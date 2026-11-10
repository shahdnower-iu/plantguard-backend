import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// General API — 100 req / 15 min per IP
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth routes — 10 req / 15 min per IP (brute-force protection)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts, please try again later.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Disease scan (Plant.id) — 20 req / hour per IP
export const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Scan limit reached, please try again in an hour.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Spread scan (Claude Vision) — per AUTHENTICATED USER, not per IP.
 * Default: 5 scans / minute / user (configurable via env).
 * This is on top of the weekly quota enforced in user.service.ts.
 */
export const scanRateLimiter = rateLimit({
  windowMs: env.SCAN_RATE_LIMIT_WINDOW_MS,
  max: env.SCAN_RATE_LIMIT_MAX,
  // Key by user ID so shared IPs (offices, proxies) aren't unfairly limited
  keyGenerator: (req) => (req as any).user?.userId ?? req.ip ?? 'anonymous',
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many scans. Please wait a moment and try again.',
      code: 'SCAN_RATE_LIMIT',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
