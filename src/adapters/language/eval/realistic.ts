import type { AttributionCategory } from "@/domain/reflection";
import type { AttributionCase } from "./golden";

/**
 * A REALISTIC, held-out attribution eval set — how students actually write, not
 * the clean textbook phrasings the deterministic regex was built around. Indirect,
 * colloquial, hedged, sometimes multi-clause. Labels are the honest human reading.
 *
 * This is the fair test: a regex handles the clean set; the real question is who
 * wins on messy language. NOTHING here is used as a few-shot exemplar (no leakage)
 * — it is purely a held-out measurement.
 */
const REALISTIC_SEED: Readonly<Record<AttributionCategory, readonly string[]>> = {
  strategy: [
    "honestly i just kind of dove in without thinking about how to set it up first",
    "i tried to do the whole thing in my head instead of writing it down and lost track",
    "if i'd sketched the graph before answering i think i would've caught it",
    "my process was all over the place, i jumped around instead of going in order",
    "i never checked my answer against the question so i didn't notice it was off",
    "i went with my first instinct instead of working it through properly",
  ],
  effort_allocation: [
    "i kind of blanked on how much time i had and the last two i basically guessed",
    "didn't really review this section, i figured i already knew it",
    "i spent way too long stuck on number 3 and had to rush everything after",
    "i was pretty checked out by the end and stopped really trying",
    "put it off till the night before so i only skimmed the examples",
    "i had the energy at the start but kind of gave up halfway through",
  ],
  misconception: [
    "i keep thinking the negative cancels out when you divide but apparently it doesn't",
    "i was sure you flip the fraction for slope, turns out that's not it",
    "in my head 'per' meant add for some reason so i added instead of divided",
    "i had it backwards, i thought rise was the bottom number",
    "i genuinely believed you distribute before you combine, that messed me up",
    "i thought both sides meant you double it, that's not how it works though",
  ],
  external: [
    "the kid next to me kept tapping his pencil and i couldn't concentrate",
    "we honestly never really went over this kind of problem in class",
    "i missed most of last week being out sick so i hadn't seen this yet",
    "my calculator froze halfway and i lost my train of thought",
    "it was freezing in that room and i just wanted it to be over",
    "the instructions were confusing, i wasn't even sure what they wanted",
  ],
  ability: [
    "i'm just not a math person, my brain doesn't work that way",
    "some people get this stuff and i'm just not one of them",
    "no matter how much i study it never clicks for me",
    "i've always been the slow one when it comes to numbers",
    "i think i'm just built to be bad at this honestly",
    "it's like everyone else has a switch that i don't have",
  ],
};

export const REALISTIC_ATTRIBUTION: readonly AttributionCase[] = Object.entries(
  REALISTIC_SEED,
).flatMap(([label, texts]) =>
  texts.map((text) => ({ text, label: label as AttributionCategory })),
);
