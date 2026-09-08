# AGENTS.md — how to add things to anthropocene

This file is the contract for anyone (human or agent) adding content. Read it before
writing a lesson. The rules here are not style preferences — most of them are enforced by
`npm run content:check`, which the build runs first and which fails on violation.

---

## 0. The one-minute version

```bash
npm run new:lesson -- --path computational-physics --chapter 03-ode-solvers \
  --id 05-dormand-prince --title "Adaptive steps in practice" \
  --teaches embedded-pairs --requires rk4,butcher-tableau --minutes 25

npm run content:check     # graph rules, gaps, per-lesson requirements
npm run dev               # http://localhost:4321/anthropocene
```

If the path or chapter does not exist, the scaffolder creates it. If a concept named in
`--teaches` or `--requires` has no file, it creates a stub. That is the whole
"give it a category and it makes a learning path" flow.

---

## 1. What this platform is trying to be

A free alternative to Brilliant that does not stop where Brilliant stops.

Brilliant's model is right: a lesson is a sequence of small interactions that build on
each other, and you learn by manipulating the thing rather than reading about it. Its
ceiling is the problem — it is built for a general audience, so it never gets to the
material an actual practitioner needs.

So the standard here is: **keep the interaction model, remove the ceiling.**

Three consequences that should shape everything you write:

1. **The visualization is the explanation.** If a paragraph and a figure say the same
   thing, cut the paragraph. If a figure is decorative, cut the figure.
2. **Being wrong is the mechanism.** A reader who predicts "RK4 conserves energy better"
   and watches it not happen has learned something a paragraph cannot deliver. Design for
   the productive wrong answer.
3. **Depth is opt-in, not absent.** Every lesson runs foundation → frontier on one page.
   The reader chooses how deep to go. Never write down to them.

---

## 2. Content lives in `content/`, separate from the app

```
content/
  concepts/<id>.yaml                        atomic knowledge nodes
  paths/<path-id>/path.yaml                 a category / learning path
  paths/<path-id>/<NN-chapter>/chapter.yaml
  paths/<path-id>/<NN-chapter>/<NN-lesson>.mdx
```

Nothing in `content/` imports app code, and nothing in `src/` hardcodes a lesson. You can
grep it, move it, or hand it to another renderer.

Numeric prefixes (`03-ode-solvers`) set ordering and are stripped from URLs.

---

## 3. The concept graph — the rule that matters most

**A concept is taught by exactly one lesson.** This is enforced at build time.

```yaml
teaches:  ['rk4', 'butcher-tableau']         # concepts this lesson OWNS
requires: ['forward-euler', 'global-error']  # concepts it assumes
```

- `teaches` a concept another lesson already teaches → **build error**. Link instead.
- `requires` something nothing teaches → reported as a **gap** (visible on `/graph`).
  Gaps are fine. They are the to-write queue, generated rather than maintained by hand.
- Cycles in the resulting prerequisite DAG → **build error**.

This is what stops the platform turning into a pile of overlapping blog posts. When you
need an idea, you link to its owner; you do not re-explain it. If the existing
explanation is inadequate, **improve that lesson** rather than writing a second one.

A concept file is small on purpose:

```yaml
title: 'Classical RK4'
blurb: 'Four slope samples per step, combined so error terms through third order cancel.'
notation: 'y_{n+1} = y_n + \tfrac{h}{6}(k_1 + 2k_2 + 2k_3 + k_4)'
tags: ['ch3']
```

> **YAML gotcha, and it will bite you:** always write `notation` (and any LaTeX) in
> **single quotes**. YAML double-quoted scalars process escapes, so `"\tfrac"` silently
> becomes a TAB followed by `frac`. `content:check` catches this, but write it right the
> first time.

---

## 4. Lesson frontmatter

```yaml
---
title: 'Why a worse method gives a better orbit'
blurb: 'One line. What the reader will be able to do — not what the lesson covers.'
order: 1                    # within the chapter
tier: 'advanced'            # foundation | core | advanced | frontier
minutes: 30                 # honest estimate of focused work; drives the daily goal
teaches: ['velocity-verlet']
requires: ['rk4']
runtime: 'none'             # 'python' opts into the lazily-loaded Pyodide runtime
status: 'live'              # 'draft' hides nothing but marks it visibly
updated: 2026-09-08
---
```

`status: 'live'` triggers stricter checks: a live lesson must own at least one concept,
ship at least one graded interaction, and ship at least one `<Recall>` card.

---

## 5. The widget vocabulary

Every widget below is available in any lesson **with no import and no client
directive**. They are wired up in `src/pages/learn/[path]/[chapter]/[lesson].astro`.

### Graded — these count toward completion and award XP

| Widget | Use it for |
|---|---|
| `<Predict>` | Commit to an answer, then see the simulation. **The highest-value widget — reach for it first.** |
| `<Tune>` | Hunt for a threshold by moving a parameter until the system does the thing. |
| `<CodeChallenge>` | Implement the algorithm; graded by measuring the convergence order it actually achieves. |

### Ungraded

| Widget | Use it for |
|---|---|
| `<Recall>` | A spaced-repetition card, authored where the idea appears. |
| `<Tier>` | Depth-gated section: `foundation` / `core` / `advanced` / `frontier`. |

### Visualization

| Widget | Use it for |
|---|---|
| `<SolverLab>` | Compare integrators on a problem — trajectory, error, energy, phase views. |
| `<ConvergenceLab>` | Log-log error vs step size, with the order fitted and reported. |
| `<DerivativeLab>` | The finite-difference U-curve. |
| `<FloatLab>` | Bit-level anatomy of a float64. |
| `<CancellationLab>` | Two algebraically identical formulas, one of which survives. |
| `<Plot>` | The general 2D primitive, if nothing above fits. |

### Examples

```mdx
<Predict
  id="verlet-energy-predict"                     {/* globally unique, stable forever */}
  question="What happens to the energy under RK4 versus velocity Verlet?"
  options={[
    { key: 'a', label: 'RK4 holds it better', why: 'Tempting, and right about the short run — but...' },
    { key: 'c', label: 'RK4 drifts; Verlet stays bounded', why: 'Correct, and here is the mechanism.' },
  ]}
  correct="c"
>
  {/* revealed only after the reader commits — this is the payoff */}
  <SolverLab problem="oscillator" methods={['rk4','velocity-verlet']} view="energy" />
</Predict>

<Recall id="symplectic-one-line" concept="symplectic-euler">
  <div slot="front">What is the only difference between forward and symplectic Euler?</div>

  The answer, written to teach rather than merely confirm.
</Recall>

<Tier level="advanced">
  The treatment for someone who already has the working version.
</Tier>
```

**Every `why` must be written**, including for wrong options. A wrong answer the reader
cannot understand is a wasted interaction.

---

## 6. Hard constraints you will hit

These come from the architecture, not from taste. Knowing them up front saves an hour.

### Widget props are JSON — you cannot pass a function

Widgets are Astro islands, and island props are serialized. So:

- ❌ `<Tune compute={(v) => ...} />`
- ✅ `<Tune scenario="euler-stability" />`, with the computation registered in
  `src/components/learn/tune-scenarios.ts`.

Adding a `<Tune>` interaction means adding a scenario to that registry.

### You cannot pass JSX as a prop either

- ❌ `<Recall front={<>Why does <code>x</code>…</>}>`
- ✅ `<Recall><div slot="front">Why does <code>x</code>…</div>…</Recall>`

### MDX treats `<` as a tag

Write `≤` and `≥` rather than `<=` and `>=` in prose. Inside `$…$` math it is fine.

### Widget ids are database keys

`id` on a `<Predict>`/`<Tune>`/`<CodeChallenge>`, and on a `<Recall>`, keys stored
progress and FSRS schedules. **Changing an id orphans the reader's history and resets the
card's schedule.** Ids must be globally unique; `content:check` enforces it.

---

## 7. Adding a new widget

1. Write the React component in `src/components/viz/` or `src/components/learn/`.
2. Add an `.astro` wrapper in `src/components/widgets/` carrying `client:visible`
   (MDX-provided components cannot carry client directives themselves).
3. Register it in the `lessonComponents` map in
   `src/pages/learn/[path]/[chapter]/[lesson].astro`.
4. If it is graded, add its name to `GRADED_WIDGETS` in `src/lib/graph/graph.ts` **and**
   to `GRADED` in `scripts/check-content.ts`, so it counts toward completion.
5. Document it in the table above.

### Library freedom

Each widget is its own island, so a one-off lesson can import p5.js, MathBox, JSXGraph or
anything else **without any other lesson paying for it in bundle size**. The defaults
below are recommendations, not restrictions.

| Need | Use |
|---|---|
| 2D plots, axes | `<Plot>` (canvas data + SVG axes, `d3-scale`/`d3-shape`) |
| 3D / fields / N-body | `three.js` + `@react-three/fiber`; WebGPU compute past ~10k particles |
| UI motion | `motion` (`motion/react`) |
| Timeline-driven explainers | `gsap` |
| Math typesetting | KaTeX, build-time, via `$…$` — **never ship a math renderer to the client** |
| Real numpy/scipy | Pyodide, behind `runtime: 'python'`, lazily loaded |

---

## 8. The numerics rule

`src/lib/numerics/` is the **single source of truth**. The code a lesson displays, the
code that draws its curves, and the reference a `<CodeChallenge>` is graded against are
all the same code. Never reimplement a solver inside a lesson or a widget.

Consequently that code is written to be *read*: plain arrays, no clever optimisation, the
math visible in the shape of the expression.

**Every pedagogical claim gets a test.** If a lesson says RK4 is fourth order, there is a
test asserting the measured order is 4. If it says Verlet's energy error stays bounded
while RK4's does not, there is a test asserting exactly that. See
`src/lib/numerics/__tests__/`. A wrong simulation is a wrong lesson, which is worse than
no lesson.

```bash
npm test
```

---

## 9. Writing style

- **Open with tension, not a definition.** What does the reader currently believe that
  this lesson complicates?
- **Second person, present tense.** Direct.
- **No filler.** Cut "it is important to note", "as we will see", "in this lesson we will".
- **Name the payoff early.** The reader should know within two paragraphs why they care.
- **Wrong answers deserve real explanations.** Especially the tempting ones.
- **End with "What to carry forward"** — two or three lines connecting to what is next.
- **Do not hedge about difficulty.** No "don't worry if this seems hard". Just explain it.

---

## 10. Progress, XP, and storage

Progress lives in SQLite in the browser (OPFS, `opfs-sahpool` VFS — chosen because it
needs no COOP/COEP headers and therefore works on GitHub Pages). No server, no account.

- `xp_events` is **append-only**. Streaks, levels and daily totals are derived from it, so
  no aggregate can disagree with its own history.
- XP: 12 for a first-try solve, 6 after a retry, 30 for a lesson, 8 per review card.
- Reviews use FSRS-6 via `ts-fsrs`.
- **One tab at a time** — the SAH pool VFS allows a single holder. This is detected and
  shown in the header rather than crashed on.
- Every storage call degrades to a no-op if the database is unavailable. **Lessons must
  work in full without it.** Progress is a feature, never a precondition for reading.

---

## 11. Before you commit

```bash
npm run content:check    # graph rules, gaps, per-lesson requirements
npm test                 # the numerics claims
npm run build            # runs content:check first
```

Then read your lesson in the browser and actually do the interactions. If you were not
tempted by a wrong answer anywhere, the predictions are too easy.
