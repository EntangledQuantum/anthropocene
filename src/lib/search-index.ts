/** Shape of `/index.json`, shared by the palette and the concept graph. */

export interface IndexLesson {
  id: string; title: string; blurb: string; url: string;
  pathId: string; chapterId: string; tier: string; minutes: number;
  status: string; teaches: string[]; requires: string[];
}
export interface IndexConcept {
  id: string; title: string; blurb: string; notation: string | null;
  tags: string[]; ownerId: string | null; ownerUrl: string | null;
  usedBy: string[]; misconceptions: number;
}
export interface IndexChapter {
  id: string; title: string; blurb: string; question: string | null;
  url: string; lessonIds: string[];
}
export interface IndexPath {
  id: string; title: string; subtitle: string; blurb: string;
  url: string; accent: string; chapters: IndexChapter[];
}
export interface ContentIndex {
  paths: IndexPath[];
  lessons: IndexLesson[];
  concepts: IndexConcept[];
  edges: { from: string; to: string }[];
}

let cache: Promise<ContentIndex> | null = null;

/** Fetches the index once per page load. */
export function loadIndex(): Promise<ContentIndex> {
  if (!cache) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    cache = fetch(`${base}/index.json`).then((r) => {
      if (!r.ok) throw new Error(`index.json: ${r.status}`);
      return r.json() as Promise<ContentIndex>;
    });
  }
  return cache;
}

/* ── fuzzy matching ────────────────────────────────────────────────────────
   Subsequence matching with a score, which is what makes a palette feel
   quick: "vervsrk" should find "Verlet versus RK4". Consecutive characters
   and word-boundary hits score higher, so the intuitive abbreviation wins
   over an accidental scattered match.
   ──────────────────────────────────────────────────────────────────────── */

export interface FuzzyHit { score: number; positions: number[] }

export function fuzzyMatch(needle: string, haystack: string): FuzzyHit | null {
  if (!needle) return { score: 0, positions: [] };

  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();

  let score = 0;
  let hi = 0;
  let prevMatch = -2;
  const positions: number[] = [];

  for (let ni = 0; ni < n.length; ni++) {
    const ch = n[ni];
    if (ch === ' ') continue;

    const found = h.indexOf(ch, hi);
    if (found === -1) return null;

    score += 1;
    if (found === prevMatch + 1) score += 4;                       // consecutive
    if (found === 0 || /[\s\-/_.]/.test(h[found - 1])) score += 3; // word start

    positions.push(found);
    prevMatch = found;
    hi = found + 1;
  }

  // Prefer shorter targets: an exact-ish match on a short title beats a
  // scattered one buried in a long blurb.
  score -= Math.min(haystack.length / 24, 6);
  if (h.startsWith(n)) score += 10;
  if (h === n) score += 20;

  return { score, positions };
}
