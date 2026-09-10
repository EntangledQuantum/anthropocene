import { getCollection, type CollectionEntry } from 'astro:content';
import type { Tier } from '../../content.config.ts';

/* The glob loader derives ids from paths relative to `content/paths`:
     computational-physics/path                              → a path
     computational-physics/02-derivatives/chapter            → a chapter
     computational-physics/02-derivatives/01-finite-diff     → a lesson       */

export interface LessonNode {
  /** Stable global id, e.g. "computational-physics/02-derivatives/01-finite-diff". */
  id: string;
  pathId: string;
  chapterId: string;
  /** Last path segment, used in URLs. */
  slug: string;
  url: string;
  title: string;
  blurb: string;
  order: number;
  tier: Tier;
  minutes: number;
  teaches: string[];
  requires: string[];
  runtime: 'none' | 'python';
  status: 'draft' | 'live';
  /** Ids of the graded widgets authored in this lesson, scanned from the MDX
   *  source at build time. Progress must NOT be derived from which widgets
   *  have hydrated: `client:visible` islands only register once scrolled into
   *  view, so a hydration-derived total reads "0 / 1" on a page with six. */
  widgets: { id: string; kind: string }[];
  entry: CollectionEntry<'lessons'>;
}

export interface ChapterNode {
  id: string;
  pathId: string;
  slug: string;
  url: string;
  title: string;
  blurb: string;
  question?: string;
  order: number;
  status: 'draft' | 'live';
  lessons: LessonNode[];
  minutes: number;
}

export interface PathNode {
  id: string;
  slug: string;
  url: string;
  title: string;
  subtitle: string;
  blurb: string;
  accent: 'magenta' | 'cyan' | 'iris' | 'orchid' | 'aqua';
  status: 'draft' | 'live';
  chapters: ChapterNode[];
  lessons: LessonNode[];
  minutes: number;
}

export interface Misconception {
  id: string;
  name: string;
  signal: string;
  correction: string;
}

export interface ConceptNode {
  id: string;
  title: string;
  blurb: string;
  notation?: string;
  tags: string[];
  misconceptions: Misconception[];
  references: { label: string; url: string }[];
  /** The single lesson that owns this concept, if one has been written. */
  ownerId?: string;
  /** Lessons that list this concept in `requires`. */
  usedBy: string[];
}

export interface GraphIssue {
  kind: 'duplicate-owner' | 'gap' | 'cycle' | 'orphan-concept' | 'dangling-chapter';
  message: string;
  detail?: string;
}

export interface Graph {
  paths: PathNode[];
  lessons: Map<string, LessonNode>;
  concepts: Map<string, ConceptNode>;
  /** conceptId → id of the lesson that teaches it. */
  owners: Map<string, string>;
  /** lessonId → lesson ids it depends on (resolved through concepts). */
  prereqs: Map<string, string[]>;
  /** Topologically sorted lesson ids; the canonical study order. */
  order: string[];
  issues: GraphIssue[];
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const href = (...parts: string[]) => `${BASE}/${parts.join('/')}/`;

/** "computational-physics/02-derivatives/chapter" → parts before the filename. */
const dirOf = (id: string) => id.split('/').slice(0, -1);

/** Strips a leading "NN-" ordering prefix for use in URLs. */
export const unprefix = (s: string) => s.replace(/^\d+-/, '');

/** Widgets that count toward lesson completion. `<Recall>` is scheduled by
 *  FSRS rather than graded, and `<Explore>` is deliberately ungraded. */
const GRADED_WIDGETS = ['Predict', 'Tune', 'SketchCurve', 'RankOrder', 'Classify', 'Estimate'] as const;

/** Scans lesson source for graded widget usages and their `id` props.
 *  Deliberately a scan and not a parse: the id must be a plain string literal
 *  in the source, which `check-content` also enforces. */
export function scanWidgets(body: string): { id: string; kind: string }[] {
  const found: { id: string; kind: string }[] = [];
  for (const kind of GRADED_WIDGETS) {
    // <Predict ... id="foo" ...>  — attributes may precede or follow `id`.
    const re = new RegExp(`<${kind}\\b[^>]*?\\bid=["']([^"']+)["']`, 'g');
    for (const m of body.matchAll(re)) found.push({ id: m[1], kind });
  }
  return found;
}

let cached: Graph | null = null;

export async function buildGraph(): Promise<Graph> {
  if (cached) return cached;

  const [pathEntries, chapterEntries, lessonEntries, conceptEntries] = await Promise.all([
    getCollection('paths'),
    getCollection('chapters'),
    getCollection('lessons'),
    getCollection('concepts'),
  ]);

  const issues: GraphIssue[] = [];

  /* ── concepts ─────────────────────────────────────────────────────────── */
  const concepts = new Map<string, ConceptNode>();
  for (const e of conceptEntries) {
    concepts.set(e.id, { id: e.id, ...e.data, usedBy: [] });
  }

  /* ── lessons ──────────────────────────────────────────────────────────── */
  const lessons = new Map<string, LessonNode>();
  for (const e of lessonEntries) {
    const parts = e.id.split('/');
    if (parts.length < 3) continue;
    const [pathId, chapterDir] = parts;
    const slug = unprefix(parts[parts.length - 1]);
    lessons.set(e.id, {
      id: e.id,
      pathId,
      chapterId: `${pathId}/${chapterDir}`,
      slug,
      url: href('learn', pathId, unprefix(chapterDir), slug),
      title: e.data.title,
      blurb: e.data.blurb,
      order: e.data.order,
      tier: e.data.tier,
      minutes: e.data.minutes,
      teaches: e.data.teaches,
      requires: e.data.requires,
      runtime: e.data.runtime,
      status: e.data.status,
      widgets: scanWidgets(e.body ?? ''),
      entry: e,
    });
  }

  /* ── concept ownership: the single-owner rule ─────────────────────────── */
  const owners = new Map<string, string>();
  for (const lesson of [...lessons.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const conceptId of lesson.teaches) {
      const existing = owners.get(conceptId);
      if (existing) {
        issues.push({
          kind: 'duplicate-owner',
          message: `Concept "${conceptId}" is taught by two lessons.`,
          detail: `${existing} and ${lesson.id} — one of them should link to the other instead of re-teaching it.`,
        });
        continue;
      }
      owners.set(conceptId, lesson.id);
      const c = concepts.get(conceptId);
      if (c) c.ownerId = lesson.id;
      else
        issues.push({
          kind: 'orphan-concept',
          message: `Lesson "${lesson.id}" teaches "${conceptId}", which has no concept file.`,
          detail: `Create content/concepts/${conceptId}.yaml`,
        });
    }
  }

  /* ── prerequisite edges, resolved through concepts ────────────────────── */
  const prereqs = new Map<string, string[]>();
  for (const lesson of lessons.values()) {
    const deps = new Set<string>();
    for (const conceptId of lesson.requires) {
      const c = concepts.get(conceptId);
      if (c) c.usedBy.push(lesson.id);

      const ownerId = owners.get(conceptId);
      if (!ownerId) {
        issues.push({
          kind: 'gap',
          message: `"${conceptId}" is required by ${lesson.id} but no lesson teaches it.`,
          detail: c ? `Concept exists: "${c.blurb}"` : `No concept file either.`,
        });
        continue;
      }
      if (ownerId !== lesson.id) deps.add(ownerId);
    }
    prereqs.set(lesson.id, [...deps]);
  }

  /* ── topological order (Kahn), with cycle reporting ───────────────────── */
  const order = topoSort(lessons, prereqs, issues);

  /* ── assemble paths → chapters → lessons ──────────────────────────────── */
  const chaptersById = new Map<string, ChapterNode>();
  for (const e of chapterEntries) {
    const dir = dirOf(e.id);
    if (dir.length < 2) continue;
    const pathId = dir[0];
    const chapterDir = dir[dir.length - 1];
    const id = `${pathId}/${chapterDir}`;
    chaptersById.set(id, {
      id,
      pathId,
      slug: unprefix(chapterDir),
      url: href('learn', pathId, unprefix(chapterDir)),
      title: e.data.title,
      blurb: e.data.blurb,
      question: e.data.question,
      order: e.data.order,
      status: e.data.status,
      lessons: [],
      minutes: 0,
    });
  }

  for (const lesson of lessons.values()) {
    const ch = chaptersById.get(lesson.chapterId);
    if (!ch) {
      issues.push({
        kind: 'dangling-chapter',
        message: `Lesson "${lesson.id}" has no chapter.yaml.`,
        detail: `Create content/paths/${lesson.chapterId}/chapter.yaml`,
      });
      continue;
    }
    ch.lessons.push(lesson);
  }
  for (const ch of chaptersById.values()) {
    ch.lessons.sort((a, b) => a.order - b.order);
    ch.minutes = ch.lessons.reduce((n, l) => n + l.minutes, 0);
  }

  const paths: PathNode[] = [];
  for (const e of pathEntries) {
    const pathId = dirOf(e.id)[0];
    if (!pathId) continue;
    const own = [...chaptersById.values()].filter((c) => c.pathId === pathId);

    // Explicit `chapters:` order wins; anything unlisted sorts after by `order`.
    const rank = new Map(e.data.chapters.map((dir, i) => [`${pathId}/${dir}`, i]));
    own.sort((a, b) => {
      const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ra !== rb ? ra - rb : a.order - b.order;
    });

    const all = own.flatMap((c) => c.lessons);
    paths.push({
      id: pathId,
      slug: pathId,
      url: href('learn', pathId),
      title: e.data.title,
      subtitle: e.data.subtitle,
      blurb: e.data.blurb,
      accent: e.data.accent,
      status: e.data.status,
      chapters: own,
      lessons: all,
      minutes: all.reduce((n, l) => n + l.minutes, 0),
    });
  }
  paths.sort((a, b) => a.title.localeCompare(b.title));

  cached = { paths, lessons, concepts, owners, prereqs, order, issues };
  return cached;
}

function topoSort(
  lessons: Map<string, LessonNode>,
  prereqs: Map<string, string[]>,
  issues: GraphIssue[],
): string[] {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of lessons.keys()) {
    indegree.set(id, 0);
    dependents.set(id, []);
  }
  for (const [id, deps] of prereqs) {
    for (const dep of deps) {
      if (!lessons.has(dep)) continue;
      indegree.set(id, (indegree.get(id) ?? 0) + 1);
      dependents.get(dep)!.push(id);
    }
  }

  // Deterministic: among ready lessons, take the lowest id.
  const ready = [...indegree].filter(([, n]) => n === 0).map(([id]) => id).sort();
  const out: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    out.push(id);
    for (const next of dependents.get(id) ?? []) {
      const n = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, n);
      if (n === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }

  if (out.length !== lessons.size) {
    const stuck = [...lessons.keys()].filter((id) => !out.includes(id)).sort();
    issues.push({
      kind: 'cycle',
      message: `Prerequisite cycle among ${stuck.length} lesson(s).`,
      detail: stuck.join(', '),
    });
    out.push(...stuck);
  }
  return out;
}

/** Prereq lessons for one lesson, in study order. */
export function prerequisitesOf(graph: Graph, lessonId: string): LessonNode[] {
  return (graph.prereqs.get(lessonId) ?? [])
    .map((id) => graph.lessons.get(id))
    .filter((l): l is LessonNode => Boolean(l))
    .sort((a, b) => graph.order.indexOf(a.id) - graph.order.indexOf(b.id));
}

/** Lessons that build directly on this one. */
export function unlockedBy(graph: Graph, lessonId: string): LessonNode[] {
  const out: LessonNode[] = [];
  for (const [id, deps] of graph.prereqs) {
    if (deps.includes(lessonId)) {
      const l = graph.lessons.get(id);
      if (l) out.push(l);
    }
  }
  return out.sort((a, b) => graph.order.indexOf(a.id) - graph.order.indexOf(b.id));
}
