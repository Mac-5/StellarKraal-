import fs from 'fs';
import path from 'path';
import request from 'supertest';
import type { Express } from 'express';
import { _resetDeduplicationCache } from './middleware/deduplication';

jest.mock('@stellar/stellar-sdk', () => {
  const server = {
    getAccount: jest.fn().mockResolvedValue({ id: 'GABC', sequence: '1' }),
    prepareTransaction: jest.fn().mockResolvedValue({ toXDR: () => 'prepared_xdr' }),
    simulateTransaction: jest.fn().mockResolvedValue({ result: { retval: {} } }),
    getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
  };
  return {
    StrKey: { isValidEd25519PublicKey: (value: string) => value.startsWith('G') },
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      PUBLIC: 'Public Global Stellar Network ; September 2015',
    },
    BASE_FEE: '100',
    Contract: jest.fn().mockImplementation(() => ({ call: jest.fn().mockReturnValue({}) })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({ toXDR: () => 'mock_xdr' }),
    })),
    Address: jest.fn().mockImplementation(() => ({ toScVal: jest.fn().mockReturnValue({}) })),
    nativeToScVal: jest.fn().mockReturnValue({}),
    scValToNative: jest.fn().mockReturnValue({}),
    xdr: { ScVal: { scvVoid: jest.fn().mockReturnValue({}) } },
    Keypair: {
      fromPublicKey: jest.fn().mockReturnValue({ verify: jest.fn().mockReturnValue(true) }),
    },
    SorobanRpc: { Server: jest.fn(() => server) },
    rpc: { Server: jest.fn(() => server) },
  };
});

jest.mock('./utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock(
  'express-validator',
  () => {
    const chain = () => {
      const value = {
        trim: () => value,
        customSanitizer: () => value,
        isLength: () => value,
        withMessage: () => value,
        run: () => Promise.resolve(),
      };
      return value;
    };
    return {
      body: chain,
      param: chain,
      query: chain,
      validationResult: () => ({ isEmpty: () => true }),
    };
  },
  { virtual: true }
);

jest.mock('./jobs/healthFactorJob', () => ({
  scheduleHealthFactorJob: jest.fn(() => ({ stop: jest.fn() })),
  runHealthFactorJob: jest.fn().mockResolvedValue(0),
}));

jest.mock('./jobs/repaymentReminderJob', () => ({
  scheduleRepaymentReminderJob: jest.fn(() => ({ stop: jest.fn() })),
}));

jest.mock('./graphql/server', () => ({
  createGraphQLMiddleware: jest.fn().mockResolvedValue({
    middleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    server: { stop: jest.fn().mockResolvedValue(undefined) },
  }),
}));

let testUser: { publicKey: string } = {
  publicKey: 'GBGBE57DSWNBO73HMKLGPCNUR7V4T3WYCXU34AHVZAR3FFFOSVZLEABQ',
};

jest.mock('./middleware/auth', () => ({
  authRouter: require('express').Router(),
  jwtMiddleware: (req: { user?: { publicKey: string } }, _res: unknown, next: () => void) => {
    req.user = testUser;
    next();
  },
}));

const testHttpServer = {
  close: jest.fn(),
  closeAllConnections: jest.fn(),
};
(globalThis as unknown as { httpServer: typeof testHttpServer }).httpServer = testHttpServer;
(globalThis as unknown as { isShuttingDown: boolean }).isShuttingDown = false;
const app = jest.requireActual<{ default: Express }>('./index').default;

const owner = 'GBGBE57DSWNBO73HMKLGPCNUR7V4T3WYCXU34AHVZAR3FFFOSVZLEABQ';
const uploadsDirectory = path.resolve(__dirname, '../uploads');
const initialUploads = new Set(fs.readdirSync(uploadsDirectory));

function multipart(
  fields: Record<string, string>,
  file?: { buffer: Buffer; filename: string; contentType: string }
) {
  let test = request(app).post('/api/v1/collateral');
  for (const [key, value] of Object.entries(fields)) {
    test = test.field(key, value);
  }
  if (file) {
    test = test.attach('image', file.buffer, {
      filename: file.filename,
      contentType: file.contentType,
    });
  }
  return test;
}

function uploadFiles() {
  return new Set(fs.readdirSync(uploadsDirectory));
}

describe('POST /api/v1/collateral multipart registration', () => {
  beforeEach(() => {
    _resetDeduplicationCache();
    testUser = { publicKey: owner };
  });

  afterAll(() => {
    for (const filename of fs.readdirSync(uploadsDirectory)) {
      if (!initialUploads.has(filename)) {
        fs.unlinkSync(path.join(uploadsDirectory, filename));
      }
    }
  });

  it.each([
    ['image/jpeg', 'photo.exe', '.jpg'],
    ['image/png', 'photo.exe', '.png'],
  ])('stores a valid %s image with canonical fields', async (contentType, filename, extension) => {
    const response = await multipart(
      {
        animal_type: ' cattle ',
        breed: ' Holstein ',
        age: '3.5',
        weight: '450.25',
      },
      { buffer: Buffer.from('image-data'), filename, contentType }
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      owner,
      animal_type: 'cattle',
      breed: 'Holstein',
      age_years: 3.5,
      weight_kg: 450.25,
      count: 1,
      appraised_value: 45025,
    });
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.photo_url).toMatch(new RegExp(`^/uploads/[0-9a-f-]+${extension}$`));
  });

  it('does not deduplicate multipart requests', async () => {
    const fields = { animal_type: 'cattle', breed: 'Angus', age: '4', weight: '500' };
    const file = {
      buffer: Buffer.from('image-data'),
      filename: 'cow.png',
      contentType: 'image/png',
    };
    const first = await multipart(fields, file);
    const second = await multipart(fields, file);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
  });

  it('requires an image', async () => {
    const response = await multipart({
      animal_type: 'cattle',
      breed: 'Holstein',
      age: '3',
      weight: '450',
    });

    expect(response.status).toBe(422);
    expect(response.body.details).toHaveProperty('image');
  });

  it('rejects an invalid image MIME type', async () => {
    const response = await multipart(
      { animal_type: 'cattle', breed: 'Holstein', age: '3', weight: '450' },
      { buffer: Buffer.from('not-an-image'), filename: 'photo.gif', contentType: 'image/gif' }
    );

    expect(response.status).toBe(422);
    expect(response.body.details.image[0]).toMatch(/JPEG or PNG/);
  });

  it('rejects an image larger than 100 KB with 413', async () => {
    const before = uploadFiles();
    const response = await multipart(
      { animal_type: 'cattle', breed: 'Holstein', age: '3', weight: '450' },
      {
        buffer: Buffer.alloc(100 * 1024 + 1),
        filename: 'large.png',
        contentType: 'image/png',
      }
    );

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('Payload Too Large');
    expect(uploadFiles()).toEqual(before);
  });

  it('returns field-keyed errors and removes a valid image when text fields are invalid', async () => {
    const before = uploadFiles();
    const response = await multipart(
      { animal_type: ' ', breed: '', age: 'not-a-number', weight: '0' },
      { buffer: Buffer.from('image-data'), filename: 'photo.png', contentType: 'image/png' }
    );

    expect(response.status).toBe(422);
    expect(response.body.details).toEqual(
      expect.objectContaining({
        animal_type: expect.any(Array),
        breed: expect.any(Array),
        age: expect.any(Array),
        weight: expect.any(Array),
      })
    );
    expect(uploadFiles()).toEqual(before);
  });

  it('derives owner from the authenticated request user', async () => {
    const authenticatedOwner = 'GASPH4OCYOERATXIKLPNURXUP7ISAQU2KWFB5XLUJ3LQHKHOCN3CEGD6';
    testUser = { publicKey: authenticatedOwner };
    const response = await multipart(
      {
        owner: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        animal_type: 'goat',
        breed: 'Boer',
        age: '2',
        weight: '60',
      },
      { buffer: Buffer.from('image-data'), filename: 'goat.jpg', contentType: 'image/jpeg' }
    );

    expect(response.status).toBe(201);
    expect(response.body.owner).toBe(authenticatedOwner);
  });

  it('preserves the legacy JSON create payload', async () => {
    const response = await request(app).post('/api/v1/collateral').send({
      owner: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      animal_type: 'sheep',
      count: 3,
      appraised_value: 750000,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      owner,
      animal_type: 'sheep',
      count: 3,
      appraised_value: 750000,
    });
    expect(response.body.id).toEqual(expect.any(String));
  });
});
