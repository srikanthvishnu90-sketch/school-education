import { expect, test } from "@playwright/test";

/**
 * Real sign-in via magic link (p5). A provisioned email requests a link; in dev
 * the link is surfaced on-screen (no SMTP); following it establishes the session
 * and lands the student on their surface. An unknown email must not reveal that it
 * isn't provisioned. Runs under prefers-reduced-motion.
 */

test("a provisioned student signs in with a magic link", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Sign in with your school email").fill("avery@demo.school");
  await page.getByRole("button", { name: "Send link" }).click();

  // Dev surfaces the link; follow it.
  const open = page.getByRole("link", { name: "Open your link" });
  await expect(open).toBeVisible();
  await open.click();

  // Signed in → the student's map.
  await expect(page).toHaveURL(/\/map/);
  await expect(page.getByText("Your learning map")).toBeVisible();
});

test("a brand-new email self-signs-up and can start a real cycle", async ({
  page,
}) => {
  await page.goto("/signin");
  await page.getByLabel("Sign in with your school email").fill("brand.new@school.org");
  await page.getByRole("button", { name: "Send link" }).click();
  await page.getByRole("link", { name: "Open your link" }).click();

  // A fresh student lands on their (empty) map and is invited to start.
  await expect(page).toHaveURL(/\/map/);
  await page.getByRole("link", { name: "Make a guess" }).click();
  await expect(page).toHaveURL(/\/predict\//);
  // Provisioned on entry — they can answer the first item.
  await expect(page.getByLabel("Your answer")).toBeVisible();
});
