import { expect, test } from "@playwright/test";

/**
 * The crisis loop closes on a human (P16): a student's tier_1 text raises an
 * escalation, and the designated COUNSELOR — the only role that may — sees it,
 * reads who/which-tier/when (never the sealed text), and acknowledges it. Proves
 * the counselor surface end to end. Runs under prefers-reduced-motion.
 */
test("a student's crisis reaches the counselor, who acknowledges it", async ({
  page,
}) => {
  // Student triggers a crisis in reflection.
  await page.goto("/signin");
  await page.getByRole("button", { name: "Avery" }).click();
  for (let i = 1; i <= 4; i += 1) {
    await page.getByRole("radio", { name: "Very sure" }).click();
  }
  await page.getByRole("radio", { name: "4 out of 5 or more" }).click();
  await page.getByRole("link", { name: "Think about it" }).click();
  await page.getByRole("button", { name: "Skip this" }).click();
  const box = page.locator("textarea").first();
  await box.fill("i want to kill myself");
  await box.blur();
  await expect(page.getByText("Call or text 988")).toBeVisible();

  // The counselor signs in and sees the escalation.
  await page.goto("/signin");
  await page.getByRole("button", { name: /Mr\. Okafor/ }).click();
  await expect(page).toHaveURL(/\/escalations/);
  await expect(page.getByText("Students who may need you")).toBeVisible();
  await expect(page.getByText("student-avery")).toBeVisible();
  await expect(page.getByText("Needs attention now", { exact: false })).toBeVisible();

  // …and acknowledges it (which stops the retries).
  await page.getByRole("button", { name: "Acknowledge" }).first().click();
  await expect(page.getByText("Acknowledged").first()).toBeVisible();
});
