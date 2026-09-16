# University Physics — how to continue

Handoff note, 2026-09-16. Written for the next orchestrator or agent picking this up cold.

**You are responsible for `content/paths/university-physics/` only.** The
computational-physics and linear-algebra paths belong to a different orchestrator. Do not
edit them, their lessons, or `src/lib/numerics/`. If you find a bug there, write it down
and move on — there is one already recorded in §5.

---

## 1. Read these first, in order

1. [`docs/learning-with-visualizations-thesis.md`](../learning-with-visualizations-thesis.md) — doctrine, wins all conflicts
2. [`AGENTS.md`](../../AGENTS.md) — house rules
3. [`docs/university-physics-brief.md`](../university-physics-brief.md) — the authoring contract for this path
4. [`docs/university-physics-curriculum.md`](../university-physics-curriculum.md) — the map: 44 chapters, each with its lesson list, visual questions, misconceptions and reusable picture
5. [`UNIVERSITY-PHYSICS-PLAN.md`](../../UNIVERSITY-PHYSICS-PLAN.md) — the build queue and chapter tick-list

The reference lesson to copy for voice and shape is
`content/paths/university-physics/02-motion-as-geometry/01-three-graphs.mdx`.

---

## 2. Where the work stands

**Shipped: 7 lessons across 4 chapters. 919 tests, 110 pages, 0 content errors.**

| Chapter | State |
|---|---|
| 01 Language of Nature | 2 lessons live |
| 02 Motion Along a Line | 1 lesson live (the reference lesson); a second is still wanted |
| 03 Motion in Two/Three Dimensions | 2 lessons live — **lesson 1 has a live bug, see §5** |
| 04 Newton's Laws | 2 lessons live |
| 05–44 | chapter.yaml stubs only, all `status: 'draft'` |

### Shared visual worlds — build once, reuse

This is the single most important structural idea in this path. The curriculum asks for
worlds that come back in new clothes; building them once is the difference between a path
and a pile.

| World | Component | Chapters | Status |
|---|---|---|---|
| Linked x/v/a graphs | `LinkedGraphs` | 2, 3, 14 | built, verified in browser |
| Free-body diagram builder | `FbdBuilder` | 4, 5, 11 | built, **not browser-verified** |
| Potential track + total-E line | `PotentialTrack` | 7, 14, 30, 40 | built, verified in browser |
| Field arrows + equipotentials | `FieldCanvas` | 13, 21, 22, 23, 27, 28 | built, verified in browser |
| Two-source ripple tank | `RippleTank` | 15, 16, 35, 36 | **to build** |
| Phasor stage | `PhasorStage` | 31, 35 | **to build** |

Before building any widget, check this table. Chapter 22 should reuse chapter 21's field
canvas, not write a second one.

### `src/lib/physics/` — the single source of truth

Every number a widget prints must come from here. Never reimplement physics in a widget.

- `vectors.ts` — arrow vs components kept as separate operations, because that distinction *is* chapter 1
- `kinematics.ts` — one worldline, differentiated down and accumulated back up; projectiles with optional quadratic drag
- `interp.ts` — Fritsch–Carlson monotone cubic. A spline that overshoots would invent accelerations the learner never asked for
- `fields.ts` — superposed inverse-power fields. **Read the header comment before using `flux`** (see §4)
- `landscape.ts` — potential landscapes, velocity-Verlet marble, turning points, equilibria
- `dimensions.ts`, `dynamics.ts`, `motion2d.ts` — chapters 1, 4, 3 respectively
- `work.ts`, `landscapes-ch7.ts`, `oscillator.ts` — **partial**, see §3

---

## 3. Unfinished work already on disk

Three agents were killed mid-task by a session limit. Their libraries landed and pass
tests; their **lessons were never written**. Do not rewrite these from scratch — finish them.

| File | For | State |
|---|---|---|
| `src/lib/physics/work.ts` + tests | Ch 6 Work & Kinetic Energy | library done, no lessons |
| `src/components/viz/WorkArrows.tsx` | Ch 6 | component exists, **no `.astro` wrapper**, so it is not registered — add `src/components/widgets/WorkArrows.astro` |
| `src/lib/physics/landscapes-ch7.ts` + tests | Ch 7 Potential Energy | extra landscapes done, no lessons |
| `src/components/viz/ForceFromSlope.tsx` + `.astro` | Ch 7 | built, unverified |
| `src/lib/physics/oscillator.ts` + tests | Ch 14 Periodic Motion | library done (driven damped oscillator, exact pendulum period via AGM), no lessons |

`oscillator.test.ts` arrived with five wrong assertions, now fixed. Worth knowing what they
were, because they are the kind of error to watch for:

- It claimed the pendulum period is ~3× at 170°. The exact value is **2.4394** —
  T/T₀ = (2/π)·K(sin θ₀/2), and K diverges only logarithmically, so 3× belongs much closer
  to 180°. The library was right and the test was wrong.
- It read `equilibriaOf(LANDSCAPES.pendulum)[0]`, which is the **unstable** maximum at −π
  and has no `omega`. Ask for `.find(e => e.stability === 'stable')`.
- Two tolerances were tighter than the physics they measured (asserting a tiny swing's
  period is *exactly* the small-angle period, when it genuinely differs by θ₀²/16).

---

## 4. Traps already paid for

**The Gauss dimension trap.** Flux through a plane loop is invariant only for a 1/r field.
Drawing 1/r² point charges and integrating around a circle — the obvious thing to build —
makes the flux *halve* when the radius doubles, teaching the exact opposite of Gauss's law.
`fields.ts` makes `kind` an explicit choice (`'point'` = 1/r², a 3D charge in a slice, use
`fluxThroughSphere`; `'line'` = 1/r, end-on line charge, plane flux is honest). Tests pin
both behaviours. **A Gauss lesson must use `kind="line"`.**

**Never animate through React state.** Drive the loop from refs and throttle readouts to
~8 Hz. `setState` per frame re-runs the effect, resets the accumulator and silently drops
the simulation to a few steps per second. `PotentialTrack.tsx` is the reference
implementation of doing it right.

**Widgets and scenarios register by directory.** Adding `src/components/widgets/X.astro`
registers `<X>` in every lesson — there is no import list to edit. Scenario packs go in
`src/components/learn/scenarios/*.ts` exporting `tune` / `sketch` / `estimate`. This exists
so several authors can work at once without colliding; do not edit the big shared
`*-scenarios.ts` files.

**Concept ids are globally unique and single-owner.** Before creating one, `ls
content/concepts/`. If the id is taken, that is the rule working — `requires:` it and link.
Give each concurrent agent a disjoint reserved id set up front.

**YAML:** LaTeX in single quotes (double quotes turn `\tfrac` into a TAB); apostrophes
doubled. **MDX:** write `≤`/`≥` in prose, never `<=`/`>=`.

---

## 5. Open bugs

### 5.1 One lesson has zero interactivity — highest priority

`content/paths/university-physics/03-motion-in-space/01-acceleration-need-not-point-where-you-are-going.mdx`

**Every `client:visible` island on this page fails to hydrate.** Not just its `SteeringLab`
— the Predicts, Tune, RankOrder and Recalls are all inert too. The page renders its
server-side markup and nothing ever becomes interactive. `SteeringLab`'s canvas stays at
the default 300×150 backing store, never paints, and its readouts sit frozen at their
initial values — so it reports aₙ = 0 and "straight" at 90°, which contradicts the very
claim the lesson is built on.

Reproduce:

```bash
npm run build
# serve dist/ on any port, then in the browser:
#   [...document.querySelectorAll('astro-island[client=visible]')]
#     .map(e => e.hasAttribute('ssr') ? 0 : 1).join('')
```

Use a tall viewport (e.g. 1100×2600) so several islands are in view at load — scrolling
does **not** trigger hydration in the embedded browser pane, so only what is visible at
load counts. On this page you get `0000000`. On every other lesson, and on
computational-physics, the islands inside the viewport hydrate normally (`111000000`).

Already ruled out: missing or misnamed JS chunks (all present and correctly referenced),
malformed island `props` (all parse), the `astro-island` custom element (defined), console
errors (none), network failures (none), viewport and scroll. The island modules are
**never even requested**, so the IntersectionObserver callback never fires for this page.

Next thing to try: bisect the lesson body. Delete widgets from the MDX one at a time,
rebuild, and re-run the hydration probe until the page comes back — `SteeringLab` and
`RankOrder` are the two components unique to this lesson versus the working ones.

### 5.2 Pre-existing, outside this path — report only, do not fix

```
src/lib/numerics/sph.ts(298,72): error TS1117:
An object literal cannot have multiple properties with the same name.
```

Two independent agents flagged it. It is the only error in a full `npx tsc --noEmit` of the
repo. A duplicate key means one value silently wins, so it is a real bug — but it belongs
to the computational-physics orchestrator.

### 5.3 Not browser-verified

`FbdBuilder`, `WorkArrows`, `ForceFromSlope`, `VectorFrame`, `DimensionBalance`,
`UnitChain`, `ProjectileSplit` were written by agents that were told not to start a dev
server. They typecheck and their libraries are tested, but nobody has watched them run.
Drive them before trusting them — §6 says how.

---

## 6. How to run a wave

Six concurrent Opus agents worked in one checkout successfully. What made it work:

1. **One agent owns one chapter** and writes its two flagship lessons. Two excellent
   lessons beat four thin ones.
2. **Disjoint file ownership.** Each agent creates only its own lessons, concepts, widgets,
   lib module and scenario pack. Everything shared is import-only.
3. **Agents must not run `npm run dev` or `npm run build`** — the port and the Vite cache
   collide across agents, and HMR churn from concurrent writes will invalidate any browser
   check you try to run at the same time. Agents verify with `npm run content:check` and
   `npx vitest run src/lib/physics`.
4. **Agents must not run git.** The orchestrator commits, so a half-written file never
   lands on its own.
5. **The orchestrator does all browser validation**, against a **static build**, not the
   dev server:

```bash
npm run build                      # then serve dist/ yourself on a spare port
```

Validate by outcome, not by reading the diff. Drive the interactions, read the numbers
back, and check them against the physics. Both bugs in §5.1 and the five wrong assertions
in §3 were invisible to `content:check`, to `vitest`, and to the agents' own reports.

### Before you commit

```bash
npm run content:check
npm test
npm run build
```

Then tick the chapter in `UNIVERSITY-PHYSICS-PLAN.md`, flip its `chapter.yaml` to
`status: 'live'`, and delete the row you finished — ship the thing, delete the entry, same
commit.

---

## 7. What to do next, in order

1. **Fix §5.1.** A lesson that is live and inert is worse than one that does not exist.
2. **Finish chapters 6, 7 and 14** from the libraries already on disk (§3). Cheapest real
   progress available — the hard part is done.
3. **Browser-verify the widgets in §5.3**, starting with `FbdBuilder`, because chapters 5
   and 11 are scheduled to reuse it and will inherit any defect.
4. **Chapter 5** (Applying Newton's Laws) — reuses `FbdBuilder` with rotated axes.
5. **Chapter 2 lesson 2** — constant acceleration, the case people reach for when it does
   not apply.
6. Then work down the curriculum. Chapters 13 and 21–23 are cheap because `FieldCanvas`
   already exists; 15/16/35/36 need `RippleTank` built first.
