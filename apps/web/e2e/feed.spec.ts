import { expect, test } from "@playwright/test";

import { disconnect, seedWorld, signIn, type World } from "./helpers";

let world: World;

test.beforeEach(async () => {
  world = await seedWorld();
});

test.afterAll(async () => {
  await disconnect();
});

test.describe("feed & L detail", () => {
  test("renders public Ls and opens a detail page with its comments", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "The Feed" })).toBeVisible();
    await expect(page.getByText(world.google.title)).toBeVisible();
    await expect(page.getByText(world.startup.title)).toBeVisible();

    await page.getByRole("link", { name: new RegExp(world.google.title) }).first().click();

    await expect(page).toHaveURL(new RegExp(`/ls/${world.google.id}`));
    await expect(page.getByRole("heading", { name: world.google.title })).toBeVisible();
    await expect(page.getByText("onsite loop")).toBeVisible();
    await expect(page.getByRole("heading", { name: /1 comment/i })).toBeVisible();
    await expect(page.getByText("Interview loops can be brutal")).toBeVisible();
  });

  test("PRIVATE Ls are invisible to anonymous visitors, in the feed and by direct URL", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(world.privateL.title)).toHaveCount(0);

    const res = await page.goto(`/ls/${world.privateL.id}`);
    expect(res?.status()).toBe(404);
  });

  test("an anonymous L renders as 'Anonymous builder' with no profile link", async ({ page }) => {
    await page.goto(`/ls/${world.anonymous.id}`);

    await expect(page.getByRole("heading", { name: world.anonymous.title })).toBeVisible();
    await expect(page.getByText("Anonymous builder")).toBeVisible();
    await expect(page.getByRole("link", { name: /Nadia Ray/ })).toHaveCount(0);
  });

  test("sort=popular reorders the feed by the API's lifetime popularityScore", async ({ page }) => {
    await page.goto("/?sort=popular");

    const cardTitles = page.getByRole("heading", { level: 2 });
    // The feed has a route-level streaming skeleton. Wait for both canonical rows before
    // reading the collection; `allInnerTexts()` itself is intentionally non-waiting.
    await expect(cardTitles.filter({ hasText: world.google.title })).toBeVisible();
    await expect(cardTitles.filter({ hasText: world.startup.title })).toBeVisible();

    const titles = await cardTitles.allInnerTexts();
    const google = titles.findIndex((title) => title.includes(world.google.title));
    const layoff = titles.findIndex((title) => title.includes(world.startup.title));

    expect(google).toBeGreaterThanOrEqual(0);
    expect(layoff).toBeGreaterThan(google);
  });

  // v2 has no category filter. A saved v1 URL carrying one must still render the feed
  // rather than 404 or empty out — the param is simply ignored now.
  test("a leftover v1 category filter in the URL is ignored, not honoured", async ({ page }) => {
    await page.goto("/?filter=startups");

    await expect(page.getByText(world.startup.title)).toBeVisible();
    await expect(page.getByText(world.google.title)).toBeVisible();
  });

  test("cards no longer render the category, company, tags or event date", async ({ page }) => {
    await page.goto("/");

    // The seeded google L has category INTERVIEWS, company Google, and tags — v1 still
    // sends all of them, and the card must ignore every one.
    await expect(page.getByText(world.google.title)).toBeVisible();
    await expect(page.getByText("Interviews", { exact: true })).toHaveCount(0);
    await expect(page.getByText("#interview")).toHaveCount(0);
    await expect(page.getByText("#faang")).toHaveCount(0);
  });

  test("the following feed shows only the authors the viewer follows", async ({ page, context }) => {
    await signIn(context, world.kartik); // kartik follows nadia only
    await page.goto("/?scope=following");

    await expect(page.getByText(world.nadiaPublic.title)).toBeVisible();
    await expect(page.getByText(world.google.title)).toHaveCount(0);
  });

  test("a logged-out visitor asking for the following feed gets the global feed", async ({
    page,
  }) => {
    await page.goto("/?scope=following");
    await expect(page.getByText(world.google.title)).toBeVisible();
  });

  test("a missing L renders the not-found page rather than crashing", async ({ page }) => {
    const res = await page.goto("/ls/01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(res?.status()).toBe(404);
  });

  test("logged-out write routes redirect to login with a safe return path", async ({ page }) => {
    await page.goto("/new");

    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await expect(page.getByRole("heading", { name: "Welcome to LinkedOut" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      /returnTo=%2Fnew/,
    );
  });

  // The rails are served from the schema-validated fixture until GET /v2/feed/sidebar
  // ships (NEXT_PUBLIC_FEED_SIDEBAR_FIXTURE, set for this suite in playwright.config).
  // What these prove is the wiring either way: that the aggregate reaches the page, both
  // rails render on the feed route, and the anonymity rule survives the round trip.
  test("the feed renders both discovery rails", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("region", { name: /top ls/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /l of the day/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /people to follow/i })).toBeVisible();
  });

  test("an anonymous Top L keeps its author hidden in the rail", async ({ page }) => {
    await page.goto("/");

    const rail = page.getByRole("region", { name: /top ls/i });
    const anonymousRow = rail.locator("li", { hasText: "Anonymous builder" });
    await expect(anonymousRow).toHaveCount(1);
    // Whatever the row links to, it is never a profile.
    await expect(anonymousRow.locator('a[href^="/u/"]')).toHaveCount(0);
  });

  test("L of the day names a real, attributed builder", async ({ page }) => {
    await page.goto("/");

    const daily = page.getByRole("region", { name: /l of the day/i });
    // The contract types this author as non-null, so a profile link must always exist.
    await expect(daily.locator('a[href^="/u/"]').first()).toBeVisible();
    await expect(daily.getByText(/builders interacted/)).toBeVisible();
  });

  test("a signed-out visitor is offered login rather than a dead follow button", async ({
    page,
  }) => {
    await page.goto("/");

    const people = page.getByRole("region", { name: /people to follow/i });
    await expect(people.getByRole("link", { name: /^follow/i }).first()).toHaveAttribute(
      "href",
      /\/login\?returnTo=/,
    );
  });

  test("the rails are hidden on a narrow viewport, and the feed still works", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto("/");

    // Below lg the feed is the whole page: the rails would otherwise sit after an
    // infinite list, where nobody can reach them.
    await expect(page.getByRole("region", { name: /top ls/i })).toBeHidden();
    await expect(page.getByRole("region", { name: /people to follow/i })).toBeHidden();
    await expect(page.getByText(world.google.title)).toBeVisible();
  });

  test("login links point at the real API's OAuth start endpoints", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      /\/v1\/auth\/google\?returnTo=/,
    );
    await expect(page.getByRole("link", { name: "Continue with GitHub" })).toHaveAttribute(
      "href",
      /\/v1\/auth\/github\?returnTo=/,
    );
  });
});
