import { Router, Request, Response, NextFunction } from 'express';

/**
 * API versioning strategy
 * -----------------------
 * Every API surface is mounted under an explicit version prefix (`/api/v1`).
 * To introduce a new version, create a sibling router (e.g. `v2Router`) and
 * mount it under `/api/v2` in `mountApiVersions`. Versions coexist so clients
 * can migrate at their own pace; unversioned `/api` requests are rejected with
 * a 404 that points at the versioned path.
 */

const API_VERSIONS = ['v1'] as const;
const DEFAULT_API_VERSION = 'v1';

export function createV1Router(): Router {
  const router = Router();

  // Existing v1 routes are registered here (or imported and mounted).
  // Example: router.use('/users', usersRouter);

  return router;
}

/**
 * Mounts every API version under its own prefix. Add new versions by
 * registering another entry here without touching existing ones.
 */
export function mountApiVersions(app: Router): void {
  app.use('/api/v1', createV1Router());

  // Requests to /api without a version get a 404 pointing at the versioned path.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/' || req.path === '') {
      res.status(404).json({
        error: 'API version required',
        message: `Please use a versioned API path, e.g. /api/${DEFAULT_API_VERSION}${req.originalUrl.replace(/^\/api/, '')}`,
        supportedVersions: API_VERSIONS,
      });
      return;
    }
    next();
  });
}

export default mountApiVersions;
