# Reflection question design

This document converts the supplied analysis of child self-report into product constraints for plumb. It is a design and measurement contract, not a claim that self-report becomes reliable when the interface is improved.

## Core position

A student answer is a social response before it is dependable evidence. The product must not treat the presence, confidence, or fluency of an answer as proof of understanding, emotion, honesty, or need.

Reflection exists to help the student practice noticing and explaining a recent learning episode. It may open a conversation. It must not independently set a grade, rank, diagnosis, intervention, disciplinary outcome, or durable trait label.

## Measurement hierarchy

Use inputs in this order:

1. **Observed outcome or task evidence** — graded work, a fresh transfer item, or normalized evidence from the provider layer.
2. **A prediction recorded before the compared outcome is revealed** — useful only when that exact outcome is later joined to it.
3. **Episode-anchored reflection** — what happened, where the work changed, and what the student did next.
4. **General self-description** — too vulnerable to authority, self-presentation, vocabulary, and trait framing to drive decisions; avoid collecting it.

The useful signal is often divergence between evidence, prediction, and reflection. Divergence opens a follow-up; it is never a verdict about the student.

## Prompt requirements

Every prompt must:

- refer to a concrete, recent lesson, task, example, or moment;
- ask about one construct at a time;
- use neutral wording that does not imply a preferred answer;
- avoid yes/no wording for consequential questions;
- avoid trait language such as “Are you good at…?” or “What kind of learner are you?”;
- make “I’m not sure” a legitimate closed response;
- allow optional questions to be skipped without warning, penalty, or a “missing data” cue;
- distinguish prediction from retrospective feeling;
- use vocabulary the student can understand without manufacturing an emotion label;
- disclose who receives the resulting information and what it can affect.

Do not use model-generated wording unless it passes the same deterministic checks and preserves the teacher’s lesson context.

## Teacher output → student conversation

Teacher input is transformed in a narrow sequence:

1. Lesson title, type, summary, objectives, and standards become a lesson analysis.
2. The analysis identifies the task, concrete activity context, likely transition points, and vocabulary.
3. The question set is generated from that analysis—not from a generic reflection template.
4. The chat presents one question at a time and preserves the exact lesson/reflection ID.
5. The student’s prediction is later joined with the teacher-entered outcome; unjoined predictions are not interpreted.

Recommended standard sequence:

1. **Episode locator:** “Think about the problems you worked on today. Which moment is closest to what happened?”
2. **Emotion vocabulary in context:** “At that moment, which word fits best?” Include “I’m not sure.”
3. **Last known step:** “Pick one example. What was the last step you could explain in your own words?”
4. **Observed response:** “Right after that step, what did you do next?”
5. **Ground-truthable prediction:** “Before you see the score or answer key for today’s task, how much do you predict you completed correctly?”
6. **Optional feed-forward:** “What is one small thing you would try first?”

## Response formats and age

The current product does not capture a verified grade/age band, so it cannot honestly claim age-adaptive response formats yet. Until that exists, the live experience should be treated as adolescent-oriented and pilot-limited.

Before expanding to younger students:

- validate comprehension with the intended age group;
- prefer fewer, concrete verbal choices over abstract Likert endpoints;
- do not infer a continuous score from visual faces or extreme taps;
- teach emotion vocabulary before relying on fine-grained emotion selection;
- test authority effects, acquiescence, repeated-prompt fatigue, and accessibility by age band.

## Autonomy and disclosure

The interface must state, truthfully:

- the reflection does not change the student’s score;
- the teacher receives a summary rather than the raw chat, if that remains the actual data flow;
- a safety concern is the exception and creates a counselor alert;
- optional questions can be skipped;
- “I’m not sure” is useful information, not failure.

If implementation or policy differs, the copy must change before release. Reassuring but false privacy language is worse than no reassurance.

## Prompt audit checklist

Treat prompt wording like a security boundary. Before a prompt ships, test:

- Could a student infer which answer an adult wants?
- Does it ask for a trait when an episode would work?
- Could “I don’t know” be the most accurate answer, and is that option available?
- Does the response format force false precision?
- Does the question rely on vocabulary that has not been taught?
- Will the answer affect a consequence directly or indirectly?
- Is the prompt still neutral when translated or read by a younger student?
- Is every inference traceable to evidence from the same student and episode?

## Required tests

- Generated prompts include the teacher’s lesson context and contain no trait or leading-language patterns.
- Standard sets include a metacognitive prediction that can be joined to a later result.
- Optional prompts expose a skip path; closed prompts expose “I’m not sure.”
- Skips and uncertainty do not become negative behavioral or emotional signals.
- A teacher-created lesson appears in the correct student conversation.
- The student-facing disclosure matches the actual teacher and counselor data flows.
- Predictions without outcomes and outcomes without predictions produce no calibration claim.
