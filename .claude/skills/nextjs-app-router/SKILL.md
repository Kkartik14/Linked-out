---
name: nextjs-app-router
description: Next.js App Router (Next.js 15/16) routing, layouts, metadata, route handlers, and rendering. Use WHEN creating or editing files under app/, wiring routes/layouts/loading/error/not-found, reading params or searchParams, adding metadata/SEO, writing route.ts handlers, or configuring caching/rendering (dynamic, revalidate, generateStaticParams). Covers the async params/searchParams/cookies/headers breaking change.
---

# Next.js App Router

Guidance for the App Router in Next.js 15/16. Assume Server Components by default and the **async dynamic APIs** introduced in 15 and enforced in 16.

## When to use
- Adding/editing anything under `app/` (pages, layouts, route handlers).
- Reading `params`, `searchParams`, `cookies()`, or `headers()`.
- Adding metadata / SEO, loading & error states, or `generateStaticParams`.
- Deciding a route's rendering mode (static vs dynamic, revalidation).

## File conventions (`app/`)
- `layout.tsx` — shared UI for a segment + children; **preserves state**, does not re-render on navigation. Root layout is required and must render `<html>` and `<body>`.
- `page.tsx` — makes a route publicly reachable. A folder without `page.tsx` is not routable.
- `loading.tsx` — Suspense fallback for the segment.
- `error.tsx` — error boundary (**must be a Client Component**, `'use client'`). Receives `{ error, reset }`.
- `not-found.tsx` — 404 UI; trigger with `notFound()` from `next/navigation`.
- `route.ts` — Route Handler (REST endpoint). Export `GET`, `POST`, etc.
- `template.tsx` — like layout but re-mounts on navigation (rarely needed).
- Route groups `(group)/` organize without affecting the URL. Dynamic segments: `[id]`, catch-all `[...slug]`, optional `[[...slug]]`.

## CRITICAL: async dynamic APIs (Next.js 15/16)
`params`, `searchParams`, `cookies()`, and `headers()` are **Promises**. Await them.

```tsx
// app/posts/[id]/page.tsx
type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { cursor } = await searchParams;
  // ...
}
```
- `searchParams` is only available in `page.tsx` (not `layout.tsx`).
- Reading `cookies()`, `headers()`, or `searchParams` opts the route into **dynamic rendering**.
- Migration codemod: `npx @next/codemod@latest next-async-request-api .`

## Metadata / SEO
```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Feed', description: '…' };

// Dynamic:
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id);
  return { title: post.title, openGraph: { images: [post.image] } };
}
```
Never use `next/head` in the App Router — use the `metadata` export or `generateMetadata`.

## Route Handlers (`app/api/**/route.ts`)
```ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get('cursor');
  return NextResponse.json({ items: [] });
}
```
This project consumes an **external REST backend** (cookie auth). Prefer calling the backend directly from Server Components / a typed client rather than adding proxy route handlers, unless you need to hide a secret or reshape a response.

## Rendering & caching (Next 15/16)
- Fetch cache is **not cached by default** in 15+. Opt in per-request:
  - `fetch(url, { cache: 'force-cache' })` — static/cached.
  - `fetch(url, { next: { revalidate: 60 } })` — ISR-style revalidation.
  - `fetch(url, { cache: 'no-store' })` — always fresh (needed for authed, per-user data).
- Segment config: `export const dynamic = 'force-dynamic' | 'force-static'`, `export const revalidate = 60`.
- Tag + revalidate: `fetch(url, { next: { tags: ['feed'] } })` then `revalidateTag('feed')` in a Server Action.
- `generateStaticParams()` pre-renders dynamic routes at build (Server Component only, must be exported). Pair with `export const dynamicParams = false` to 404 un-generated paths.

## Navigation
- Use `<Link href="…">` from `next/link` for internal links (client-side nav), never a bare `<a>`.
- Server-side redirect: `redirect('/login')` from `next/navigation`.
- Client-side: `useRouter()` (`'use client'` only).

## Pitfalls
- Root layout missing `<html>`/`<body>` → build error.
- Forgetting to `await` params/searchParams/cookies/headers in 15/16.
- `error.tsx` without `'use client'`.
- Caching per-user authenticated data (use `no-store` for viewer-specific responses).
- A folder without `page.tsx` silently produces no route.

## Related skills
`react-server-client-components` (RSC boundaries, data fetching, Suspense), `rest-data-fetching` (this project's API contract), `react-forms-rhf-zod` (forms + Server Actions).
