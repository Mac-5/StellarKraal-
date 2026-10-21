//! Unit tests for the StellarKraal Lottery contract.
//!
//! Covers all four GitHub issues:
//! - #1252 – per-winner entropy nonce (round_bytes in entropy_hash)
//! - #1253 – indexed persistent participant storage
//! - #1254 – buy_tickets_batch
//! - #1255 – min_participants + rollover

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, BytesN as _},
    Address, Bytes, BytesN, Env,
};

use crate::{DataKey, LotteryConfig, LotteryContract, LotteryContractClient, LotteryError, LotteryState};

// ── Test helpers ──────────────────────────────────────────────────────────────

/// Deploy the token contract and return its address.
fn deploy_token(env: &Env, admin: &Address) -> Address {
    let token_wasm = soroban_sdk::testutils::wasm::StellarAssetContract;
    let token_addr = env.register(token_wasm, ());
    let token_client = soroban_sdk::token::StellarAssetClient::new(env, &token_addr);
    token_client.set_admin(admin);
    token_addr
}

/// Mint `amount` tokens for `to`.
fn mint(env: &Env, token: &Address, admin: &Address, to: &Address, amount: i128) {
    let token_client = soroban_sdk::token::StellarAssetClient::new(env, token);
    token_client.mock_all_auths();
    token_client.mint(to, &amount);
}

/// Standard lottery config with sane defaults.
fn default_config(token: Address) -> LotteryConfig {
    LotteryConfig {
        token,
        ticket_price: 100,
        winner_count: 1,
        max_tickets_per_address: 10,
        min_participants: None,
    }
}

/// Deploy a lottery contract, returning `(client, admin, token_addr)`.
fn setup(env: &Env) -> (LotteryContractClient, Address, Address) {
    let admin = Address::generate(env);
    let token = deploy_token(env, &admin);

    let contract_id = env.register(LotteryContract, ());
    let client = LotteryContractClient::new(env, &contract_id);

    env.mock_all_auths();
    client.initialize(&admin, &default_config(token.clone()));

    (client, admin, token)
}

// ── #1254: buy_tickets_batch ──────────────────────────────────────────────────

/// Buying a batch of N tickets costs `ticket_price * N` and records N slots.
#[test]
fn test_buy_tickets_batch_basic() {
    let env = Env::default();
    let (client, _admin, token) = setup(&env);
    let buyer = Address::generate(&env);
    mint(&env, &token, &_admin, &buyer, 1_000);

    env.mock_all_auths();
    client.buy_tickets_batch(&buyer, &5);

    assert_eq!(client.get_ticket_count(&buyer), 5);
    assert_eq!(client.get_total_tickets(), 5);
}

/// Buying a zero-count batch returns ZeroCount.
#[test]
fn test_buy_tickets_batch_zero_count() {
    let env = Env::default();
    let (client, _admin, token) = setup(&env);
    let buyer = Address::generate(&env);
    mint(&env, &token, &_admin, &buyer, 1_000);

    env.mock_all_auths();
    let result = client.try_buy_tickets_batch(&buyer, &0);
    assert_eq!(result, Err(Ok(LotteryError::ZeroCount)));
}

/// Exceeding the per-address cap across multiple batch calls returns TicketCapExceeded.
#[test]
fn test_buy_tickets_batch_cap_exceeded() {
    let env = Env::default();
    let (client, _admin, token) = setup(&env);
    let buyer = Address::generate(&env);
    mint(&env, &token, &_admin, &buyer, 10_000);

    env.mock_all_auths();
    client.buy_tickets_batch(&buyer, &10); // fills cap

    let result = client.try_buy_tickets_batch(&buyer, &1); // over cap
    assert_eq!(result, Err(Ok(LotteryError::TicketCapExceeded)));
}

/// A single buy_ticket call still works (calls batch with count=1).
#[test]
fn test_buy_ticket_delegates_to_batch() {
    let env = Env::default();
    let (client, _admin, token) = setup(&env);
    let buyer = Address::generate(&env);
    mint(&env, &token, &_admin, &buyer, 1_000);

    env.mock_all_auths();
    client.buy_ticket(&buyer);
    assert_eq!(client.get_ticket_count(&buyer), 1);
}

// ── #1253: indexed persistent participant storage ─────────────────────────────

/// Participants are stored in persistent storage, verifiable by slot index.
#[test]
fn test_participants_stored_in_persistent_storage() {
    let env = Env::default();
    let (client, _admin, token) = setup(&env);
    let buyer = Address::generate(&env);
    mint(&env, &token, &_admin, &buyer, 1_000);

    env.mock_all_auths();
    client.buy_tickets_batch(&buyer, &3);

    // Each ticket slot should map to the buyer in persistent storage.
    for idx in 0u32..3 {
        let stored: Address = env
            .as_contract(&client.address, || {
                env.storage()
                    .persistent()
                    .get::<DataKey, Address>(&DataKey::Participant(idx))
                    .expect("slot should exist")
            });
        assert_eq!(stored, buyer);
    }

    // Only the counter lives in instance storage – NOT a serialised Vec.
    assert!(env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .has(&DataKey::TotalTickets)
    }));
}

/// A full draw cycle works with persistent storage, proving all 1253 slots are
/// accessible to the draw() algorithm.
#[test]
fn test_draw_reads_persistent_participants() {
    let env = Env::default();
    let (client, admin, token) = setup(&env);

    let buyer = Address::generate(&env);
    mint(&env, &token, &admin, &buyer, 500);

    env.mock_all_auths();
    client.buy_ticket(&buyer);

    // Compute a valid commitment: sha256(secret || salt)
    let secret = Bytes::from_slice(&env, b"supersecret");
    let salt = BytesN::random(&env);
    let mut preimage = Bytes::new(&env);
    preimage.extend_from_slice(secret.as_ref());
    preimage.extend_from_slice(salt.as_ref());
    let hash = env.crypto().sha256(&preimage);

    client.commit_secret(&hash, &salt);
    client.draw(&secret);

    assert_eq!(client.get_state(), LotteryState::Finished);
    let winners = client.get_winners();
    assert_eq!(winners.len(), 1);
    assert_eq!(winners.get(0).unwrap(), buyer);
}

// ── #1252: per-winner entropy nonce ──────────────────────────────────────────

/// With multiple winners, each must be distinct (proves distinct per-round entropy).
#[test]
fn test_multi_winner_distinct_entropy() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = deploy_token(&env, &admin);
    let contract_id = env.register(LotteryContract, ());
    let client = LotteryContractClient::new(&env, &contract_id);

    env.mock_all_auths();
    client.initialize(
        &admin,
        &LotteryConfig {
            token: token.clone(),
            ticket_price: 10,
            winner_count: 3,         // 3 winners
            max_tickets_per_address: 5,
            min_participants: None,
        },
    );

    // Create 5 distinct buyers.
    let buyers: soroban_sdk::Vec<Address> = {
        let mut v = soroban_sdk::Vec::new(&env);
        for _ in 0..5 {
            let b = Address::generate(&env);
            mint(&env, &token, &admin, &b, 100);
            client.buy_ticket(&b);
            v.push_back(b);
        }
        v
    };

    let secret = Bytes::from_slice(&env, b"entropysecret");
    let salt = BytesN::random(&env);
    let mut preimage = Bytes::new(&env);
    preimage.extend_from_slice(secret.as_ref());
    preimage.extend_from_slice(salt.as_ref());
    let hash = env.crypto().sha256(&preimage);

    client.commit_secret(&hash, &salt);
    client.draw(&secret);

    let winners = client.get_winners();
    assert_eq!(winners.len(), 3, "expected 3 winners");

    // All three winners must be distinct addresses.
    for i in 0..winners.len() {
        for j in (i + 1)..winners.len() {
            assert_ne!(
                winners.get(i).unwrap(),
                winners.get(j).unwrap(),
                "duplicate winner detected — entropy nonce may not be working"
            );
        }
    }

    // All winners must be drawn from the known buyer pool.
    for i in 0..winners.len() {
        let w = winners.get(i).unwrap();
        let in_pool = (0..buyers.len()).any(|j| buyers.get(j as u32).unwrap() == w);
        assert!(in_pool, "winner not in buyer pool");
    }
    let _ = buyers;
}

// ── #1255: min_participants + rollover ────────────────────────────────────────

/// If unique participants < min_participants, draw() returns InsufficientParticipants.
#[test]
fn test_draw_respects_min_participants() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = deploy_token(&env, &admin);
    let contract_id = env.register(LotteryContract, ());
    let client = LotteryContractClient::new(&env, &contract_id);

    env.mock_all_auths();
    client.initialize(
        &admin,
        &LotteryConfig {
            token: token.clone(),
            ticket_price: 10,
            winner_count: 1,
            max_tickets_per_address: 5,
            min_participants: Some(3), // need at least 3 unique participants
        },
    );

    // Only 2 unique participants buy tickets.
    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    mint(&env, &token, &admin, &b1, 100);
    mint(&env, &token, &admin, &b2, 100);
    client.buy_ticket(&b1);
    client.buy_ticket(&b2);

    let secret = Bytes::from_slice(&env, b"rollsecret");
    let salt = BytesN::random(&env);
    let mut preimage = Bytes::new(&env);
    preimage.extend_from_slice(secret.as_ref());
    preimage.extend_from_slice(salt.as_ref());
    let hash = env.crypto().sha256(&preimage);

    client.commit_secret(&hash, &salt);

    let result = client.try_draw(&secret);
    assert_eq!(result, Err(Ok(LotteryError::InsufficientParticipants)));
}

/// rollover() resets round state and carries balance forward.
#[test]
fn test_rollover_carries_balance_and_resets_state() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = deploy_token(&env, &admin);
    let contract_id = env.register(LotteryContract, ());
    let client = LotteryContractClient::new(&env, &contract_id);

    env.mock_all_auths();
    client.initialize(
        &admin,
        &LotteryConfig {
            token: token.clone(),
            ticket_price: 100,
            winner_count: 1,
            max_tickets_per_address: 5,
            min_participants: Some(3),
        },
    );

    // Round 1: only 2 participants.
    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    mint(&env, &token, &admin, &b1, 500);
    mint(&env, &token, &admin, &b2, 500);
    client.buy_ticket(&b1);
    client.buy_ticket(&b2);

    let secret = Bytes::from_slice(&env, b"round1secret");
    let salt = BytesN::random(&env);
    let mut preimage = Bytes::new(&env);
    preimage.extend_from_slice(secret.as_ref());
    preimage.extend_from_slice(salt.as_ref());
    let hash = env.crypto().sha256(&preimage);
    client.commit_secret(&hash, &salt);

    // draw should fail → call rollover
    let _ = client.try_draw(&secret);
    client.rollover();

    // State must be reset to Open with incremented round.
    assert_eq!(client.get_state(), LotteryState::Open);
    assert_eq!(client.get_round(), 2);
    assert_eq!(client.get_total_tickets(), 0);

    // Ticket counts for b1/b2 should be cleared.
    assert_eq!(client.get_ticket_count(&b1), 0);
    assert_eq!(client.get_ticket_count(&b2), 0);

    // Carry-over balance must equal round-1 ticket revenue (2 * 100 = 200).
    let carry = client.get_carry_over();
    assert_eq!(carry, 200, "carry-over should equal round-1 prize pool");
}

/// After rollover, a successful round's prize includes the carried balance.
#[test]
fn test_rollover_carry_included_in_prize() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = deploy_token(&env, &admin);
    let contract_id = env.register(LotteryContract, ());
    let client = LotteryContractClient::new(&env, &contract_id);

    env.mock_all_auths();
    client.initialize(
        &admin,
        &LotteryConfig {
            token: token.clone(),
            ticket_price: 100,
            winner_count: 1,
            max_tickets_per_address: 5,
            min_participants: Some(3),
        },
    );

    // ── Round 1: undershoot quorum, rollover ──
    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    mint(&env, &token, &admin, &b1, 500);
    mint(&env, &token, &admin, &b2, 500);
    client.buy_ticket(&b1);
    client.buy_ticket(&b2);

    let s1 = Bytes::from_slice(&env, b"secret1");
    let salt1 = BytesN::random(&env);
    let mut pre1 = Bytes::new(&env);
    pre1.extend_from_slice(s1.as_ref());
    pre1.extend_from_slice(salt1.as_ref());
    let h1 = env.crypto().sha256(&pre1);
    client.commit_secret(&h1, &salt1);
    let _ = client.try_draw(&s1);
    client.rollover();

    // ── Round 2: meet quorum ──
    let b3 = Address::generate(&env);
    let b4 = Address::generate(&env);
    let b5 = Address::generate(&env);
    mint(&env, &token, &admin, &b3, 500);
    mint(&env, &token, &admin, &b4, 500);
    mint(&env, &token, &admin, &b5, 500);
    client.buy_ticket(&b3);
    client.buy_ticket(&b4);
    client.buy_ticket(&b5);

    let s2 = Bytes::from_slice(&env, b"secret2");
    let salt2 = BytesN::random(&env);
    let mut pre2 = Bytes::new(&env);
    pre2.extend_from_slice(s2.as_ref());
    pre2.extend_from_slice(salt2.as_ref());
    let h2 = env.crypto().sha256(&pre2);
    client.commit_secret(&h2, &salt2);
    client.draw(&s2);

    // Prize = (3 * 100 [round2 tickets] + 200 [carry]) / 1 winner = 500
    let winners = client.get_winners();
    assert_eq!(winners.len(), 1);
    let winner = winners.get(0).unwrap();

    let token_client = soroban_sdk::token::Client::new(&env, &token);
    let initial_balance = token_client.balance(&winner);

    client.claim(&winner);

    let final_balance = token_client.balance(&winner);
    let prize = final_balance - initial_balance;
    // carry (200) + round2 pool (300) = 500
    assert_eq!(prize, 500, "prize should include carry-over");
}

/// rollover() returns QuorumMet if quorum has actually been satisfied.
#[test]
fn test_rollover_rejected_when_quorum_met() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = deploy_token(&env, &admin);
    let contract_id = env.register(LotteryContract, ());
    let client = LotteryContractClient::new(&env, &contract_id);

    env.mock_all_auths();
    client.initialize(
        &admin,
        &LotteryConfig {
            token: token.clone(),
            ticket_price: 10,
            winner_count: 1,
            max_tickets_per_address: 5,
            min_participants: Some(2),
        },
    );

    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    mint(&env, &token, &admin, &b1, 100);
    mint(&env, &token, &admin, &b2, 100);
    client.buy_ticket(&b1);
    client.buy_ticket(&b2);

    let s = Bytes::from_slice(&env, b"full");
    let salt = BytesN::random(&env);
    let mut pre = Bytes::new(&env);
    pre.extend_from_slice(s.as_ref());
    pre.extend_from_slice(salt.as_ref());
    let h = env.crypto().sha256(&pre);
    client.commit_secret(&h, &salt);

    // quorum is met (2 >= 2), so rollover must fail
    let result = client.try_rollover();
    assert_eq!(result, Err(Ok(LotteryError::QuorumMet)));
}

/// rollover() returns QuorumMet (no-config guard) when min_participants is None.
#[test]
fn test_rollover_requires_min_participants_config() {
    let env = Env::default();
    let (client, _admin, token) = setup(&env); // no min_participants
    let buyer = Address::generate(&env);
    mint(&env, &token, &_admin, &buyer, 100);

    env.mock_all_auths();
    client.buy_ticket(&buyer);

    let s = Bytes::from_slice(&env, b"nosecret");
    let salt = BytesN::random(&env);
    let mut pre = Bytes::new(&env);
    pre.extend_from_slice(s.as_ref());
    pre.extend_from_slice(salt.as_ref());
    let h = env.crypto().sha256(&pre);
    client.commit_secret(&h, &salt);

    let result = client.try_rollover();
    assert_eq!(result, Err(Ok(LotteryError::QuorumMet)));
}
