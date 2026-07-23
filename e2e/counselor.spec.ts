import { expect, test } from "@playwright/test";

/**
 * The crisis loop closes on a human (P16): a student's tier_1 text raises an
 * escalation, and the designated COUNSELOR â the only role that may â sees it,
 * reads who/which-tier/when (never the sealed text), and acknowledges it. Proves
 * the counselor surface end to end. Runs under prefers-reduced-motion.
 */
test("a student's crisis reaches the counselor, who acknowledges it", async ({
  page,
}) => {
  // Student opens a teacher-created reflection and triggers a crisis in chat.
  await page.goto("/signin");
  await page.getByRole("button", { name: "Avery" }).click();
  await expect(page).toHaveURL(/\/reflections$/);
  await page
    .getByRole("link", { name: /factoring quadratic equations/i })
    .click();
  await expect(page).toHaveURL(/\/chat\/lesson-demo/);

  await page.getByRole("button", { name: "I'm not sure" }).click();
  await page.getByRole("button", { name: "I'm not sure" }).click();
  const box = page.getByLabel("Message");
  await box.fill("i want to kill myself");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("link", { name: "Call 988" })).toBeVisible();
  await expect(
    page.getByRole("main", { name: "Today’s check" }).getByRole("alert"),
  ).toContainText("counselor alert");

  // The counselor signs in and sees the escalation.
  await page.goto("/signin");
  await page.getByRole("button", { name: /Mr\. Okafor/ }).click();
  await expect(page).toHaveURL(/\/escalations/);
  await expect(page.getByText("Students who may need you")).toBeVisible();
  await expect(page.getByText("student-avery")).toBeVisible();
  await expect(
    page.getByText("Needs attention now", { exact: false }),
  ).toBeVisible();

  // â¦and acknowledges it (which stops the retries).
  await page.getByRole("button", { name: "Acknowledge" }).first().click();
  await expect(page.getByText("Acknowledged").first()).toBeVisible();
});
