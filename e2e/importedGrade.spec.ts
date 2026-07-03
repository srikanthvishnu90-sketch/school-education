import { expect, test } from "@playwright/test";

/**
 * A real gradebook grade reaches a student (p7): the teacher/operator imports a
 * OneRoster CSV, and the student sees it on their map as a teacher-recorded score
 * — kept separate from their own belief↔reality trajectory. Runs under
 * prefers-reduced-motion.
 */

const RESULTS = `sourcedId,studentSourcedId,lineItemSourcedId,score,scoreDate,scoreStatus
r1,student-avery,li-1,8,2026-06-01T09:00:00.000Z,Submitted`;
const LINE_ITEMS = `sourcedId,title,resultValueMax
li-1,Unit 3 quiz,10`;

test("teacher imports a grade and the student sees it on their map", async ({
  page,
}) => {
  // Operator (teacher) imports the gradebook CSV.
  await page.goto("/signin");
  await page.getByRole("button", { name: /Ms\. Rivera/ }).click();
  await expect(page).toHaveURL(/\/class\//);
  await page.goto("/ingest");
  await page.getByPlaceholder("sourcedId,studentSourcedId").fill(RESULTS);
  await page.getByPlaceholder("sourcedId,title,resultValueMax").fill(LINE_ITEMS);
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("1 of 1 rows imported")).toBeVisible();

  // The student signs in and sees their teacher-recorded grade.
  await page.goto("/signin");
  await page.getByRole("button", { name: "Avery" }).click();
  await expect(page).toHaveURL(/\/predict\//);
  await page.goto("/map");
  await expect(page.getByText("What your teacher recorded")).toBeVisible();
  await expect(page.getByText("Unit 3 quiz")).toBeVisible();
  await expect(page.getByText("8 out of 10")).toBeVisible();
});
