import nodemailer from 'nodemailer';
import { env } from '../../config/env';

// Gmail SMTP transporter — uses your Gmail address + a Google App Password.
// App Password is NOT your real Gmail password. Get one at:
// Google Account → Security → 2-Step Verification → App Passwords → Create
const transporter = nodemailer.createTransport({
  service: 'gmail',         // tells nodemailer to use Gmail's SMTP settings automatically
  auth: {
    user: env.GMAIL_USER,          // yourname@gmail.com
    pass: env.GMAIL_APP_PASSWORD,  // the 16-char App Password (no spaces)
  },
});

export async function sendOTPEmail(email: string, firstName: string, otp: string): Promise<void> {
  await transporter.sendMail({
    from: `"PlantGuard" <${env.GMAIL_USER}>`,
    to: email,
    subject: 'Your PlantGuard verification code',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color: #2d6a4f;">Welcome to PlantGuard, ${firstName}! 🌿</h2>
        <p>Your verification code is:</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1b4332; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #666;">This code expires in <strong>10 minutes</strong>.</p>
        <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetOTPEmail(
  email: string,
  firstName: string,
  otp: string,
): Promise<void> {
  await transporter.sendMail({
    from: `"PlantGuard" <${env.GMAIL_USER}>`,
    to: email,
    subject: 'Reset your PlantGuard password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color: #2d6a4f;">Password Reset 🔒</h2>
        <p>Hi ${firstName}, we received a request to reset your PlantGuard password.</p>
        <p>Use the code below to continue. It expires in <strong>10 minutes</strong>.</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1b4332; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #999; font-size: 12px;">
          If you didn't request a password reset, you can safely ignore this email.
          Your password will not be changed.
        </p>
      </div>
    `,
  });
}