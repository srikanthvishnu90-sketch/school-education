import { expect, test, type Page } from "@playwright/test";

/**
 * The full student cycle, end to end, on seed archetypes. Asserts the hard
 * budget (≤ 12 screens, one decision per screen), the emotional skip path (flow
 * proceeds identically), the gentle re-ask on a non-productive attribution (never
 * blocks exit), and task-focused gap language with no self-referential wording.
 *
 * The whole suite runs under prefers-reduced-motion (playwright.config.ts).
 */

const ASSESSMENT = "assess-algebra1-u1";

const FORBIDDEN_SELF_WORDS = [
  "bad at",
  "not good",
  "stupid",
  "dumb",
  "smart",
  "talent",
  "gifted",
  "failure",
  "ability",
];

/** One decision per screen: at most one radiogroup visible at a time. */
async function expectOneDecision(page: Page): Promise<void> {
  const groups = await page.getByRole("radiogroup").count();
  expect(groups).toBeLessThanOrEqual(1);
}

/** Walks the 5 predict screens (4 items + 1 global). Returns screens shown. */
async function predict(page: Page, student: string): Promise<number> {
  await page.goto(`/predict/${ASSESSMENT}?student=${student}`);
  let screens = 0;
  for (let i = 1; i <= 4; i += 1) {
    await expect(
      page.getByText(`Predict · question ${i} of 4`),
    ).toBeVisible();
    await expectOneDecision(page);
    screens += 1;
    await page.getByRole("radio", { name: "Very confident" }).click();
  }
  await expect(page.getByText("your overall estimate")).toBeVisible();
  await expectOneDecision(page);
  screens += 1;
  await page.getByRole("radio", { name: "4 in 5 or more" }).click();
  await expect(page).toHaveURL(new RegExp(`/result/${ASSESSMENT}`));
  return screens;
}

test("overconfident-low archetype: full cycle ≤ 12 screens, gap language about the task", async ({
  page,
}) => {
  let screens = await predict(page, "student-avery");

  // Result: evidence, then ONE calibration statement in task language.
  await expect(page.getByText("The evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("A gap to close")).toBeVisible();
  const statement = await page
    .locator("p", { hasText: "far apart on" })
    .innerText();
  for (const word of FORBIDDEN_SELF_WORDS) {
    expect(statement.toLowerCase()).not.toContain(word);
  }
  expect(statement).not.toContain("!");
  screens += 1;
  await page.getByRole("link", { name: "Reflect on this" }).click();

  // Emotional step — SKIP (records nothing, proceeds identically).
  await expect(page.getByText("How did seeing that feel?")).toBeVisible();
  screens += 1;
  await page.getByRole("button", { name: "Skip for now" }).click();

  // Attribution: category → specific → controllable (productive path).
  await expect(page.getByText("What most shaped this result?")).toBeVisible();
  await expectOneDecision(page);
  screens += 1;
  await page.getByRole("radio", { name: "My approach" }).click();

  await expect(page.getByText("this kind of problem, or the whole")).toBeVisible();
  await expectOneDecision(page);
  screens += 1;
  await page.getByRole("radio", { name: "This kind of problem" }).click();

  await expect(page.getByText("change next time?")).toBeVisible();
  await expectOneDecision(page);
  screens += 1;
  await page.getByRole("radio", { name: "Yes, I can change it" }).click();

  // Commit: one action, one date.
  await expect(page.getByText("one thing you")).toBeVisible();
  screens += 1;
  await page
    .getByPlaceholder("Redo the two slope questions")
    .fill("Redo the two slope questions, writing each step out.");
  await page.getByRole("button", { name: "Commit to this" }).click();

  // Quiet close.
  await expect(page.getByText("That’s the cycle.")).toBeVisible();
  screens += 1;

  expect(screens).toBeLessThanOrEqual(12);
});

test("emotional path when named still reaches the quiet close", async ({
  page,
}) => {
  await predict(page, "student-blake");
  await page.getByRole("link", { name: "Reflect on this" }).click();

  await expect(page.getByText("How did seeing that feel?")).toBeVisible();
  await page.getByRole("button", { name: "anxious" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("radio", { name: "My approach" }).click();
  await page.getByRole("radio", { name: "This kind of problem" }).click();
  await page.getByRole("radio", { name: "Yes, I can change it" }).click();
  await page
    .getByPlaceholder("Redo the two slope questions")
    .fill("Write out each slope step and check it.");
  await page.getByRole("button", { name: "Commit to this" }).click();
  await expect(page.getByText("That’s the cycle.")).toBeVisible();

  // The map reflects that a feeling WAS named for this student.
  await page.goto("/map?student=student-blake");
  await expect(page.getByText("You also named how it felt")).toBeVisible();
});

test("non-productive attribution re-asks and never blocks exit", async ({
  page,
}) => {
  await predict(page, "student-casey");
  await page.getByRole("link", { name: "Reflect on this" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();

  await page.getByRole("radio", { name: "My approach" }).click();
  // Choose a WHOLE-SUBJECT (non-specific) cause → not productive.
  await page.getByRole("radio", { name: "The whole subject" }).click();
  await page.getByRole("radio", { name: "Not really" }).click();

  // Gentle re-ask — and a way out is always present (never blocks exit).
  await expect(page.getByText("find a cause you can act on")).toBeVisible();
  await expect(page.getByRole("link", { name: "Leave for now" })).toBeVisible();

  // "Look again" returns to the attribution, does not trap.
  await page.getByRole("button", { name: "Look again" }).click();
  await expect(page.getByText("this kind of problem, or the whole")).toBeVisible();
});
