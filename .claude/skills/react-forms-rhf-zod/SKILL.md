---
name: react-forms-rhf-zod
description: Forms with react-hook-form + Zod (+ shadcn Form) in the Next.js App Router, including Server Actions with useActionState and shared client/server schemas. Use WHEN building or validating any form, wiring zodResolver, handling submit/mutations, surfacing server-side field errors, or making inputs accessible. Covers optimistic UI with useOptimistic and this API's mutation-response pattern.
---

# Forms: react-hook-form + Zod

Client validation for UX, server validation for trust, one shared schema.

## When to use
- Any create/edit form (post composer, profile edit, auth, comments).
- Wiring `zodResolver`, submit handlers, or mutation calls.
- Surfacing server/API validation errors on fields.
- Optimistic updates on submit.

## Shared schema (single source of truth)
Define once, use on client (RHF) and server (Server Action / API validation):
```ts
// lib/schemas.ts
import { z } from "zod";
export const createPostSchema = z.object({
  title: z.string().min(1, "Required").max(140),
  body: z.string().min(1).max(5000),
  anonymous: z.boolean().default(false),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;
```

## Client form with RHF + zodResolver + shadcn Form
```tsx
'use client';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const form = useForm<CreatePostInput>({
  resolver: zodResolver(createPostSchema),
  defaultValues: { title: "", body: "", anonymous: false },
});

async function onSubmit(values: CreatePostInput) {
  const res = await fetch("/api/posts", {
    method: "POST",
    credentials: "include",           // cookie auth (see rest-data-fetching)
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) return applyServerErrors(res, form); // map API field errors
  const created = await res.json();   // use the returned entity to update UI
}
// <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)}>…</form></Form>
```
Use shadcn `FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage` so labels + errors are wired accessibly (see `shadcn-ui`).

## Server Actions + useActionState (React 19)
Progressive-enhancement path. Re-validate with the same schema server-side.
```ts
// actions.ts
'use server';
export async function createPost(_prev: State, formData: FormData) {
  const parsed = createPostSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  // call backend with cookies forwarded, then revalidateTag('feed') / redirect
  return { ok: true };
}
```
```tsx
'use client';
import { useActionState } from "react";
const [state, action, pending] = useActionState(createPost, { });
// <form action={action}> … disable submit while `pending` …
```
When combining with RHF, push server field errors back with `form.setError(name, { message })` (e.g. in an effect on `state`).

## Mapping server/API validation errors
This backend returns field-level errors; translate them onto the form so users see them inline rather than a generic toast:
```ts
Object.entries(fieldErrors).forEach(([name, msgs]) =>
  form.setError(name as keyof CreatePostInput, { message: msgs[0] }));
```

## Optimistic updates
Two layers:
- `useOptimistic` for instant in-place UI (e.g. like button, new comment) that reconciles when the request resolves/reverts on error.
- For lists/mutations, apply the **entity returned by the mutation response** (this API returns the created/updated object) rather than refetching — see `rest-data-fetching`.
```tsx
const [optimistic, addOptimistic] = useOptimistic(items, (s, next: Item) => [next, ...s]);
```
Always handle the failure branch (revert + surface error).

## Accessibility
- Every input has an associated `<label>` (shadcn `FormLabel` handles `htmlFor`/`id`).
- Errors linked via `aria-describedby` + `aria-invalid` (shadcn `FormMessage` does this).
- Don't disable the submit as the only feedback; show why it's disabled.
- Group related fields with `<fieldset>`/`<legend>`. See `web-accessibility`.

## Pitfalls
- Trusting client validation only — always re-parse on the server.
- Uncontrolled↔controlled warnings: set `defaultValues` for every field.
- Forgetting `credentials: "include"` on fetches (auth cookie won't be sent).
- Refetching the whole list after a mutation instead of using the returned entity.
- Not resetting the form after success (`form.reset()`), or not clearing optimistic state on error.

## Related skills
`rest-data-fetching`, `shadcn-ui`, `typescript-react` (z.infer types), `web-accessibility`.
