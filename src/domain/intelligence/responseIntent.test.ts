import { describe, it, expect } from "vitest";
import {
  classifyResponse,
  contextualFollowup,
  type ResponseCategory,
} from "./responseIntent";

function cat(answer: string): ResponseCategory {
  return classifyResponse(answer).category;
}

describe("classifyResponse", () => {
  it("passes a real, on-topic answer as direct/usable", () => {
    const r = classifyResponse("The sign on the middle term tripped me up.");
    expect(r.category).toBe("direct");
    expect(r.isUnpredictable).toBe(false);
  });

  it("flags a refusal", () => {
    expect(cat("I'd rather not say")).toBe("refusal");
    expect(cat("pass")).toBe("refusal");
    expect(cat("none of your business")).toBe("refusal");
    expect(classifyResponse("").category).toBe("refusal"); // empty = skip
  });

  it("flags gibberish / key-mash", () => {
    expect(cat("asdfghjkl")).toBe("gibberish");
    expect(cat("!!!@#$%^&")).toBe("gibberish");
  });

  it("flags an ambiguous non-answer", () => {
    expect(cat("idk")).toBe("ambiguous");
    expect(cat("maybe")).toBe("ambiguous");
    expect(cat("kind of")).toBe("ambiguous");
  });

  it("flags an explicitly off-topic answer (the survey-bot example)", () => {
    const r = classifyResponse("I really love how blue the sky is today! totally unrelated.");
    expect(r.category).toBe("off_topic");
    expect(r.isUnpredictable).toBe(true);
  });

  it("does not mislabel short but genuine answers", () => {
    expect(cat("the signs")).toBe("direct");
    expect(cat("factoring")).toBe("direct");
  });
});

describe("contextualFollowup", () => {
  const Q = "What tripped you up most about factoring today?";

  it("anchors gibberish and off-topic probes to the current question", () => {
    expect(contextualFollowup("gibberish", Q)).toContain("factoring");
    expect(contextualFollowup("off_topic", Q)).toContain("factoring");
  });

  it("honors a refusal with an out (no pressure)", () => {
    const f = contextualFollowup("refusal", Q);
    expect(f.toLowerCase()).toContain("skip");
  });

  it("asks an ambiguous answer for a specific moment", () => {
    expect(contextualFollowup("ambiguous", Q).toLowerCase()).toContain("specific");
  });
});
