import { z } from 'zod';

/** Validated environment. Parsed once at startup; the app refuses to boot on a bad env. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.string().min(1),
  WEB_URL: z.string().min(1),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  COOKIE_DOMAIN: z.string().default(''),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),

  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET: z.string().default('linkedout-avatars'),
  R2_PUBLIC_BASE_URL: z.string().default(''),
  R2_ENDPOINT: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;
