import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// ─── Token Types ──────────────────────────────────────────────────────────────

export interface TokenPayload {
  userId: string;
  email: string;
}

// Internal — typed payloads include a "type" discriminator so we can reject
// a refresh token used as an access token and vice versa.
interface AccessTokenClaims extends TokenPayload {
  type: 'access';
}

interface RefreshTokenClaims extends TokenPayload {
  type: 'refresh';
}

// ─── Access Token — 15 minutes ───────────────────────────────────────────────
// Short-lived. Must be refreshed via POST /api/auth/refresh before expiry.
// The frontend should call /refresh when it gets a 401 or proactively at ~13 min.

export function generateAccessToken(payload: TokenPayload): string {
  const claims: AccessTokenClaims = { ...payload, type: 'access' };
  return jwt.sign(claims, env.JWT_SECRET, {
    expiresIn: '15m',   // exactly 15 minutes — matches JWT_EXPIRY default
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
  }) as AccessTokenClaims;

  // Reject refresh tokens presented as access tokens
  if (decoded.type !== 'access') {
    throw new jwt.JsonWebTokenError('Invalid token type');
  }

  return { userId: decoded.userId, email: decoded.email };
}

// ─── Refresh Token — 7 days ───────────────────────────────────────────────────
// Long-lived. Stored in memStore server-side so it can be revoked on logout.
// Uses a DIFFERENT secret than access tokens so they cannot be interchanged.

export function generateRefreshToken(payload: TokenPayload): string {
  const claims: RefreshTokenClaims = { ...payload, type: 'refresh' };
  return jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',    // 7 days
    algorithm: 'HS256',
  });
}

export function verifyRefreshToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
  }) as RefreshTokenClaims;

  // Reject access tokens presented as refresh tokens
  if (decoded.type !== 'refresh') {
    throw new jwt.JsonWebTokenError('Invalid token type');
  }

  return { userId: decoded.userId, email: decoded.email };
}
