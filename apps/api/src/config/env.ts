import { z } from 'zod';
import { Buffer } from 'node:buffer';
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

function isHttpOrigin(value: string): boolean {
  const parsed = z.url().safeParse(value);
  if (!parsed.success) return false;
  const url = new URL(value);
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.pathname === '/' &&
    url.search.length === 0 &&
    url.hash.length === 0 &&
    url.username.length === 0 &&
    url.password.length === 0
  );
}

const originMessage = 'Must be an HTTP(S) origin without credentials, path, query, or hash.';
const requiredOrigin = z
  .string()
  .refine(isHttpOrigin, { message: originMessage })
  .transform((value) => new URL(value).origin);
const optionalOrigin = z
  .string()
  .default('')
  .refine((value) => value.length === 0 || isHttpOrigin(value), { message: originMessage })
  .transform((value) => (value.length === 0 ? '' : new URL(value).origin));

const optionalInternalSecret = z.string().default('').refine(
  (value) => value.length === 0 || Buffer.byteLength(value, 'utf8') >= 32,
  { message: 'Must contain at least 32 bytes.' },
);

const otpEncryptionKey = z.string().default('').refine(
  (value) => value.length === 0 || Buffer.from(value, 'base64url').byteLength === 32,
  { message: 'Must be a base64url-encoded 32-byte key.' },
);

function normalizeHostname(hostname: string): string {
  let normalized = hostname.toLowerCase();
  while (normalized.endsWith('.')) normalized = normalized.slice(0, -1);
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized;
}

function originsEqual(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function isLocalProductionHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  const family = isIP(normalized);
  if (family === 0) return false;
  return localAddressBlockList.check(normalized, family === 4 ? 'ipv4' : 'ipv6');
}

function addProductionHttpsUrlIssues(
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
  return parsed;
}

function addProductionNetworkUrlIssues(
  ctx: z.RefinementCtx,
  field: string,
  value: string,
): URL | null {
  const parsed = addProductionHttpsUrlIssues(ctx, field, value);
  if (!parsed) return null;
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
  field: 'API_BASE_URL' | 'WEB_URL' | 'PUBLIC_OAUTH_CALLBACK_BASE_URL',
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
    // Vercel runs Preview deployments with NODE_ENV=production. Keep that deployment class
    // explicit so core production hardening stays enabled while optional integrations whose
    // callback/assets are intentionally production-only may remain disabled on arbitrary branches.
    VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
    PORT: z.coerce.number().int().positive().default(4000),
    API_BASE_URL: requiredOrigin,
    WEB_URL: requiredOrigin,
    PUBLIC_OAUTH_CALLBACK_BASE_URL: optionalOrigin,
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().optional(),

    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    INTERNAL_API_SECRET: optionalInternalSecret,
    BFF_CALLER_SECRET: optionalInternalSecret,
    OAUTH_SESSION_MODE: z.enum(['legacy', 'handoff']).default('legacy'),
    COOKIE_DOMAIN: z.string().default(''),

    EMAIL_DELIVERY_MODE: z.enum(['disabled', 'stub']).default('disabled'),
    EMAIL_OTP_PEPPER: optionalInternalSecret,
    EMAIL_OTP_ENCRYPTION_KEY: otpEncryptionKey,
    EMAIL_OTP_INSPECTION_SECRET: optionalInternalSecret,

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
    if (env.EMAIL_DELIVERY_MODE === 'stub') {
      for (const field of [
        'EMAIL_OTP_PEPPER',
        'EMAIL_OTP_ENCRYPTION_KEY',
        'EMAIL_OTP_INSPECTION_SECRET',
      ] as const) {
        if (env[field].length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} is required when EMAIL_DELIVERY_MODE is stub.`,
          });
        }
      }
    }
    if (env.OAUTH_SESSION_MODE === 'handoff') {
      for (const field of ['INTERNAL_API_SECRET', 'BFF_CALLER_SECRET'] as const) {
        if (env[field].length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} is required when OAUTH_SESSION_MODE is handoff.`,
          });
        }
      }
      if (env.PUBLIC_OAUTH_CALLBACK_BASE_URL.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBLIC_OAUTH_CALLBACK_BASE_URL'],
          message: 'PUBLIC_OAUTH_CALLBACK_BASE_URL is required when OAUTH_SESSION_MODE is handoff.',
        });
      } else if (originsEqual(env.PUBLIC_OAUTH_CALLBACK_BASE_URL, env.API_BASE_URL)) {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBLIC_OAUTH_CALLBACK_BASE_URL'],
          message: 'The public OAuth callback origin must be distinct from the private API origin.',
        });
      } else if (!originsEqual(env.PUBLIC_OAUTH_CALLBACK_BASE_URL, env.WEB_URL)) {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBLIC_OAUTH_CALLBACK_BASE_URL'],
          message: 'The public OAuth callback origin must match WEB_URL.',
        });
      }
    }
    for (const field of ['INTERNAL_API_SECRET', 'BFF_CALLER_SECRET'] as const) {
      if (
        env[field].length > 0 &&
        (env[field] === env.JWT_ACCESS_SECRET || env[field] === env.JWT_REFRESH_SECRET)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} must be distinct from legacy JWT secrets.`,
        });
      }
    }
    if (
      env.INTERNAL_API_SECRET.length > 0 &&
      env.INTERNAL_API_SECRET === env.BFF_CALLER_SECRET
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['BFF_CALLER_SECRET'],
        message: 'BFF_CALLER_SECRET must be distinct from INTERNAL_API_SECRET.',
      });
    }
    const authSecrets = [
      ['EMAIL_OTP_PEPPER', env.EMAIL_OTP_PEPPER],
      ['EMAIL_OTP_INSPECTION_SECRET', env.EMAIL_OTP_INSPECTION_SECRET],
    ] as const;
    for (const [field, secret] of authSecrets) {
      if (
        secret.length > 0 &&
        [env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET, env.INTERNAL_API_SECRET, env.BFF_CALLER_SECRET]
          .filter((candidate) => candidate.length > 0)
          .includes(secret)
      ) {
        ctx.addIssue({ code: 'custom', path: [field], message: `${field} must be a distinct secret.` });
      }
    }
    if (
      env.EMAIL_OTP_PEPPER.length > 0 &&
      env.EMAIL_OTP_PEPPER === env.EMAIL_OTP_INSPECTION_SECRET
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_OTP_INSPECTION_SECRET'],
        message: 'EMAIL_OTP_INSPECTION_SECRET must be distinct from EMAIL_OTP_PEPPER.',
      });
    }
    if (env.NODE_ENV !== 'production') return;

    // Arbitrary branch previews cannot share the canonical OAuth callback hostname and should not
    // receive production object-storage credentials by default. The core database/JWT/internal
    // assertion requirements above still apply. A stable staging/custom environment may opt in by
    // supplying these values, but ordinary previews are allowed to expose those features as
    // unconfigured instead of failing application startup.
    const requiredProductionFields =
      env.VERCEL_ENV === 'preview'
        ? ([] as const)
        : ([
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
            'INTERNAL_API_SECRET',
            'BFF_CALLER_SECRET',
          ] as const);

    for (const field of requiredProductionFields) {
      if (env[field].length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is required in production.`,
        });
      }
    }

    if (env.OAUTH_SESSION_MODE === 'legacy') {
      addProductionUrlIssues(ctx, 'API_BASE_URL', env.API_BASE_URL);
    } else {
      // In handoff mode Nest is private by design. TLS remains mandatory, while RFC1918 and
      // other internal addresses are valid deployment targets for the BFF-to-Nest hop.
      addProductionHttpsUrlIssues(ctx, 'API_BASE_URL', env.API_BASE_URL);
    }
    addProductionUrlIssues(ctx, 'WEB_URL', env.WEB_URL);
    addProductionUrlIssues(
      ctx,
      'PUBLIC_OAUTH_CALLBACK_BASE_URL',
      env.PUBLIC_OAUTH_CALLBACK_BASE_URL,
    );
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
