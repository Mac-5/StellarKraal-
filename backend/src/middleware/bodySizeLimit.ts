import { Request, Response, NextFunction } from 'express';

/** Maximum request body size for JSON, URL-encoded, and multipart requests. */
export const MAX_BODY_SIZE_BYTES = 100 * 1024;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function rejectOversizedRequest(req: Request, res: Response): void {
  if (res.headersSent) return;
  res.status(413).json({ error: 'Payload Too Large' });
  // A streamed request has no parser-level limit to stop it. Destroy the
  // request after the response is flushed so no downstream handler can act on
  // a partial body while still allowing the client to receive the 413.
  res.once('finish', () => req.destroy());
}

/**
 * Reject oversized mutating requests before a body parser or multipart handler
 * allocates request data. Parser-specific limits remain enabled at the app
 * boundary for requests that do not provide Content-Length.
 */
export function bodySizeLimit(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  const rawContentLength = req.headers['content-length'];
  const contentLength = rawContentLength === undefined ? NaN : Number(rawContentLength);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE_BYTES) {
    rejectOversizedRequest(req, res);
    return;
  }

  // Content-Length is absent for chunked requests. Count those bytes before
  // the JSON, URL-encoded, or multipart parser can hand a request to a route.
  if (!Number.isFinite(contentLength)) {
    let received = 0;
    let rejected = false;

    const cleanup = () => {
      req.off('data', onData);
      req.off('end', cleanup);
      req.off('aborted', cleanup);
    };
    const onData = (chunk: Buffer | string) => {
      if (rejected) return;
      received += Buffer.byteLength(chunk);
      if (received > MAX_BODY_SIZE_BYTES) {
        rejected = true;
        cleanup();
        rejectOversizedRequest(req, res);
      }
    };

    req.on('data', onData);
    req.once('end', cleanup);
    req.once('aborted', cleanup);
    res.once('finish', cleanup);
  }

  next();
}
