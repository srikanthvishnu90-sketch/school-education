import { expect, test, type Page } from "@playwright/test";

/**
 * The RETURN — the single behavior the pilot exists to measure (P17): a student
 * completes a cycle, comes back from the map, and predicts a SECOND time. Proves
 * the multi-cycle path end to end and that the trajectory grows a line per cycle.
 * Runs under prefers-reduced-motion.
 */

async function predictThroughResult(page: Page, assessment: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/predict/${assessment}`));
  for (let i = 1; i <= 4; i += 1) {
    await page.getByLabel("Your answer").fill("0");
    await page.getByRole("radio", { name: "Very sure" }).click();
  }
  await page.getByRole("radio", { name: "4 out of 5 or more" }).click();
  await expect(page).toHaveURL(new RegExp(`/result/${assessment}`));
}

test("a student returns from the map and predicts a second time", async ({
  page,
}) => {
  await page.goto("/signin");
  await page.getByRole("button", { name: "Avery" }).click();

  // Cycle 1.
  await predictThroughResult(page, "assess-algebra1-u1");

  // The map shows one line and invites the return.
  await page.goto("/map");
  await expect(page.getByText("Ready for your next check?")).toBeVisible();
  const startNext = page.getByRole("link", { name: /Start check 2/ });
  await expect(startNext).toBeVisible();
  await startNext.click();

  // Cycle 2 — the return.
  await predictThroughResult(page, "assess-algebra1-u2");

  // The map now shows the two-cycle trajectory, and there is no further check.
  await page.goto("/map");
  await expect(page.getByText("Two lines", { exact: false })).toBeVisible();
  await expect(page.getByText("Check 2", { exact: false })).toBeVisible();
  await expect(page.getByText("Ready for your next check?")).toHaveCount(0);
});
