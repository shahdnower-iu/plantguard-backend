// src/config/env.ts

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server
  PORT:     z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Database (PostgreSQL via Neon)
  DATABASE_URL: z.string().url(),

  // JWT — two separate secrets so access and refresh tokens are non-interchangeable
  JWT_SECRET:         z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  // Gmail SMTP
  GMAIL_USER:         z.string().email(),
  GMAIL_APP_PASSWORD: z.string().min(16),

  // Google OAuth
  GOOGLE_CLIENT_ID:     z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY:    z.string(),
  CLOUDINARY_API_SECRET: z.string(),

  // AI providers
  OPENROUTER_API_KEY: z.string().min(1),
  GEMINI_API_KEY:     z.string().min(1),

  // YOLOv8 local model server
  MODEL_SERVER_URL: z.string().url().default('http://localhost:5001'),

  // Spread-scan rate limiter (per authenticated user)
  // Defaults: 10 scans per 60 seconds
  SCAN_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  SCAN_RATE_LIMIT_MAX:       z.coerce.number().default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n[Config] ❌ Missing or invalid environment variables:');
  const errors = parsed.error.flatten().fieldErrors;
  Object.entries(errors).forEach(([key, msgs]) => {
    console.error(`  • ${key}: ${msgs?.join(', ')}`);
  });
  console.error('\nSee .env.example for the full list of required variables.\n');
  process.exit(1);
}

export const env = parsed.data;
export type Env  = z.infer<typeof envSchema>;
