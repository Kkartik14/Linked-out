/**
 * Public runtime config. These are `NEXT_PUBLIC_*` so they're inlined into the
 * client bundle at build time; do not put secrets here.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/v1";

/**
 * v2 routes live beside v1 on the same host, so this is derived rather than configured.
 *
 * During the migration the app speaks v2 *types* to v1 *routes* — v1 responses are a
 * superset of v2's (docs/api-contract-v2.md §5) — so `API_BASE_URL` stays the default for
 * every call. `GET /feed/sidebar` is the one route with no v1 equivalent, and is the only
 * caller of this today.
 */
export const API_V2_BASE_URL =
  process.env.NEXT_PUBLIC_API_V2_BASE_URL ?? API_BASE_URL.replace(/\/v1$/, "/v2");
