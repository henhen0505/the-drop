import 'dotenv/config';
import { z } from 'zod';

/**
 * Env var schema. Validated once at process startup so misconfiguration
 * fails loudly before the server accepts traffic, rather than surfacing
 * as an obscure runtime error later (e.g. an unparsable DATABASE_URL
 * breaking the first query).
 */
const envSchema = z
  .object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .url('DATABASE_URL must be a valid connection string'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  FRONTEND_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  LASTFM_API_KEY: z.string().optional(),
  TICKETMASTER_API_KEY: z.string().optional(),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_DAYS: z.coerce.number().int().positive().default(7),
  // architecture/dedup-engine.md "Review-Only Launch Mode": auto-merge stays off
  // until the first 50-100 decisions have been manually reviewed.
  DEDUP_AUTO_MERGE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DEDUP_AUTO_MERGE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  DEDUP_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.55),
  // api-contracts.md "POST /submissions": a PROMOTER's submissions auto-publish once this many of
  // their earlier submissions have been approved (or merged) by an admin. 0 auto-publishes always.
  PROMOTER_AUTO_PUBLISH_AFTER: z.coerce.number().int().min(0).default(3),
  })
  .refine((e) => e.DEDUP_REVIEW_THRESHOLD < e.DEDUP_AUTO_MERGE_THRESHOLD, {
    message: 'DEDUP_REVIEW_THRESHOLD must be lower than DEDUP_AUTO_MERGE_THRESHOLD',
    path: ['DEDUP_REVIEW_THRESHOLD'],
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // Fail fast: an invalid/missing env var at startup is a boundary
    // violation, not something to limp along with defaults.
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}

export const env = loadEnv();

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  database: {
    url: env.DATABASE_URL,
  },
  frontendUrl: env.FRONTEND_URL,
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
  },
  spotify: {
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
  },
  lastfm: {
    apiKey: env.LASTFM_API_KEY,
  },
  ticketmaster: {
    apiKey: env.TICKETMASTER_API_KEY,
  },
  dedup: {
    autoMergeEnabled: env.DEDUP_AUTO_MERGE_ENABLED,
    autoMergeThreshold: env.DEDUP_AUTO_MERGE_THRESHOLD,
    reviewThreshold: env.DEDUP_REVIEW_THRESHOLD,
  },
  submissions: {
    promoterAutoPublishAfter: env.PROMOTER_AUTO_PUBLISH_AFTER,
  },
  jwt: {
    secret: env.JWT_SECRET,
    accessExpiry: env.JWT_ACCESS_EXPIRY,
    refreshDays: env.JWT_REFRESH_DAYS,
  },
} as const;
