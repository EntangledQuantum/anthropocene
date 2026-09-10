# AGENTS.md — the formula for adding content

## Read this first

**[`docs/learning-with-visualizations-thesis.md`](docs/learning-with-visualizations-thesis.md)
is required reading before you design a lesson.** It is the doctrine; this file is the
house rules that implement it. Where the two disagree, the thesis wins and this file is
the bug.

The one line to carry: **the visualization is the question.** The learner is placed inside
the problem, and interaction is not decoration after an explanation — interaction *is* the
explanation, happening in their hands. A lesson is a sequenced chain of small decisions
that force the idea to assemble itself. Symbols arrive after the idea has a body.

Two companion queues:

- **[`LEARNING-PLAN.md`](LEARNING-PLAN.md)** — content to write, ordered basic → advanced.
- **[`PLATFORM-GAPS.md`](PLATFORM-GAPS.md)** — where we currently fall short of the thesis.

Both are queues. Ship the thing, delete the entry, same commit.

---

This is the contract. Everyone adding a lesson follows it, human or agent. Most of it is
enforced by `npm run content:check`, which the build runs first and which fails the build
on violation.

Read §1 and §2 before writing anything. They are the two rules that earlier lessons got
wrong and that are expensive to fix afterwards.

---

## 0. The one-minute version

```bash
npm run new:lesson -- --path computational-physics --chapter 03-ode-solvers \
  --id 05-dormand-prince --title "Adaptive steps in practice" \
  --teaches embedded-pairs --requires rk4,butcher-tableau --minutes 25

npm run content:check     # graph rules, gaps, per-lesson requirements
npm test                  # the numerics claims
npm run dev               # http://localhost:4321/anthropocene
```

If the path or chapter does not exist, the scaffolder creates it. If a concept named in
`--teaches` or `--requires` has no file, it creates a stub. That is the whole
"give it a category and it makes a learning path" flow.

**Pick what to write from [`LEARNING-PLAN.md`](LEARNING-PLAN.md), and delete the entry
from that file in the same commit that ships the lesson.**

---

## 1. Never test code-writing

**No lesson may ask the learner to write code.** There is no `<CodeChallenge>` widget and
there will not be one.

Nobody hand-writes an RK4 step in 2026. Asking them to is testing the one part of the
skill that is now free, and it is testing it badly — a learner who cannot type the
formula from memory may understand it perfectly, and one who can type it may understand
nothing.

The thesis backs this structurally: its list of solvable input types (§5.5) contains no
"write the function". Every entry is a *decision in a visual world* — drag, plot, reshape,
estimate, classify, choose between competing interpretations.

What is genuinely scarce is the judgement a model will not exercise for you:

- Knowing **which** method the problem calls for, and why.
- Predicting how a system will **behave** before running it.
- Reading a wrong output and naming **which** assumption broke.
- Knowing what a method **cannot** do, and recognising the failure on sight.

So test that. Concretely, instead of *"implement forward Euler"*:

| Instead of | Ask |
|---|---|
| Implement the step function | **Sketch** the solution when the step size crosses the stability limit |
| Write RK4 | **Rank** these methods by accuracy at equal cost |
| Code the energy calculation | **Predict** whether energy drifts or oscillates, then watch |
| Fix this buggy solver | **Classify** each symptom as a property of the problem or of the method |
| Implement Richardson | Choose **which two rows** to combine, and say what cancels |

Showing code is fine and often essential — the lesson displays the solver it is
discussing, and that code comes from `src/lib/numerics/` (see §7). Displaying is not
testing. The rule is only about what the learner is *graded on*.

---

## 2. The visualization is the lesson

The bar is: **an interactive that could not be replaced by a paragraph and a static
figure.** If a picture would say the same thing, ship the picture and cut the widget.

Two worked examples to measure against. Read their source before building anything new.

### `<StabilityExplorer>` — `src/components/viz/StabilityExplorer.tsx`

Stability regions in the complex plane, evaluated **per pixel on the GPU**. Drag `z = hλ`
anywhere and the trajectory panel responds live.

Why it clears the bar:
- It shows a **shape**, not an inequality. "No explicit method is A-stable" becomes a
  thing you see by switching methods and watching the region fail to reach the axis.
- The per-pixel evaluation matters: the structure that teaches (how the boundary pinches
  toward the imaginary axis) lives at a resolution a coarse CPU grid would erase.
- It is **coupled** — the plane and the solution plot are two views of one state, so
  moving the marker explains itself.

### `<PhaseFlow>` — `src/components/viz/PhaseFlow.tsx`

Transports a whole **region** of initial conditions and measures its area with a shoelace
integral over a tracked boundary ring.

Why it clears the bar:
- It makes Liouville's theorem **visible**. Symplecticity stops being a definition.
- The measurement is honest — a real polygon area over real tracked particles, not a
  Gaussian fit or a hand-tuned constant.
- It invites a falsifiable experiment: change `h`, watch accuracy degrade and area
  preservation not.

### The rules that came out of building those

1. **Couple your views.** One state, several representations, updating together.
2. **Show the failure mode**, not just the success. Excluded points stay on the chart,
   dimmed — the pre-asymptotic bend and the roundoff floor are the most instructive parts
   of a convergence plot.
3. **Measure honestly.** Every number a widget prints must come from a real computation
   over `src/lib/numerics`. Never hardcode a curve to make a point.
4. **GPU when the resolution is the point.** WebGL2 is assumed; this is not built for
   phones. `src/components/viz/gl/webgl.ts` has the fragment-shader helper. Do not pull in
   three.js for something a shader does.
5. **Never animate through React state.** Drive the loop from refs and throttle readouts
   to ~8 Hz. Calling `setState` per frame re-runs the effect, resets the accumulator and
   silently drops the simulation to a few steps per second.
6. **Legibility beats atmosphere, always.** Every axis gets a scale. If a background makes
   text harder to read, the background is wrong.

---

## 3. Content lives in `content/`, separate from the app

```
content/
  concepts/<id>.yaml                        atomic knowledge nodes
  paths/<path-id>/path.yaml                 a category / learning path
  paths/<path-id>/<NN-chapter>/chapter.yaml
  paths/<path-id>/<NN-chapter>/<NN-lesson>.mdx
```

Nothing in `content/` imports app code, and nothing in `src/` hardcodes a lesson.
Numeric prefixes set ordering and are stripped from URLs.

---

## 4. The concept graph — one owner per concept

**A concept is taught by exactly one lesson.** Enforced at build time.

```yaml
teaches:  ['rk4', 'butcher-tableau']         # concepts this lesson OWNS
requires: ['forward-euler', 'global-error']  # concepts it assumes
```

- `teaches` something another lesson teaches → **build error**. Link instead.
- `requires` something nothing teaches → a **gap**, listed on `/graph`. Gaps are fine;
  they are the generated to-write queue.
- Cycles → **build error**.

When you need an idea, link to its owner. If that lesson explains it badly, **improve
that lesson** rather than writing a second one.

```yaml
title: 'Classical RK4'
blurb: 'Four slope samples per step, combined so error terms through third order cancel.'
notation: 'y_{n+1} = y_n + \tfrac{h}{6}(k_1 + 2k_2 + 2k_3 + k_4)'
tags: ['ch3']
```

> **YAML gotcha:** write `notation` and all LaTeX in **single quotes**. Double-quoted YAML
> processes escapes, so `"\tfrac"` silently becomes TAB + `frac`. `content:check` catches
> it, but write it right the first time.

---

## 5. Lesson frontmatter

```yaml
---
title: 'Why a worse method gives a better orbit'
blurb: 'One line. What the reader can do afterwards — not what the lesson covers.'
order: 1                    # within the chapter
tier: 'advanced'            # foundation | core | advanced | frontier
minutes: 30                 # honest estimate of focused work
teaches: ['velocity-verlet']
requires: ['rk4']
runtime: 'none'             # 'python' opts into lazily-loaded Pyodide
status: 'live'              # 'draft' marks it visibly, hides nothing
updated: 2026-09-10
---
```

`status: 'live'` triggers stricter checks: the lesson must own ≥1 concept, ship ≥1 graded
interaction, and ship ≥1 `<Recall>` card.

---

## 6. The widget vocabulary

Available in any lesson with **no import and no client directive**. Wired up in
`src/pages/learn/[path]/[chapter]/[lesson].astro`.

### Graded — count toward completion, award XP

| Widget | Tests |
|---|---|
| `<Predict>` | Commit to an outcome, then watch it. **Reach for this first.** |
| `<SketchCurve>` | Draw the shape you expect. The strongest test we have — you cannot bluff a curve. |
| `<RankOrder>` | Relational judgement: which is bigger, faster, cheaper. |
| `<Classify>` | Distinctions that blur — problem vs method, stable vs unstable. |
| `<Tune>` | Hunt a threshold by moving a parameter until the system does the thing. |

### Ungraded

| Widget | Use for |
|---|---|
| `<Recall>` | A spaced-repetition card, authored where the idea appears. |
| `<Tier>` | Depth-gated section: `foundation` / `core` / `advanced` / `frontier`. |

### Visualization

| Widget | Shows |
|---|---|
| `<StabilityExplorer>` | Stability regions in the complex plane, GPU, draggable. |
| `<PhaseFlow>` | Phase-space area transport. Liouville made visible. |
| `<SolverLab>` | Integrators compared — trajectory, error, energy, phase. |
| `<ConvergenceLab>` | Log-log error vs step size, order fitted and reported. |
| `<DerivativeLab>` | The finite-difference U-curve. |
| `<FloatLab>` | Bit-level anatomy of a float64. |
| `<CancellationLab>` | Two identical formulas, one of which survives. |
| `<Plot>` | The general 2D primitive when nothing above fits. |

### Examples

```mdx
<Predict
  id="verlet-energy-predict"                    {/* globally unique, stable forever */}
  question="What happens to the energy under RK4 versus velocity Verlet?"
  options={[
    { key: 'a', label: 'RK4 holds it better', why: 'Tempting, and right about the short run — but…' },
    { key: 'c', label: 'RK4 drifts; Verlet stays bounded', why: 'Correct, and here is the mechanism.' },
  ]}
  correct="c"
>
  {/* revealed only after committing — this is the payoff */}
  <PhaseFlow system="oscillator" initial="velocity-verlet" />
</Predict>

<SketchCurve
  id="rk4-drift-sketch"
  scenario="rk4-energy-drift"           {/* registered in learn/sketch-scenarios.ts */}
  prompt="Sketch ΔE/E₀ over 2000 time units. It starts at exactly zero."
  hint="Nothing in RK4 constrains which direction its per-step error points."
  explanation="A steady slide downward…"
/>

<Recall id="symplectic-one-line" concept="symplectic-euler">
  <div slot="front">What is the only difference between forward and symplectic Euler?</div>

  The answer, written to teach rather than merely confirm.
</Recall>
```

**Every `why` must be written**, including for wrong options — especially the tempting
ones. A wrong answer the learner cannot understand is a wasted interaction.

---

## 7. Hard constraints

Architectural, not stylistic. Each of these has cost someone an hour.

### Widget props are JSON — no functions, no JSX

Widgets are Astro islands and props are serialised.

- ❌ `<Tune compute={(v) => …} />` → ✅ `<Tune scenario="euler-stability" />`, registered in
  `src/components/learn/tune-scenarios.ts`
- ❌ `<SketchCurve truth={[…]} />` → ✅ `scenario="…"`, registered in `sketch-scenarios.ts`
- ❌ `<Recall front={<>…</>}>` → ✅ `<Recall><div slot="front">…</div>…</Recall>`

### MDX treats `<` as a tag

Write `≤` and `≥` in prose, not `<=` / `>=`. Inside `$…$` math it is fine.

### Widget ids are database keys

`id` keys stored progress and FSRS schedules. **Changing an id orphans the learner's
history and resets the card.** Globally unique; `content:check` enforces it.

---

## 8. Adding a new widget

1. React component in `src/components/viz/` or `src/components/learn/`.
2. `.astro` wrapper in `src/components/widgets/` carrying `client:visible` — MDX-provided
   components cannot carry client directives themselves.
3. Register it in `lessonComponents` in `src/pages/learn/[path]/[chapter]/[lesson].astro`.
4. If graded, add its name to `GRADED_WIDGETS` in `src/lib/graph/graph.ts` **and** `GRADED`
   in `scripts/check-content.ts`.
5. Document it in §6 and add it to the design rules in §2 if it teaches something new.

### Library freedom

Each widget is its own island, so a one-off lesson can import anything without every other
lesson paying for it in bundle size.

| Need | Use |
|---|---|
| Per-pixel fields, regions, basins | WebGL2 via `viz/gl/webgl.ts` |
| 2D plots, axes | `<Plot>` (canvas data + SVG axes, `d3-scale`) |
| Particle systems | Typed arrays + canvas 2D; GPU past ~50k |
| UI motion | `motion` (`motion/react`) |
| Math typesetting | KaTeX at build time via `$…$` — never ship a math renderer |
| Real numpy/scipy | Pyodide, behind `runtime: 'python'`, lazily loaded |

---

## 9. The numerics rule

`src/lib/numerics/` is the **single source of truth**. The code a lesson displays, the
code that draws its curves, and the code a widget measures are the same code. Never
reimplement a solver inside a lesson or a widget.

That code is written to be *read*: plain arrays, no clever optimisation, the math visible
in the shape of the expression.

**Every pedagogical claim gets a test.** If a lesson says RK4 is fourth order, a test
asserts the measured order is 4. If it says Verlet preserves phase-space area, a test
transports a ring of particles and measures it. See `src/lib/numerics/__tests__/`.

A wrong simulation is a wrong lesson, which is worse than no lesson.

---

## 10. Writing style

- **Open with tension, not a definition.** What does the reader currently believe that
  this lesson complicates?
- **Second person, present tense.** Direct.
- **No filler.** Cut "it is important to note", "as we will see", "in this lesson we will".
- **Name the payoff early** — within two paragraphs.
- **Wrong answers deserve real explanations.**
- **End with "What to carry forward"** — two or three lines pointing at what is next.
- **Do not hedge about difficulty.** No "don't worry if this seems hard". Just explain it.

---

## 11. Design

Dark only. No light theme, no toggle.

The reference is Claire Boucher's visual language: iridescent chrome, bloom, soft
gradients bleeding into black, with sharp manga-clean edges cutting through. Ethereal and
lush, then a hard line.

What that is **not**: dense 10px uppercase mono in every corner, scanlines over body text,
hairlines everywhere. That reads as a military dashboard and it fights the reading. An
earlier pass made exactly this mistake.

**The rule: atmosphere lives in the background and the chrome. The reading column and
every number, axis and label stays large, calm and high contrast.** Legibility wins every
conflict.

Tokens are in `src/styles/global.css`. Use them; do not hardcode hex in a component
except inside shader source, where CSS variables cannot reach.

---

## 12. The quality bar

Thesis §11 is the acceptance test for any lesson. Run it honestly. **If a lesson fails two
of these, rewrite it — do not ship and iterate.**

- **Eight minutes.** A rusty, curious adult sits down cold and has one genuine "oh" inside eight minutes.
- **Mute.** Hide the prose and the explanations. Do the interactives alone still teach something?
- **Transfer.** Change the story and the numbers. Does it still work, or was the screenshot memorised?
- **Representation.** Can the learner show the idea two ways?
- **Struggle.** Is a wrong path possible, visible, and recoverable without a lecture?
- **Silence.** Could you remove 30% of the words and lose nothing? Then remove them.
- **Pride.** Would a serious person send this to a friend because the *idea* is beautiful?
- **Tomorrow.** Is there a picture left in their head tomorrow?

---

## 13. Before you commit

```bash
npm run content:check    # graph rules, gaps, per-lesson requirements
npm test                 # the numerics claims
npm run build            # runs content:check first
```

Then read the lesson in a browser and actually do the interactions. If you were not
tempted by a wrong answer anywhere, the predictions are too easy.

If you changed the landing page or the design system, **regenerate the screenshots**:

```bash
npm run screenshot                                    # docs/landing.png (README embeds it)
npm run screenshot -- /learn/computational-physics/ path-journey
```
