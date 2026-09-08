# anthropocene

A free, open-source, deeply interactive learning platform. Learn by doing — without the
ceiling.

Brilliant proved that short interactive problems beat reading. It also charges a lot and
stops well short of the material a practitioner actually needs. This keeps the
interaction model and removes the ceiling: every topic runs from foundation to frontier
on one page, and you choose the depth.

**Live:** https://entangledquantum.github.io/anthropocene/

## What makes it different

- **Predict → run → confront.** You commit to an answer *before* the simulation runs.
  Watching your prediction fail is the mechanism; a paragraph cannot do it.
- **Graded on behaviour, not on syntax.** Code challenges measure the convergence order
  your implementation actually achieves. Any correct method passes. A plausible one that
  is secretly second-order does not.
- **One concept, one owner.** A concept is taught by exactly one lesson, enforced at build
  time. Everything else links to it — so the material never repeats itself, and the list
  of unwritten topics is generated rather than maintained.
- **Foundation to frontier in one lesson.** `<Tier>` blocks fold away the depth until you
  ask for it.
- **Recall built in.** Cards are authored inline where the idea appears and scheduled with
  FSRS-6.
- **Yours, locally.** XP, streaks and review state live in SQLite in your browser. No
  account, no server, no subscription, works offline.

## Stack

| | |
|---|---|
| Framework | Astro 7 + React islands — 0 JS on prose, hydration per widget |
| Math | KaTeX rendered at **build time** via Satteri's native math support |
| Plots | Canvas data layer + SVG axes on `d3-scale` / `d3-shape` |
| 3D | `three.js` + `@react-three/fiber`, WebGPU where available |
| Storage | SQLite-WASM (`opfs-sahpool` VFS — no COOP/COEP, so it works on GitHub Pages) |
| Recall | `ts-fsrs` (FSRS-6) |
| Search | Pagefind — chunked index, downloads only what a query needs |
| Python | Pyodide, lazy, opt-in per lesson |

## Run it

```bash
npm install
npm run dev          # http://localhost:4321/anthropocene
```

```bash
npm run content:check   # concept-graph rules, gaps, per-lesson requirements
npm test                # asserts the physics: orders, stability, energy drift
npm run build           # runs content:check first
```

## Adding content

Read **[AGENTS.md](AGENTS.md)**. It is the authoring contract — widget vocabulary, the
never-re-teach rule, and the architectural constraints that will otherwise cost you an
hour.

```bash
npm run new:lesson -- --path computational-physics --chapter 03-ode-solvers \
  --id 05-dormand-prince --title "Adaptive steps in practice" \
  --teaches embedded-pairs --requires rk4,butcher-tableau
```

If the path does not exist, it is created. Give it a category and it builds the learning
path around it.

## Content

`content/` is fully separate from `src/`. Nothing in it imports app code and nothing in
`src/` hardcodes a lesson.

The first path is **Computational Physics**: floating point → finite differences → ODE
solvers one at a time → structure-preserving integrators → spectral, variational, Monte
Carlo and differentiable simulation.

## Licence

MIT for the code. Content under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
