# Agent briefing — mandatory, every lesson agent

You are writing one computational-physics lesson for **anthropocene**: a free Brilliant-class studio. The visualization is the question. Interaction is the explanation. If you ship a lecture with sliders glued on, you have failed.

Read these **before writing a single MDX sentence**, in this order:

1. `docs/learning-with-visualizations-thesis.md` — doctrine. Wins all conflicts.
2. `AGENTS.md` — house rules that implement the doctrine.
3. `docs/computational-physics-curriculum.md` — **only the line range in your assignment**.
4. Your assigned draft lesson (the `.mdx` already in the tree).
5. These live models (style, not content to copy):
   - `content/paths/computational-physics/01-numerical-reality/01-floating-point.mdx`
   - `content/paths/computational-physics/03-ode-solvers/02-rk4.mdx`
   - `content/paths/computational-physics/04-structure-preserving/01-verlet-vs-rk4.mdx`

Then follow the pipeline below. Do not skip stages.

---

## Pipeline (do in order)

### 1. Research

Use `web_search`. Pull primary sources, not blog recaps. Write notes to
`docs/orchestrator/notes/<your-topic-id>.md` covering:

- The structure the learner must *feel* (not the definition).
- The most tempting wrong belief (this becomes a `misconceptions:` entry).
- The simplest useful case (1D, two cells, two particles, 2×2 matrix).
- One transfer costume (same idea, different physics clothing).
- Numerics claims you will make (orders, stability limits, rates) — these need tests.

### 2. Plan the solvable chain

Write the plan at the top of the same notes file as a numbered list of **solvables**, using thesis §5.2 beats:

1. Hook / confrontation (a picture that is already a question)
2. Naive attempt
3. The world talks back
4. Name the structure (one or two sentences)
5. Tighten
6. Representation shift
7. Near-transfer
8. Optional edge
9. Close on a reusable picture

Open with a solvable, not three paragraphs of setup. Target **12–18 honest minutes**. Cut words. Thesis wants 5–12; do not ship a 30-minute essay.

### 3. Assets

**Interactive widgets are the assets.** Do not generate decorative images. Do not download stock diagrams. Atmosphere lives in chrome; the reading column stays large, calm, high-contrast.

If you need a new visualization:

- Couple views (one state, several representations).
- Measure honestly from `src/lib/numerics/` — never hardcode a curve.
- Show the failure mode, not just the success.
- Never animate through React state (refs + ~8 Hz readouts).
- GPU only when resolution *is* the point (`src/components/viz/gl/webgl.ts`).
- Register scenarios in `tune-scenarios.ts` / `sketch-scenarios.ts` / `estimate-scenarios.ts`. Widget props are JSON — no functions, no JSX callbacks.

New widget (only if existing vocabulary cannot pose the question):

1. React in `src/components/learn/` or `src/components/viz/`
2. `.astro` wrapper in `src/components/widgets/` with `client:visible`
3. Register in `src/pages/learn/[path]/[chapter]/[lesson].astro`
4. If graded: `GRADED_WIDGETS` in `src/lib/graph/graph.ts` **and** `GRADED` in `scripts/check-content.ts`

Prefer existing: `<Predict>`, `<SketchCurve>`, `<RankOrder>`, `<Classify>`, `<Tune>`, `<Estimate>`, `<Recall>`, `<Tier>`, plus labs (`StabilityExplorer`, `PhaseFlow`, `SolverLab`, `ConvergenceLab`, `DerivativeLab`, `FloatLab`, `CancellationLab`, `Plot`).

### 4. Write the lesson

- Replace the draft stub. Set `status: 'live'` and `updated: 2026-09-10`.
- Keep the existing `teaches:` / `requires:` / `id` unless the assignment says otherwise. Widget ids are database keys — mint new globally-unique ids, never reuse.
- Own ≥1 concept, ≥1 graded widget, ≥1 `<Recall>` card (live-lesson gate).
- Aim for **≥4 graded solvables**. Depth is the product.
- Every wrong `<Predict>` option gets a real `why`. Tempting wrong answers should set `misconception: '<id>'` matching an id you add to the concept YAML.
- YAML LaTeX in **single quotes**.
- Prose: second person, present tense, no filler, no hedging. End with **What to carry forward**.
- MDX: write `≤` / `≥` in prose, not `<=` / `>=`.
- Never ask the learner to write code. Showing numerics source is fine.

### 5. Tests

Every pedagogical claim gets a test in `src/lib/numerics/__tests__/`. If you say a rate, a stability limit, an order, or a conservation property, assert it from the same code the widget runs.

### 6. Verify

```bash
npm run content:check
npm test
```

Fix failures you caused. Do not “fix” unrelated failing tests by weakening them.

### 7. Commit (worktree only)

```bash
git add -A
git commit -m "lesson: <title>

Ship <lesson-file> live. Numerics claims pinned by tests."
```

Retry the commit on lock errors (wait 2s, up to 3 times).

---

## Hard do-nots

- Do **not** edit `LEARNING-PLAN.md`, `PLATFORM-GAPS.md`, `AGENTS.md`, `README.md`. The orchestrator updates queues after merge.
- Do **not** rewrite another lesson. Improve only files in your assignment’s **Owned files** list, plus new files you create.
- Do **not** reimplement solvers inside a widget. Import `src/lib/numerics/`.
- Do **not** add a `<CodeChallenge>`. There will never be one.
- Do **not** farm XP, skip-thinking multiple choice, or four-numbers-and-a-cartoon.
- Do **not** change existing widget `id`s in other lessons.
- When adding to shared registries (`tune-scenarios.ts`, `ode.ts`, `problems.ts`), **append**. Do not restyle unrelated entries.
- If you need a new function in `ode.ts` / `diff.ts` / `linalg.ts`, add it; do not change the contract of existing integrators.

---

## Quality bar (fail two → rewrite, do not ship)

- **Eight minutes:** rusty adult gets one “oh”.
- **Mute:** interactives alone still teach.
- **Transfer:** new numbers/story still work.
- **Representation:** idea shown two ways.
- **Struggle:** wrong path possible, visible, recoverable.
- **Silence:** cut 30% of the words.
- **Pride:** a serious person would send it because the *idea* is beautiful.
- **Tomorrow:** a picture remains.

---

## Design

Dark only. Tokens in `src/styles/global.css`. No hardcoded hex except inside shaders. Legibility beats atmosphere. Every axis has a scale.
