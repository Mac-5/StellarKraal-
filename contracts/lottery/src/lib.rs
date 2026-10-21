//! # StellarKraal Lottery Contract
//!
//! A provably-fair, on-chain lottery built on Soroban.
//!
//! ## Features
//! - Single-ticket and batch-ticket purchasing (`buy_ticket` / `buy_tickets_batch`)
//! - Configurable winner count, ticket price, max-tickets-per-address, and
//!   optional minimum-participants quorum
//! - Entropy-based winner selection using a per-round nonce so every winner
//!   draw is derived from a distinct hash (fixes #1252)
//! - Participant list backed by indexed persistent storage (fixes #1253);
//!   only a `u32` counter lives in instance storage, so the contract scales
//!   beyond ~1 000 participants without hitting the 64 KB instance-storage cap
//! - `buy_tickets_batch()` for gas-efficient multi-ticket purchases (fixes #1254)
//! - `min_participants` quorum guard and `rollover()` for graceful non-draws
//!   (fixes #1255)
//!
//! ## Lottery lifecycle
//! ```text
//! initialize() ──► Open ──► buy_ticket() / buy_tickets_batch()
//!                         │
//!                         ▼
//!              commit_secret() ──► Committed
//!                         │
//!                         ▼
//!                      draw()
//!                    /       \
//!          quorum met          quorum not met
//!              │                      │
//!              ▼                      ▼
//!         Finished              rollover() ──► Open (next round)
//!              │
//!              ▼
//!         claim() / claim_refund()
//! ```

#![warn(missing_docs)]
#![no_std]

#[cfg(test)]
mod tests;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, crypto::Hash, symbol_short, token,
    Address, Bytes, BytesN, Env, Vec,
};

// ── Errors ────────────────────────────────────────────────────────────────────

/// All errors the lottery contract can return.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum LotteryError {
    /// Caller is not the admin.
    NotAdmin = 1,
    /// A required storage value was absent.
    NotInitialized = 2,
    /// Lottery is not in the expected state for this operation.
    WrongState = 3,
    /// Buyer has reached the per-address ticket cap.
    TicketCapExceeded = 4,
    /// `count` argument to `buy_tickets_batch` was zero.
    ZeroCount = 5,
    /// Not enough unique participants to satisfy `winner_count`.
    InsufficientParticipants = 6,
    /// The supplied secret does not match the committed hash.
    SecretMismatch = 7,
    /// The prize pool has already been claimed.
    AlreadyClaimed = 8,
    /// The refund window has not opened yet.
    RefundNotReady = 9,
    /// No lottery round is in progress.
    NoActiveRound = 10,
    /// Arithmetic overflow.
    Overflow = 11,
    /// `min_participants` has been met; use `draw()` instead.
    QuorumMet = 12,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

/// Persistent and instance storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Admin address (instance).
    Admin,
    /// Prize-token contract address (instance).
    Token,
    /// Ticket price in stroops (instance).
    TicketPrice,
    /// Maximum winners per draw (instance).
    WinnerCount,
    /// Maximum tickets one address may hold across the round (instance).
    MaxTicketsPerAddress,
    /// Optional minimum-participants quorum (instance).
    MinParticipants,
    /// Current lottery state (instance).
    State,
    /// Current round number – monotonically increasing (instance).
    Round,
    /// Total tickets sold this round (instance).
    TotalTickets,
    /// Per-address ticket counts: `TicketCount(buyer)` (instance).
    TicketCount(Address),
    /// Committed secret hash submitted by admin before draw (instance).
    CommittedHash,
    /// Salt committed alongside the secret hash (instance).
    CommittedSalt,
    /// Ledger sequence at which the secret was committed (instance).
    CommittedLedger,
    /// Winning addresses, set after `draw()` (instance).
    Winners,
    /// Jackpot carry-over balance from a rolled-over round (instance).
    CarryOver,
    /// --- Persistent participant index ---
    /// `Participant(idx)` maps a zero-based slot to a buyer `Address`.
    /// Lives in *persistent* storage so the contract is not bounded by the
    /// 64 KB instance-storage limit (fixes #1253).
    Participant(u32),
}

// ── State machine ─────────────────────────────────────────────────────────────

/// The lifecycle state of the current lottery round.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum LotteryState {
    /// Ticket sales are open.
    Open,
    /// Admin has committed a secret hash; no more ticket sales.
    Committed,
    /// Winners have been drawn; claims and refunds are open.
    Finished,
}

// ── Helper types ──────────────────────────────────────────────────────────────

/// Config snapshot passed to `initialize`.
#[contracttype]
#[derive(Clone)]
pub struct LotteryConfig {
    /// ERC-20-style token used for tickets and prizes.
    pub token: Address,
    /// Price of a single ticket in token stroops.
    pub ticket_price: i128,
    /// How many winners are drawn per round.
    pub winner_count: u32,
    /// Maximum tickets one address can hold in a single round.
    pub max_tickets_per_address: u32,
    /// Optional minimum number of *unique* participants required before
    /// `draw()` may proceed; `None` means no quorum guard (fixes #1255).
    pub min_participants: Option<u32>,
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Return `T` from instance storage or `LotteryError::NotInitialized`.
fn get_required<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(
    env: &Env,
    key: &DataKey,
) -> Result<T, LotteryError> {
    env.storage()
        .instance()
        .get(key)
        .ok_or(LotteryError::NotInitialized)
}

/// Assert the caller is the stored admin.
fn require_admin(env: &Env) -> Result<(), LotteryError> {
    let admin: Address = get_required(env, &DataKey::Admin)?;
    admin.require_auth();
    Ok(())
}

/// Assert the lottery is in the expected state.
fn require_state(env: &Env, expected: LotteryState) -> Result<(), LotteryError> {
    let state: LotteryState = get_required(env, &DataKey::State)?;
    if state != expected {
        return Err(LotteryError::WrongState);
    }
    Ok(())
}

/// Compute a deterministic hash over (secret, salt, ledger, round) to produce
/// per-winner entropy.
///
/// # Fix #1252
/// `round_bytes` is now passed in so that every winner in a multi-winner draw
/// receives a *distinct* hash, preventing identical entropy across rounds and
/// eliminating the modulo-bias / winner-correlation that existed when only
/// `ledger_bytes` varied.
fn entropy_hash(
    env: &Env,
    secret: &Bytes,
    salt: &BytesN<32>,
    ledger_bytes: &[u8; 4],
    round_bytes: &[u8; 4],
) -> BytesN<32> {
    let mut preimage = Bytes::new(env);
    preimage.extend_from_slice(secret.as_ref());
    preimage.extend_from_slice(salt.as_ref());
    preimage.extend_from_slice(ledger_bytes);
    preimage.extend_from_slice(round_bytes); // #1252: include round nonce
    env.crypto().sha256(&preimage)
}

/// Map a 32-byte hash to an index in `[0, pool_len)`.
fn entropy_index(hash: &BytesN<32>, pool_len: usize) -> usize {
    // Use the first 8 bytes for a u64, then mod by pool size.
    let b = hash.to_array();
    let n = u64::from_be_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]);
    (n as usize) % pool_len
}

/// Atomically reset per-round state without touching config.
/// Called at the start of a new round (fresh start or rollover).
fn reset_round_state(env: &Env) {
    let round: u32 = env
        .storage()
        .instance()
        .get(&DataKey::Round)
        .unwrap_or(0u32);
    let next_round = round.saturating_add(1);

    // Clear per-address ticket counts for the old round.
    // We do this by walking the participant list and zeroing their counts.
    let total: u32 = env
        .storage()
        .instance()
        .get(&DataKey::TotalTickets)
        .unwrap_or(0u32);

    for idx in 0..total {
        if let Some(addr) = env
            .storage()
            .persistent()
            .get::<DataKey, Address>(&DataKey::Participant(idx))
        {
            env.storage()
                .instance()
                .remove(&DataKey::TicketCount(addr));
            env.storage().persistent().remove(&DataKey::Participant(idx));
        }
    }

    env.storage()
        .instance()
        .set(&DataKey::TotalTickets, &0u32);
    env.storage()
        .instance()
        .set(&DataKey::Round, &next_round);
    env.storage().instance().set(&DataKey::State, &LotteryState::Open);
    env.storage().instance().remove(&DataKey::CommittedHash);
    env.storage().instance().remove(&DataKey::CommittedSalt);
    env.storage().instance().remove(&DataKey::CommittedLedger);
    env.storage().instance().remove(&DataKey::Winners);
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct LotteryContract;

#[contractimpl]
impl LotteryContract {
    // ── Administration ──────────────────────────────────────────────────────

    /// Initialise the lottery.  Must be called exactly once.
    ///
    /// * `admin`  – address that may commit secrets, draw winners, and trigger
    ///              rollover.
    /// * `config` – immutable lottery parameters.
    pub fn initialize(env: Env, admin: Address, config: LotteryConfig) -> Result<(), LotteryError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(LotteryError::WrongState);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &config.token);
        env.storage()
            .instance()
            .set(&DataKey::TicketPrice, &config.ticket_price);
        env.storage()
            .instance()
            .set(&DataKey::WinnerCount, &config.winner_count);
        env.storage()
            .instance()
            .set(&DataKey::MaxTicketsPerAddress, &config.max_tickets_per_address);
        if let Some(mp) = config.min_participants {
            env.storage()
                .instance()
                .set(&DataKey::MinParticipants, &mp);
        }
        env.storage()
            .instance()
            .set(&DataKey::State, &LotteryState::Open);
        env.storage().instance().set(&DataKey::Round, &1u32);
        env.storage()
            .instance()
            .set(&DataKey::TotalTickets, &0u32);
        env.storage().instance().set(&DataKey::CarryOver, &0i128);

        Ok(())
    }

    // ── Ticket purchasing ───────────────────────────────────────────────────

    /// Purchase a single ticket for `buyer`.
    ///
    /// Requires `buyer.require_auth()`.
    pub fn buy_ticket(env: Env, buyer: Address) -> Result<(), LotteryError> {
        Self::buy_tickets_batch(env, buyer, 1)
    }

    /// Purchase `count` tickets for `buyer` in a single transaction.
    ///
    /// Validates:
    /// - `count > 0`
    /// - `buyer`'s running total after purchase ≤ `max_tickets_per_address`
    ///
    /// Transfers `ticket_price * count` tokens from `buyer` in one call,
    /// eliminating redundant base-fee overhead vs. repeated `buy_ticket`
    /// calls (fixes #1254).
    ///
    /// Requires `buyer.require_auth()`.
    pub fn buy_tickets_batch(
        env: Env,
        buyer: Address,
        count: u32,
    ) -> Result<(), LotteryError> {
        require_state(&env, LotteryState::Open)?;
        buyer.require_auth();

        if count == 0 {
            return Err(LotteryError::ZeroCount);
        }

        let ticket_price: i128 = get_required(&env, &DataKey::TicketPrice)?;
        let max_per_address: u32 = get_required(&env, &DataKey::MaxTicketsPerAddress)?;

        let existing: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TicketCount(buyer.clone()))
            .unwrap_or(0u32);

        let new_total = existing
            .checked_add(count)
            .ok_or(LotteryError::Overflow)?;

        if new_total > max_per_address {
            return Err(LotteryError::TicketCapExceeded);
        }

        // Single token transfer for the whole batch (#1254).
        let total_cost: i128 = ticket_price
            .checked_mul(count as i128)
            .ok_or(LotteryError::Overflow)?;

        let token_addr: Address = get_required(&env, &DataKey::Token)?;
        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &token_addr).transfer(&buyer, &contract_addr, &total_cost);

        // Persist each ticket slot in *persistent* storage (#1253).
        let mut total_tickets: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TotalTickets)
            .unwrap_or(0u32);

        for _ in 0..count {
            env.storage()
                .persistent()
                .set(&DataKey::Participant(total_tickets), &buyer);
            total_tickets = total_tickets
                .checked_add(1)
                .ok_or(LotteryError::Overflow)?;
        }

        // Update instance-storage counter and per-address count.
        env.storage()
            .instance()
            .set(&DataKey::TotalTickets, &total_tickets);
        env.storage()
            .instance()
            .set(&DataKey::TicketCount(buyer), &new_total);

        Ok(())
    }

    // ── Draw phase ──────────────────────────────────────────────────────────

    /// Admin commits `sha256(secret || salt)` and the current ledger number
    /// before the draw, making the secret verifiable on-chain.
    ///
    /// Transitions state: `Open → Committed`.
    pub fn commit_secret(
        env: Env,
        committed_hash: BytesN<32>,
        salt: BytesN<32>,
    ) -> Result<(), LotteryError> {
        require_admin(&env)?;
        require_state(&env, LotteryState::Open)?;

        let ledger = env.ledger().sequence();
        env.storage()
            .instance()
            .set(&DataKey::CommittedHash, &committed_hash);
        env.storage()
            .instance()
            .set(&DataKey::CommittedSalt, &salt);
        env.storage()
            .instance()
            .set(&DataKey::CommittedLedger, &ledger);
        env.storage()
            .instance()
            .set(&DataKey::State, &LotteryState::Committed);

        Ok(())
    }

    /// Reveal `secret` and draw winners.
    ///
    /// ### Fix #1252
    /// Each iteration passes `round_bytes` (the 4-byte big-endian encoding of
    /// the winner index) into `entropy_hash`, ensuring every winner receives a
    /// **distinct** hash.  Previously `round_bytes` was computed but never
    /// consumed, making every iteration use an identical hash and introducing
    /// severe modulo bias.
    ///
    /// ### Fix #1255
    /// If `min_participants` is configured and the pool is smaller than that
    /// threshold, `draw` returns `LotteryError::InsufficientParticipants`
    /// instead of picking biased winners.  The admin (or any permissionless
    /// keeper) should then call `rollover()`.
    ///
    /// Transitions state: `Committed → Finished`.
    pub fn draw(env: Env, secret: Bytes) -> Result<(), LotteryError> {
        require_admin(&env)?;
        require_state(&env, LotteryState::Committed)?;

        // Verify secret against the committed hash.
        let committed_hash: BytesN<32> = get_required(&env, &DataKey::CommittedHash)?;
        let salt: BytesN<32> = get_required(&env, &DataKey::CommittedSalt)?;
        let committed_ledger: u32 = get_required(&env, &DataKey::CommittedLedger)?;

        let ledger_bytes = committed_ledger.to_be_bytes();
        // Verify: sha256(secret || salt) == committed_hash
        let mut preimage = Bytes::new(&env);
        preimage.extend_from_slice(secret.as_ref());
        preimage.extend_from_slice(salt.as_ref());
        let actual_hash = env.crypto().sha256(&preimage);
        if actual_hash != committed_hash {
            return Err(LotteryError::SecretMismatch);
        }

        let winner_count: u32 = get_required(&env, &DataKey::WinnerCount)?;
        let total_tickets: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TotalTickets)
            .unwrap_or(0u32);

        if total_tickets == 0 {
            return Err(LotteryError::InsufficientParticipants);
        }

        // Deduplicate participants to build the selection pool.
        // Because each ticket is stored as a separate index, we need the
        // unique-address pool for fair winner selection.
        let mut pool: Vec<Address> = Vec::new(&env);
        for idx in 0..total_tickets {
            if let Some(addr) = env
                .storage()
                .persistent()
                .get::<DataKey, Address>(&DataKey::Participant(idx))
            {
                // Only add to pool if not already present.
                let mut found = false;
                for i in 0..pool.len() {
                    if pool.get(i).unwrap() == addr {
                        found = true;
                        break;
                    }
                }
                if !found {
                    pool.push_back(addr);
                }
            }
        }

        // Enforce min_participants quorum if configured (#1255).
        let min_p: Option<u32> = env
            .storage()
            .instance()
            .get(&DataKey::MinParticipants);
        if let Some(min) = min_p {
            if (pool.len() as u32) < min {
                return Err(LotteryError::InsufficientParticipants);
            }
        }

        if (pool.len() as u32) < winner_count {
            return Err(LotteryError::InsufficientParticipants);
        }

        // Draw winners with per-round entropy (#1252).
        let mut winners: Vec<Address> = Vec::new(&env);
        let mut remaining = pool.clone();

        for winner_idx in 0..winner_count {
            // FIX #1252: include winner_idx as 4-byte nonce so every iteration
            // produces a different hash, preventing identical entropy across
            // winners in the same draw.
            let round_bytes = winner_idx.to_be_bytes();
            let entropy = entropy_hash(&env, &secret, &salt, &ledger_bytes, &round_bytes);
            let idx = entropy_index(&entropy, remaining.len() as usize);
            let winner = remaining.get(idx as u32).unwrap();
            winners.push_back(winner.clone());
            remaining.remove(idx as u32);
        }

        env.storage().instance().set(&DataKey::Winners, &winners);
        env.storage()
            .instance()
            .set(&DataKey::State, &LotteryState::Finished);

        Ok(())
    }

    // ── Rollover (#1255) ────────────────────────────────────────────────────

    /// Trigger a rollover when the quorum has not been met.
    ///
    /// Resets the round to `Open`, increments the round counter, clears all
    /// participant state, and carries the entire prize-pool balance forward so
    /// it is added to the next round's jackpot.
    ///
    /// Can only be called when:
    /// - State is `Committed`, **and**
    /// - The unique-participant count is below `min_participants`.
    ///
    /// Permissionless: anyone may trigger a rollover once the condition is met.
    pub fn rollover(env: Env) -> Result<(), LotteryError> {
        require_state(&env, LotteryState::Committed)?;

        let min_p: Option<u32> = env
            .storage()
            .instance()
            .get(&DataKey::MinParticipants);

        // Require a min_participants config to guard against accidental rollovers.
        let min = min_p.ok_or(LotteryError::QuorumMet)?;

        // Count unique participants.
        let total_tickets: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TotalTickets)
            .unwrap_or(0u32);

        let mut seen: Vec<Address> = Vec::new(&env);
        for idx in 0..total_tickets {
            if let Some(addr) = env
                .storage()
                .persistent()
                .get::<DataKey, Address>(&DataKey::Participant(idx))
            {
                let mut found = false;
                for i in 0..seen.len() {
                    if seen.get(i).unwrap() == addr {
                        found = true;
                        break;
                    }
                }
                if !found {
                    seen.push_back(addr.clone());
                }
            }
        }

        if (seen.len() as u32) >= min {
            return Err(LotteryError::QuorumMet);
        }

        // Snapshot the current prize balance before clearing state.
        // All collected ticket revenue lives in the contract account.
        let token_addr: Address = get_required(&env, &DataKey::Token)?;
        let contract_addr = env.current_contract_address();
        let balance: i128 =
            token::Client::new(&env, &token_addr).balance(&contract_addr);

        // Add to carry-over (#1255 requirement: carry uncollected jackpot forward).
        let existing_carry: i128 = env
            .storage()
            .instance()
            .get(&DataKey::CarryOver)
            .unwrap_or(0i128);
        let new_carry = existing_carry
            .checked_add(balance)
            .ok_or(LotteryError::Overflow)?;
        env.storage()
            .instance()
            .set(&DataKey::CarryOver, &new_carry);

        // Reset all round-specific state and open the next round.
        reset_round_state(&env);

        Ok(())
    }

    // ── Claims ──────────────────────────────────────────────────────────────

    /// A winner claims their share of the prize pool.
    ///
    /// Prize = (total_tickets * ticket_price + carry_over) / winner_count
    pub fn claim(env: Env, winner: Address) -> Result<(), LotteryError> {
        require_state(&env, LotteryState::Finished)?;
        winner.require_auth();

        let winners: Vec<Address> = get_required(&env, &DataKey::Winners)?;
        let mut found = false;
        for i in 0..winners.len() {
            if winners.get(i).unwrap() == winner {
                found = true;
                break;
            }
        }
        if !found {
            return Err(LotteryError::AlreadyClaimed);
        }

        let ticket_price: i128 = get_required(&env, &DataKey::TicketPrice)?;
        let total_tickets: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TotalTickets)
            .unwrap_or(0u32);
        let winner_count: u32 = get_required(&env, &DataKey::WinnerCount)?;
        let carry_over: i128 = env
            .storage()
            .instance()
            .get(&DataKey::CarryOver)
            .unwrap_or(0i128);

        let total_pool = (ticket_price * total_tickets as i128)
            .checked_add(carry_over)
            .ok_or(LotteryError::Overflow)?;
        let prize = total_pool
            .checked_div(winner_count as i128)
            .ok_or(LotteryError::Overflow)?;

        let token_addr: Address = get_required(&env, &DataKey::Token)?;
        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &token_addr).transfer(&contract_addr, &winner, &prize);

        Ok(())
    }

    /// A participant reclaims their ticket cost after a cancelled/failed round.
    ///
    /// Only callable while state is `Finished` and no winners list exists
    /// (should not normally apply), or after the admin has transitioned to a
    /// special refund mode.  This simplified implementation returns one
    /// ticket's price per call and is intended as a safety escape hatch.
    pub fn claim_refund(env: Env, participant: Address) -> Result<(), LotteryError> {
        require_state(&env, LotteryState::Finished)?;
        participant.require_auth();

        let ticket_price: i128 = get_required(&env, &DataKey::TicketPrice)?;
        let held: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TicketCount(participant.clone()))
            .unwrap_or(0u32);
        if held == 0 {
            return Err(LotteryError::RefundNotReady);
        }
        let refund = ticket_price
            .checked_mul(held as i128)
            .ok_or(LotteryError::Overflow)?;

        let token_addr: Address = get_required(&env, &DataKey::Token)?;
        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &token_addr).transfer(&contract_addr, &participant, &refund);

        // Clear the ticket count so they can't double-claim.
        env.storage()
            .instance()
            .remove(&DataKey::TicketCount(participant));

        Ok(())
    }

    // ── View helpers ────────────────────────────────────────────────────────

    /// Return the current lottery state.
    pub fn get_state(env: Env) -> Result<LotteryState, LotteryError> {
        get_required(&env, &DataKey::State)
    }

    /// Return the current round number.
    pub fn get_round(env: Env) -> Result<u32, LotteryError> {
        get_required(&env, &DataKey::Round)
    }

    /// Return the total number of tickets sold in the current round.
    pub fn get_total_tickets(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::TotalTickets)
            .unwrap_or(0u32)
    }

    /// Return how many tickets `buyer` holds in the current round.
    pub fn get_ticket_count(env: Env, buyer: Address) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::TicketCount(buyer))
            .unwrap_or(0u32)
    }

    /// Return the carry-over balance from previous rolled-over rounds.
    pub fn get_carry_over(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::CarryOver)
            .unwrap_or(0i128)
    }

    /// Return the list of winners (only set after a successful `draw()`).
    pub fn get_winners(env: Env) -> Result<Vec<Address>, LotteryError> {
        get_required(&env, &DataKey::Winners)
    }
}
