# University Physics — how to continue

Handoff note for the next orchestrator or agent picking this up cold. Last rewritten
2026-10-02, when chapters 43 and 44 landed and the final pass was done.

## 0. Where it stands — read this first

| Chapters | State |
|---|---|
| **1–44** | **Done.** Two focused lessons each (88 lessons), reviewed in a browser and committed one chapter at a time (`git log --oneline \| grep "university-physics ch"`). |

**Gate (2026-10-02):** `npm run content:check` 0 errors / 0 warnings / 0 gaps, `npm test`
2059 tests in 98 files passing, `npm run build` complete (191 pages). The only `tsc` error is
the known out-of-scope `src/lib/numerics/sph.ts(298)`.

**Final pass, done:**
- Chapter 19's `SlamThePump` moves 0.05 L per key press, so a quick four-press stroke reaches
  the target by keyboard alone (driven in Playwright: 445 K, Solved).
- §2a audit across the path: no `<SketchCurve>` anywhere, no lesson built on a bare `<Plot>`,
  every lesson 5–9 steps. Screenshots of graph-adjacent lessons (chapters 2, 12, 16, 25, 39)
  show the object first with the graph as a live companion.
- `<Estimate>` readouts now show three significant figures and the unit ("17,200 years").
- `blackbody-radiation` is owned by chapter 44 lesson 2 (the stretching-light step names
  Wien's law), which closed the last gap.

**In progress (2026-10-02): third lessons.** One agent per chapter adds `03-<slug>.mdx`
following [`THIRD-LESSON-BRIEF.md`](THIRD-LESSON-BRIEF.md). Chapters 1–16 launched; 17–44
not yet. A chapter is done when `03-*.mdx` exists, its preview has been reviewed and a
`university-physics chNN lesson 3: …` commit exists (`git log --oneline | grep "lesson 3"`).
Any `03-*.mdx` without that commit is unreviewed agent work: run the review recipe on it.

**What is worth doing next, if anyone continues** (none of it is broken):
1. A human read-through of the later chapters (30–44). Their agents drove every graded
   scene, but the orchestrator reviewed them by screenshot, not by playing every step.
2. Chapter 43's drag handlers were exercised by keyboard only; try them with a mouse.
3. The curriculum lists ~12 lessons per chapter and this pass shipped the two flagship
   lessons per chapter. A third lesson per chapter is the obvious growth path; brief it with
   `AGENT-BRIEF.md` exactly as before, and keep §2a's "same move twice" rule across the
   whole chapter.

**To resume, paste this into a fresh session:**

> Continue the University Physics path in this repo. Read
> `docs/orchestrator-university/CONTINUE-HERE.md` first: §0 has the exact state. All 44
> chapters have two focused lessons and the gate is green. Pick up "What is worth doing
> next" in §0: for new lessons, launch one chapter agent each (about eight at a time) using
> `docs/orchestrator-university/AGENT-BRIEF.md`, and review every chapter in a browser with
> `scripts/preview/preview.sh` before committing it. Follow `AGENTS.md` §2a strictly: one
> decision per screen, act on real objects, no repeated sketch-the-graph, graphs live and
> secondary. Commit and push to the current branch as you go.

**How each chapter was briefed:** every agent prompt was
"read `docs/orchestrator-university/AGENT-BRIEF.md` and follow it exactly", plus one
paragraph naming the chapter directory and slug, two lesson ideas with an opening bet, the
physics lib to write and the claims its tests must pin, the concept ids to `require`, the
preview tag `chNN` and widget ids `up-chNN-…`. Copy that shape. The hooks used for the last
chapters, as examples:
- **40 Wave functions:** particle in a box (raise the energy line until ψ fits both walls;
  E₁ > 0; |ψ|² node for n = 2), then tunnelling (thicken a barrier, ln T falls ≈ −2κ;
  chapter 7's turning point is where the wave starts to decay). Lib: Numerov shooting.
- **41 Atoms:** hydrogen |ψ|² slices in WebGL (nodes appear with n, l, m; radial
  probability peaks at a₀ though density peaks at the nucleus), then Pauli filling for
  Z = 1–20 and the ionisation sawtooth.
- **42 Molecules and solids:** a bond as a spring in chapter 7's well (H → D frequency
  × ≈ 0.72), then bands from N atoms (tight binding) and a semiconductor that conducts
  better when hot while copper conducts worse.
- **43 Nuclei:** the binding-energy curve as a landscape you roll nuclei down (fusion left,
  fission right), then half-life: a box of nuclei decaying one at a time, with the learner
  predicting how many remain after two half-lives, and carbon dating as transfer.
- **44 Particles and cosmos:** conservation laws as the rule book (sort proposed decays
  into allowed or forbidden by charge, baryon and lepton number), then the expanding
  universe: dots on a stretching sheet where every dot sees the others recede at v ∝ d
  (Hubble), and the learner reads the age of the universe off the slope.

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
