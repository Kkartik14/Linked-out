import { expect, test } from "@playwright/test";

import { db, disconnect, seedWorld, signIn, type World } from "./helpers";

let world: World;

test.beforeEach(async () => {
  world = await seedWorld();
});

test.afterAll(async () => {
  await disconnect();
});

test.describe("feed & L detail", () => {
  /** The centre column. The rails can hold the same L, so assertions must be scoped. */
  const feed = (page: import("@playwright/test").Page) =>
    page.getByRole("region", { name: "The Feed" });

  test("renders public Ls and opens a detail page with its comments", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "The Feed" })).toBeVisible();
    await expect(feed(page).getByText(world.google.title)).toBeVisible();
    await expect(feed(page).getByText(world.startup.title)).toBeVisible();

    await feed(page).getByRole("link", { name: new RegExp(world.google.title) }).first().click();

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
    await expect(feed(page).getByText(world.privateL.title)).toHaveCount(0);

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

    // Scoped to the feed: the rails' section headings are level 2 as well.
    const cardTitles = feed(page).getByRole("heading", { level: 2 });
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

  // The public API has no category filter. A saved URL carrying one must still render the feed
  // rather than 404 or empty out — the param is simply ignored now.
  test("a removed category filter in the URL is ignored, not honoured", async ({ page }) => {
    await page.goto("/?filter=startups");

    await expect(feed(page).getByText(world.startup.title)).toBeVisible();
    await expect(feed(page).getByText(world.google.title)).toBeVisible();
  });

  test("cards no longer render the category, company, tags or event date", async ({ page }) => {
    await page.goto("/");

    // The clean resource contract has no category, company, tag, or event-date metadata.
    await expect(feed(page).getByText(world.google.title)).toBeVisible();
    await expect(page.getByText("Interviews", { exact: true })).toHaveCount(0);
    await expect(page.getByText("#interview")).toHaveCount(0);
    await expect(page.getByText("#faang")).toHaveCount(0);
  });

  test("the following feed shows only the authors the viewer follows", async ({ page, context }) => {
    await signIn(context, world.kartik); // kartik follows nadia only
    await page.goto("/?scope=following");

    await expect(feed(page).getByText(world.nadiaPublic.title)).toBeVisible();
    await expect(feed(page).getByText(world.google.title)).toHaveCount(0);
  });

  test("a logged-out visitor asking for the following feed gets the global feed", async ({
    page,
  }) => {
    await page.goto("/?scope=following");
    await expect(feed(page).getByText(world.google.title)).toBeVisible();
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

  test("a signed-out Save attempt returns to the intended L after login", async ({ page }) => {
    await page.goto(`/ls/${world.nadiaPublic.id}`);

    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page).toHaveURL(
      new RegExp(`/login\\?returnTo=%2Fls%2F${world.nadiaPublic.id}$`),
    );
  });

  // These drive the real GET /feed/sidebar against the real ranking, over the interactions
  // seeded in backend.cjs. They assert the rules the contract makes — ordering, anonymity,
  // attribution, the daily exclusion — not a particular score.
  test("the feed renders both discovery rails", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("region", { name: /top ls/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /l of the day/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /people to follow/i })).toBeVisible();
  });

  test("following from home stays consistent across the sidebar, directory, and profile", async ({
    page,
    context,
  }) => {
    await signIn(context, world.nadia);
    await page.goto("/");

    // Warm both destinations through client navigation. A cold route receives fresh server data;
    // the reported bug appears when Next/React Query can reuse a previously visited result.
    await page
      .getByRole("region", { name: "Your profile" })
      .getByRole("link", { name: "Following" })
      .click();
    await expect(page.getByText("Not following anyone yet.")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);

    await page
      .getByRole("region", { name: "Your profile" })
      .getByRole("link", { name: "View profile" })
      .click();
    await expect(page.getByRole("link", { name: "0 following" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);

    const profileCard = page.getByRole("region", { name: "Your profile" });
    const followingMetric = profileCard.locator("dl > div").filter({ hasText: "Following" });
    const people = page.getByRole("region", { name: "People to follow" });

    await people.getByRole("button", { name: "Follow Kartik Gupta" }).click();
    await expect(followingMetric.getByText("1", { exact: true })).toBeVisible();

    await profileCard.getByRole("link", { name: "Following" }).click();
    await expect(page).toHaveURL(/\/u\/nadia\/following$/);
    await expect(page.getByText("Kartik Gupta")).toBeVisible();

    await page.getByRole("link", { name: /Nadia Ray/ }).first().click();
    await expect(page).toHaveURL(/\/u\/nadia$/);
    await expect(page.getByRole("link", { name: "1 following" })).toBeVisible();
  });

  test("following reconciles a warmed Following feed and followers-only profile Ls", async ({
    page,
    context,
  }) => {
    await signIn(context, world.nadia);
    const followersOnlyTitle = "The part I only share with followers";
    await db().l.create({
      data: {
        authorId: world.kartik.id,
        title: followersOnlyTitle,
        story: "This should become visible as soon as the follow succeeds.",
        type: "STORY",
        visibility: "FOLLOWERS",
      },
    });
    await page.goto("/");

    const people = page.getByRole("region", { name: "People to follow" });
    await people.getByRole("link", { name: "Kartik Gupta" }).click();
    await expect(page.getByText(followersOnlyTitle)).toHaveCount(0);
    // Use the product's client-side home link instead of browser history. The cache remains
    // warm either way, while this gives the journey one deterministic destination even when
    // Playwright's full suite has prior browser-history entries.
    await page.getByRole("link", { name: "LinkedOut home" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("tab", { name: "Following" }).click();
    await expect(page.getByText("Follow some builders")).toBeVisible();
    await page.getByRole("tab", { name: "Global" }).click();

    const followed = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/v1/users/kartik/follow") &&
        response.ok(),
    );
    await people.getByRole("button", { name: "Follow Kartik Gupta" }).click();
    await followed;
    await page.getByRole("tab", { name: "Following" }).click();
    await expect(page.getByText(followersOnlyTitle)).toBeVisible();

    await page.getByRole("link", { name: "Kartik Gupta" }).first().click();
    await expect(page).toHaveURL(/\/u\/kartik$/);
    await expect(page.getByText(followersOnlyTitle)).toBeVisible();
  });

  test("following from the sidebar refreshes an already-open Following feed", async ({
    page,
    context,
  }) => {
    await signIn(context, world.nadia);
    await page.goto("/?scope=following");

    await expect(page.getByText("Follow some builders and their Ls will show up here.")).toBeVisible();
    await page
      .getByRole("region", { name: "People to follow" })
      .getByRole("button", { name: "Follow Kartik Gupta" })
      .click();

    await expect(
      page.getByRole("region", { name: "The Feed" }).getByText(world.google.title),
    ).toBeVisible();
  });

  test("Top Ls ranks only the Ls that were actually interacted with this week", async ({ page }) => {
    await page.goto("/");

    const rail = page.getByRole("region", { name: /top ls/i });
    // Seeded interactions: a HELPFUL on the anonymous L, and nadia's comment on google.
    await expect(rail.getByText(world.anonymous.title)).toBeVisible();
    await expect(rail.getByText(world.google.title)).toBeVisible();
    // `nadiaPublic` has no interaction, so it is not a candidate at all.
    await expect(rail.getByText(world.nadiaPublic.title)).toHaveCount(0);
    // `startup` was interacted with, but it is the daily winner — excluded here so the
    // right rail never shows the same L twice.
    await expect(rail.getByText(world.startup.title)).toHaveCount(0);
  });

  test("an anonymous Top L keeps its author hidden in the rail", async ({ page }) => {
    await page.goto("/");

    const rail = page.getByRole("region", { name: /top ls/i });
    const anonymousRow = rail.locator("li", { hasText: world.anonymous.title });
    await expect(anonymousRow.getByText("Anonymous builder")).toBeVisible();
    // Nadia wrote it. Whatever the row links to, it is never her profile.
    await expect(anonymousRow.locator('a[href^="/u/"]')).toHaveCount(0);
    await expect(anonymousRow.getByText("Nadia Ray")).toHaveCount(0);
  });

  test("L of the day is the previous UTC day's winner, attributed to its author", async ({
    page,
  }) => {
    await page.goto("/");

    const daily = page.getByRole("region", { name: /l of the day/i });
    // `startup` is the only L interacted with during the closed previous-day window.
    await expect(daily.getByText(world.startup.title)).toBeVisible();
    await expect(daily.getByRole("link", { name: "Kartik Gupta" })).toHaveAttribute(
      "href",
      "/u/kartik",
    );
    await expect(daily.getByText(/\d+ builders? interacted/)).toBeVisible();
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
    await expect(feed(page).getByText(world.google.title)).toBeVisible();
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
