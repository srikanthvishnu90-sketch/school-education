import { expect, test } from "@playwright/test";

/**
 * The teacher surface, authenticated as the seed teacher. Asserts both class
 * signals render from seeded data, a flag for the overconfident-low archetype
 * appears in task language and clears on acknowledge (suppressed via the agent),
 * a sub-min-N skill shows no estimate, and the teacher cannot fetch another
 * class. Runs under prefers-reduced-motion (playwright.config.ts).
 */

const FORBIDDEN_SELF_WORDS = [
  "bad at",
  "not good",
  "stupid",
  "dumb",
  "smart",
  "gifted",
  "overconfident student",
];

test("teacher: class signals, task-language flag, acknowledge suppresses, class isolation", async ({
  page,
}) => {
  // Sign in as the teacher.
  await page.goto("/signin");
  await page.getByRole("button", { name: /Ms\. Rivera/ }).click();
  await expect(page).toHaveURL(/\/class\//);

  // Both class signals render from seeded data.
  await expect(page.getByText("Where the class is blindsided")).toBeVisible();
  await expect(page.getByText("Class scored", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Follow-through this window")).toBeVisible();
  await expect(page.getByText("Improved:", { exact: false })).toBeVisible();
  await expect(page.getByText("Regressed:", { exact: false })).toBeVisible();

  // The sub-min-N skill shows no estimate.
  await expect(page.getByText("not enough evidence yet")).toBeVisible();

  // Flags: a task-language flag for the overconfident-low archetype (Avery).
  await page.getByRole("link", { name: "Flags" }).click();
  await expect(page.getByText("Where a student may need you")).toBeVisible();
  await expect(page.getByText("Avery")).toBeVisible();
  const flagText = await page.locator("p", { hasText: "far apart on" }).innerText();
  for (const word of FORBIDDEN_SELF_WORDS) {
    expect(flagText.toLowerCase()).not.toContain(word);
  }
  expect(flagText).not.toContain("!");

  // Acknowledge suppresses the flag (the agent stops re-raising it).
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("Nothing to look at right now")).toBeVisible();
  await expect(page.getByText("Avery")).toHaveCount(0);

  // The teacher cannot fetch another class.
  const resp = await page.goto("/class/some-other-class");
  expect(resp?.status()).toBe(404);
});
