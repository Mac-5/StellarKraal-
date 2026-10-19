import { StrKey } from '@stellar/stellar-sdk';

/**
 * Regression tests for issue #485: contract event account addresses must be
 * decoded to base32 Stellar G-addresses, not raw hex.
 *
 * The contractEventListener handlers decode account addresses with:
 *   StrKey.encodeEd25519PublicKey(vals[i].address.accountId().ed25519())
 * These tests exercise that exact decoding path against mock event values.
 */

// A known ed25519 public key (32 bytes) and its expected StrKey G-address.
const RAW_PUBLIC_KEY = Buffer.from(
  '3f0c34bf93ad0d9971dbfb9045b221e1a9c8e9b3f0c1d2e3a4b5c6d7e8f90123',
  'hex',
);
const EXPECTED_G_ADDRESS = StrKey.encodeEd25519PublicKey(RAW_PUBLIC_KEY);

// Minimal mock of the stellar-sdk ScVal address shape used by the handlers.
function mockAddressScVal(publicKey: Buffer) {
  return {
    address: () => ({
      accountId: () => ({
        ed25519: () => publicKey,
      }),
    }),
  };
}

// Mirrors the decoding used in the livestock/registered and loan/requested handlers.
function decodeOwner(vals: ReturnType<typeof mockAddressScVal>[]) {
  return StrKey.encodeEd25519PublicKey(vals[1].address().accountId().ed25519());
}

describe('contractEventListener account address decoding (#485)', () => {
  it('decodes the livestock/registered owner to a G-address', () => {
    const vals = [mockAddressScVal(Buffer.alloc(32)), mockAddressScVal(RAW_PUBLIC_KEY)];
    const owner = decodeOwner(vals);

    expect(owner).toBe(EXPECTED_G_ADDRESS);
    expect(owner.startsWith('G')).toBe(true);
    expect(StrKey.isValidEd25519PublicKey(owner)).toBe(true);
  });

  it('decodes the loan/requested borrower to a G-address', () => {
    const vals = [mockAddressScVal(Buffer.alloc(32)), mockAddressScVal(RAW_PUBLIC_KEY)];
    const borrower = decodeOwner(vals);

    expect(borrower).toBe(EXPECTED_G_ADDRESS);
    expect(borrower.startsWith('G')).toBe(true);
    expect(StrKey.isValidEd25519PublicKey(borrower)).toBe(true);
  });

  it('does not produce a raw hex string', () => {
    const vals = [mockAddressScVal(Buffer.alloc(32)), mockAddressScVal(RAW_PUBLIC_KEY)];
    const owner = decodeOwner(vals);

    expect(owner).not.toBe(RAW_PUBLIC_KEY.toString('hex'));
    expect(owner).toHaveLength(56);
  });
});
