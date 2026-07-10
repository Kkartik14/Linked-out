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
  test("finds Ls through the real Postgres full-text index", async ({ page }) => {
    await page.goto("/search");

    await expect(page.getByText(/Search for a story/)).toBeVisible();
    const search = page.locator("#main-content").getByRole("searchbox", { name: "Search" });
    await search.fill("google");
    await search.press("Enter");

    await expect(page).toHaveURL(/q=google/);
    await expect(page.getByText(world.google.title)).toBeVisible();
  });

  test("search never surfaces a PRIVATE L to a stranger", async ({ page }) => {
    await page.goto("/search?q=leadership");
    await expect(page.getByText(world.privateL.title)).toHaveCount(0);
  });

  test("search shows an anonymous L without leaking its author", async ({ page }) => {
    await page.goto("/search?q=burned");

    await expect(page.getByText(world.anonymous.title)).toBeVisible();
    await expect(page.getByText("Anonymous builder")).toBeVisible();
  });

  test("an unmatched query renders an empty state, not an error", async ({ page }) => {
    await page.goto("/search?q=zzzznothingmatches");
    await expect(page.getByText(world.google.title)).toHaveCount(0);
  });

  test("search can switch to people results", async ({ page }) => {
    await page.goto("/search?q=kartik&type=users");

    await expect(page.getByRole("tab", { name: "People" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Kartik Gupta")).toBeVisible();
    await expect(page.getByText("@kartik")).toBeVisible();
  });
});

test.describe("profiles & collections", () => {
  test("a public profile renders reputation, journey and Ls", async ({ page }) => {
    await page.goto("/u/kartik");

    await expect(page.getByRole("heading", { name: "Kartik Gupta" })).toBeVisible();
    await expect(page.getByText("Building in public")).toBeVisible();
    await expect(page.getByText(world.google.title)).toBeVisible();
  });

  test("a stranger never sees the owner's PRIVATE Ls on their profile", async ({ page }) => {
    await page.goto("/u/kartik");
    await expect(page.getByText(world.privateL.title)).toHaveCount(0);
  });

  test("the owner does see their own PRIVATE Ls", async ({ page, context }) => {
    await signIn(context, world.kartik);
    await page.goto("/u/kartik");

    await expect(page.getByRole("link", { name: "Edit profile" })).toBeVisible();
    await expect(page.getByText(world.privateL.title)).toBeVisible();
  });

  test("an unknown profile is a 404", async ({ page }) => {
    const res = await page.goto("/u/nobodyhere");
    expect(res?.status()).toBe(404);
  });

  test("the owner sees their collections tab and can open a collection", async ({
    page,
    context,
  }) => {
    await signIn(context, world.kartik);
    await page.goto("/u/kartik");

    await page.getByRole("tab", { name: "Collections" }).click();
    await expect(page.getByRole("button", { name: "New collection" })).toBeVisible();
    await expect(page.getByText(world.collection.title)).toBeVisible();
  });

  test("a collection owner can rename a collection, and it persists", async ({ page, context }) => {
    await signIn(context, world.kartik);
    await page.goto(`/collections/${world.collection.id}`);

    await expect(page.getByRole("heading", { name: world.collection.title })).toBeVisible();

    await page.getByRole("button", { name: "Rename" }).click();
    await page.getByLabel("Collection title").fill("Interview notes");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("heading", { name: "Interview notes" })).toBeVisible();

    const row = await db().collection.findUnique({ where: { id: world.collection.id } });
    expect(row.title).toBe("Interview notes");
    expect(row.slug).toBe("interview-notes");
  });

  test("a non-owner sees a collection read-only", async ({ page, context }) => {
    await signIn(context, world.nadia);
    await page.goto(`/collections/${world.collection.id}`);

    await expect(page.getByRole("heading", { name: world.collection.title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rename" })).toHaveCount(0);
  });

  test("a collection hides member Ls the viewer may not see", async ({ page }) => {
    await db().collectionL.create({
      data: { collectionId: world.collection.id, lId: world.privateL.id, position: 1 },
    });

    await page.goto(`/collections/${world.collection.id}`);

    await expect(page.getByText(world.google.title)).toBeVisible();
    await expect(page.getByText(world.privateL.title)).toHaveCount(0);
  });
});
