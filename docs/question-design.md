# Asking students well — the research behind plumb's questions

This is the source of truth for **how plumb formulates reflection questions**. It is
distilled from developmental and survey-methods research (high-school focus, ages
~14–18, which is plumb's audience). The actionable rules here are encoded and
enforced in code: `src/domain/intelligence/questionDesign.ts` (the guardrail) and
tested in `questionDesign.test.ts` + `factoringSurvey.test.ts`.

## The core problem: self-report is a hint, not the truth

Students don't always tell you the true thing:

- **Acquiescence / "yea-saying"** — unsure kids lean toward "yes"/"agree"/"true".
- **Answering the unanswerable** — asked something they can't know, kids invent an
  answer rather than say "I don't know" (Waterman, Blades & Spencer; Hughes & Grieve).
- **Social desirability / impression management** — they say what looks good; teens
  do this deliberately (Paulhus).
- **Suggestibility** — they follow hints hidden in the question (Ceci & Bruck).
- **Satisficing / straight-lining** — they fade and click the same button; a large
  California study saw straight-lining rise to ~25% by a survey's end (Krosnick;
  *Educational Researcher*, 2021).

**Design consequence:** plumb treats every self-report answer as a *divergence signal*
to check against real behavior/results — never as ground truth.

## Teens specifically (14–18)

- Can "think about thinking" (metacognition) but feel watched (**imaginary audience**,
  Elkind) and manage what they show.
- Want to be their own boss (**autonomy** — Self-Determination Theory, Deci & Ryan).
- Emotional granularity **dips** around 13–15 — mixed feelings without the words to
  split them (Barrett; Nook et al.) → give teens *more* feeling-word help, not less.
- Privacy is the **biggest lever** for honesty (Turner 1998; Ong & Weiss 2000;
  Soneson 2025).

## The rules plumb builds to

| Rule | Because | Cite |
|---|---|---|
| Ask about a real recent **moment**, not a fixed trait | teens recall events better than they judge their whole self | episodic + time anchoring |
| Offer a **feeling menu**, not good/bad | granularity dips in early teens | Barrett; Nook |
| Never **lead** | teens follow hidden hints | Ceci & Bruck |
| No **yes/no** for skill | acquiescence | yea-saying |
| **One idea** per question | double-barreled can't be answered | double-barreled |
| Keep it **short** | fatigue → satisficing/straight-lining | Krosnick; ER 2021 |
| Let them **skip / "I don't know"** | else they invent answers; choice → honesty | Waterman; SDT |
| Say **who sees it** and that it won't be punished | privacy is the #1 honesty lever | Turner; Ong & Weiss; Soneson |
| End with a **next step**; blame changeable causes | naming a problem with no help can harm | Hattie & Timperley; Weiner |
| Prefer **predict-then-check** over "rate yourself" | self-ratings reflect hope; the gap teaches calibration | Zimmerman |

## Response format by age band

| Band | Ages | Max scale points | Notes |
|---|---|---|---|
| Early elementary | 6–7 | 2 | 2 faces / yes-no; read aloud; one idea |
| Elementary | 8–10 | 3 | 3-point faces or words; easy "I don't know" |
| Middle school | 11–14 | 5 | 3-point reliably, 5-point if tested |
| **High school** | **14–18** | **5** | up to 5-point Likert; feeling menus; optional open text; strong privacy |

All ages: prefer faces/word Likert over sliders; keep it short; allow skip.

## Validated instruments to borrow wording from

PANAS-C (feelings), Harter Self-Perception Profile (self-view), Junior MAI
(metacognition), EPOCH (teen wellbeing: Engagement, Perseverance, Optimism,
Connectedness, Happiness), WEMWBS (wellbeing). Borrow their tested wording rather
than inventing new items.

## The "never" list (enforced by `reviewQuestion`)

- Never **lead** (`leading`)
- Never join **two asks with "and"** (`double_barreled`)
- Never ask an **abstract trait** of a student — use a concrete moment (`abstract_trait`)
- Never use **yes/no** for a judgment (`yes_no`)
- Never make a single prompt **too long** (`too_long`)

## Ethics

Get assent + consent; comply with FERPA/COPPA; keep emotional questions gentle and
always paired with a next step or help (iatrogenic-harm guard); let students stop.
Get legal review before launch.

> Simplifications: age numbers ("2–3 min focus per year", "granularity dip 13–15")
> are rules of thumb from specific studies, not laws. The SDT→honesty link is a
> strong hypothesis (built from autonomy-support research), not directly proven for
> a "you may skip" option. Validation samples are country-specific — re-check with
> plumb's own students.
