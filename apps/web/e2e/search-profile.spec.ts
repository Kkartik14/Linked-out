import { expect, test } from "@playwright/test";

import { db, disconnect, seedWorld, signIn, type World } from "./helpers";

let world: World;

test.beforeEach(async () => {
  world = await seedWorld();
});

test.afterAll(async () => {
  await disconnect();
});

test.describe("search", () => {
  test("searches Ls live from the first character through the real Postgres index", async ({
    page,
  }) => {
    await page.goto("/search");

    const search = page
      .locator("#main-content")
      .getByRole("searchbox", { name: "Search Ls and people" });
    await search.fill("r");

    await expect(page).toHaveURL(/q=r/);
    await expect(
      page.getByRole("region", { name: "Search", exact: true }).getByText(world.google.title),
    ).toBeVisible();
  });

  test("an empty search keeps the feed and both desktop discovery rails", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/search");

    const centre = page.getByRole("region", { name: "Search", exact: true });
    await expect(centre.getByRole("heading", { name: "The Feed" })).toBeVisible();
    await expect(centre.getByText(world.google.title)).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Profile and discovery" }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Top Ls and L of the day" }),
    ).toBeVisible();
  });

  test("clearing a deep-linked query restores the feed without leaving search", async ({ page }) => {
    await page.goto("/search?q=burned");
    const centre = page.getByRole("region", { name: "Search", exact: true });

    await centre.getByRole("searchbox", { name: "Search Ls and people" }).clear();

    await expect(page).toHaveURL(/\/search$/);
    await expect(centre.getByRole("heading", { name: "The Feed" })).toBeVisible();
    await expect(centre.getByText(world.google.title)).toBeVisible();
  });

  test("the header opens a grouped L preview without removing header search", async ({ page }) => {
    await page.goto("/");

    const search = page.getByRole("combobox", { name: "Search Ls and people" });
    await search.fill("g");

    await expect(page.getByRole("group", { name: "Ls" })).toBeVisible();
    await expect(page.getByRole("group", { name: "People" })).toBeVisible();
    await expect(page.getByRole("option", { name: new RegExp(world.google.title) })).toBeVisible();
  });

  test("search never surfaces a PRIVATE L to a stranger", async ({ page }) => {
    await page.goto("/search?q=leadership");
    await expect(
      page.getByRole("region", { name: "Search", exact: true }).getByText(world.privateL.title),
    ).toHaveCount(0);
  });

  test("search shows an anonymous L without leaking its author", async ({ page }) => {
    await page.goto("/search?q=burned");

    const centre = page.getByRole("region", { name: "Search", exact: true });
    await expect(centre.getByText(world.anonymous.title)).toBeVisible();
    await expect(centre.getByText("Anonymous builder")).toBeVisible();
  });

  test("an unmatched query renders an empty state, not an error", async ({ page }) => {
    await page.goto("/search?q=zzzznothingmatches");
    await expect(
      page.getByRole("region", { name: "Search", exact: true }).getByText(world.google.title),
    ).toHaveCount(0);
  });

  test("search can switch to people results", async ({ page }) => {
    await page.goto("/search?q=kartik&type=users");

    const centre = page.getByRole("region", { name: "Search", exact: true });
    await expect(centre.getByRole("tab", { name: "People" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(centre.getByText("Kartik Gupta")).toBeVisible();
    await expect(centre.getByText("@kartik")).toBeVisible();
  });
});

test.describe("profiles", () => {
  test("a public profile renders reputation and type-filtered Ls", async ({ page }) => {
    await page.goto("/u/kartik");

    await expect(page.getByRole("heading", { name: "Kartik Gupta" })).toBeVisible();
    await expect(page.getByText("Building in public")).toBeVisible();
    await page.getByRole("tab", { name: "Stories" }).click();
    await expect(page.getByText(world.google.title)).toBeVisible();
    await expect(page.getByRole("tab", { name: "All" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Collections" })).toHaveCount(0);
  });

  test("a stranger sees neither the owner's PRIVATE Ls nor profile controls", async ({
    page,
    context,
  }) => {
    await signIn(context, world.nadia);
    await page.goto("/u/kartik");
    await expect(page.getByText(world.privateL.title)).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Current chapter" })).toHaveCount(0);
  });

  test("the owner does see their own PRIVATE Ls", async ({ page, context }) => {
    await signIn(context, world.kartik);
    await page.goto("/u/kartik");

    await expect(page.getByRole("link", { name: "Edit profile" })).toBeVisible();
    await expect(page.getByText(world.privateL.title)).toBeVisible();
  });

  test("the owner can set and clear Current chapter from their profile", async ({
    page,
    context,
  }) => {
    await signIn(context, world.kartik);
    await page.goto("/u/kartik");

    const chapter = page.getByRole("combobox", { name: "Current chapter" });
    await expect(chapter).toContainText("Building");
    await chapter.click();
    await page.getByRole("option", { name: /Working/ }).click();

    await expect(page.getByText("Current chapter updated.")).toBeVisible();
    await expect(chapter).toContainText("Working");
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("🟢");
    await expect.poll(async () => (await db().user.findUnique({
      where: { id: world.kartik.id },
    })).status).toBe("WORKING");

    await page.goto("/");
    await expect(
      page
        .getByRole("complementary", { name: "Profile and discovery" })
        .getByText("Working", { exact: true }),
    ).toBeVisible();

    await page.goto("/u/kartik");
    await chapter.click();
    await page.getByRole("option", { name: "Not set" }).click();
    await expect(chapter).toHaveText("Not set");
    await expect.poll(async () => (await db().user.findUnique({
      where: { id: world.kartik.id },
    })).status).toBeNull();

    await page.goto("/settings");
    await expect(page.getByRole("combobox", { name: "Current chapter" })).toHaveCount(0);
    await expect(page.getByText("Journey status")).toHaveCount(0);
  });

  test("an unknown profile is a 404", async ({ page }) => {
    const res = await page.goto("/u/nobodyhere");
    expect(res?.status()).toBe(404);
  });

  test("the removed collection page is a 404", async ({ page }) => {
    const res = await page.goto(`/collections/${world.google.id}`);
    expect(res?.status()).toBe(404);
  });
});
