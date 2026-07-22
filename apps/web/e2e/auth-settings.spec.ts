import { expect, test } from "@playwright/test";

import { db, disconnect, seedWorld, signIn, type World } from "./helpers";

let world: World;

test.beforeEach(async () => {
  world = await seedWorld();
});

test.afterAll(async () => {
  await disconnect();
});

test.describe("auth surface", () => {
  test("login sanitizes unsafe return paths", async ({ page }) => {
    await page.goto("/login?returnTo=https://evil.example&error=access_denied");

    await expect(page.getByText("You cancelled the sign-in.")).toBeVisible();
    const href = await page.getByRole("link", { name: "Continue with Google" }).getAttribute("href");

    expect(href).toContain("returnTo=%2F");
    expect(href).not.toContain("evil.example");
  });

  test("auth callback errors are shown without redirect loops", async ({ page }) => {
    await page.goto("/auth/callback?error=oauth_failed");

    await expect(page.getByRole("heading", { name: "Sign-in failed" })).toBeVisible();
    await expect(page.getByText("Something went wrong with the provider.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to login" })).toHaveAttribute("href", "/login");
  });

  test("protected pages redirect to login when logged out", async ({ page }) => {
    for (const path of ["/saved", "/notifications", "/settings", "/new"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=`));
    }
  });

  test("the auth callback routes a not-yet-onboarded user to onboarding (contract §1.1)", async ({
    page,
    context,
  }) => {
    await signIn(context, world.newcomer);
    await page.goto("/auth/callback?returnTo=%2Fsaved");

    await expect(page).toHaveURL(/\/onboarding\?returnTo=%2Fsaved/);
  });

  test("the auth callback forwards an onboarded user straight to returnTo", async ({
    page,
    context,
  }) => {
    await signIn(context, world.kartik);
    await page.goto("/auth/callback?returnTo=%2Fsaved");

    await expect(page).toHaveURL(/\/saved/);
    await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
  });

  test("the auth callback sends a logged-out visitor back to login", async ({ page }) => {
    await page.goto("/auth/callback?returnTo=%2Fsaved");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fsaved/);
  });

  test("the API refuses writes from a user who has not finished onboarding", async ({
    page,
    context,
  }) => {
    await signIn(context, world.newcomer);
    await page.goto("/new");

    await page.getByLabel("Title").fill("Too early to post");
    await page.getByLabel("Story").fill("I have not chosen a username yet.");
    await page.getByRole("button", { name: "Share this L" }).click();

    // The API's onboarding guard (403 FORBIDDEN) is the authority; nothing is persisted.
    await expect(page).not.toHaveURL(/\/ls\//);
    expect(await db().l.count({ where: { authorId: world.newcomer.id } })).toBe(0);
  });

  test("onboarding claims a username through the real API", async ({ page, context }) => {
    await signIn(context, world.newcomer);
    await page.goto("/onboarding");

    await page.getByPlaceholder("yourname").fill("freshbuilder");
    await page.getByRole("button", { name: /Continue|Save|Finish/ }).first().click();

    await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));

    const row = await db().user.findUnique({ where: { id: world.newcomer.id } });
    expect(row.username).toBe("freshbuilder");
  });

  test("onboarding surfaces a USERNAME_TAKEN conflict from the API", async ({ page, context }) => {
    await signIn(context, world.newcomer);
    await page.goto("/onboarding");

    await page.getByPlaceholder("yourname").fill("kartik");
    await page.getByRole("button", { name: /Continue|Save|Finish/ }).first().click();

    await expect(page.getByText(/already taken|USERNAME_TAKEN/i)).toBeVisible();

    const row = await db().user.findUnique({ where: { id: world.newcomer.id } });
    expect(row.username).toBeNull();
  });

  // A rejected credential must never be downgraded to a guest response. The public API deliberately does
  // not (contract §2 — "not silently treated as guest"), so every optional-auth read 401s
  // on a stale cookie, including the public feed. The app cannot clear an httpOnly cookie
  // from a Server Component (ADR 0001 §1.1), so the only recoverable answer is to offer
  // re-authentication rather than render an error page.
  test("a rejected credential is sent to log in, not silently served as a guest", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "lo_access", value: "not-a-jwt", domain: "localhost", path: "/", httpOnly: true },
    ]);
    await page.goto("/");

    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await expect(page.getByRole("heading", { name: "Welcome to LinkedOut" })).toBeVisible();
  });

  test("a visitor presenting no credential at all still reads the public feed", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "The Feed" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "The Feed" }).getByText(world.google.title),
    ).toBeVisible();
  });

  // AUTH-01 (ADR 0001 §6) is now a real, passing test in `auth-handoff.spec.ts`: a live `lo_sid`
  // authenticates a protected render and a client API call through the one-origin BFF, with no
  // 15-minute access boundary to fall off. The old `test.fixme` here modeled the wrong (access
  // cookie + refresh) lifecycle and has been removed now that the handoff path exists.
});

test.describe("saved, notifications & settings", () => {
  test("the saved page lists the viewer's SAVED Ls", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(context, world.kartik);
    await db().reaction.create({
      data: { userId: world.kartik.id, lId: world.nadiaPublic.id, type: "SAVED" },
    });

    await page.goto("/saved");

    await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
    await expect(page.getByText(world.nadiaPublic.title)).toBeVisible();
    const leftRail = page.getByRole("complementary", { name: "Profile and discovery" });
    await expect(leftRail).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Top Ls and L of the day" }),
    ).toBeVisible();
    await expect(leftRail.getByRole("link", { name: "Saved" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(leftRail.getByRole("link", { name: "Followers" })).toHaveAttribute(
      "href",
      "/u/kartik/followers",
    );
    await expect(leftRail.getByRole("link", { name: "Following" })).toHaveAttribute(
      "href",
      "/u/kartik/following",
    );
  });

  test("notifications render server-composed copy and can be marked read", async ({
    page,
    context,
  }) => {
    await signIn(context, world.kartik);

    // nadia comments on kartik's L → the API composes the notification message.
    await db().notification.create({
      data: {
        type: "COMMENT",
        recipientId: world.kartik.id,
        actorId: world.nadia.id,
        lId: world.google.id,
      },
    });

    await page.goto("/notifications");

    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.getByText("Nadia Ray commented on your L.")).toBeVisible();

    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByRole("button", { name: "Mark all read" })).toHaveCount(0);

    await expect
      .poll(() => db().notification.count({ where: { recipientId: world.kartik.id, readAt: null } }))
      .toBe(0);
  });

  test("settings saves profile changes through PATCH /users/me", async ({ page, context }) => {
    await signIn(context, world.kartik);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Kartik G");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Profile updated.")).toBeVisible();

    await expect
      .poll(async () => (await db().user.findUnique({ where: { id: world.kartik.id } })).name)
      .toBe("Kartik G");
  });

  test("settings caps name and bio at the contract's limits before the API is called", async ({
    page,
    context,
  }) => {
    await signIn(context, world.kartik);
    await page.goto("/settings");

    const name = page.getByRole("textbox", { name: "Name", exact: true });
    await expect(name).toHaveAttribute("maxlength", "80");
    await expect(page.getByRole("textbox", { name: "Bio" })).toHaveAttribute("maxlength", "280");

    await name.fill("x".repeat(120));
    expect((await name.inputValue()).length).toBeLessThanOrEqual(80);
  });

  test("settings clears an optional field with an explicit null", async ({ page, context }) => {
    await signIn(context, world.kartik);
    await page.goto("/settings");

    await page.getByRole("textbox", { name: "Bio" }).fill("");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile updated.")).toBeVisible();

    await expect
      .poll(async () => (await db().user.findUnique({ where: { id: world.kartik.id } })).bio)
      .toBeNull();
  });
});
