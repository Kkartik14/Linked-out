---
name: frontend-testing
description: Frontend testing for a Next.js/React/TS app — Vitest + React Testing Library for unit/component tests, Playwright for end-to-end, MSW for API mocking, and accessibility assertions. Use WHEN writing or fixing tests, choosing what/how to test, mocking the REST API, querying the DOM, simulating user interaction, or adding e2e coverage for a flow.
---

# Frontend Testing

Test behavior users can observe, not implementation details. Layers: **Vitest + RTL** (component/unit), **Playwright** (e2e), **MSW** (mock the REST API at the network boundary).

## When to use
- Writing/fixing unit, component, or e2e tests.
- Deciding what to test and at which layer.
- Mocking the backend, querying the DOM, or simulating user input.

## What to test where
- **Unit (Vitest):** pure logic — the API client, cursor pagination helpers, permission/anonymous-author narrowing, Zod schemas, formatting.
- **Component (Vitest + RTL):** a component's behavior given props/interaction (form validation, optimistic like toggling, empty/error states).
- **E2E (Playwright):** critical user journeys across pages (log in → post → see it in feed → like → edit).
- Prioritize the risky/complex paths; don't chase 100% coverage or snapshot everything.

## React Testing Library principles
- Query by **accessible role/name** first: `getByRole('button', { name: /post/i })`, then `getByLabelText`, `getByText`. Avoid `getByTestId` unless nothing else works. This doubles as an a11y check.
- Interact via `@testing-library/user-event` (not `fireEvent`) — it models real user behavior.
- Assert on user-visible output; never assert on state/props/internal function calls.
- Use `findBy*`/`waitFor` for async UI; avoid arbitrary timeouts.
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

test("shows validation error when title is empty", async () => {
  render(<PostComposer />);
  await userEvent.click(screen.getByRole("button", { name: /post/i }));
  expect(await screen.findByText(/required/i)).toBeInTheDocument();
});
```

## Vitest setup notes
- Use `jsdom` (or `happy-dom`) environment for component tests; `import '@testing-library/jest-dom'` for matchers.
- `vi.fn()`/`vi.mock()` for mocks; prefer MSW over mocking `fetch` directly.
- Server Components that are just `async` data-fetchers are best covered by e2e or by unit-testing the extracted data functions; RTL renders Client Components and presentational pieces.

## Mock the API with MSW
Mock at the network layer so components run their real fetch/optimistic code paths. Reflect this API's contract: cursor pagination, ULID ids, `viewer` flags, anonymous authors, 401s.
```ts
import { http, HttpResponse } from "msw";
export const handlers = [
  http.get("*/feed", ({ request }) => {
    const cursor = new URL(request.url).searchParams.get("cursor");
    return HttpResponse.json({ items: [/* … */], nextCursor: cursor ? null : "01J…" });
  }),
  http.post("*/posts/:id/like", () => HttpResponse.json({ /* updated Post */ })),
];
```
Add handlers for the 401 path and for anonymous-author payloads so those branches are exercised.

## Playwright (e2e)
- Use role/label locators: `page.getByRole('button', { name: 'Post' })`, `page.getByLabel('Title')` — resilient and accessibility-aligned.
- Prefer web-first assertions (`await expect(locator).toBeVisible()`) which auto-wait; avoid manual sleeps.
- Auth: this app uses cookie auth — seed the session by setting the auth cookie via `context.addCookies(...)` or a stored `storageState` from a login step, rather than logging in through the UI every test.
- Mock/stub the backend with `page.route()` when you need deterministic data, or run against a seeded test backend for true e2e.
- Isolate tests (fresh context per test); don't depend on order.

## Accessibility in tests
- Role-based queries already enforce accessible names.
- Add automated a11y checks: `@axe-core/playwright` in e2e, `vitest-axe`/`jest-axe` in component tests, on key screens.

## Pitfalls
- Testing implementation details (state, internal handlers) → brittle tests that break on refactor.
- `getByTestId` everywhere instead of accessible queries.
- `fireEvent` instead of `user-event`; arbitrary `setTimeout`/`waitForTimeout`.
- Not mocking the 401 / error / empty / anonymous-author branches.
- Snapshot-testing large trees (noisy, low signal).
- Logging in through the UI in every Playwright test instead of reusing `storageState`.

## Related skills
`rest-data-fetching` (contract to mock), `web-accessibility` (axe, roles), `react-forms-rhf-zod`, `react-server-client-components`.
