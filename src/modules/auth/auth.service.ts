// src/modules/auth/auth.service.ts

import { OAuth2Client } from 'google-auth-library';
import prisma from '../../config/connectionDb';
import { memSet, memGet, memDel } from '../../config/memStore';
import { hashPassword, verifyPassword, generateOTP, isValidOTPFormat } from '../../utils/hash';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { sendOTPEmail, sendPasswordResetOTPEmail } from './auth.email';
import { ValidationError, AuthenticationError, ConflictError } from '../../utils/errors';
import { env } from '../../config/env';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const OTP_TTL     = 600;               // 10 minutes
const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// ─── Register ─────────────────────────────────────────────────────────────────

export async function registerUser(data: {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  country?: string;
  city?: string;
  password: string;
}): Promise<{ message: string }> {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing && !existing.deletedAt) {
    if (existing.authProvider === 'GOOGLE') {
      throw new ConflictError('This email is linked to a Google account. Please sign in with Google.');
    }
    throw new ConflictError('This email is already registered.');
  }

  const otp            = generateOTP();
  const hashedPassword = await hashPassword(data.password);

  memSet(`otp:${data.email}`,      OTP_TTL, otp);
  memSet(`register:${data.email}`, OTP_TTL, JSON.stringify({ ...data, password: hashedPassword }));

  await sendOTPEmail(data.email, data.firstName, otp);

  return { message: 'OTP sent to your email. Please verify within 10 minutes.' };
}

// ─── Verify email ─────────────────────────────────────────────────────────────

export async function verifyEmail(
  email: string,
  otp: string
): Promise<{ accessToken: string; refreshToken: string; user: Record<string, any> }> {
  if (!isValidOTPFormat(otp)) throw new ValidationError('OTP must be 6 digits');

  const storedOtp        = memGet(`otp:${email}`);
  const registrationJson = memGet(`register:${email}`);

  if (!storedOtp)         throw new ValidationError('OTP expired. Please register again.');
  if (storedOtp !== otp)  throw new ValidationError('Incorrect OTP.');
  if (!registrationJson)  throw new ValidationError('Registration data expired. Please register again.');

  const regData = JSON.parse(registrationJson);
  const user    = await prisma.user.create({ data: { ...regData, authProvider: 'EMAIL' } });

  memDel(`otp:${email}`);
  memDel(`register:${email}`);

  const tokens = await _issueTokens(user.user_id, user.email);
  const { password: _, ...safe } = user;
  return { ...tokens, user: safe };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser(
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string; user: Record<string, any> }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) throw new AuthenticationError('Invalid email or password');

  if (user.authProvider === 'GOOGLE' || !user.password) {
    throw new AuthenticationError('This account uses Google sign-in. Please sign in with Google.');
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) throw new AuthenticationError('Invalid email or password');

  const tokens = await _issueTokens(user.user_id, user.email);
  const { password: _, ...safe } = user;
  return { ...tokens, user: safe };
}

// ─── Google Sign-In / Sign-Up ─────────────────────────────────────────────────
// Handles both flows in one call:
//   • New user  → creates account, returns isNewUser: true
//   • Returning user → logs in, returns isNewUser: false
//   • Existing email-only account → links the Google ID, returns isNewUser: false

export async function googleSignIn(
  idToken: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: Record<string, any>;
  isNewUser: boolean;
}> {
  // 1. Verify Google ID Token
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) {
    throw new AuthenticationError('Invalid Google token');
  }

  const { sub: googleId, email, given_name, family_name, picture } = payload;

  // 2. Find existing user (by googleId OR email) — intentionally no deletedAt
  //    filter here so we detect soft-deleted rows before trying to create,
  //    which would fail with a unique-constraint error on the email column.
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { googleId },
        { email },
      ],
    },
  });

  let isNewUser = false;

  if (!user) {
    // ── Create new Google user ───────────────────────────────
    user = await prisma.user.create({
      data: {
        email,
        googleId,
        firstName:    given_name ?? 'User',
        lastName:     family_name ?? '',
        profileImage: picture ?? null,
        authProvider: 'GOOGLE',
        timezone:     'Africa/Cairo',
        subscription: 'FREE',
        password:     null,
      },
    });
    isNewUser = true;
  } else if (user.deletedAt) {
    // ── Soft-deleted account — restore and re-link to Google ─
    user = await prisma.user.update({
      where: { user_id: user.user_id },
      data: {
        googleId,
        authProvider: 'GOOGLE',
        deletedAt:    null,              // un-delete the account
        firstName:    given_name ?? user.firstName,
        lastName:     family_name ?? user.lastName,
        profileImage: picture ?? user.profileImage,
        password:     null,
      },
    });
    isNewUser = true;                    // treat as new from client's perspective
  } else if (!user.googleId) {
    // ── Link existing active email account to Google ─────────
    user = await prisma.user.update({
      where: { user_id: user.user_id },
      data: {
        googleId,
        authProvider: 'GOOGLE',
      },
    });
  }

  // 3. Issue tokens
  const tokens = await _issueTokens(user.user_id, user.email);

  // 4. Return safe user object (strip sensitive fields)
  const { password: _, ...safeUser } = user;

  return { ...tokens, user: safeUser, isNewUser };
}

// ─── Forgot password ──────────────────────────────────────────────────────────
// Step 1 of 2: send a 6-digit OTP to the user's registered email address.
// We intentionally return the same success message whether the email exists or
// not so that we don't leak registered addresses to anonymous callers.

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Only send an OTP if the account exists, is active, and uses email auth.
  // (Google-only accounts have no password to reset.)
  if (user && !user.deletedAt && user.authProvider !== 'GOOGLE' && user.password) {
    const otp = generateOTP();
    memSet(`pwd_reset_otp:${email}`,   OTP_TTL, otp);
    memSet(`pwd_reset_ready:${email}`, OTP_TTL, 'pending'); // gate for step 2
    await sendPasswordResetOTPEmail(email, user.firstName, otp);
  }

  // Same response regardless — prevents email enumeration
  return { message: 'If that email is registered, a reset code has been sent.' };
}

// ─── Verify reset OTP ─────────────────────────────────────────────────────────
// Step 2a (optional client checkpoint): confirm the OTP is correct before
// showing the "new password" form. Returns a short-lived token that must be
// supplied to resetPassword so the client doesn't have to resend the OTP.

export async function verifyPasswordResetOTP(
  email: string,
  otp: string,
): Promise<{ message: string }> {
  if (!isValidOTPFormat(otp)) throw new ValidationError('OTP must be 6 digits');

  const storedOtp = memGet(`pwd_reset_otp:${email}`);
  if (!storedOtp)        throw new ValidationError('OTP expired. Please request a new one.');
  if (storedOtp !== otp) throw new ValidationError('Incorrect OTP.');

  // Mark OTP as verified so resetPassword can proceed
  memSet(`pwd_reset_verified:${email}`, OTP_TTL, 'true');

  return { message: 'OTP verified. You may now set a new password.' };
}

// ─── Reset password ───────────────────────────────────────────────────────────
// Step 2b: set the new password. Requires the OTP to be verified first
// (either via verifyPasswordResetOTP or in the same call if the client
// sends both at once — this function accepts the otp param for a single-step flow).

export async function resetPassword(
  email: string,
  otp: string,
  newPassword: string,
): Promise<{ message: string }> {
  if (!isValidOTPFormat(otp)) throw new ValidationError('OTP must be 6 digits');

  // Accept if the OTP itself is still valid OR was already verified in step 2a
  const storedOtp      = memGet(`pwd_reset_otp:${email}`);
  const alreadyVerified = memGet(`pwd_reset_verified:${email}`);

  if (!alreadyVerified && !storedOtp) {
    throw new ValidationError('OTP expired. Please request a new reset code.');
  }
  if (!alreadyVerified && storedOtp !== otp) {
    throw new ValidationError('Incorrect OTP.');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) throw new ValidationError('Account not found.');

  if (user.authProvider === 'GOOGLE' || !user.password) {
    throw new ValidationError('Google accounts cannot reset a password here. Please sign in with Google.');
  }

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({ where: { email }, data: { password: hashed } });

  // Clean up all reset keys and invalidate any active refresh tokens
  memDel(`pwd_reset_otp:${email}`);
  memDel(`pwd_reset_ready:${email}`);
  memDel(`pwd_reset_verified:${email}`);
  memDel(`refresh:${user.user_id}`);

  return { message: 'Password reset successfully. Please log in with your new password.' };
}

// ─── Refresh access token ─────────────────────────────────────────────────────
// Returns BOTH a new accessToken AND a rotated refreshToken.
// The old refresh token is deleted from the store and replaced with the new one.

export async function refreshAccessToken(
  token: string
): Promise<{ accessToken: string; refreshToken: string }> {
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw new AuthenticationError('Invalid or expired refresh token');
  }

  const stored = memGet(`refresh:${decoded.userId}`);
  if (!stored || stored !== token) {
    throw new AuthenticationError('Refresh token has been revoked');
  }

  // Rotate: delete old token, issue a fresh pair
  memDel(`refresh:${decoded.userId}`);
  const tokens = await _issueTokens(decoded.userId, decoded.email);
  return tokens;
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutUser(userId: string): Promise<void> {
  memDel(`refresh:${userId}`);
}

// ─── Internal helper ──────────────────────────────────────────────────────────

async function _issueTokens(userId: string, email: string) {
  const accessToken  = generateAccessToken({ userId, email });
  const refreshToken = generateRefreshToken({ userId, email });
  memSet(`refresh:${userId}`, REFRESH_TTL, refreshToken);
  return { accessToken, refreshToken };
}