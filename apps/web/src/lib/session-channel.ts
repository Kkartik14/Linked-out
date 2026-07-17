/**
 * Cross-tab notification that the session snapshot may be stale.
 *
 * Cookies are shared by every tab on the origin, but each tab's view of *who it is* is a
 * snapshot — the `session` prop the root layout rendered. Signing in as B in one tab
 * replaces the cookies for all of them, and the other tabs never find out: they keep
 * rendering A, keep A's private cache, and a stale submit executes under B's cookies
 * (ADR 0001 §1.6, AUTH-03/FRONTEND-24).
 *
 * The channel carries an **invalidation signal, not an identity**. Two reasons, and they are
 * the whole design:
 *
 *  1. *It cannot be authority.* Only the server can read an httpOnly cookie, so a
 *     client-side message asserting "you are now B" would be a claim the receiver has no way
 *     to verify. The receiver instead re-derives the truth from the server
 *     (`router.refresh()` → the layout re-runs `getSession()`), which is the same path that
 *     produced its original snapshot. One authority, not two.
 *  2. *It is untrusted input.* Any same-origin script can post here, so the payload is
 *     unauthenticated and unattributable. A message carrying an identity would have to be
 *     believed to be useful — making an untrusted channel authoritative over who the viewer
 *     is, a hole this would introduce rather than close. Carrying nothing to believe, a
 *     forged message degrades to a wasted refresh. (Confidentiality is the weaker argument
 *     and not the reason: a same-origin script able to read this channel already holds the
 *     cookies, so the id would leak nothing it does not have.)
 *
 * Per the WHATWG spec a `BroadcastChannel` never delivers to the object that posted, but it
 * *does* deliver to sibling objects in the same tab — `postMessage()` removes only `source`
 * from its destination set, not the source's document. So publish and subscribe deliberately
 * share one module-level channel: that is what makes "other tabs, never me" true, rather
 * than a tab id filter bolted on afterwards. Verified against jsdom, which implements the
 * same rule.
 *
 * Not sufficient alone: a bfcache'd document is not "fully active", so it is excluded from
 * the destination set and gets no replay on restore. `SessionProvider` pairs this with a
 * `pageshow` backstop.
 */

const CHANNEL_NAME = "linkedout:session";

/** The only payload. Presence is the whole message; see the identity note above. */
const SESSION_CHANGED = "session-changed";

let channel: BroadcastChannel | null = null;

/**
 * `null` on the server and anywhere `BroadcastChannel` is missing, which makes both exported
 * functions no-ops there rather than a guard every caller has to remember. Never closed: the
 * page owns it for its lifetime, and closing it on one subscriber's unmount would silently
 * break publishing for the rest of the document.
 */
function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/**
 * Tell every *other* tab its session snapshot is stale. Call after any transition that
 * rewrites the shared cookies — sign-in, sign-out — not after an ordinary profile edit,
 * which changes the viewer's data but not which principal the cookies name.
 */
export function publishSessionChanged(): void {
  getChannel()?.postMessage(SESSION_CHANGED);
}

/** Subscribe to other tabs' session changes. Returns an unsubscribe function. */
export function subscribeSessionChanged(handler: () => void): () => void {
  const target = getChannel();
  if (!target) return () => {};

  const listener = (event: MessageEvent<unknown>) => {
    if (event.data === SESSION_CHANGED) handler();
  };

  target.addEventListener("message", listener);
  return () => target.removeEventListener("message", listener);
}
