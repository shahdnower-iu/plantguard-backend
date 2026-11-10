import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';

// Global error handler — catches all errors thrown in routes/services
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Zod validation errors (bad request body)
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    res.status(400).json({ error: 'Validation failed', details: messages, code: 'VALIDATION_ERROR' });
    return;
  }

  // Our custom app errors (ValidationError, AuthenticationError, NotFoundError, etc.)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }
  
  // Unknown errors — log and return generic 500
  console.error('[Error]', err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}

// Wraps async route handlers so errors are forwarded to errorHandler automatically
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
