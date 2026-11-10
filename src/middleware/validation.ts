import { z, ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Middleware factory: validates req.body against a Zod schema
// On success: attaches parsed data to req.body (with type coercion applied)
// On failure: passes ZodError to the global errorHandler
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(result.error); // ZodError → errorHandler formats it as 400
    }
    req.body = result.data;
    next();
  };
}

// ─── Common reusable schemas ──────────────────────────────────────────────────

export const emailSchema = z.string().email('Invalid email address').toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
