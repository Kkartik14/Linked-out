/**
 * Centralized, principal-scoped React Query keys.
 *
 * Two rules this factory enforces:
 *  1. **Principal-scoped** — every viewer-dependent key is prefixed with the current
 *     principal (the logged-in user's id, or `"anon"`), so under normal navigation one
 *     account's cache is not read under another account's key, and invalidation is scoped
 *     per-principal. This is NOT yet a full cross-tab guarantee: until the session lifecycle
 *     work lands (FRONTEND-02 / AUTH-03), a stale tab can still fetch with a replaced cookie
 *     and store another principal's response under the prior principal's key. Those issues
 *     stay open.
 *  2. **Distinct finite/infinite keys** — a finite `useQuery` and an `useInfiniteQuery`
 *     over the same resource store incompatible shapes (`Paginated<T>` vs
 *     `InfiniteData`). Sharing a key corrupts both (FRONTEND-01), so they get distinct
 *     leaves here by construction.
 *
 * Get the principal from `usePrincipal()` (see `components/session-provider`) — the `p`
 * parameter every factory below takes. It is a plain `string`, deliberately: a `Principal`
 * alias for `string` read like a guarantee and enforced nothing, since any string is
 * assignable to it. Branding it would enforce something, but only if minted in
 * `usePrincipal()`, which is outside this file's remit; until that lands, the honest signal
 * is the parameter name plus these rules, not a type that only looks like a type.
 */

export const queryKeys = {
  feed: {
    infinite: (p: string, scope: string, sort: string) => ["feed", p, scope, sort] as const,
  },
  /** The feed page's discovery rails. Principal-scoped: the response carries viewer state. */
  feedSidebar: {
    detail: (p: string) => ["feed-sidebar", p] as const,
  },
  search: {
    ls: (p: string, query: string) => ["search", p, "ls", query] as const,
    users: (p: string, query: string) => ["search", p, "users", query] as const,
  },
  users: {
    ls: (p: string, username: string, type: string) =>
      ["user-ls", p, username, type] as const,
    journey: (p: string, username: string) => ["journey", p, username] as const,
    collections: (p: string, username: string) =>
      ["user-collections", p, username] as const,
  },
  ls: {
    reactions: (p: string, lId: string) => ["ls", p, lId, "reactions"] as const,
    commentCount: (p: string, lId: string) => ["ls", p, lId, "comment-count"] as const,
  },
  comments: {
    list: (p: string, lId: string) => ["comments", p, "list", lId] as const,
    replies: (p: string, commentId: string) =>
      ["comments", p, "replies", commentId] as const,
  },
  profiles: {
    detail: (p: string, username: string) => ["profiles", p, username] as const,
  },
  saved: {
    all: (p: string) => ["saved", p] as const,
  },
  notifications: {
    /** Root for a principal — invalidate this to refresh preview + page + unread count. */
    all: (p: string) => ["notifications", p] as const,
    unreadCount: (p: string) => ["notifications", p, "unread-count"] as const,
    /** Header dropdown: a finite page. */
    preview: (p: string) => ["notifications", p, "preview"] as const,
    /** Full page: an infinite query — deliberately distinct from `preview`. */
    infinite: (p: string) => ["notifications", p, "infinite"] as const,
  },
} as const;
