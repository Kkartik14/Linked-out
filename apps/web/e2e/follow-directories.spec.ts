import { expect, test } from "@playwright/test";

import { db, disconnect, seedWorld, signIn, signOut, type World } from "./helpers";

let world: World;

test.beforeEach(async () => {
  world = await seedWorld();
});

test.afterAll(async () => {
  await disconnect();
});

// Seed world: kartik follows nadia. So nadia.followers = [kartik], kartik.following = [nadia],
// and nobody follows kartik.
test.describe("follower / following directories", () => {
  test("a profile's follower count opens the followers directory (public)", async ({ page }) => {
    await page.goto("/u/nadia");
    await page.getByRole("link", { name: /followers/ }).click();

    await expect(page).toHaveURL(/\/u\/nadia\/followers$/);
    await expect(page.getByRole("heading", { name: "Followers" })).toBeVisible();
    await expect(page.getByText("Kartik Gupta")).toBeVisible();
  });

  test("the following directory lists who a user follows", async ({ page }) => {
    await page.goto("/u/kartik/following");

    await expect(page.getByRole("heading", { name: "Following" })).toBeVisible();
    await expect(page.getByText("Nadia Ray")).toBeVisible();
  });

  test("following someone from the directory persists through the real API", async ({
    page,
    context,
  }) => {
    // nadia does not follow kartik yet; on her own followers list she can follow him back.
    await signIn(context, world.nadia);
    await page.goto("/u/nadia/followers");

    await expect(page.getByText("Kartik Gupta")).toBeVisible();
    await page.getByRole("button", { name: "Follow" }).click();

    await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
    await expect
      .poll(() =>
        db().follow.count({ where: { followerId: world.nadia.id, followingId: world.kartik.id } }),
      )
      .toBe(1);
  });

  test("unfollow stays reversible until the directory is reopened", async ({
    page,
    context,
  }) => {
    // Start from the profile so browser Back exercises the same cached navigation path as a user.
    await signIn(context, world.kartik);
    await page.goto("/u/kartik");
    await page.getByRole("link", { name: "1 following" }).click();

    await expect(page.getByText("Nadia Ray")).toBeVisible();
    await page.getByRole("button", { name: "Following" }).click();

    // Current-open behavior is deliberate: keep the row so an accidental unfollow is reversible.
    await expect(page.getByRole("button", { name: "Follow" })).toBeVisible();
    await expect(page.getByText("Nadia Ray")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/u\/kartik$/);
    await expect(page.getByRole("link", { name: "0 following" })).toBeVisible();

    await page.getByRole("link", { name: "0 following" }).click();
    await expect(page).toHaveURL(/\/u\/kartik\/following$/);
    await expect(page.getByText("Not following anyone yet.")).toBeVisible();
    await expect(page.getByText("Nadia Ray")).toHaveCount(0);
  });

  test("the viewer's own row carries no follow control", async ({ page, context }) => {
    // kartik is nadia's only follower, so on nadia's followers list he sees only himself.
    await signIn(context, world.kartik);
    await page.goto("/u/nadia/followers");

    await expect(page.getByText("Kartik Gupta")).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Follow|Following)$/ })).toHaveCount(0);
  });

  test("a user with no followers shows the empty state", async ({ page }) => {
    await page.goto("/u/kartik/followers");

    await expect(page.getByText("No followers yet.")).toBeVisible();
  });

  test("a signed-out visitor is sent to login when trying to follow", async ({ page, context }) => {
    await signOut(context);
    await page.goto("/u/nadia/followers");

    await page.getByRole("button", { name: "Follow" }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=/);
  });
});
