import type { Id } from "../common";
import type { AttributionCategory } from "../reflection";

/**
 * LanguageCapability — the "AI = labor, not judgment" port (CLAUDE.md). It may
 * classify free text into the domain's taxonomies and tag skills. It must NEVER
 * decide an intervention, compute a gap, or set a safety outcome. The default
 * implementation is deterministic and rule-based; a future LLM adapter could
 * implement this same interface, but the decision path stays LLM-free.
 */

export interface SkillRef {
  id: Id;
  name: string;
}

export interface LanguageCapability {
  /** Map a free-text reflection note onto the attribution taxonomy. */
  classifyAttribution(note: string): AttributionCategory;
  /** Tag which of the given skills a free-text passage refers to. */
  tagSkills(text: string, skills: readonly SkillRef[]): Id[];
}
