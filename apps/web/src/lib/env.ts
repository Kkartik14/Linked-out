/**
 * Public runtime config. These are `NEXT_PUBLIC_*` so they're inlined into the
 * client bundle at build time; do not put secrets here.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/v2";
