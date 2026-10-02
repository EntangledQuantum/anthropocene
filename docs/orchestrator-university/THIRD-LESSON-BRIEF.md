# Addendum: adding a third lesson to a finished chapter

Read `AGENT-BRIEF.md` first and follow all of it. This page changes only what differs when
the chapter already has two finished lessons and you are adding **one** more.

## What you ship

**One new lesson, `03-<slug>.mdx`, `order: 3`**, in the same focused shape: 5–8 `<Step>`s,
8–12 minutes, at least one purpose-built scene (aim for two), at least half the graded
decisions actions in the world, 1–2 `<Recall>` cards, `## What to carry forward` at the end.

## How to choose it

1. Read the chapter's two existing lessons **in full**, their scenes, and the concepts they
   `teach`. Then read the chapter's block in `docs/university-physics-curriculum.md`.
2. Pick the most important idea from the curriculum's lesson list that the two lessons do
   **not** already teach. Prefer an idea that later chapters lean on, or one with a famous
   misconception the chapter has not yet confronted. The orchestrator's prompt names a
   suggestion; you may pick a better one if you can say why in your report.
3. It must feel different from the two existing lessons: a different kind of opening bet,
   a different verb in the main scene, and a different kind of last exercise. Do not reuse
   either existing lesson's scenes as a graded task. You may show one as an ungraded picture.

## Files

- You may create the new lesson, new scenes, new libs + tests, new concept files and a new
  scenario pack `up-chNN-l3-<name>.ts`.
- **In lesson 2 you may change one thing only:** the single "Next: …" line at the end, so it
  points to your lesson. Your lesson's own "Next:" line points to the next chapter's first
  lesson (read its title). In chapter 44, close the path instead.
- Do not edit the existing lessons otherwise, their scenes, or any other chapter's files.
- Widget ids: `up-chNN-l3-<something>`.
- **Concepts:** teach only new concept ids. Run `ls content/concepts` and grep the path for
  `teaches:` before creating one; if another lesson owns it, `require` it instead.

## The graph rule, again

The owner's standing complaint is generic graphs. The learner acts on the real thing (a
block, a wave, a lens, a circuit, an atom), and any graph is a live record beside it. Never
make the learner draw, reshape or drag points on a graph, and never ship a scene that is only
axes and a line.

## Verify and report

As `AGENT-BRIEF.md` §5–6, with the preview route
`/learn/university-physics/<chapter-slug>/<your-lesson-slug>`. Report also which curriculum
idea you chose and why.
