# Chapter agent brief: university physics, focused rewrite

You own **one chapter** of `content/paths/university-physics/`. Your job is to ship its
**two flagship lessons** in the focused, step-by-step style, rewriting any lesson already
there. Several agents are working at the same time, one per chapter, in one shared checkout.

## 1. Read first, in this order

1. `AGENTS.md`, all of it. **§2a is the reason this rewrite exists.** Its banned list is
   hard: kitchen-sink labs, the reflex sketch-the-graph, a chart instead of the object,
   instructions in captions, prose before the first decision, paragraphs over three
   sentences, quiz-with-a-picture, and the same move twice.
2. `docs/university-physics-brief.md`: path house rules, the nine-beat recipe, scope.
3. `docs/learning-with-visualizations-thesis.md` §5 and §6.
4. Your chapter's block in `docs/university-physics-curriculum.md`: lessons, visual
   questions, misconceptions, reusable picture. It is your spec. Choose the two lessons that
   carry the chapter's core structure.
5. **The reference lesson**:
   `content/paths/university-physics/04-interaction/01-nothing-keeps-it-going.mdx`, plus
   `src/components/viz/scene.tsx`, `HoldToPush.tsx` and `CancelTheArrow.tsx`. Match that
   shape and that size.

## 2. What a finished lesson looks like

- A sequence of `<Step>` blocks, 5–8 of them, 8–12 honest minutes. Leave a blank line after
  `<Step>` and before `</Step>` so markdown works inside.
- **Each step has at most three sentences of prose and exactly one decision.** Put
  explanations in `why:` / `explanation=` / the scene's `hit` line.
- Step 1 is a hook: a situation in two sentences or fewer, then a bet a thoughtful novice
  gets wrong about half the time. It is usually a `<Predict>` whose payoff (children) is a
  scene they can then play with.
- **At least half the graded decisions are actions in a physical scene** you build:
  drag, hold, aim, release, tilt, balance, place, time. They are graded by the scene itself
  (`useTask` + `CheckBar`, `@graded` marker). The miss line states what is off, as a number
  about the scene.
- **At least one purpose-built scene per lesson; aim for two.** Each has one or two
  controls, one focal object and roughly 250 lines at most. It shows the *physical thing*
  (block, rope, wave, lens, field, circuit, atom), not just a graph. A small companion trace
  is fine, as in `HoldToPush`.
- One "name it" step where the equation arrives as a caption for what they just did.
- A transfer or edge step: new clothes, or where the model breaks.
- 1–2 `<Recall>` cards per lesson, short.
- Last step ends with `## What to carry forward`: two or three bullets and one line
  pointing at the next lesson.
- `<SketchCurve>`: **at most one in your whole chapter, and preferably none.** Do not end a
  lesson with one. Use `<RankOrder>`, `<Classify>`, `<Estimate>` and `<Tune>` sparingly,
  where they are genuinely the best question, and never the same kind twice in a lesson.
- Voice: second person, present tense, short sentences, no filler, no hedging.

## 3. Files you may create or edit

| You may | You must not |
|---|---|
| `content/paths/university-physics/<your-chapter>/*.mdx` and its `chapter.yaml` (set `status: 'live'`) | any other chapter's files |
| New `content/concepts/<id>.yaml`, and concept files your chapter's lessons already teach | concept files taught by other chapters |
| New `src/components/viz/<Scene>.tsx` + `src/components/widgets/<Scene>.astro` | `scene.tsx`, `HoldToPush`, `CancelTheArrow`, any existing widget or `*Lab.tsx` |
| New `src/lib/physics/<topic>.ts` + `src/lib/physics/__tests__/<topic>.test.ts` | edits to existing physics libs (import them; extend by adding a new file) |
| New `src/components/learn/scenarios/up-chNN-<name>.ts` | the big shared `*-scenarios.ts` files |

Do **not** run `git`, `npm run dev` or `npm run build`. Do not touch `AGENTS.md`, `package.json`,
or anything under `content/paths/computational-physics` / `linear-algebra` / `src/lib/numerics`.

**Name scenes distinctly** (check `ls src/components/widgets` first). A widget name is a
global tag, so pick something specific: `TiltUntilSlip`, not `Ramp`.

**Do not build lessons on the old large widgets**: `FbdBuilder`, `LinkedGraphs`,
`PotentialTrack`, `FieldCanvas`, `SteeringLab`, `ProjectileSplit`, `VectorFrame`,
`DimensionBalance`, `UnitChain`, `WorkArrows`, `WorkArea`, `ForceFromSlope`,
`OscillatorClock`. Their physics lives in `src/lib/physics/`, so import it from there into
your small scene.

## 4. Rules that bite

- **Rewriting an existing lesson:** keep its `teaches:` concept ids exactly. Other lessons
  `require` them. You may change titles, slugs, widget ids and everything else. Old widget
  ids may be retired.
- **Concepts are single-owner.** Before creating `content/concepts/<id>.yaml`, run
  `ls content/concepts/`. Teach only concepts that belong to *your* chapter. For an idea
  from another chapter, `requires:` it by its obvious id. A gap is fine, and the
  orchestrator reconciles gaps.
- **Misconceptions** go in your concept files (`id`, `name`, `signal`, `correction`). A
  `<Predict>` option may reference them with `misconception: '<id>'`, and an unknown id
  fails the build.
- **Widget ids** are `up-chNN-<something>`, globally unique. Put `id` first in the tag.
- **Props are JSON**: no functions, no JSX. Computed truths go in a scenario pack, computed
  from `src/lib/physics/`, never typed in.
- **YAML**: LaTeX in single quotes, and apostrophes doubled (`'Newton''s'`). **MDX**: write `≤`
  and `≥` in prose, never `<=` / `>=`.
- **Never animate through React state.** Drive loops from refs; throttle readouts to about
  8 Hz (see `HoldToPush`).
- **Every number a scene prints comes from `src/lib/physics/`**, and **every pedagogical
  claim has a vitest test.** A wrong simulation is a wrong lesson.
- Physics colours are fixed: `C.velocity` cyan, `C.accel` magenta, `C.force` amber,
  `C.position` iris, `C.energy` aqua, `C.field` orchid. Use `Stage equal` whenever angles
  or lengths must look true.

## 5. Verify before you report

1. `npm run content:check`. Fix every error in *your* files. Another chapter's
   half-written file may error temporarily; ignore it and do not edit it.
2. `npx vitest run src/lib/physics/__tests__/<your files>`: all green.
3. **Look at it.** Build and screenshot your lesson with every step shown:

   ```bash
   bash scripts/preview/preview.sh chNN /learn/university-physics/<chapter-slug>/<lesson-slug>
   ```

   The chapter slug is the directory name without its number prefix, and likewise the
   lesson slug. Then **Read every PNG** in `/tmp/anth-shots/chNN/`. Check that text is
   legible, nothing overlaps, arrows point where the physics says, every axis has a scale,
   and each scene has one obvious thing to do. The JSON it prints lists page errors; there
   must be none. If the build fails because of *another* chapter's file, wait a minute and
   retry.
4. **Drive each graded scene.** Copy `scripts/preview/shoot.mjs` to
   `scripts/preview/drive-chNN.mjs` and adapt it. Perform the wrong action,
   click Check and read the miss line. Then perform the right action, click Check and
   confirm it says Solved. Fix what you find and re-run.

## 6. Report back, briefly

- Lessons: title, slug, step count, minutes.
- Scenes built: name, what the learner does, and graded or not.
- Concepts created, and any `requires:` that is a gap.
- Tests added, and what they pin.
- What you verified in the browser, and **anything you could not make work**. Do not
  report success you did not see.
