import { createHttpGateway, PINNED_MODELS } from "@/adapters/language";
import { stripPii } from "@/adapters/language/pii";
import { isNonDiagnostic } from "@/domain/intelligence/nonDiagnostic";
import { piiRoster } from "./intelligence";
import { rosterRedactionTerms } from "./rosterNames";

/**
 * The open study companion behind a course's chat box. It is deliberately NOT the
 * reflection engine: a student can just talk here, ask a question about the class,
 * or think out loud. The rules still hold — it is LABOR, not judgment:
 *   · every student message is crisis-screened at the action boundary (not here);
 *   · the payload is PII-stripped before it reaches the model;
 *   · the system prompt keeps it task-focused and forbids diagnosis/grading;
 *   · a diagnostic slip in the reply, a model failure, or no key at all all fall
 *     back to a safe deterministic reply, so zero-LLM still works.
 */

export interface AssistantMessage {
  role: "student" | "assistant";
  text: string;
}

export interface AssistantContext {
  courseName: string;
  teacher: string;
  studentName: string;
}

const SYSTEM = `You are a calm, encouraging study companion inside a K-12 classroom reflection app, talking with one student about a specific class.

Your job is to help the student think about their own learning — what they tried, what made sense, what was confusing, and what they might do next. You may answer honest questions about the subject and help them reason it through.

Hard rules:
- Talk about the WORK and the student's PROCESS, never about the student as a person. Never label their ability, intelligence, or character ("you're good/bad at this", "you're smart/slow"). No grades, scores, or verdicts.
- Be brief and warm — usually 1 to 3 short sentences, plain words an adolescent uses. End most turns with one concrete, gentle question about a recent moment in the work.
- "I don't know" or "I'm not sure" is always a fine answer; never push.
- Never diagnose feelings or tell them how they should feel. If they seem stuck, ask what specifically got hard.
- Stay on their schoolwork and learning. If they drift far off-topic, kindly bring it back to the class.
- You draft and help them reflect; you never decide anything about them.`;

/** The opening line the chat greets the student with — deterministic, no model call. */
export function assistantOpening(ctx: AssistantContext): string {
  return `Hi ${ctx.studentName} — I'm here to think through ${ctx.courseName} with you. How did today go? Tell me one thing that clicked and one thing that felt tricky.`;
}

/** A safe reflective reply used when the model is off, fails, or slips. */
function fallbackReply(messages: readonly AssistantMessage[]): string {
  const studentTurns = messages.filter((m) => m.role === "student").length;
  const prompts = [
    "Got it. What's one specific step in that problem where things started to feel unsure?",
    "Thanks for sharing that. If you tried it again right now, what's the first thing you'd do differently?",
    "That makes sense. Which part would you want to check against an example next time?",
    "Okay. What's one small thing you could try before the next class to get a bit more comfortable?",
  ];
  return prompts[studentTurns % prompts.length];
}

const redactionTerms = (): string[] => [...piiRoster(), ...rosterRedactionTerms()];

let gateway: ReturnType<typeof createHttpGateway> | null | undefined;
function getGateway(): ReturnType<typeof createHttpGateway> | null {
  if (gateway === undefined) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    gateway =
      apiKey !== undefined && apiKey.length > 0
        ? createHttpGateway({
            apiKey,
            models: PINNED_MODELS,
            now: () => new Date(),
            // On the interactive chat path — bound the wait, fall back fast.
            timeoutMs: 6000,
            maxRetries: 1,
          })
        : null;
  }
  return gateway;
}

/**
 * Produce the assistant's next reply. `messages` is the full turn history (oldest
 * first), ending with the student's latest message. Always resolves to a safe
 * string — it never throws to the caller.
 */
export async function assistantReply(
  ctx: AssistantContext,
  messages: readonly AssistantMessage[],
): Promise<string> {
  const gw = getGateway();
  if (gw === null) return fallbackReply(messages);

  const transcript = messages
    .map((m) => `${m.role === "student" ? "Student" : "Companion"}: ${m.text}`)
    .join("\n");
  const { clean } = stripPii(
    `Class: ${ctx.courseName} (teacher ${ctx.teacher}).\n\n${transcript}\n\nCompanion:`,
    redactionTerms(),
  );

  try {
    const res = await gw.send({
      task: "render",
      system: SYSTEM,
      prompt: clean,
      maxTokens: 240,
    });
    const reply = res.text.trim();
    // Guard: a reply that trips the non-diagnostic bar (a verdict about the
    // student) is dropped for a safe reflective prompt instead.
    if (reply.length === 0 || !isNonDiagnostic(reply)) {
      return fallbackReply(messages);
    }
    return reply;
  } catch {
    return fallbackReply(messages);
  }
}
