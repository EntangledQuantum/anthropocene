# PLATFORM-GAPS.md — where we fall short of the thesis

Measured against [`docs/learning-with-visualizations-thesis.md`](docs/learning-with-visualizations-thesis.md),
which is the doctrine. **Read that document before working from this one.**

This is a queue, like `LEARNING-PLAN.md`. **Delete an entry when it ships.** If this file
describes something that already works, it is wrong.

`LEARNING-PLAN.md` tracks *content* to write. This file tracks *platform capability* the
content needs in order to be any good.

---

## The honest summary

We built a good **explanation engine with interactive figures**. The thesis describes a
**problem-solving studio**. Those are different products, and the gap is mostly in three
places:

1. **Our lessons are essays with widgets in them.** The thesis is explicit that words are
   expensive and that a lesson is a chain of solvables, not prose punctuated by demos.
   Our lessons run 18–30 minutes; the target is 5–12.
2. **Each widget is its own island.** The thesis wants one *evolving canvas* that persists
   across several questions, so memory has an object to hold. We reset the world every time.
3. **We have roughly 1–3 interactions per concept.** The thesis says 20+. Depth is the
   product, and we do not have it yet.

Everything below follows from those three.

---

## P0 — the doctrine violations

These are bugs against §6, not enhancements.

- [ ] **Lessons are too long and too wordy.** §5.1, §8, principle 11.
  Every live lesson needs a pass with the silence test (§11): remove 30% of the words and
  check nothing is lost. Target 5–12 minutes. Split where a lesson is carrying two ideas.
  `minutes:` in frontmatter should be honest after the cut, not aspirational.

- [ ] **The evolving canvas.** §5.4, §6.6.
  Right now every widget is an isolated island with its own state. A lesson should be able
  to declare one visual world that several consecutive solvables share and mutate — the
  tangent you dragged in question 2 still there in question 5. This is the single biggest
  structural gap and it needs a real design: a lesson-scoped world store that widgets read
  and write, plus a `<Canvas>` wrapper that owns the shared diagram.

- [ ] **Prose comes before interaction.** §2.3, §5.2, principle 4.
  Our lessons explain and then demonstrate. The thesis order is hook → naive attempt →
  the world talks back → *then* name the structure. Restructure lessons to open with a
  solvable, not with three paragraphs of setup.

- [ ] **Wrong answers do not change the world.** §2.6, §8, principle 8.
  Today a wrong `<Predict>` shows text. The thesis wants the world to *show* why — the
  areas do not match, the point is not on the circle. Feedback should be visible in the
  diagram wherever the diagram can express it.

- [ ] **Canonical reveal after an honest attempt.** §5.5, glossary.
  We reveal an explanation, but not "here is how a clear thinker would have seen it",
  tied to the same picture and slightly interactive.

---

## P1 — missing layers

### Layer B — the coach (entirely absent)

The thesis is emphatic (§2.7) that this is about a *principle*, not a chatbot: do not lift
the weights for the learner.

- [ ] **A coach that points rather than tells.** Guiding questions, highlighted regions on
  the current figure, a spawned smaller interactive. Must refuse the final answer until the
  learner has worked. Fades with competence.

### Layer C — the gym (thin)

- [ ] **Variants.** §7, §12. Same objective, new numbers/story/surface, so practice
  requires recognising the idea rather than recalling the screen.
- [ ] **20+ solvables per concept.** §4 Layer C. We are an order of magnitude short.
- [ ] **Interleaved mixed sets** at the end of a chapter, forcing strategy choice.
- [ ] **Checkpoints** on a path.
- [ ] **Review should be interactive, not a flashcard.** §7. Our `<Recall>` is text
  front/back. The thesis says review is the same idea in new clothes — a review item should
  be a *solvable*, ideally a variant.

### Layer D — the map

- [x] Paths and chapters exist
- [x] **"You are here" on a path** — the path page is a route with a lit thread, chapter
  markers and a single ringed next stop, rather than a list of identical rows.
- [ ] **Mastery versus completion.** §4 Layer D, §7. We track *completed*. We need
  *understood* and *needs review* as distinct states, driven by FSRS stability per concept.
- [ ] **"What should I do in the next eight minutes?"** §4 Layer E. The home page markets
  the product to a stranger; it should orient a returning learner.
- [ ] **Placement.** A short interactive diagnostic, not a 80-question exam.
- [ ] **Ask in your own words → route to a lesson.** §7. The palette handles "jump to a
  thing I can name"; this is the harder version — a natural-language question routed into
  the right lesson rather than answered in a chat box.

### Layer E — the habit

- [x] Streaks, XP, daily goal
- [ ] **Streak safety valve.** §4 Layer E, §10 rule 4. Two charges, so a missed day is not
  guilt software.
- [ ] **An honest daily minimum.** "3 solvables or 1 lesson", stated on the home page.
- [ ] **Daily puzzle** as a cultural object.
- [ ] **Streak charges need to be spendable**, not just counted — see the safety valve above.

### Layer F — culture

- [ ] **"Why this lesson is shaped this way"** note per lesson, for teachers. §12 explicitly
  names this as an open-source advantage over Brilliant's closed craft shop.
- [ ] **Shareable puzzles.**

---

## P2 — interaction primitives

§7 wants "12 primitives used with taste" in a consistent dialect. We have five graded ones.
Missing, in rough value order:

- [ ] **`<Locator>`** — drag a point in 2D on the diagram. The most-used Brilliant primitive
  and our most conspicuous absence.
- [ ] **`<Stepper>`** — advance through time or algorithm steps at the learner's pace.
  §8: time should be learner-paced, never an uninterruptible video.
- [ ] **`<PlotPoints>`** — place points to satisfy a constraint.
- [ ] **`<Assemble>`** — drag ordered pieces/tiles into a structure (an algorithm, a proof,
  a pipeline). Distinct from `<RankOrder>`, which is a linear ranking.
- [ ] **`<Expression>`** — enter a symbolic answer.
- [ ] **Linked representations.** §6.6, "the link *is* the lesson". A wrapper where changing
  one view moves the others: equation ↔ graph, table ↔ plot.

---

## P3 — polish and craft (§8)

- [ ] **The primary action should be on the object, not on a Submit button.** Several of our
  widgets require a separate "check" click where direct manipulation would do.
- [ ] **Encouragement should be factual, not empty.** Audit all feedback copy: "the left side
  matches; the right side does not" beats "correct".
- [ ] **Keyboard and screen-reader story** for every primitive. §7 accessibility.
- [ ] **Spatial continuity between solvables** — a diagram should not jump layout without cause.
- [ ] **Reduce hidden state.** If a parameter matters, it is visible.

---

## Done

Delete from the lists above and record here only if it is worth remembering.

- ✅ **Never test code-writing** — the thesis's input-type list (§5.5) contains no
  "write the function"; it is all decisions in a visual world. Removed `<CodeChallenge>`,
  replaced with `<SketchCurve>`, `<RankOrder>`, `<Classify>`.
- ✅ **Prediction as a first-class move** (§5.6) — `<Predict>` gates the reveal on committing.
- ✅ **Parameters beat single cases** (§6.5) — `<SolverLab>`, `<PhaseFlow>`,
  `<StabilityExplorer>` all expose the knob rather than a screenshot.
- ✅ **One visual language** (§6.7) — a single analogous ramp for every data series, plus
  two state colours deliberately outside it. Roles are addressed by meaning
  (`--sig-you`, `--sig-truth`, `--sig-mute`), and the type system stops a state colour
  being used as a series.

- ✅ **Misconceptions as first-class data** (§7, §12) — `misconceptions:` on a concept,
  referenced by id from a wrong `<Predict>` option, resolved at build time and rendered as
  "the belief underneath". A mistyped id fails the build rather than silently dropping the
  most useful feedback a wrong answer can give. 8 authored so far.

- ✅ **XP cannot be farmed** (§10 rule 1, principle 12) — the award tapers 12 → 6 → 0, so
  exhausting a four-option question earns nothing while a corrected mistake still pays.
  Locked down by tests, because this is exactly the kind of rule a later tweak reverts.

- ✅ **"You are here"** (§4 Layer D) — the path is a journey with a lit thread and one
  ringed next stop.

- ✅ **Search from anywhere** (§7) — ⌘K / Ctrl-K or `/` opens a palette over every page,
  fuzzy-matching lessons, concepts, chapters and paths. Concepts resolve to the lesson
  that owns them, so jumping to an idea lands where it is taught. The index is fetched on
  first open, so nobody pays for a feature they did not use.

- ✅ **The graph is a graph** (§6.1) — the page was a sorted list of cards that called
  itself a graph, which is exactly the illustration-versus-model failure the thesis names.
  Now force-directed, self-indexing from `/index.json`, with hover isolating a concept's
  neighbourhood and click opening its lesson.

- ✅ **Estimation as a first-class move** (§5.5, §6.8, §8) — `<Estimate>` commits the
  learner to an order of magnitude before the reveal, graded on a multiplicative factor.
  Answers are computed from the numerics, and the figures the prose quotes are pinned by
  tests so they cannot drift.
