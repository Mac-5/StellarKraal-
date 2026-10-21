import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { withDbConnection } from './database';
import { insertRefreshToken, rotateRefreshToken } from './refreshTokens';
import { hashRefreshToken } from '../utils/tokenBlocklist';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('persistent refresh-token rotation', () => {
  const originalDbFile = process.env.DB_FILE;
  const ttl = 7 * 24 * 60 * 60 * 1000;
  const oldHash = hashRefreshToken('old-raw-token');
  const newHash = hashRefreshToken('new-raw-token');
  let directory: string;

  beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'stellarkraal-refresh-'));
    process.env.DB_FILE = path.join(directory, 'tokens.sqlite3');
    const schema = readFileSync(path.join(__dirname, '../../migrations/sqls/20261016000000-add-refresh-tokens-up.sql'), 'utf8');
    await withDbConnection(async (db) => {
      for (const statement of schema.split(';').filter((sql) => sql.trim())) {
        await db.query(statement);
      }
    });
  });

  afterEach(() => {
    if (originalDbFile === undefined) delete process.env.DB_FILE;
    else process.env.DB_FILE = originalDbFile;
    rmSync(directory, { recursive: true, force: true });
  });

  async function tokens() {
    return withDbConnection((db) => db.query<{ token_hash: string; public_key: string; expires_at: number }>('SELECT * FROM refresh_tokens'));
  }

  it('stores digests rather than raw bearer tokens', async () => {
    await insertRefreshToken(oldHash, 'wallet', Date.now() + ttl);
    expect((await tokens())[0].token_hash).toBe(oldHash);
    expect(JSON.stringify(await tokens())).not.toContain('old-raw-token');
  });

  it('rotates atomically, invalidates the old token and persists a seven-day replacement', async () => {
    await insertRefreshToken(oldHash, 'wallet', Date.now() + ttl);
    const expiry = Date.now() + ttl;
    expect(await rotateRefreshToken(oldHash, newHash, expiry)).toBe('wallet');
    expect(await rotateRefreshToken(oldHash, hashRefreshToken('reused'), expiry)).toBeUndefined();
    expect(await tokens()).toEqual([{ token_hash: newHash, public_key: 'wallet', expires_at: expiry }]);
    // A new connection can consume the replacement; no process-local map is needed.
    expect(await rotateRefreshToken(newHash, hashRefreshToken('third'), expiry)).toBe('wallet');
  });

  it('does not rotate unknown or expired refresh tokens', async () => {
    expect(await rotateRefreshToken(oldHash, newHash, Date.now() + ttl)).toBeUndefined();
    await insertRefreshToken(oldHash, 'wallet', Date.now() - 1);
    expect(await rotateRefreshToken(oldHash, newHash, Date.now() + ttl)).toBeUndefined();
    expect((await tokens())[0].token_hash).toBe(oldHash);
  });

  it('allows exactly one concurrent consumer of a refresh token', async () => {
    await insertRefreshToken(oldHash, 'wallet', Date.now() + ttl);
    const result = await Promise.all([
      rotateRefreshToken(oldHash, newHash, Date.now() + ttl),
      rotateRefreshToken(oldHash, hashRefreshToken('competitor'), Date.now() + ttl),
    ]);
    expect(result.filter((wallet) => wallet === 'wallet')).toHaveLength(1);
    expect(result.filter((wallet) => wallet === undefined)).toHaveLength(1);
    expect(await tokens()).toHaveLength(1);
  });

  it('preserves the old token if insertion of the replacement fails', async () => {
    await insertRefreshToken(oldHash, 'wallet', Date.now() + ttl);
    await insertRefreshToken(newHash, 'other-wallet', Date.now() + ttl);
    await expect(rotateRefreshToken(oldHash, newHash, Date.now() + ttl)).rejects.toThrow();
    expect((await tokens()).map((token) => token.token_hash)).toContain(oldHash);
  });
});
