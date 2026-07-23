import { expect, test } from "@playwright/test";

/**
 * Real sign-in via magic link (p5). A provisioned email requests a link; in dev
 * the link is surfaced on-screen (no SMTP); following it establishes the session
 * and lands the student in their lesson inbox. Runs under reduced motion and the
 * deterministic adapter so this release gate never depends on an external model.
 */

test("a provisioned student signs in with a magic link", async ({ page }) => {
  await page.goto("/signin");
  await page
    .getByRole("button", { name: /sign in with your school email instead/i })
    .click();
  await page
    .getByLabel("Sign in with your school email")
    .fill("avery@demo.school");
  await page.getByRole("button", { name: "Send link" }).click();

  // Dev surfaces the link; follow it.
  const open = page.getByRole("link", { name: "Open your link" });
  await expect(open).toBeVisible();
  await open.click();

  // Signed in → the student's teacher-created lesson inbox.
  await expect(page).toHaveURL(/\/reflections$/);
  await expect(
    page.getByRole("heading", { name: "Your lessons" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /factoring quadratic equations/i }),
  ).toBeVisible();
});

test("a brand-new email self-signs-up and lands on a reflection", async ({
  page,
}) => {
  await page.goto("/signin");
  await page
    .getByRole("button", { name: /sign in with your school email instead/i })
    .click();
  await page
    .getByLabel("Sign in with your school email")
    .fill("brand.new@school.org");
  await page.getByRole("button", { name: "Send link" }).click();
  await page.getByRole("link", { name: "Open your link" }).click();

  await expect(page).toHaveURL(/\/reflections$/);
  await expect(
    page.getByRole("heading", { name: "Your lessons" }),
  ).toBeVisible();
});
