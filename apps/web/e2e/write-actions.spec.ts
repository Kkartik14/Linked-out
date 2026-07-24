import { expect, test } from "@playwright/test";

import { db, disconnect, seedWorld, signIn, type World } from "./helpers";

let world: World;

test.beforeEach(async ({ context }) => {
  world = await seedWorld();
  await signIn(context, world.kartik);
});

test.afterAll(async () => {
  await disconnect();
});

test.describe("write actions against the real API", () => {
  test("the composer validates before it ever calls the API", async ({ page }) => {
    await page.goto("/new");

    // Engage the form (type then clear) so react-hook-form has hydrated before we
    // submit. An immediate empty submit on a freshly-loaded route can beat hydration
    // and trigger a native form post that never runs client validation.
    const title = page.getByLabel("Title");
    await title.fill("x");
    await title.fill("");

    await page.getByRole("button", { name: "Share this L" }).click();

    await expect(page.getByText("Give your L a title.")).toBeVisible();
    await expect(page.getByText("Tell the story.")).toBeVisible();
  });

  test("creating an L persists it and lands on its detail page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Share an L" }).click();

    const title = "A useful rejection from a systems interview";
    await page.getByLabel("Title").fill(title);
    await page
      .getByLabel("Story")
      .fill("I missed the concurrency edge case, then turned it into a checklist.");
    await page.getByRole("button", { name: "Share this L" }).click();

    await page.waitForURL(/\/ls\/[0-9A-HJKMNP-TV-Z]{26}/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("concurrency edge case")).toBeVisible();

    const row = await db().l.findFirst({ where: { title } });
    expect(row).not.toBeNull();
    expect(row.authorId).toBe(world.kartik.id);
    expect(row.visibility).toBe("PUBLIC");

    // Creating an L moves the author's reputation (contract §4.3).
    const author = await db().user.findUnique({ where: { id: world.kartik.id } });
    expect(author.lsShared).toBe(1);

    await page.getByRole("link", { name: "Back to the feed" }).click();
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    const viewerProfile = page.getByRole("region", { name: "Your profile" });
    await expect(viewerProfile.locator("dl > div").first().getByText("1", { exact: true })).toBeVisible();

    await viewerProfile.getByRole("link", { name: "View profile" }).click();
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });

  test("an anonymous L never renders its author, even to the author", async ({ page }) => {
    await page.goto("/new");

    await page.getByLabel("Title").fill("Something I cannot sign");
    await page.getByLabel("Story").fill("Told in confidence.");
    await page.getByLabel("Post anonymously").click();
    await page.getByRole("button", { name: "Share this L" }).click();

    await page.waitForURL(/\/ls\//);
    await expect(page.getByText("Anonymous builder")).toBeVisible();
    await expect(page.getByRole("link", { name: /Kartik Gupta/ })).toHaveCount(0);
  });

  test("reacting persists, reconciles from the API response, and toggles off", async ({ page }) => {
    await page.goto(`/ls/${world.nadiaPublic.id}`);

    await page.getByRole("button", { name: "Add reaction" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Been There" }).click();
    await expect(page.getByRole("button", { name: /Been There, 1/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect
      .poll(() => db().reaction.count({ where: { lId: world.nadiaPublic.id, type: "BEEN_THERE" } }))
      .toBe(1);

    await page.getByRole("button", { name: /^Been There/ }).click();
    await expect(page.getByRole("button", { name: /^Been There/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add reaction" })).toBeVisible();
    await expect
      .poll(() => db().reaction.count({ where: { lId: world.nadiaPublic.id, type: "BEEN_THERE" } }))
      .toBe(0);
  });

  test("saving an L adds it to /saved", async ({ page }) => {
    await page.goto(`/ls/${world.nadiaPublic.id}`);

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove from saved" })).toBeVisible();

    await page.goto("/saved");
    await expect(page.getByText(world.nadiaPublic.title)).toBeVisible();
  });

  test("commenting persists and updates the comment count", async ({ page }) => {
    await page.goto(`/ls/${world.google.id}`);

    const body = "This is exactly the kind of feedback loop I need.";
    await page.getByLabel("Write a comment").fill(body);
    await page.getByRole("button", { name: "Post" }).click();

    await expect(page.getByText(body)).toBeVisible();
    await expect(page.getByRole("heading", { name: /2 comments/i })).toBeVisible();
    await expect.poll(() => db().comment.count({ where: { lId: world.google.id } })).toBe(2);
  });

  test("the author can edit their own L, and the change persists", async ({ page }) => {
    await page.goto("/");
    const feed = page.getByRole("region", { name: "The Feed" });
    await feed.getByRole("link", { name: world.google.title }).click();
    await page.getByRole("link", { name: "Edit" }).click();

    await page.getByLabel("Title").fill("Rejected, and glad of it");
    await page.getByRole("button", { name: "Save changes" }).click();

    await page.waitForURL(new RegExp(`/ls/${world.google.id}$`));
    await expect(page.getByRole("heading", { name: "Rejected, and glad of it" })).toBeVisible();

    const row = await db().l.findUnique({ where: { id: world.google.id } });
    expect(row.title).toBe("Rejected, and glad of it");

    await page.getByRole("link", { name: "Back to the feed" }).click();
    await expect(feed.getByRole("link", { name: "Rejected, and glad of it" })).toBeVisible();
    await expect(feed.getByRole("link", { name: world.google.title })).toHaveCount(0);
  });

  test("deleting an L removes it from a warmed feed without a refresh", async ({ page }) => {
    await page.goto("/");
    const feed = page.getByRole("region", { name: "The Feed" });
    await feed.getByRole("link", { name: world.google.title }).click();

    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete this L?" }).getByRole("button", { name: "Delete" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(feed.getByRole("link", { name: world.google.title })).toHaveCount(0);
  });

  test("resolving a Battle updates its badge in a warmed feed", async ({ page }) => {
    await db().l.update({ where: { id: world.google.id }, data: { type: "BATTLE" } });
    await page.goto("/");
    const feed = page.getByRole("region", { name: "The Feed" });
    await feed.getByRole("link", { name: world.google.title }).click();

    await page.getByRole("button", { name: "Mark resolved" }).click();
    await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
    await page.getByRole("link", { name: "Back to the feed" }).click();

    await expect(feed.getByText("Resolved", { exact: true })).toBeVisible();
    await expect(feed.getByText("Ongoing", { exact: true })).toHaveCount(0);
  });

  test("unfollowing from a profile reconciles the viewer's directory and profile", async ({
    page,
  }) => {
    await page.goto("/u/kartik");
    await page.getByRole("link", { name: "1 following" }).click();
    await page.getByRole("link", { name: /Nadia Ray/ }).click();

    const unfollowed = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().endsWith("/v1/users/nadia/follow") &&
        response.ok(),
    );
    await page.getByRole("button", { name: "Following" }).click();
    await unfollowed;
    await expect(page.getByRole("button", { name: "Follow" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/u\/kartik\/following$/);
    await expect(page.getByText("Not following anyone yet.")).toBeVisible();
    await expect(page.getByText("Nadia Ray")).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/u\/kartik$/);
    await expect(page.getByRole("link", { name: "0 following" })).toBeVisible();
  });
});
