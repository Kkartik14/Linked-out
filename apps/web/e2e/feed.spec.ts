import { expect, test } from "@playwright/test";

test("the feed loads and shows Ls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The Feed" })).toBeVisible();
  await expect(page.getByText("Rejected after the final round at Google")).toBeVisible();
});

test("opening an L shows the full story and comments", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Rejected after the final round at Google/ }).click();
  await expect(page).toHaveURL(/\/ls\//);
  await expect(page.getByText("windowless room")).toBeVisible();
  await expect(page.getByRole("heading", { name: /comments/i })).toBeVisible();
});

test("filtering the feed by category narrows results", async ({ page }) => {
  await page.goto("/?filter=startups");
  await expect(page.getByText("We shut down the startup after three years")).toBeVisible();
  await expect(page.getByText("Rejected after the final round at Google")).toHaveCount(0);
});
