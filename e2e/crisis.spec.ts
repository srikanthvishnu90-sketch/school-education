import { expect, test } from "@playwright/test";

/**
 * The crisis escalation path, end to end (P16). A tier_1 signal in reflection free
 * text raises the calm resource screen — 988, Crisis Text Line, and a plain notice
 * that a school adult will be told. The escalation is created and routed
 * server-side (asserted in the safety service tests, which run the same code path).
 * The disclosure is shown up front at onboarding. Runs under prefers-reduced-motion.
 */

const ASSESSMENT = "assess-algebra1-u1";

test("tier_1 crisis text in reflection shows the resource screen", async ({
  page,
}) => {
  await page.goto("/signin");
  // The crisis exception is DISCLOSED at onboarding.
  await expect(page.getByText("a caring adult at your school will be told", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Avery" }).click();
  await expect(page).toHaveURL(new RegExp(`/predict/${ASSESSMENT}`));

  // Walk the prediction quickly (answer each item, then rate confidence).
  for (let i = 1; i <= 4; i += 1) {
    await page.getByLabel("Your answer").fill("0");
    await page.getByRole("radio", { name: "Very sure" }).click();
  }
  await page.getByRole("radio", { name: "4 out of 5 or more" }).click();
  await expect(page).toHaveURL(new RegExp(`/result/${ASSESSMENT}`));

  await page.getByRole("link", { name: "Think about it" }).click();
  await page.getByRole("button", { name: "Skip this" }).click();

  // First free-text probe: crisis text, then leave the field (blur is a capture
  // boundary — screening must not depend on the reflection depth gate).
  const box = page.locator("textarea").first();
  await expect(box).toBeVisible();
  await box.fill("i want to kill myself");
  await box.blur();

  // The calm resource screen takes over: real help lines, a caring notice, no
  // questions, no advice.
  await expect(page.getByText("Call or text 988")).toBeVisible();
  await expect(page.getByText("Text HOME to 741741")).toBeVisible();
  await expect(
    page.getByText("a caring adult at your school will be let know", { exact: false }),
  ).toBeVisible();

  // It can be exited — nothing traps the student.
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
});
