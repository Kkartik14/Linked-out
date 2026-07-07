/**
 * Public runtime config. These are `NEXT_PUBLIC_*` so they're inlined into the
 * client bundle at build time; do not put secrets here.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/v1";

/** When true, the API client serves fixtures instead of hitting the backend. */
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "1";
