declare const composedPrincipal: unique symbol;

/**
 * The principal a view was **composed under** — not whoever the cookie names right now.
 *
 * Every authenticated mutation echoes this back as `X-LinkedOut-Principal`, and the API
 * rejects it with `409 PRINCIPAL_MISMATCH` when it disagrees with the live credential. That
 * is what stops a stale tab's form from landing on whoever signed in after it was rendered:
 * cookies are shared across tabs, so the identity a form was typed under and the identity
 * its request arrives with are two different facts, and only the first one is honest about
 * what the user meant.
 *
 * Branded, and that is the whole point of this file. The value is a plain user id, so a
 * `string` parameter would accept `usePrincipal()` — the *live* principal — and that single
 * substitution silently defeats the feature: the header would always agree with the session,
 * every mutation would pass, and nothing would ever fail to reveal it. The brand makes that
 * a compile error instead of a security hole nobody notices. `useComposedPrincipal()` is the
 * only mint; there is deliberately no exported constructor here.
 *
 * (`query-keys.ts` declines to brand its own principal for the opposite and equally correct
 * reason: nothing there mints one, so a brand would only have looked like a guarantee.)
 */
export type ComposedPrincipal = string & { readonly [composedPrincipal]: true };
