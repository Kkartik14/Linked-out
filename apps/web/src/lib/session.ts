import { cache } from "react";
import type { AuthMeResponse, MetaEnumsResponse } from "@linkedout/contracts/v2";
import { getMe, getMeta } from "@/lib/api";
import { DEFAULT_META } from "@/lib/meta-fallback";

/**
 * Current session, deduped per request via React `cache`. Never throws — a
 * failed/absent session resolves to logged-out.
 */
export const getSession = cache(async (): Promise<AuthMeResponse> => {
  try {
    return await getMe();
  } catch {
    return { user: null, needsOnboarding: false };
  }
});

/**
 * Enum display metadata. React dedupes calls inside a render; `getMeta` also opts the public,
 * principal-independent fetch into Next's cross-request daily revalidation cache.
 */
export const getMetaCached = cache(async (): Promise<MetaEnumsResponse> => {
  try {
    return await getMeta();
  } catch {
    return DEFAULT_META;
  }
});
