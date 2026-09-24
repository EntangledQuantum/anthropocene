# University Physics — the authoring brief

Read this **after** [`AGENTS.md`](../AGENTS.md) and
[`learning-with-visualizations-thesis.md`](learning-with-visualizations-thesis.md), which
still govern. This file is the house rules specific to the `university-physics` path, plus
the coordination rules that let several authors work at once without colliding.

The source curriculum is `docs/university-physics-curriculum.md`. It is the map: 44
chapters, each with its own lesson list, visual questions, misconceptions, and a
**reusable picture** the chapter is supposed to leave behind. Your chapter's entry there is
your spec.

---

## 0. Scope — read this first

**You own the chapters you were assigned, and nothing else.**

Never edit, refactor, "improve", or delete anything under:

- `content/paths/computational-physics/**`
- `content/paths/linear-algebra/**`
- `src/lib/numerics/**`
- any existing `src/components/viz/*Lab.tsx` you did not create

Those belong to other authors working at the same time. Touching them will destroy work in
progress. If something there looks broken, **say so in your report** and move on.

---

## 1. What you own

| You create | You must not touch |
|---|---|
| `content/paths/university-physics/<your-chapter>/*.mdx` | any other chapter's `.mdx` |
| `content/concepts/<new-id>.yaml` — only ids that do not exist yet | an existing concept file |
| `src/components/viz/<YourWidget>.tsx` + `src/components/widgets/<YourWidget>.astro` | anyone else's widget |
| `src/lib/physics/<your-topic>.ts` + `src/lib/physics/__tests__/<your-topic>.test.ts` | `vectors.ts`, `kinematics.ts`, `interp.ts` — import them, extend them only by adding a new file |
| `src/components/learn/scenarios/<your-pack>.ts` | `tune-scenarios.ts`, `sketch-scenarios.ts`, `estimate-scenarios.ts` |

Two registries used to be hand-edited and are now **automatic**:

- **Widgets.** Any `.astro` file in `src/components/widgets/` is available in every lesson
  under its own filename. Adding a widget is adding a file — do not edit `lesson.astro`.
- **Scenarios.** `src/components/learn/scenarios/*.ts` may export `tune`, `sketch` and
  `estimate` records; they are merged into the shared registries automatically.

Set the chapter's `status` to `'live'` in its `chapter.yaml` once it has real lessons.

---

## 2. The lesson recipe

The curriculum's §7 gives the beats. Follow them in order:

1. **Hook** — a situation that is slightly too interesting. A scale in an elevator, two
   pulses meeting, a loop entering a field. Not a definition.
2. **Naive attempt** — let slogan-physics try, and let it be *possible*. A wrong path the
   learner cannot actually take is not a struggle, it is a diagram.
3. **World talks back** — the meter, the trace, the field arrow, the histogram. Not a
   sentence telling them they were wrong.
4. **Name the structure** — one or two sentences. The formula is a *caption* for something
   they already did.
5. **Tighten** — same world, one new constraint.
6. **Representation shift** — graphs ↔ arrows ↔ energy bar ↔ equation.
7. **Near transfer** — the same structure in new clothes (spring → pendulum → LC → well).
8. **Edge** — where the model dies: drag, finite well, off-axis, inelastic, damping.
9. **Reusable picture** — end with the image that should survive to tomorrow.

**Each beat is a `<Step>`** (`AGENTS.md` §2a): three sentences at most and one decision.
Beats may merge, but the order holds. Not every lesson needs all nine; most land at 5–8
steps.

**Length.** 8–12 minutes of focused work. If `minutes` is over 14, the lesson is two
lessons.

**Never test code-writing.** `AGENTS.md` §1. There is no code widget and there will not be
one. Test judgement: which model applies, what will happen, which assumption broke.

---

## 3. The visualization is the question

The bar from `AGENTS.md` §2 applies unchanged: **an interactive that could not be replaced
by a paragraph and a static figure.**

**Read `AGENTS.md` §2a first.** It bans the patterns the first pass of this path was built
on: kitchen-sink labs, the reflex sketch-the-graph, a chart standing in for the object, and
essays between widgets.

Read these before you build anything:

- `content/paths/university-physics/04-interaction/01-nothing-keeps-it-going.mdx`: the
  reference lesson. Steps, one decision each, two small self-checking scenes.
- `src/components/viz/scene.tsx`: the scene kit every new visual is built from.
- `src/components/viz/HoldToPush.tsx` and `CancelTheArrow.tsx`: what "small and focused"
  means in code. One or two controls, a live physical picture, a factual miss line.
- `src/components/viz/StabilityExplorer.tsx`: the GPU exemplar, for when per-pixel
  resolution is the point (fields, interference, wavefunctions).

The rules that matter most here:

1. **Couple your views.** One state, several representations, updating together.
2. **Measure honestly.** Every number a widget prints comes from a real computation over
   `src/lib/physics/`. Never hardcode a curve to make a point.
3. **Never animate through React state.** Drive the loop from refs and throttle readouts to
   ~8 Hz. `setState` per frame re-runs the effect and silently drops the simulation to a
   few steps per second. This has bitten this repo before.
4. **Show the failure mode**, not only the success.
5. **Legibility beats atmosphere.** Every axis gets a scale. Big text, calm numbers.
6. **GPU when resolution is the point** — `src/components/viz/gl/webgl.ts`. Do not pull in
   three.js for something a fragment shader does.

### Reuse the kit, not the lab

The first pass built large shared "worlds" (`FbdBuilder`, `LinkedGraphs`, `PotentialTrack`,
`FieldCanvas`, `SteeringLab`, `ProjectileSplit`, `VectorFrame`) and reused them with
different props. That is how every lesson came to look the same and do too much. **Do not
build new lessons on them.** Build a small scene for your idea from `viz/scene.tsx`, and
import physics from `src/lib/physics/`. Those libraries *are* the shared world; the widgets
are cheap.

A chapter may share one of its own scenes between its two lessons when the second lesson
genuinely continues the first picture. That is the evolving canvas, and it is good. A
scene built for chapter 7 reappearing in chapter 30 with a new prop is the old mistake.

---

## 4. Concepts and the single-owner rule

A concept is taught by exactly one lesson, enforced at build time.

Before creating `content/concepts/<id>.yaml`, check it does not exist:

```bash
ls content/concepts/ | grep -i '<id>'
```

If the id is taken, that is the rule working: **link to the owner instead of re-teaching.**
Put it in `requires:` and write one clause pointing at it.

`requires:` an id nothing teaches is a **gap**, not an error — it is the generated to-write
queue, and it is fine to leave gaps for chapters that have not been written yet.

Write **misconceptions** into the concept file, from the curriculum's per-chapter list.
They are first-class data: `<Predict>` wrong options reference them by id and the build
fails on an unknown id. Every `why:` must be written, including for wrong answers —
especially the tempting ones.

**YAML gotcha:** LaTeX goes in **single quotes**. Double quotes process escapes, so
`"\tfrac"` silently becomes a TAB. Apostrophes inside single-quoted YAML are doubled:
`'Newton''s law'`.

---

## 5. Frontmatter

```yaml
---
title: 'Three graphs that must agree'
blurb: 'One line — what the reader can DO afterwards, not what the lesson covers.'
order: 1
tier: 'foundation'        # foundation | core | advanced | frontier
minutes: 14               # honest; 8-14 is the target band
teaches: ['worldline']
requires: ['instantaneous-rate']
status: 'live'            # 'live' demands >=1 owned concept, >=1 graded widget, >=1 <Recall>
updated: 2026-09-12
---
```

## 6. Widgets available with no import

**Graded:** `<Predict>` (reach for this first), `<SketchCurve>`, `<RankOrder>`,
`<Classify>`, `<Tune>`, `<Estimate>`.
**Ungraded:** `<Recall>`, `<Tier>`.
**Viz:** `<LinkedGraphs>`, `<Plot>`, plus everything already in `components/widgets/`.

Props are **JSON-serialised** — no functions, no JSX. A widget that needs a computed truth
takes a `scenario="..."` key registered in your scenarios pack, where the answer is
*computed* from `src/lib/physics/`, never typed in. An estimation question with a
hand-entered true value is a trivia question wearing a slider.

`<Recall>` children use named slots: `<div slot="front">…</div>` then the answer.

**MDX gotcha:** write `≤` and `≥` in prose, never `<=` / `>=`. Inside `$…$` it is fine.

**Widget `id`s are database keys.** Globally unique, and changing one orphans a learner's
history. Prefix yours with the chapter, e.g. `up-ch7-marble-predict`.

---

## 7. The physics rule

`src/lib/physics/` is the single source of truth. The code a lesson displays, the code that
draws its curves and the code a widget measures are the same code. Never reimplement
physics inside a widget.

**Every pedagogical claim gets a test.** If the lesson says the period of a pendulum is
amplitude-dependent, a test measures it. If it says buoyant force equals displaced weight,
a test integrates the pressure over the surface and checks. A wrong simulation is a wrong
lesson, which is worse than no lesson.

---

## 8. Before you report back

```bash
npm run content:check    # graph rules, gaps, per-lesson requirements
npm test                 # your claims
npm run build            # runs content:check first
```

All three must pass. Then **look at your lesson in a browser** and actually do the
interactions:

```bash
npm run dev              # http://localhost:4321/anthropocene
```

If you were not tempted by a wrong answer anywhere, your predictions are too easy.

Run the quality bar honestly (thesis §11 / curriculum §9). **Fail two, rewrite:**
eight-minute test · mute test · transfer · representation · struggle · silence · tomorrow ·
pride.

### Your report

State plainly: which lessons and concepts you added, which widgets you built and whether
they are reusable by later chapters, what you verified in the browser, and **anything you
could not make work**. Do not report success you did not verify.
