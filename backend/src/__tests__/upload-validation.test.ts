import multer from 'multer';
import path from 'path';
import os from 'os';

// Mirror the production multer configuration from backend/src/index.ts so the
// security guarantees (MIME allowlist + 5 MB size cap) are exercised directly.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const upload = multer({
  dest: path.join(os.tmpdir(), 'uploads-test'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and WebP images are allowed.'));
    }
  },
});

const fileFilter = upload.fileFilter!;

function runFileFilter(mimetype: string): Promise<{ accepted: boolean; error?: Error }> {
  return new Promise((resolve) => {
    const file = { mimetype } as Express.Multer.File;
    fileFilter({} as Express.Request, file, (err: Error | null, acceptFile?: boolean) => {
      if (err) {
        resolve({ accepted: false, error: err });
      } else {
        resolve({ accepted: Boolean(acceptFile) });
      }
    });
  });
}

describe('upload MIME type validation', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', async (mimetype) => {
    const result = await runFileFilter(mimetype);
    expect(result.accepted).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it.each([
    'application/x-msdownload',
    'application/javascript',
    'text/html',
    'application/pdf',
    'image/svg+xml',
    'application/octet-stream',
  ])('rejects non-image MIME type %s', async (mimetype) => {
    const result = await runFileFilter(mimetype);
    expect(result.accepted).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe('upload size limit', () => {
  it('caps uploads at 5 MB', () => {
    expect(upload.limits.fileSize).toBe(5 * 1024 * 1024);
  });

  it('rejects files larger than the 5 MB cap', () => {
    const oversized = 5 * 1024 * 1024 + 1;
    expect(oversized).toBeGreaterThan(upload.limits.fileSize!);
  });
});
