import { expect, test, type Page } from "@playwright/test";

/**
 * The full student cycle, end to end, on seed archetypes. Asserts the hard
 * budget (≤ 12 screens, one decision per screen), the emotional skip path (flow
 * proceeds identically), the free-answer depth gate (a thin answer cannot move
 * on), the gentle re-ask on a non-productive attribution (never blocks exit), and
 * task-focused gap language with no self-referential wording.
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

const A_REAL_WHY =
  "I thought I understood how to find the slope but I mixed up the rise and the run and flipped my fraction the wrong way.";
const A_REAL_PLAN =
  "Next time I will write the rise over the run first and check which number goes on top before I divide anything.";

/** One decision per screen: at most one radiogroup visible at a time. */
async function expectOneDecision(page: Page): Promise<void> {
  const groups = await page.getByRole("radiogroup").count();
  expect(groups).toBeLessThanOrEqual(1);
}

/** Walks the 5 guess screens (4 items + 1 overall). Returns screens shown. */
async function predict(page: Page, student: string): Promise<number> {
  await page.goto(`/predict/${ASSESSMENT}?student=${student}`);
  let screens = 0;
  for (let i = 1; i <= 4; i += 1) {
    await expect(page.getByText(`Your guess · question ${i} of 4`)).toBeVisible();
    await expectOneDecision(page);
    screens += 1;
    await page.getByRole("radio", { name: "Very sure" }).click();
  }
  await expect(page.getByText("how many do you think you got right")).toBeVisible();
  await expectOneDecision(page);
  screens += 1;
  await page.getByRole("radio", { name: "4 out of 5 or more" }).click();
  await expect(page).toHaveURL(new RegExp(`/result/${ASSESSMENT}`));
  return screens;
}

test("overconfident-low archetype: full cycle ≤ 12 screens, gap language about the task", async ({
  page,
}) => {
  let screens = await predict(page, "student-avery");

  // Result: what happened, then ONE plain calibration statement.
  await expect(page.getByText("What happened", { exact: true })).toBeVisible();
  await expect(page.getByText("A gap", { exact: true })).toBeVisible();
  const statement = await page.locator("p", { hasText: "far apart on" }).innerText();
  for (const word of FORBIDDEN_SELF_WORDS) {
    expect(statement.toLowerCase()).not.toContain(word);
  }
  expect(statement).not.toContain("!");
  screens += 1;
  await page.getByRole("link", { name: "Think about it" }).click();

  // Feeling step — SKIP (records nothing, proceeds identically).
  await expect(page.getByText("How do you feel now?")).toBeVisible();
  screens += 1;
  await page.getByRole("button", { name: "Skip this" }).click();

  // Cause (simple pick).
  await expect(page.getByText("What made this happen?")).toBeVisible();
  await expectOneDecision(page);
  screens += 1;
  await page.getByRole("radio", { name: "The way I did it" }).click();

  // Why — a free answer that must be REAL (depth gate blocks a thin one).
  await expect(page.getByText("Why do you think it went this way?")).toBeVisible();
  screens += 1;
  const why = page.getByLabel("Why do you think it went this way?");
  await why.fill("idk");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await why.fill(A_REAL_WHY);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Fixable? (collapses specific + controllable).
  await expect(page.getByText("Can you fix this next time")).toBeVisible();
  await expectOneDecision(page);
  screens += 1;
  await page.getByRole("radio", { name: "Yes, I can" }).click();

  // One small step — free answer, depth-gated.
  await expect(
    page.getByRole("heading", { name: /one small thing you will try/ }),
  ).toBeVisible();
  screens += 1;
  await page.getByLabel("What is one small thing you will try?").fill(A_REAL_PLAN);
  await page.getByRole("button", { name: "This is my plan" }).click();

  // Quiet close.
  await expect(page.getByText("That’s it for now.")).toBeVisible();
  screens += 1;

  expect(screens).toBeLessThanOrEqual(12);
});

test("emotional path when named still reaches the quiet close", async ({
  page,
}) => {
  await predict(page, "student-blake");
  await page.getByRole("link", { name: "Think about it" }).click();

  await expect(page.getByText("How do you feel now?")).toBeVisible();
  await page.getByRole("button", { name: "anxious" }).click();
  await page.getByRole("button", { name: "Keep going" }).click();

  await page.getByRole("radio", { name: "The way I did it" }).click();
  await page
    .getByLabel("Why do you think it went this way?")
    .fill("I ran out of time on the last two and just guessed, so I was not really sure what I was doing there at all.");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "Yes, I can" }).click();
  await page
    .getByLabel("What is one small thing you will try?")
    .fill("Next time I will do the two slope questions first, while I still have lots of time and energy left.");
  await page.getByRole("button", { name: "This is my plan" }).click();
  await expect(page.getByText("That’s it for now.")).toBeVisible();

  // The map reflects that a feeling WAS named for this student.
  await page.goto("/map?student=student-blake");
  await expect(page.getByText("You also said how it felt")).toBeVisible();
});

test("non-productive attribution re-asks and never blocks exit", async ({
  page,
}) => {
  await predict(page, "student-casey");
  await page.getByRole("link", { name: "Think about it" }).click();
  await page.getByRole("button", { name: "Skip this" }).click();

  await page.getByRole("radio", { name: "Just me" }).click();
  await page
    .getByLabel("Why do you think it went this way?")
    .fill("I feel like I am just not a math person and this stuff never really makes any sense to me at all.");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // "Not really" → not fixable → gentle re-ask.
  await page.getByRole("radio", { name: "Not really" }).click();

  await expect(page.getByText("find something you can change")).toBeVisible();
  await expect(page.getByRole("link", { name: "Leave for now" })).toBeVisible();

  // "Look again" returns to the free answer, does not trap.
  await page.getByRole("button", { name: "Look again" }).click();
  await expect(page.getByText("Why do you think it went this way?")).toBeVisible();
});
