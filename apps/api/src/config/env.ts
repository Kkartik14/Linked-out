import { z } from 'zod';
import { BlockList, isIP } from 'node:net';

const localAddressBlockList = new BlockList();
localAddressBlockList.addSubnet('127.0.0.0', 8, 'ipv4');
localAddressBlockList.addSubnet('10.0.0.0', 8, 'ipv4');
localAddressBlockList.addSubnet('172.16.0.0', 12, 'ipv4');
localAddressBlockList.addSubnet('192.168.0.0', 16, 'ipv4');
localAddressBlockList.addSubnet('100.64.0.0', 10, 'ipv4');
localAddressBlockList.addSubnet('169.254.0.0', 16, 'ipv4');
localAddressBlockList.addSubnet('192.0.0.0', 24, 'ipv4');
localAddressBlockList.addSubnet('192.0.2.0', 24, 'ipv4');
localAddressBlockList.addSubnet('192.88.99.0', 24, 'ipv4');
localAddressBlockList.addSubnet('198.18.0.0', 15, 'ipv4');
localAddressBlockList.addSubnet('198.51.100.0', 24, 'ipv4');
localAddressBlockList.addSubnet('203.0.113.0', 24, 'ipv4');
localAddressBlockList.addSubnet('224.0.0.0', 4, 'ipv4');
localAddressBlockList.addSubnet('240.0.0.0', 4, 'ipv4');
localAddressBlockList.addSubnet('0.0.0.0', 8, 'ipv4');
localAddressBlockList.addAddress('::1', 'ipv6');
localAddressBlockList.addAddress('::', 'ipv6');
localAddressBlockList.addSubnet('64:ff9b::', 96, 'ipv6');
localAddressBlockList.addSubnet('100::', 64, 'ipv6');
localAddressBlockList.addSubnet('2001::', 23, 'ipv6');
localAddressBlockList.addSubnet('2001:db8::', 32, 'ipv6');
localAddressBlockList.addSubnet('2002::', 16, 'ipv6');
localAddressBlockList.addSubnet('fc00::', 7, 'ipv6');
localAddressBlockList.addSubnet('fe80::', 10, 'ipv6');
localAddressBlockList.addSubnet('ff00::', 8, 'ipv6');

const optionalUrl = z
  .string()
  .default('')
  .refine((value) => value.length === 0 || z.url().safeParse(value).success, {
    message: 'Must be a valid URL.',
  });

function normalizeHostname(hostname: string): string {
  let normalized = hostname.toLowerCase();
  while (normalized.endsWith('.')) normalized = normalized.slice(0, -1);
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized;
}

function isLocalProductionHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  const family = isIP(normalized);
  if (family === 0) return false;
  return localAddressBlockList.check(normalized, family === 4 ? 'ipv4' : 'ipv6');
}

function addProductionNetworkUrlIssues(
  ctx: z.RefinementCtx,
  field: string,
  value: string,
): URL | null {
  // Base-field validation owns missing/malformed URL messages. Production hardening must
  // never throw while Zod is still accumulating those issues.
  if (value.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') {
    ctx.addIssue({ code: 'custom', path: [field], message: `${field} must use HTTPS in production.` });
  }
  if (isLocalProductionHost(parsed.hostname)) {
    ctx.addIssue({
      code: 'custom',
      path: [field],
      message: `${field} cannot point at a non-public network in production.`,
    });
  }
  return parsed;
}

function addProductionUrlIssues(
  ctx: z.RefinementCtx,
  field: 'API_BASE_URL' | 'WEB_URL',
  value: string,
): void {
  const parsed = addProductionNetworkUrlIssues(ctx, field, value);
  if (!parsed) return;
  if (parsed.pathname !== '/' || parsed.search.length > 0 || parsed.hash.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: [field],
      message: `${field} must be an origin without path, query, or hash.`,
    });
  }
}

/** Validated environment. Parsed once at startup; the app refuses to boot on a bad env. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_BASE_URL: z.url(),
    WEB_URL: z.url(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

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
    R2_PUBLIC_BASE_URL: optionalUrl,
    R2_ENDPOINT: optionalUrl,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    const requiredProductionFields = [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'R2_PUBLIC_BASE_URL',
      'R2_ENDPOINT',
      'COOKIE_DOMAIN',
    ] as const;

    for (const field of requiredProductionFields) {
      if (env[field].length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is required in production.`,
        });
      }
    }

    addProductionUrlIssues(ctx, 'API_BASE_URL', env.API_BASE_URL);
    addProductionUrlIssues(ctx, 'WEB_URL', env.WEB_URL);
    addProductionNetworkUrlIssues(ctx, 'R2_PUBLIC_BASE_URL', env.R2_PUBLIC_BASE_URL);
    addProductionNetworkUrlIssues(ctx, 'R2_ENDPOINT', env.R2_ENDPOINT);
    if (env.TRUST_PROXY_HOPS <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY_HOPS'],
        message: 'TRUST_PROXY_HOPS must be set to the exact trusted proxy hop count in production.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
