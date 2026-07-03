import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CRISIS_ESCALATION_FLOW_ID,
  exportDpaDataFlows,
} from "@/compliance/dataFlows";
import { CRISIS_DISCLOSURE } from "@/compliance/disclosure";

/**
 * The crisis path is DISCLOSED, not hidden (P16): its data flow appears explicitly
 * in the DPA export, and the onboarding disclosure names the exception plainly.
 */
describe("DPA data-flow manifest", () => {
  it("lists the crisis escalation flow explicitly, with recipients and lawful basis", () => {
    const flow = exportDpaDataFlows().find((f) => f.id === CRISIS_ESCALATION_FLOW_ID);
    expect(flow).toBeDefined();
    expect(flow?.leavesStudent).toBe(true);
    expect(flow?.recipients.join(" ").toLowerCase()).toContain("counselor");
    expect(flow?.lawfulBasis.toLowerCase()).toMatch(/duty of care|legal|vital/);
    // It is described as the exception that is not disabled by consent.
    expect(flow?.description.toLowerCase()).toContain("consent");
  });
});

describe("onboarding disclosure", () => {
  it("discloses the crisis exception in plain, caring language", () => {
    expect(CRISIS_DISCLOSURE.toLowerCase()).toContain("private");
    expect(CRISIS_DISCLOSURE.toLowerCase()).toMatch(/hurt|danger|help/);
    expect(CRISIS_DISCLOSURE.toLowerCase()).toContain("adult");
  });

  it("is present on the onboarding surface (sign-in)", () => {
    const surface = readFileSync("src/app/signin/SignInList.tsx", "utf8");
    expect(surface).toContain("CRISIS_DISCLOSURE");
  });
});
