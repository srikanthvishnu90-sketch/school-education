import {
  ASSESSMENT_ID,
  SKILL_LINEAR,
  SKILL_SLOPE,
  buildSeededWorld,
  createObserver,
  createTeacherService,
  type TeacherService,
} from "@/application";
import {
  createActionVerification,
  createAssessment,
  createCalibrationRecord,
  type ActionVerification,
  type Id,
} from "@/domain";

/**
 * The teacher's seeded world — a class snapshot, held separate from the live
 * student world. It carries only what the teacher surface is allowed to read:
 * predictions/outcomes (calibration), verifications (follow-through), and the
 * agent's flags. A persistent gap is seeded for the overconfident-low archetype
 * so a flag stands; one skill has too little evidence to demonstrate the min-N
 * gate. No affect or reflection text is ever exposed here.
 */

export const TEACHER_ID = "teacher-1";
export const TEACHER_NAME = "Ms. Rivera";
export const GRAPHS_ASSESSMENT_ID = "assess-graphs";
export const SKILL_GRAPHS = "skill-graphs";

const MIN_N = 2;
const SKILL_NAMES: Record<Id, string> = {
  [SKILL_LINEAR]: "linear equations",
  [SKILL_SLOPE]: "interpreting slope",
  [SKILL_GRAPHS]: "reading graphs",
};

export function studentDisplayName(id: Id): string {
  const raw = id.replace(/^student-/, "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export interface TeacherWorld {
  service: TeacherService;
  classId: Id;
  mainAssessmentId: Id;
  assessmentIds: Id[];
  studentIds: Id[];
  teacherId: Id;
}

function verification(
  id: Id,
  studentId: Id,
  verdict: ActionVerification["accuracyVerdict"],
  at: Date,
): ActionVerification {
  return createActionVerification({
    id,
    nextActionId: `${id}-ref`,
    studentId,
    targetSkillId: SKILL_LINEAR,
    openedAt: at,
    baseline: { skillId: SKILL_LINEAR, accuracy: 0.5, brier: 0.2, itemCount: 4 },
    baselineAssessmentId: ASSESSMENT_ID,
    accuracyVerdict: verdict,
    calibrationVerdict: "flat",
    closedAt: at,
  });
}

async function build(): Promise<TeacherWorld> {
  const world = await buildSeededWorld();
  const { repos, clock } = world;
  const studentIds = world.students.map((s) => s.id);
  const avery = "student-avery";

  // Persistent gap for the overconfident-low archetype → the agent flags it.
  [0.4, 0.35].forEach((bias, i) =>
    repos.calibrations.save(
      createCalibrationRecord({
        id: `cal-avery-${i}`,
        assessmentId: ASSESSMENT_ID,
        studentId: avery,
        brier: 0.3,
        bias,
        resolution: 0.1,
        itemCount: 4,
        computedAt: clock.now(),
      }),
    ),
  );

  // Follow-through: a few resolved verifications across the class.
  await repos.verifications.save(verification("v-1", avery, "improved", clock.now()));
  await repos.verifications.save(
    verification("v-2", "student-blake", "flat", clock.now()),
  );
  await repos.verifications.save(
    verification("v-3", "student-casey", "regressed", clock.now()),
  );

  // A skill only one student has data on → below min-N → no estimate.
  await repos.assessments.save(
    createAssessment({
      id: GRAPHS_ASSESSMENT_ID,
      title: "Graphs check",
      createdAt: clock.now(),
      items: [
        {
          id: "g-item-1",
          assessmentId: GRAPHS_ASSESSMENT_ID,
          skillId: SKILL_GRAPHS,
          prompt: "What does this graph show?",
          maxPoints: 1,
        },
      ],
    }),
  );
  await world.services.capturePrediction({
    studentId: avery,
    assessmentId: GRAPHS_ASSESSMENT_ID,
    itemPredictions: [{ itemId: "g-item-1", confidence: 0.9 }],
    globalPredicted: 0.9,
  });
  await world.services.recordOutcome({
    studentId: avery,
    assessmentId: GRAPHS_ASSESSMENT_ID,
    itemOutcomes: [{ itemId: "g-item-1", correct: false, pointsAwarded: 0 }],
  });

  const observer = createObserver({
    clock,
    assessments: repos.assessments,
    predictions: repos.predictions,
    outcomes: repos.outcomes,
    goals: repos.goals,
    affects: repos.affects,
    reflections: repos.reflections,
    calibrations: repos.calibrations,
    verifications: repos.verifications,
    flagAcks: repos.flagAcks,
  });

  const service = createTeacherService({
    assessments: repos.assessments,
    predictions: repos.predictions,
    outcomes: repos.outcomes,
    verifications: repos.verifications,
    flagAcks: repos.flagAcks,
    observer,
    clock,
    skillNames: SKILL_NAMES,
    minN: MIN_N,
  });

  return {
    service,
    classId: world.classId,
    mainAssessmentId: ASSESSMENT_ID,
    assessmentIds: [ASSESSMENT_ID, GRAPHS_ASSESSMENT_ID],
    studentIds,
    teacherId: TEACHER_ID,
  };
}

let teacherWorldPromise: Promise<TeacherWorld> | null = null;

export function getTeacherWorld(): Promise<TeacherWorld> {
  if (teacherWorldPromise === null) teacherWorldPromise = build();
  return teacherWorldPromise;
}
