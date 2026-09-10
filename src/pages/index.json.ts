import type { APIRoute } from 'astro';
import { buildGraph } from '../lib/graph/graph.ts';

/**
 * The whole content graph as one JSON document.
 *
 * Consumed by the command palette (which needs to jump anywhere) and by the
 * concept graph (which needs the edges). Emitted once at build time and
 * fetched lazily, so no page pays for it up front and both features stay in
 * sync with the content automatically — adding a lesson re-indexes both with
 * no extra step.
 */
export const GET: APIRoute = async () => {
  const graph = await buildGraph();

  const lessons = [...graph.lessons.values()].map((l) => ({
    id: l.id,
    title: l.title,
    blurb: l.blurb,
    url: l.url,
    pathId: l.pathId,
    chapterId: l.chapterId,
    tier: l.tier,
    minutes: l.minutes,
    status: l.status,
    teaches: l.teaches,
    requires: l.requires,
  }));

  const concepts = [...graph.concepts.values()].map((c) => ({
    id: c.id,
    title: c.title,
    blurb: c.blurb,
    notation: c.notation ?? null,
    tags: c.tags,
    ownerId: c.ownerId ?? null,
    ownerUrl: c.ownerId ? (graph.lessons.get(c.ownerId)?.url ?? null) : null,
    usedBy: c.usedBy,
    misconceptions: c.misconceptions.length,
  }));

  /* Concept-level edges: A → B when the lesson that teaches B requires A.
     Drawing dependencies between CONCEPTS rather than lessons is what makes
     the picture worth looking at — a lesson teaching four ideas would
     otherwise collapse four distinct relationships into one fat node. */
  const edges: { from: string; to: string }[] = [];
  for (const lesson of graph.lessons.values()) {
    for (const taught of lesson.teaches) {
      for (const required of lesson.requires) {
        if (required !== taught) edges.push({ from: required, to: taught });
      }
    }
  }

  const paths = graph.paths.map((p) => ({
    id: p.id,
    title: p.title,
    subtitle: p.subtitle,
    blurb: p.blurb,
    url: p.url,
    accent: p.accent,
    chapters: p.chapters.map((c) => ({
      id: c.id,
      title: c.title,
      blurb: c.blurb,
      question: c.question ?? null,
      url: c.url,
      lessonIds: c.lessons.map((l) => l.id),
    })),
  }));

  return new Response(JSON.stringify({ paths, lessons, concepts, edges }), {
    headers: { 'content-type': 'application/json' },
  });
};
