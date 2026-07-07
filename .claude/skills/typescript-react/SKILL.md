---
name: typescript-react
description: Strict TypeScript patterns for a React/Next.js codebase — no any, precise props/event/hook typing, discriminated unions for API/state, branded IDs (ULID), typed API responses, and safe narrowing. Use WHEN writing or reviewing .ts/.tsx types, typing component props/hooks/events, modeling API responses or async state, fixing type errors, or setting up tsconfig strictness.
---

# TypeScript for React / Next.js

Target strict mode. Types should make illegal states unrepresentable and mirror the backend contract exactly.

## When to use
- Typing component props, hooks, event handlers, or refs.
- Modeling API response shapes, async/loading state, or permission flags.
- Fixing `no-explicit-any` / strictness errors.
- Setting up `tsconfig` compiler options.

## tsconfig baseline
Enable `"strict": true` plus `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`, and `"verbatimModuleSyntax": true`. Treat `any` as a bug — prefer `unknown` + narrowing.

## Never use `any`
```ts
// ❌
function handle(e: any) {}
const data: any[] = [];
// ✅
function handle(e: React.FormEvent<HTMLFormElement>) {}
const data: Post[] = [];
```
For genuinely unknown data (e.g. `JSON.parse`, third-party), use `unknown` and narrow (ideally validate with Zod — see `react-forms-rhf-zod`).

## Props typing
```ts
type ButtonProps = {
  variant?: 'primary' | 'ghost';
  children: React.ReactNode;
} & React.ComponentPropsWithoutRef<'button'>; // inherit native props + ref-less

// Extend a component's props:
type Props = React.ComponentProps<typeof Dialog>;
```
- Prefer `type` aliases for props; use `interface` only when you need declaration merging.
- `React.ReactNode` for children; avoid `JSX.Element` for arbitrary children.
- Don't annotate component return types manually; let inference handle it.

## Events, refs, hooks
```ts
const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {};
const ref = useRef<HTMLDivElement>(null);
const [user, setUser] = useState<User | null>(null); // annotate when initial is null
```

## Branded IDs (ULID)
This backend uses ULID string ids. Prevent mixing id kinds:
```ts
type Brand<T, B> = T & { readonly __brand: B };
export type UserId = Brand<string, 'UserId'>;
export type PostId = Brand<string, 'PostId'>;
export const asPostId = (s: string) => s as PostId;
```
Functions then require the right id type, so a `UserId` can't be passed where a `PostId` is expected.

## Model API responses & state as discriminated unions
```ts
type Result<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApiError }
  | { status: 'loading' };

// Viewer-context permission flags (this API): keep them explicit, not optional booleans scattered around.
type ViewerContext = { canEdit: boolean; canDelete: boolean; isAuthor: boolean };
```
Discriminated unions let the compiler force you to handle every case and narrow safely.

## Narrowing & utilities
- Narrow with `in`, `typeof`, `Array.isArray`, and custom type guards `(x): x is Post => …`.
- Use built-ins: `Pick`, `Omit`, `Partial`, `Required`, `Record<K,V>`, `NonNullable`, `ReturnType`, `Awaited<T>`.
- `satisfies` to check a literal against a type without widening it:
```ts
const routes = { home: '/', feed: '/feed' } satisfies Record<string, string>;
```
- Prefer `as const` for literal tuples/objects over manual union types.

## Pitfalls
- Non-null assertion `!` hides real nulls — narrow instead.
- `as` casts bypass the checker; only use for branding or after validation.
- Enums add runtime weight; prefer string-literal unions or `as const` objects.
- With `noUncheckedIndexedAccess`, `arr[i]` is `T | undefined` — guard it.

## Related skills
`rest-data-fetching` (API contract shapes), `react-forms-rhf-zod` (Zod-inferred types), `react-server-client-components`.
