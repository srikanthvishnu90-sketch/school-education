import { expect, test, type Page } from "@playwright/test";

/**
 * The full student cycle, end to end, on seed archetypes. plumb is an emotional
 * AND academic awareness instrument, so reflection is now a DETAILED, free-response
 * walk formulated from the teacher's exam items: for each missed question, what
 * happened; per skill, where the thinking turned; then what changed. This asserts
 * the emotional skip path, that the depth gate blocks a thin answer, that the
 * probe questions are formulated from the actual exam prompts, task-focused gap
 * language with no self-referential wording, and the gentle re-ask that never
 * blocks the way out.
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

// A long, real answer that clears the deepest probe's depth bar (synthesis, 25+
// words). Reused for every probe box in the walk.
const A_REAL_ANSWER =
  "I thought I understood how to find the slope but I mixed up the rise and the run and then flipped my fraction the wrong way around.";
const A_REAL_PLAN =
  "Next time I will write the rise over the run first and check which number goes on top before I divide anything.";

/** One decision per screen: at most one radiogroup visible at a time. */
async function expectOneDecision(page: Page): Promise<void> {
  const groups = await page.getByRole("radiogroup").count();
  expect(groups).toBeLessThanOrEqual(1);
}

/** Signs in as the named seed student (session-based auth), then walks the 5
 * guess screens (4 items + 1 overall). */
async function predict(page: Page, studentName: string): Promise<void> {
  await page.goto("/signin");
  await expect(page.getByText("Who are you?")).toBeVisible();
  await page.getByRole("button", { name: studentName }).click();
  await expect(page).toHaveURL(new RegExp(`/predict/${ASSESSMENT}`));
  for (let i = 1; i <= 4; i += 1) {
    await expect(page.getByText(`Your guess · question ${i} of 4`)).toBeVisible();
    await expectOneDecision(page);
    await page.getByRole("radio", { name: "Very sure" }).click();
  }
  await expect(page.getByText("how many do you think you got right")).toBeVisible();
  await expectOneDecision(page);
  await page.getByRole("radio", { name: "4 out of 5 or more" }).click();
  await expect(page).toHaveURL(new RegExp(`/result/${ASSESSMENT}`));
}

/** Walks the detailed free-response probe sequence to the cause step, filling
 * each box with a real answer. Returns how many probe screens were shown. */
async function walkProbes(page: Page): Promise<number> {
  let count = 0;
  // The emotion → probes hand-off can be async (recordAffect); wait for the
  // first probe box to mount before walking.
  await expect(page.locator("textarea").first()).toBeVisible();
  for (let guard = 0; guard < 12; guard += 1) {
    const textarea = page.locator("textarea").first();
    if (!(await textarea.isVisible().catch(() => false))) break;
    await textarea.fill(A_REAL_ANSWER);
    const nameReason = page.getByRole("button", { name: "Name the reason" });
    if (await nameReason.isVisible().catch(() => false)) {
      count += 1;
      await nameReason.click();
      break;
    }
    count += 1;
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  return count;
}

test("overconfident-low archetype: detailed item-by-item reflection, task-focused language", async ({
  page,
}) => {
  await predict(page, "Avery");

  // Result: what happened, then ONE plain calibration statement.
  await expect(page.getByText("What happened", { exact: true })).toBeVisible();
  await expect(page.getByText("A gap", { exact: true })).toBeVisible();
  const statement = await page.locator("p", { hasText: "far apart on" }).innerText();
  for (const word of FORBIDDEN_SELF_WORDS) {
    expect(statement.toLowerCase()).not.toContain(word);
  }
  expect(statement).not.toContain("!");
  await page.getByRole("link", { name: "Think about it" }).click();

  // Feeling step — SKIP (records nothing, proceeds identically).
  await expect(page.getByText("How do you feel now?")).toBeVisible();
  await page.getByRole("button", { name: "Skip this" }).click();

  // First probe: WHAT HAPPENED, formulated from a real exam prompt Avery missed.
  await expect(page.getByText("What happened", { exact: true })).toBeVisible();
  await expect(page.getByText("Solve 2(x - 4) = 10.", { exact: false })).toBeVisible();

  // Depth gate: a thin answer cannot move on.
  const firstBox = page.locator("textarea").first();
  await firstBox.fill("idk");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();

  // Walk the whole detailed sequence (what happened ×3, why per skill ×2, synthesis).
  const probeScreens = await walkProbes(page);
  expect(probeScreens).toBeGreaterThanOrEqual(4);

  // Cause (simple pick), informed by what they just wrote.
  await expect(page.getByText("what mostly made this happen?")).toBeVisible();
  await expectOneDecision(page);
  await page.getByRole("radio", { name: "The way I did it" }).click();

  // Fixable? (collapses specific + controllable).
  await expect(page.getByText("Can you fix this next time")).toBeVisible();
  await expectOneDecision(page);
  await page.getByRole("radio", { name: "Yes, I can" }).click();

  // One small step — free answer, depth-gated.
  await expect(
    page.getByRole("heading", { name: /one small thing you will try/ }),
  ).toBeVisible();
  await page.getByLabel("What is one small thing you will try?").fill(A_REAL_PLAN);
  await page.getByRole("button", { name: "This is my plan" }).click();

  // Quiet close.
  await expect(page.getByText("That’s it for now.")).toBeVisible();
});

test("emotional path when named still reaches the quiet close", async ({
  page,
}) => {
  await predict(page, "Blake");
  await page.getByRole("link", { name: "Think about it" }).click();

  await expect(page.getByText("How do you feel now?")).toBeVisible();
  await page.getByRole("button", { name: "anxious" }).click();
  await page.getByRole("button", { name: "Keep going" }).click();

  // Blake missed nothing → still reflects on the process (awareness > score).
  await walkProbes(page);

  await page.getByRole("radio", { name: "The way I did it" }).click();
  await page.getByRole("radio", { name: "Yes, I can" }).click();
  await page
    .getByLabel("What is one small thing you will try?")
    .fill("Next time I will do the two slope questions first, while I still have lots of time and energy left.");
  await page.getByRole("button", { name: "This is my plan" }).click();
  await expect(page.getByText("That’s it for now.")).toBeVisible();

  // The map reflects that a feeling WAS named for this student.
  await page.goto("/map");
  await expect(page.getByText("You also said how it felt")).toBeVisible();
});

test("non-productive attribution re-asks and never blocks exit", async ({
  page,
}) => {
  await predict(page, "Casey");
  await page.getByRole("link", { name: "Think about it" }).click();
  await page.getByRole("button", { name: "Skip this" }).click();

  await walkProbes(page);

  await page.getByRole("radio", { name: "Just me" }).click();
  // "Not really" → not fixable → gentle re-ask.
  await page.getByRole("radio", { name: "Not really" }).click();

  await expect(page.getByText("find something you can change")).toBeVisible();
  await expect(page.getByRole("link", { name: "Leave for now" })).toBeVisible();

  // "Look again" returns to the cause step, does not trap.
  await page.getByRole("button", { name: "Look again" }).click();
  await expect(page.getByText("what mostly made this happen?")).toBeVisible();
});
