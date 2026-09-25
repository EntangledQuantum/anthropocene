# University Physics — how to continue

Handoff note for the next orchestrator or agent picking this up cold. Last rewritten
2026-09-25, during the focused rewrite.

**You are responsible for `content/paths/university-physics/` only.** The
computational-physics and linear-algebra paths belong to another orchestrator. Do not edit
them, their lessons, or `src/lib/numerics/`.

---

## 1. What happened, in one paragraph

The first pass of this path was rejected by the owner: lessons were essays around huge
multi-control "labs" (FbdBuilder, SteeringLab, ProjectileSplit, LinkedGraphs…), and nearly
every lesson ended with the same sketch-the-graph exercise. The path is being rewritten in
a focused, Brilliant-style shape: **one screen at a time, one decision per screen, small
purpose-built scenes the learner acts in.** The rules are `AGENTS.md` §2a. Read them before
anything else.

## 2. Read these, in order

1. `AGENTS.md`, especially §2a (banned patterns, the required lesson shape, the scene kit)
2. [`docs/learning-with-visualizations-thesis.md`](../learning-with-visualizations-thesis.md)
3. [`docs/university-physics-brief.md`](../university-physics-brief.md)
4. [`AGENT-BRIEF.md`](AGENT-BRIEF.md): the exact brief each chapter agent is given
5. [`docs/university-physics-curriculum.md`](../university-physics-curriculum.md): the map
6. [`UNIVERSITY-PHYSICS-PLAN.md`](../../UNIVERSITY-PHYSICS-PLAN.md): the tick list

The reference lesson is
`content/paths/university-physics/04-interaction/01-nothing-keeps-it-going.mdx`.

## 3. Platform pieces the rewrite added

- **`<Step>`** (`src/components/widgets/Step.astro`, `src/lib/step-flow.ts`). Shows a
  lesson one step at a time. Continue unlocks when every graded widget in the step has
  been *attempted*. Graded widgets mark their root with `data-widget-id`, which is how the
  step finds them before hydration. `?all` in the URL opens every step.
- **Self-checking scenes.** A widget whose `.astro` wrapper contains `@graded` counts as
  graded (both `graph.ts` and `check-content.ts` read the marker). Such a widget used
  without an `id` is an ungraded picture.
- **Scene kit** (`src/components/viz/scene.tsx`): `SceneCard`, `Stage` (use `equal` for
  true angles), `Arrow`, `Body`, `Handle`, `Meter`, `useTask`, `CheckBar`, and the fixed
  physics palette `C`.
- **Preview tool.** `bash scripts/preview/preview.sh <tag> <route>` builds into a private
  dir under a lock (so parallel agents do not collide) and screenshots the lesson with
  every step shown into `/tmp/anth-shots/<tag>/`, printing page errors. Agents copy
  `scripts/preview/shoot.mjs` to make Playwright drivers for their graded scenes.

## 4. How a wave runs

- One agent per chapter, briefed with `AGENT-BRIEF.md` plus a paragraph of chapter-specific
  hooks. Keep about eight running and start the next chapter as each finishes.
- Agents never run git. The orchestrator commits: a per-chapter commit after review, plus
  `wip:` checkpoints of in-flight work so nothing is lost if the container is reclaimed.
- The orchestrator reviews every chapter by building and reading screenshots before
  committing it. Agents also drive their graded scenes with Playwright.
- A session limit can kill agents mid-task. Resume the *same* agent with SendMessage; its
  files are on disk and in the checkpoints.

## 5. Traps already paid for

- **Gauss dimension trap.** Flux through a plane loop is invariant only for a 1/r field;
  `fields.ts` makes `kind` explicit. A Gauss lesson must use line charges (1/r) in a plane
  slice, or real 3D spheres.
- **Rolling marbles carry spin.** A rolling ball hides 2/7 of its KE in rotation; a
  frictionless cart does not. Chapter 7 uses carts for that reason.
- **Pendulum period.** It is 2.4394× the small-angle period at 170°, not 3×.
- **Never animate through React state.** Loops live in refs; readouts are throttled to about
  8 Hz (`HoldToPush.tsx`).
- **Predict payoffs hydrate late.** A scene inside a `<Predict>` loads only once revealed,
  so a click in the first instant after commit can be lost. Harmless for people; drive
  scripts should wait.
- **YAML:** LaTeX goes in single quotes, apostrophes doubled. **MDX:** use `≤`/`≥` in prose.
- **Out of scope, known:** `src/lib/numerics/sph.ts(298)` has a duplicate object key
  (TS1117). It belongs to computational physics; report it, don't fix it.
