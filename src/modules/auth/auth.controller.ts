import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler';
import { authMiddleware } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimiter';
import { validate, emailSchema, passwordSchema } from '../../middleware/validation';
import {
  registerUser, verifyEmail, loginUser,
  googleSignIn, refreshAccessToken, logoutUser,
  forgotPassword, verifyPasswordResetOTP, resetPassword,
} from './auth.service';
import { ValidationError } from '../../utils/errors';

const router = Router();
router.use(authLimiter);



// ─── Schemas ──────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  firstName:   z.string().min(1, 'First name is required'),
  lastName:    z.string().min(1, 'Last name is required'),
  email:       emailSchema,
  password:    passwordSchema,
  phoneNumber: z.string().optional(),
  country:     z.string().optional(),
  city:        z.string().optional(),
});

const verifySchema = z.object({
  email: emailSchema,
  otp:   z.string().length(6, 'OTP must be 6 digits'),
});

const loginSchema = z.object({
  email:    emailSchema,
  password: z.string().min(1, 'Password is required'),
});

const googleSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const verifyResetOTPSchema = z.object({
  email: emailSchema,
  otp:   z.string().length(6, 'OTP must be 6 digits'),
});

const resetPasswordSchema = z.object({
  email:       emailSchema,
  otp:         z.string().length(6, 'OTP must be 6 digits'),
  newPassword: passwordSchema,
});


// ─── Cookie helper ────────────────────────────────────────────────────────────

function setRefreshCookie(res: Response, token: string) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/auth/register
router.post('/register', validate(registerSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await registerUser(req.body);
  res.status(200).json(result);
}));

// POST /api/auth/verify-email
router.post('/verify-email', validate(verifySchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  const result = await verifyEmail(email, otp);
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json({ accessToken: result.accessToken, user: result.user });
}));

// POST /api/auth/login
router.post('/login', validate(loginSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await loginUser(email, password);
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({ accessToken: result.accessToken, user: result.user });
}));

// POST /api/auth/google
// Handles both sign-up and sign-in with Google in one endpoint.
// isNewUser: true  → client should show "Welcome" / onboarding screen.
// isNewUser: false → client should go directly to the app.
router.post('/google', validate(googleSchema), asyncHandler(async (req: Request, res: Response) => {
  const { idToken } = req.body;
  const result = await googleSignIn(idToken);
  setRefreshCookie(res, result.refreshToken);
  res.status(result.isNewUser ? 201 : 200).json({
    accessToken: result.accessToken,
    user:        result.user,
    isNewUser:   result.isNewUser,
  });
}));

// ─── Forgot password (3-step flow) ────────────────────────────────────────────

// Step 1 — POST /api/auth/forgot-password
// Send a 6-digit reset OTP to the provided email.
// Always returns 200 (no email-enumeration leak).
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forgotPassword(req.body.email);
    res.status(200).json(result);
  }),
);

// Step 2 — POST /api/auth/verify-reset-otp  (optional client checkpoint)
// Validate the OTP before showing the "new password" form.
// On success, marks the OTP as verified in the in-memory store
// so the final step doesn't need to re-verify it.
router.post(
  '/verify-reset-otp',
  validate(verifyResetOTPSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, otp } = req.body;
    const result = await verifyPasswordResetOTP(email, otp);
    res.status(200).json(result);
  }),
);

// Step 3 — POST /api/auth/reset-password
// Set the new password. Accepts the OTP directly (single-step) or relies on
// the verified flag set by /verify-reset-otp (two-step).
// All existing refresh tokens for the account are revoked on success.
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, otp, newPassword } = req.body;
    const result = await resetPassword(email, otp, newPassword);
    res.clearCookie('refreshToken');
    res.status(200).json(result);
  }),
);

// ─── Token management ─────────────────────────────────────────────────────────

// POST /api/auth/refresh
// Rotates the refresh token — the client's 7-day window is always rolling.
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken ?? req.body?.refreshToken;
  if (!token) throw new ValidationError('Refresh token is required');

  const result = await refreshAccessToken(token);

  // Rotate the cookie with the new refresh token
  setRefreshCookie(res, result.refreshToken);

  res.status(200).json({ accessToken: result.accessToken });
}));

// POST /api/auth/logout
router.post('/logout', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  await logoutUser(req.user!.userId);
  res.clearCookie('refreshToken');
  res.status(200).json({ message: 'Logged out successfully' });
}));

export default router;