import { activeDriver, withDbConnection, withDbTransaction } from './database';

interface RefreshTokenRow {
  public_key: string;
  expires_at: number;
}

/** Persist only a SHA-256 token digest; raw bearer tokens never enter the database. */
export async function insertRefreshToken(tokenHash: string, publicKey: string, expiresAt: number): Promise<void> {
  await withDbConnection(async (db) => {
    await db.query(
      'INSERT INTO refresh_tokens (token_hash, public_key, expires_at) VALUES ($1, $2, $3)',
      [tokenHash, publicKey, expiresAt]
    );
  });
}

/** Consume the old digest and insert its replacement in the same locked transaction. */
export async function rotateRefreshToken(
  oldHash: string,
  newHash: string,
  expiresAt: number
): Promise<string | undefined> {
  return withDbTransaction(async (db) => {
    const rows = await db.query<RefreshTokenRow>(
      'SELECT public_key, expires_at FROM refresh_tokens WHERE token_hash = $1' +
        (activeDriver === 'pg' ? ' FOR UPDATE' : ''),
      [oldHash]
    );
    const token = rows[0];
    if (!token || Number(token.expires_at) <= Date.now()) return undefined;

    await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [oldHash]);
    await db.query(
      'INSERT INTO refresh_tokens (token_hash, public_key, expires_at) VALUES ($1, $2, $3)',
      [newHash, token.public_key, expiresAt]
    );
    return token.public_key;
  });
}

/** Test-only reset, matching the existing auth reset helper. */
export async function _clearRefreshTokens(): Promise<void> {
  await withDbConnection(async (db) => {
    await db.query('DELETE FROM refresh_tokens');
  });
}
