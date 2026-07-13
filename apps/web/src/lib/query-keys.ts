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
 * Get the principal from `usePrincipal()` (see `components/session-provider`).
 */

export type Principal = string;

export const queryKeys = {
  ls: {
    reactions: (p: Principal, lId: string) => ["ls", p, lId, "reactions"] as const,
    commentCount: (p: Principal, lId: string) => ["ls", p, lId, "comment-count"] as const,
  },
  comments: {
    all: (p: Principal) => ["comments", p] as const,
    list: (p: Principal, lId: string) => ["comments", p, "list", lId] as const,
    replies: (p: Principal, commentId: string) =>
      ["comments", p, "replies", commentId] as const,
  },
  profiles: {
    detail: (p: Principal, username: string) => ["profiles", p, username] as const,
  },
  saved: {
    all: (p: Principal) => ["saved", p] as const,
  },
  notifications: {
    /** Root for a principal — invalidate this to refresh preview + page + unread count. */
    all: (p: Principal) => ["notifications", p] as const,
    unreadCount: (p: Principal) => ["notifications", p, "unread-count"] as const,
    /** Header dropdown: a finite page. */
    preview: (p: Principal) => ["notifications", p, "preview"] as const,
    /** Full page: an infinite query — deliberately distinct from `preview`. */
    infinite: (p: Principal) => ["notifications", p, "infinite"] as const,
  },
} as const;
