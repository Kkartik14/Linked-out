import type { RequestHandler } from 'express';

export const DEFAULT_PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0';

/** Applies the private default before middleware such as CORS can finish a response early. */
export const applyDefaultPrivateCachePolicy: RequestHandler = (_request, response, next) => {
  if (!response.hasHeader('Cache-Control')) {
    response.setHeader('Cache-Control', DEFAULT_PRIVATE_CACHE_CONTROL);
  }
  next();
};
