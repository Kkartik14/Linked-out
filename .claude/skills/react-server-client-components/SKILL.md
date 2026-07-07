---
name: react-server-client-components
description: React 19 Server vs Client Components, data fetching, Suspense/streaming, the use() API, and component architecture in the Next.js App Router. Use WHEN deciding whether a component needs 'use client', fetching data, wiring Suspense/streaming boundaries, passing promises/context with use(), lifting Client boundaries down the tree, or structuring component files/folders. Includes anti-patterns (useEffect data fetching, over-clientizing, waterfalls).
---

# React Server & Client Components (React 19 + App Router)

Everything under `app/` is a **Server Component by default**. Add `'use client'` only when you truly need the client.

## Decision: Server vs Client
Use a **Client Component** (`'use client'` at top of file) only for:
- Hooks: `useState`, `useEffect`, `useReducer`, `useContext`, `useRef` with effects.
- Event handlers (`onClick`, `onChange`, `onSubmit`).
- Browser APIs (`window`, `localStorage`, `navigator`, `IntersectionObserver`).
- Client libraries that need the DOM/window.

Otherwise keep it a **Server Component** — can be `async`, fetch data directly, read `cookies()`/`headers()`, keep secrets server-side, and ship zero JS.

Quick tree: interactivity/hooks/browser API? → Client. Else data fetch / secrets / static? → Server.

## Data fetching
Fetch in Server Components; pass plain data down as props.
```tsx
// Server Component
export default async function Feed() {
  const posts = await getFeed();      // direct await, no loading state
  return <FeedList posts={posts} />;  // FeedList may be Client for interaction
}
```
Fetch in **parallel** to avoid waterfalls:
```tsx
const [user, feed] = await Promise.all([getUser(), getFeed()]);
```

## Streaming with Suspense
Render fast content immediately, stream slow parts:
```tsx
import { Suspense } from 'react';

export default function Page() {
  return (
    <>
      <Header />
      <Suspense fallback={<FeedSkeleton />}>
        <Feed />           {/* async Server Component */}
      </Suspense>
    </>
  );
}
```
`loading.tsx` provides an automatic Suspense boundary for a whole route segment.

## use() API (React 19)
Unwrap a promise or context in render. Lets a Server Component start a fetch and hand the promise to a Client Component to await under Suspense.
```tsx
// Server: start but don't await
export default function Page() {
  const userPromise = getUser();
  return <Suspense fallback={<Spinner />}><Profile userPromise={userPromise} /></Suspense>;
}
// Client
'use client';
import { use } from 'react';
export function Profile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
  return <span>{user.name}</span>;
}
```
Never type promises as `any` — use a concrete type, a generic `<T>`, or `unknown`.

## Composition: keep Client boundaries small ("islands")
- Push `'use client'` to the **leaves** (the button, the toggle), not the page.
- A Client Component can receive **Server Components as `children`/props** and render them — this does NOT clientize them:
```tsx
// Server page
<ClientCollapsible>
  <ServerHeavyContent />   {/* stays a Server Component */}
</ClientCollapsible>
```
- But **importing** a Server Component into a Client Component file makes it client. Pass it as a prop/child instead.
- Don't pass non-serializable values (functions, class instances) from Server → Client props (except `children`/RSC elements and Server Actions).

## Component architecture
- Colocate: keep a component's file, its sub-components, and tests together; only `page.tsx`/`route.ts` are routable, everything else in `app/` is safe to colocate.
- Shared, reusable primitives live in `components/` (e.g. `components/ui` for shadcn); feature-specific components live near their route.
- One component per file; name files after the component. Keep props typed and minimal; prefer composition (`children`, slots) over boolean flag explosions.
- Data-fetching Server Component (container) → presentational Client Component (interaction). Separate "fetch" from "render/interact".

## Anti-patterns
- `'use client'` on a static component (needless JS).
- Fetching in `useEffect` + `useState` when a Server Component could fetch directly.
- Serial `await`s that could be `Promise.all`.
- Using `cookies()`/`headers()` in a Client Component (server-only).
- One giant Client Component wrapping the whole page.

## Related skills
`nextjs-app-router`, `rest-data-fetching`, `react-forms-rhf-zod`, `frontend-testing`.
