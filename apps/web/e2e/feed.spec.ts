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

  test("category filtering narrows the feed", async ({ page }) => {
    await page.goto("/?filter=startups");

    await expect(page.getByText(world.startup.title)).toBeVisible();
    await expect(page.getByText(world.google.title)).toHaveCount(0);
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

  test("an unknown category filter falls back to the unfiltered feed", async ({ page }) => {
    await page.goto("/?filter=not-a-category");

    await expect(page.getByText(world.google.title)).toBeVisible();
    await expect(page.getByText(world.startup.title)).toBeVisible();
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
