import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReflectionMessage,
  createReflectionSession,
  type ReflectionQuestionSet,
  type ReflectionSession,
  type SessionStatus,
  type StudentInsightSummary,
} from "@/domain/intelligence";
import type {
  ConversationStep,
  ReflectionIntelligence,
} from "@/domain/ports/intelligence";
import type { World } from "@/app/_world/world";

const mocks = vi.hoisted(() => ({
  getSessionStudent: vi.fn(),
  getWorld: vi.fn(),
  screenReflectionText: vi.fn(),
  hasReflectionConsent: vi.fn(),
}));

vi.mock("@/app/_world/session", () => ({
  getSessionStudent: mocks.getSessionStudent,
}));

vi.mock("@/app/_world/world", () => ({
  getWorld: mocks.getWorld,
}));

vi.mock("@/app/_world/safetyActions", () => ({
  screenReflectionText: mocks.screenReflectionText,
}));

vi.mock("@/app/_world/consentActions", () => ({
  hasReflectionConsent: mocks.hasReflectionConsent,
}));

import {
  selectReflectionAction,
  sendReflectionMessage,
  startReflection,
} from "@/app/_world/reflectionActions";

const NOW = new Date("2026-07-11T12:00:00.000Z");
const REFLECTION_ID = "lesson-1";
const STUDENT_ID = "student-1";
const SESSION_ID = `${REFLECTION_ID}:${STUDENT_ID}`;

const QUESTION_SET: ReflectionQuestionSet = {
  lessonId: REFLECTION_ID,
  questions: [],
  adaptiveFollowupsEnabled: true,
  maxFollowups: 4,
  createdAt: NOW,
  // Approved: the student flow under test only runs once a teacher has opened it.
  approvedAt: NOW,
};

const QUESTION: ConversationStep = {
  kind: "question",
  stage: "technical",
  category: "technical",
  text: "What part felt clear?",
  format: "short_response",
  required: true,
};

const SUMMARY: StudentInsightSummary = {
  id: `${SESSION_ID}-summary`,
  studentId: STUDENT_ID,
  reflectionId: REFLECTION_ID,
  technicalSummary: "The student reflected on the lesson.",
  emotionalSummary: "The student described how the work felt.",
  behavioralSummary: "The student described what they tried.",
  relationshipSummary: "The response connected the work and strategy.",
  recommendedActions: ["Try one example with a checklist."],
  studentFacingSummary: "You noticed what helped today.",
  evidence: ["I checked my notes."],
  confidenceLevel: "moderate",
  createdAt: NOW,
};

function message(
  index: number,
  sender: "student" | "ai",
  text: string,
): ReflectionSession["messages"][number] {
  return createReflectionMessage({
    id: `${SESSION_ID}-m${index}`,
    sessionId: SESSION_ID,
    sender,
    text,
    category: sender === "ai" ? "technical" : undefined,
    createdAt: new Date(NOW.getTime() + index * 1_000),
  });
}

function makeSession(
  status: SessionStatus = "active",
  messages: ReflectionSession["messages"] = [],
  selectedAction?: string,
): ReflectionSession {
  return createReflectionSession({
    id: SESSION_ID,
    reflectionId: REFLECTION_ID,
    studentId: STUDENT_ID,
    status,
    messages,
    selectedAction,
    startedAt: NOW,
    completedAt: status === "completed" ? NOW : undefined,
  });
}

function makeWorld(initial?: {
  session?: ReflectionSession;
  summary?: StudentInsightSummary | null;
  nextTurn?: ConversationStep;
  priorSessions?: ReflectionSession[];
}): {
  world: World;
  savedSessions: Map<string, ReflectionSession>;
  nextTurn: ReturnType<typeof vi.fn>;
  saveSession: ReturnType<typeof vi.fn>;
} {
  const savedSessions = new Map<string, ReflectionSession>();
  if (initial?.session !== undefined) {
    savedSessions.set(initial.session.id, initial.session);
  }
  let savedSummary = initial?.summary ?? null;
  const saveSession = vi.fn(async (session: ReflectionSession) => {
    savedSessions.set(session.id, session);
  });
  const nextTurn = vi.fn(async () => initial?.nextTurn ?? QUESTION);
  const intelligence = {
    nextTurn,
    extractSignals: vi.fn(async () => ({
      technical: [],
      emotional: [],
      behavioral: [],
      context: [],
    })),
    summarizeStudentReflection: vi.fn(async () => SUMMARY),
  } as unknown as ReflectionIntelligence;

  const world = {
    clock: { now: () => NOW },
    intelligence,
    intel: {
      questionSets: {
        findByLesson: vi.fn(async (id: string) =>
          id === REFLECTION_ID ? QUESTION_SET : null,
        ),
      },
      sessions: {
        save: saveSession,
        findById: vi.fn(async (id: string) => savedSessions.get(id) ?? null),
        findByReflectionAndStudent: vi.fn(
          async (reflectionId: string, studentId: string) =>
            [...savedSessions.values()].find(
              (session) =>
                session.reflectionId === reflectionId &&
                session.studentId === studentId,
            ) ?? null,
        ),
        listByStudent: vi.fn(async () => initial?.priorSessions ?? []),
      },
      studentSummaries: {
        save: vi.fn(async (summary: StudentInsightSummary) => {
          savedSummary = summary;
        }),
        findByReflectionAndStudent: vi.fn(async () => savedSummary),
      },
    },
  } as unknown as World;

  return { world, savedSessions, nextTurn, saveSession };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionStudent.mockResolvedValue(STUDENT_ID);
  mocks.screenReflectionText.mockResolvedValue({ crisis: false });
  mocks.hasReflectionConsent.mockResolvedValue(true);
});

describe("reflection server actions", () => {
  it("requires a signed-in student before constructing the world", async () => {
    mocks.getSessionStudent.mockResolvedValue(null);

    await expect(startReflection(REFLECTION_ID)).rejects.toThrow(
      "Student authentication required.",
    );
    expect(mocks.getWorld).not.toHaveBeenCalled();
  });

  it("refuses to start a reflection whose questions a teacher has not approved", async () => {
    const { world } = makeWorld();
    // The AI has drafted a set, but no teacher has approved it yet.
    world.intel.questionSets.findByLesson = vi.fn(async () => ({
      ...QUESTION_SET,
      approvedAt: null,
    }));
    mocks.getWorld.mockResolvedValue(world);

    await expect(startReflection(REFLECTION_ID)).rejects.toThrow(
      "This reflection is not available.",
    );
  });

  it("carries the prior reflection's chosen step into a fresh session (loop closure)", async () => {
    const priorCompleted = createReflectionSession({
      id: "lesson-0:student-1",
      reflectionId: "lesson-0",
      studentId: STUDENT_ID,
      status: "completed",
      messages: [],
      selectedAction: "Try one example with a checklist",
      startedAt: new Date(NOW.getTime() - 86_400_000),
      completedAt: new Date(NOW.getTime() - 86_000_000),
    });
    const { world, savedSessions } = makeWorld({ priorSessions: [priorCompleted] });
    mocks.getWorld.mockResolvedValue(world);

    await startReflection(REFLECTION_ID);

    const created = savedSessions.get(SESSION_ID);
    expect(created?.carriedAction).toBe("Try one example with a checklist");
  });

  it("leaves carriedAction unset when the student has no prior chosen step", async () => {
    const { world, savedSessions } = makeWorld({ priorSessions: [] });
    mocks.getWorld.mockResolvedValue(world);

    await startReflection(REFLECTION_ID);

    expect(savedSessions.get(SESSION_ID)?.carriedAction).toBeUndefined();
  });

  it("resumes an active transcript without duplicating its open question", async () => {
    const session = makeSession("active", [
      message(0, "ai", "How did it feel overall?"),
      message(1, "student", "Mostly clear."),
      message(2, "ai", "What part felt clear?"),
    ]);
    const { world, saveSession } = makeWorld({ session });
    mocks.getWorld.mockResolvedValue(world);

    const result = await startReflection(REFLECTION_ID);

    expect(result).toMatchObject({
      kind: "question",
      sessionId: SESSION_ID,
      text: "What part felt clear?",
    });
    expect(result.history).toHaveLength(3);
    expect(result.history?.[0]).toMatchObject({
      sender: "ai",
      createdAt: NOW.toISOString(),
    });
    expect(saveSession).not.toHaveBeenCalled();
  });

  it("returns completed and escalated sessions as persistent terminal states", async () => {
    const completed = makeSession(
      "completed",
      [message(0, "ai", "Question"), message(1, "student", "Answer")],
      SUMMARY.recommendedActions[0],
    );
    const completedWorld = makeWorld({ session: completed, summary: SUMMARY });
    mocks.getWorld.mockResolvedValue(completedWorld.world);

    await expect(startReflection(REFLECTION_ID)).resolves.toMatchObject({
      kind: "summary",
      selectedAction: SUMMARY.recommendedActions[0],
      history: [{ sender: "ai" }, { sender: "student" }],
    });

    const escalated = makeSession("escalated", [message(0, "student", "Help")]);
    const escalatedWorld = makeWorld({ session: escalated });
    mocks.getWorld.mockResolvedValue(escalatedWorld.world);

    await expect(startReflection(REFLECTION_ID)).resolves.toMatchObject({
      kind: "safety",
      sessionId: SESSION_ID,
      history: [{ sender: "student", text: "Help" }],
    });
    expect(escalatedWorld.nextTurn).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized messages before screening them", async () => {
    await expect(sendReflectionMessage(SESSION_ID, "  ")).rejects.toThrow(
      "Message cannot be empty.",
    );
    await expect(
      sendReflectionMessage(SESSION_ID, "x".repeat(4_001)),
    ).rejects.toThrow("Message must be 4000 characters or fewer.");
    expect(mocks.screenReflectionText).not.toHaveBeenCalled();
  });

  it("enforces message ownership and active state", async () => {
    const someoneElses = createReflectionSession({
      ...makeSession(),
      studentId: "student-2",
    });
    const wrongOwnerWorld = makeWorld({ session: someoneElses });
    mocks.getWorld.mockResolvedValue(wrongOwnerWorld.world);
    await expect(sendReflectionMessage(SESSION_ID, "Answer")).rejects.toThrow(
      "Session not found.",
    );

    const completedWorld = makeWorld({
      session: makeSession("completed"),
      summary: SUMMARY,
    });
    mocks.getWorld.mockResolvedValue(completedWorld.world);
    await expect(sendReflectionMessage(SESSION_ID, "Answer")).rejects.toThrow(
      "This reflection is not accepting messages.",
    );
    expect(mocks.screenReflectionText).not.toHaveBeenCalled();
  });

  it("screens a normal answer before persisting the next question", async () => {
    const { world, savedSessions } = makeWorld({ session: makeSession() });
    mocks.getWorld.mockResolvedValue(world);

    const result = await sendReflectionMessage(
      SESSION_ID,
      "  I used my notes  ",
    );

    expect(mocks.screenReflectionText).toHaveBeenCalledWith("I used my notes");
    expect(result).toMatchObject({
      kind: "question",
      required: true,
      history: [
        { sender: "student", text: "I used my notes" },
        { sender: "ai", text: QUESTION.text },
      ],
    });
    expect(savedSessions.get(SESSION_ID)?.messages).toHaveLength(2);
  });

  it("routes every accepted message through safety and persists a crisis state", async () => {
    const { world, savedSessions, nextTurn } = makeWorld({
      session: makeSession(),
    });
    mocks.getWorld.mockResolvedValue(world);
    mocks.screenReflectionText.mockResolvedValue({ crisis: true });

    const result = await sendReflectionMessage(SESSION_ID, "  I need help  ");

    expect(mocks.screenReflectionText).toHaveBeenCalledWith("I need help");
    expect(result).toMatchObject({
      kind: "safety",
      sessionId: SESSION_ID,
      history: [{ sender: "student", text: "I need help" }],
    });
    expect(savedSessions.get(SESSION_ID)?.status).toBe("escalated");
    expect(nextTurn).not.toHaveBeenCalled();
  });

  it("only accepts a bounded recommended action on an owned completed session", async () => {
    const { world, savedSessions } = makeWorld({
      session: makeSession("completed"),
      summary: SUMMARY,
    });
    mocks.getWorld.mockResolvedValue(world);

    await expect(
      selectReflectionAction(SESSION_ID, "A made-up action"),
    ).rejects.toThrow("That action is not available for this reflection.");

    await selectReflectionAction(
      SESSION_ID,
      ` ${SUMMARY.recommendedActions[0]} `,
    );
    expect(savedSessions.get(SESSION_ID)).toMatchObject({
      selectedAction: SUMMARY.recommendedActions[0],
    });

    // An identical retry is idempotent; a different choice cannot overwrite it.
    await expect(
      selectReflectionAction(SESSION_ID, SUMMARY.recommendedActions[0]),
    ).resolves.toBeUndefined();
    await expect(
      selectReflectionAction(SESSION_ID, "Choose something else."),
    ).rejects.toThrow("An action has already been selected.");
  });

  it("rejects invalid action text, ownership, and session state", async () => {
    await expect(selectReflectionAction(SESSION_ID, " ")).rejects.toThrow(
      "Action cannot be empty.",
    );
    await expect(
      selectReflectionAction(SESSION_ID, "x".repeat(501)),
    ).rejects.toThrow("Action must be 500 characters or fewer.");

    const wrongOwnerWorld = makeWorld({
      session: createReflectionSession({
        ...makeSession("completed"),
        studentId: "student-2",
      }),
      summary: SUMMARY,
    });
    mocks.getWorld.mockResolvedValue(wrongOwnerWorld.world);
    await expect(
      selectReflectionAction(SESSION_ID, SUMMARY.recommendedActions[0]),
    ).rejects.toThrow("Session not found.");

    const activeWorld = makeWorld({ session: makeSession("active") });
    mocks.getWorld.mockResolvedValue(activeWorld.world);
    await expect(
      selectReflectionAction(SESSION_ID, SUMMARY.recommendedActions[0]),
    ).rejects.toThrow(
      "An action can only be selected for a completed reflection.",
    );
  });
});
