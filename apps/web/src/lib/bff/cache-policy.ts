/** Canonical policy for every BFF-generated response containing user/session state. */
export const PRIVATE_NO_STORE = "private, no-store, max-age=0";

export const PRIVATE_NO_STORE_HEADERS = { "cache-control": PRIVATE_NO_STORE } as const;
