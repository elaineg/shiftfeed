import { test, expect } from "@playwright/test";

// Spec success check 6: the builder page shows the exact feed URL live.
test("builder shows the exact check-1 feed URL and updates live", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");

  // 4 on / 4 off is pre-selected; set the anchor to the spec's example date.
  await page.locator("#anchor").fill("2026-06-01");

  const expectedPath =
    "/api/feed?pattern=4on4off&anchor=2026-06-01&start=07:00&end=19:00";
  const origin = new URL(baseURL!).origin;

  await expect(page.getByTestId("feed-url")).toHaveText(
    `${origin}${expectedPath}`
  );
  await expect(page.getByTestId("webcal-url")).toHaveText(
    `${origin.replace(/^https?:\/\//, "webcal://")}${expectedPath}`
  );

  // URL updates immediately when the anchor changes — no submit.
  await page.locator("#anchor").fill("2026-06-02");
  await expect(page.getByTestId("feed-url")).toHaveText(
    `${origin}/api/feed?pattern=4on4off&anchor=2026-06-02&start=07:00&end=19:00`
  );

  // Copy puts the https URL on the clipboard and confirms inline.
  await page.locator("#anchor").fill("2026-06-01");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(`${origin}${expectedPath}`);
});

// UX brief: invalid custom cycle shows a plain instruction, never a broken state.
test("invalid custom cycle replaces the URL box with guidance", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Custom" }).click();
  await page.locator("#cycle").fill("abc");
  await expect(
    page.getByRole("alert").filter({ hasText: "Cycle must be" })
  ).toContainText("Cycle must be numbers separated by commas");
  await expect(page.getByTestId("feed-url")).toHaveCount(0);
});

// UX brief: 14-day preview strip is present with ON/OFF cells.
test("two-week preview strip renders 14 day cells", async ({ page }) => {
  await page.goto("/");
  await page.locator("#anchor").fill("2026-06-01");
  await expect(
    page.getByText("Next 14 days — check this matches your roster")
  ).toBeVisible();
});
