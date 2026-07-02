import type { AttributionCategory } from "@/domain/reflection";
import type { LanguageCapability, SkillRef } from "@/domain/ports";

/**
 * DeterministicLanguageCapability — rule-based, zero-LLM. Same input → same
 * output, always. This is the default the whole system runs on (CLAUDE.md →
 * "Deterministic default; schema-validated output; zero-LLM must work").
 */

// Ordered rules: first match wins. Self-focused ("ability") is checked first so
// it can be recognized and later steered AWAY from toward controllable causes.
const ATTRIBUTION_RULES: readonly [RegExp, AttributionCategory][] = [
  [
    /\bi'?m (just )?(bad|terrible|dumb|stupid|no good)\b|not (good|smart)|can'?t do|never (get|understand)/i,
    "ability",
  ],
  [
    /\b(rushed?|ran out of time|no time|didn'?t finish|time management|skipped)\b/i,
    "effort_allocation",
  ],
  [
    /\b(confus\w*|mixed up|misremember\w*|wrong (rule|formula|sign)|sign error|thought .* (was|meant))\b/i,
    "misconception",
  ],
  [
    /\b(calculator|noise|noisy|distract\w*|was sick|unfair|the (teacher|test|room))\b/i,
    "external",
  ],
  [
    /\b(strateg\w*|approach|method|steps|show\w* my work|double.?check|checked|wrote|plan\w*)\b/i,
    "strategy",
  ],
];

export function createDeterministicLanguageCapability(): LanguageCapability {
  return {
    classifyAttribution(note: string): AttributionCategory {
      for (const [pattern, category] of ATTRIBUTION_RULES) {
        if (pattern.test(note)) return category;
      }
      // Default to the most controllable, productive cause — never "ability".
      return "strategy";
    },

    tagSkills(text: string, skills: readonly SkillRef[]): string[] {
      const haystack = text.toLowerCase();
      return skills
        .filter((skill) => {
          const name = skill.name.toLowerCase();
          if (haystack.includes(name)) return true;
          return name
            .split(/[^a-z0-9]+/)
            .filter((word) => word.length >= 4)
            .some((word) => haystack.includes(word));
        })
        .map((skill) => skill.id);
    },
  };
}
