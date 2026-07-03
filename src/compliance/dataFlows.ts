/**
 * The DPA data-flow manifest — the honest, machine-checkable list of where student
 * data goes. A Data Processing Agreement export lists these explicitly; the crisis
 * escalation flow (P16) is included and marked as the sanctioned exception to
 * data-flows-to-student, grounded in the district's duty of care.
 */

export interface DataFlow {
  id: string;
  name: string;
  description: string;
  /** Who receives the data at the other end of this flow. */
  recipients: string[];
  /** The lawful basis for the flow. */
  lawfulBasis: string;
  /** True when the data leaves the student's own view (an exception to privacy). */
  leavesStudent: boolean;
}

export const CRISIS_ESCALATION_FLOW_ID = "crisis_escalation";

export const DATA_FLOWS: readonly DataFlow[] = [
  {
    id: "academic_evidence",
    name: "Academic evidence ingestion",
    description:
      "Gradebook grades ingested from the district SIS/LMS, normalized to compute the student's own calibration.",
    recipients: ["the student"],
    lawfulBasis: "legitimate educational interest",
    leavesStudent: false,
  },
  {
    id: "teacher_aggregates",
    name: "Class calibration aggregates",
    description:
      "Class-level calibration signal (never free text or affect) shown to the student's teacher.",
    recipients: ["the student's teacher"],
    lawfulBasis: "legitimate educational interest",
    leavesStudent: true,
  },
  {
    id: CRISIS_ESCALATION_FLOW_ID,
    name: "Crisis escalation",
    description:
      "If free text is detected to signal risk of self-harm, an escalation with the encrypted text is routed to the tenant's designated counselor (and, if none is configured, the operator). Deterministic detection, no LLM. The student is shown crisis resources and told a school adult will be notified. This is the ONE exception to student-only data flow and is never disabled by consent scopes.",
    recipients: [
      "district-designated counselor",
      "operator (only if no counselor is configured)",
    ],
    lawfulBasis: "duty of care / vital interest (legal obligation)",
    leavesStudent: true,
  },
];

/** The DPA export — the full, explicit list of data flows. */
export function exportDpaDataFlows(): readonly DataFlow[] {
  return DATA_FLOWS;
}
