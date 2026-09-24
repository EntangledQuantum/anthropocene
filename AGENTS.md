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

Per-path briefs, which add house rules on top of this file:

- **[`docs/university-physics-brief.md`](docs/university-physics-brief.md)** — required
  before writing anything under `content/paths/university-physics/`. Its companion map is
  [`docs/university-physics-curriculum.md`](docs/university-physics-curriculum.md), and
  [`docs/orchestrator-university/CONTINUE-HERE.md`](docs/orchestrator-university/CONTINUE-HERE.md)
  is the handoff note: current state, unfinished work already on disk, and open bugs.

Both are queues. Ship the thing, delete the entry, same commit.

---

This is the contract. Everyone adding a lesson follows it, human or agent. Most of it is
enforced by `npm run content:check`, which the build runs first and which fails the build
on violation.

Read §1, §2 and §2a before writing anything. They are the rules that earlier lessons got
wrong and that are expensive to fix afterwards. §2a in particular is why the first pass of
university physics was rewritten.

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

## 2a. Focus: one scene, one decision

This section exists because the first pass of `university-physics` was thrown out. Those
lessons were essays wrapped around 700–1,300-line "labs" full of sliders, palettes, mode
toggles and captions that said *"three things worth doing"*. Nearly every lesson ended with
the same "sketch the graph" exercise. Learners did not know where to look, and every
lesson felt like the one before. **Everything below is enforced in review. Treat a
violation as a bug, not a style choice.**

### Banned

1. **Kitchen-sink labs.** A widget with more than two controls, or a `mode` prop that turns
   one component into several tools. If a caption has to list things to try, those things
   are separate steps with separate small scenes.
2. **The reflex `<SketchCurve>`.** "Sketch x(t) / v(t) / E(t)" is not a default ending.
   **At most one `<SketchCurve>` per chapter**, and only when the shape *is* the idea and no
   action in the world can ask it. The same goes for an `<Estimate>` that is trivia with a
   slider.
3. **A chart standing in for the physics.** A plot of a quantity against time is not a
   visualization of a puck, a wave, a lens or a field. Show the *object*: what the learner
   would see in the room. A graph may sit beside it as a companion strip, never instead of
   it.
4. **Instructions in captions.** A caption describes; it never directs. Directions go in
   the scene's one-line `prompt`.
5. **Prose before the first decision.** Open with a situation in two sentences or fewer,
   then a decision. No definitions, no "in this lesson".
6. **Paragraphs over three sentences.** Explanations live in `why`, `explanation` and the
   one line after an action, not in blocks between widgets.
7. **A quiz with a picture.** Multiple choice whose answer can be read from the text
   without touching the visual.
8. **The same move twice.** Do not use one widget the same way in two steps of a lesson,
   and do not end two lessons of a chapter with the same kind of exercise.

### Required

- **A lesson is a sequence of `<Step>`s.** Aim for 5–8 steps and 8–12 minutes. The page
  shows one step at a time, and Continue unlocks once every graded widget in the step
  has been *attempted*, right or wrong (`src/lib/step-flow.ts`). Each step has **three
  sentences of prose or fewer, and exactly one decision.**
- **At least half the graded decisions are actions in the world**: drag, hold, aim,
  release, balance, place, tilt or time. These are self-checking scenes, not multiple
  choice. `<Predict>` is for the opening bet and for choosing between *interpretations*.
- **Every lesson ships at least one purpose-built scene** for its idea, built from the scene
  kit and small: roughly 250 lines at most. Reuse the *kit*, not someone else's lab.
- **The first decision is one a thoughtful novice gets wrong about half the time.** If
  nobody would get it wrong, it is not a hook.
- **A wrong action changes the world.** The scene shows what is off (the arrow still
  points, the trace sags, the image is blurred), and the `CheckBar` miss line states it as a
  number about the scene: *"The forces still add to 7.1 N, pointing up-left."* Never write
  "Not quite, try again".
- **Step headings are claims or verbs** ("Let go", "The diagram hides the motion"), not
  topic names ("Newton's second law").
- **Physics colours are fixed** across every lesson: velocity cyan, acceleration magenta,
  force amber, position iris, energy aqua, field orchid. Use `C` from `viz/scene.tsx`.

### The scene kit: `src/components/viz/scene.tsx`

`SceneCard` (the frame and its one prompt), `Stage` (SVG world coordinates; pass `equal`
whenever angles must look true), `Arrow`, `Body`, `Handle` (drag plus keyboard), `Meter`
(the one number that matters), and `useTask` + `CheckBar` for a scene that grades itself.

To make a scene graded, give it an `id` prop, call `useTask(id)`, and put the comment
`@graded` in its `.astro` wrapper. The build then counts it (`graph.ts` and
`check-content.ts` both read the marker). Used without an `id`, the same scene is an
ungraded picture. Put `id` first in the tag.

**The reference to copy is
`content/paths/university-physics/04-interaction/01-nothing-keeps-it-going.mdx`**, with
its two scenes `HoldToPush.tsx` and `CancelTheArrow.tsx`. Measure against it:

| The old lesson did | The new lesson does |
|---|---|
| FbdBuilder with a force palette, mass slider, partner toggles and a three-part caption | `CancelTheArrow`: one handle, one question; the closed triangle appears once you solve it |
| "Sketch the speed over six seconds" | `HoldToPush`: push with your own hand, let go, and watch the trace stay flat |
| Four paragraphs before the first widget | Two sentences, then a bet |

### Verbs to reach for

Physics is full of actions with a visible consequence. Pick the one that *is* the idea:
**hold** a push, **release** at the right moment, **aim** a launch to hit a mark, **tilt**
until it slips, **balance** a lever, **drag** the image until it is sharp, **place** a
probe where the field is zero, **time** a tap to the resonance, **stop** the clock when the
wave arrives, **pick** the frame in which it looks simple, **trace** the ray, **pour**
until it floats, **add** the charge that cancels. If the verb you chose is "sketch" or
"slide a number", look again.

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
| `<Predict>` | Commit to an outcome, then watch it. The opening bet, and choices between interpretations. |
| `<SketchCurve>` | Draw the shape you expect. **Rationed: one per chapter at most** (§2a). |
| `<RankOrder>` | Relational judgement: which is bigger, faster, cheaper. |
| `<Classify>` | Distinctions that blur — problem vs method, stable vs unstable. |
| `<Tune>` | Hunt a threshold by moving a parameter until the system does the thing. |
| `<Estimate>` | Commit to an order of magnitude before seeing the answer. Graded on a factor, not a percentage. |

### Ungraded

| Widget | Use for |
|---|---|
| `<Recall>` | A spaced-repetition card, authored where the idea appears. |
| `<Step>` | One screen of a lesson. Every lesson is a sequence of these (§2a). |
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
| `<HoldToPush>` | Self-checking scene: hold a push on a puck, let go. The §2a reference. |
| `<CancelTheArrow>` | Self-checking scene: drag one force until the acceleration vanishes. |

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
- ❌ `<Estimate answer={84000} />` → ✅ `scenario="…"`, registered in a scenarios pack,
  where the answer is **computed** from `src/lib/numerics` rather than typed. An estimation
  question with a hand-entered "true" value is a trivia question wearing a slider.
- ❌ `<Recall front={<>…</>}>` → ✅ `<Recall><div slot="front">…</div>…</Recall>`

**Where to put a scenario.** Add a file to `src/components/learn/scenarios/` exporting any
of `tune`, `sketch`, `estimate` as `Record<string, …Scenario>`. Those packs are globbed
into the three shared registries automatically, so a lesson brings its own scenarios
without editing a file another author is also editing. The large `*-scenarios.ts` files
hold the original computational-physics set and are not the place to add to.

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
3. **That is the registration.** Every `.astro` file in `src/components/widgets/` is
   globbed into the authoring vocabulary under its own filename, so there is no import
   list to edit and no merge conflict when two authors add widgets at once.
4. If graded, put the comment `@graded` in its `.astro` wrapper. Both `graph.ts` and
   `check-content.ts` read the marker, so there is no list to edit. Build it from the scene
   kit (`viz/scene.tsx`, §2a).
5. Document it in §6 and add it to the design rules in §2 if it teaches something new.

### The content index

`/index.json` is emitted at build time from the concept graph and holds every path,
chapter, lesson and concept plus the prerequisite edges. The command palette and the
concept graph both read it, so **adding a lesson re-indexes search and redraws the map
with no extra step**. If you build something that needs to know what content exists, read
that endpoint rather than adding a second source of truth.

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

Dark only. No light theme, no toggle. **It is a study, not a cockpit.**

The reference for structure is [algebrica.org](https://algebrica.org): one calm reading
column, a sidebar that says where you are, numbered tables of contents, serif headings,
plain sans for everything you click, hairline dividers and nothing else. The Grimes
reference survives as **atmosphere only**: a faint pearl-lilac aurora at the top of the
page and a pearl sheen on the mark and progress fills.

What that rules out, and what two earlier passes got wrong: uppercase mono micro-labels,
neon borders, glows, HUD panels, stat tiles, and a WebGL field behind the hero. They read
as a sci-fi dashboard and made the site about itself instead of about the physics.

- **Headings** are EB Garamond (`--font-display`). **UI and body** are Inter. Mono is for
  numeric readouts only.
- **Labels are sentence case.** `.hud-label` capitalises its first letter for you; never
  add `text-transform: uppercase` or letter-spacing to a label.
- **One chrome accent**, `--color-accent` (pearl lilac), for links, the current location
  and the primary action. The series ramp (cyan → magenta) is for *data* in plots only.
- **One primary button per exercise**: `<Button primary>` for the action that submits an
  answer. Everything else is a neutral `<Button>`.
- New pages use `.page-grid` (reading column + `.page-aside`) and `.toc` lists from
  `global.css` rather than inventing a layout.

Legibility wins every conflict. Tokens are in `src/styles/global.css`. Use them; do not
hardcode hex in a component except inside shader source, where CSS variables cannot reach.

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
