---
name: rest-data-fetching
description: This project's REST API contract and frontend data patterns — cookie auth (credentials include), ULID ids, cursor-based pagination, optimistic updates from mutation responses, viewer-context permission flags, and anonymous-author handling, plus Next.js caching/revalidation for authed data. Use WHEN calling the backend, writing a fetch/API client, paginating a feed/list, doing mutations/optimistic UI, handling auth/401, or rendering permissions/anonymous authors.
---

# REST Data Fetching (LinkedOut API contract)

How the frontend talks to the backend REST API. Follow these conventions everywhere data is fetched or mutated.

## When to use
- Writing/using the API client or any `fetch` to the backend.
- Paginating feeds/lists; loading more.
- Mutations (create/update/delete), likes, comments; optimistic UI.
- Handling auth (cookie), 401s, permissions, anonymous authors.

## Auth: cookie-based, always send credentials
Auth is a backend-owned HTTP-only cookie (via Auth.js). The frontend never handles tokens.
- **Every** request to the backend must include `credentials: "include"` or the cookie won't be sent (cross-origin especially).
- From **Server Components / Server Actions / route handlers**, forward the incoming cookies explicitly:
```ts
import { cookies } from "next/headers";
const res = await fetch(`${API}/feed`, {
  headers: { cookie: (await cookies()).toString() },
  cache: "no-store",            // per-user data must not be cached
});
```
- From the **browser** (Client Components):
```ts
const res = await fetch(`${API}/feed`, { credentials: "include" });
```
- On `401`, treat as unauthenticated: redirect to login (server: `redirect('/login')`; client: route push). Don't retry blindly.

## Typed API client (recommended)
Centralize base URL, credentials, error handling, and JSON parsing in one place; return typed results. Model errors explicitly (never throw raw). See `typescript-react` for `Result<T>` unions and branded ULID ids.
```ts
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: "include", ...init });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.json() as Promise<T>;
}
```

## IDs: ULID
- All entity ids are **ULID** strings (sortable, 26 chars). Treat as opaque strings; do not assume numeric.
- Use branded types (`PostId`, `UserId`) to avoid mixing id kinds (see `typescript-react`).
- ULIDs are lexicographically time-ordered — useful as stable React `key`s and consistent sort.

## Pagination: cursor-based (not offset)
List endpoints return items plus a cursor for the next page:
```ts
type Page<T> = { items: T[]; nextCursor: string | null };
// request: GET /feed?limit=20&cursor=<nextCursor>
```
- Pass `cursor` from the previous response; `nextCursor === null` means no more pages.
- Never build offset/page-number pagination against this API.
- Infinite scroll: keep `items` accumulated in state (or SWR/React Query `useInfiniteQuery` with `getNextPageParam: (last) => last.nextCursor`). Use item `id` (ULID) as key.
- Don't refetch from page 1 after a mutation; patch the cached list (see below).

## Mutations & optimistic updates from the response
The API **returns the created/updated entity** in the mutation response. Use it directly.
- Optimistic: apply an expected change immediately (`useOptimistic` or cache mutate), fire the request, then **replace the optimistic entry with the entity from the response** on success; **revert** on error and surface the message.
- Do not blindly refetch the whole list after every mutation — reconcile with the returned entity for snappy UX and fewer round-trips.
```ts
// like example
addOptimistic({ ...post, likedByViewer: true, likeCount: post.likeCount + 1 });
const updated = await api<Post>(`/posts/${post.id}/like`, { method: "POST" });
commit(updated);   // replace optimistic with authoritative server entity
```

## Viewer-context permission flags
Entities embed what the current viewer may do — do not compute permissions client-side from roles.
```ts
type Post = {
  id: PostId;
  author: Author;                 // may be anonymous, see below
  viewer: { canEdit: boolean; canDelete: boolean; canReport: boolean; likedByViewer: boolean };
  // ...
};
```
- Gate UI on these flags (`post.viewer.canEdit && <EditButton/>`); don't infer from `author.id === currentUserId`.
- Treat missing flags as `false` (deny by default).

## Anonymous authors
Authors may be anonymous; the shape differs — handle it, don't crash on missing fields.
```ts
type Author =
  | { anonymous: false; id: UserId; name: string; avatarUrl: string | null }
  | { anonymous: true };          // no id/name/avatar
```
- Render a placeholder name ("Anonymous") and a generic avatar; avatar `alt="Anonymous user"` (see `web-accessibility`).
- Never link to a profile or show follow/mention for anonymous authors; hide author-specific actions.
- Use the discriminant (`author.anonymous`) to narrow before accessing `id`/`name`.

## Caching / revalidation (Next.js)
- Per-user/authenticated data: `cache: "no-store"` (or `export const dynamic = 'force-dynamic'`). Never statically cache viewer-specific responses.
- Public, shareable data can use `next: { revalidate: N }` or `tags` + `revalidateTag` after a mutation.
- Prefer fetching in Server Components; hand data to Client Components for interaction (see `react-server-client-components`). For client-side caching/infinite lists, SWR or TanStack Query are appropriate.

## Pitfalls
- Missing `credentials: "include"` / not forwarding cookies on the server → silent 401s.
- Statically caching authed data (leaks one user's data to another).
- Offset pagination, or resetting to page 1 after mutations.
- Computing permissions from roles instead of `viewer.*` flags.
- Assuming `author.id`/`name` exist (crashes on anonymous authors).
- Discarding the mutation response and refetching everything.

## Related skills
`typescript-react` (Result/union types, ULID branding), `react-forms-rhf-zod` (mutations + optimistic), `react-server-client-components`, `nextjs-app-router` (caching).
