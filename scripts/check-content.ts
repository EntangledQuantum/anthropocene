/**
 * Content validation gate.
 *
 * Astro's own build only checks frontmatter schemas. This checks the things
 * that actually keep the platform coherent:
 *
 *   - every concept has exactly one owning lesson (the never-re-teach rule)
 *   - no prerequisite cycles
 *   - every `requires` resolves, or is reported as a gap
 *   - every live lesson ships at least one graded interaction and one recall card
 *   - widget and card ids are unique and stable
 *
 * Run: npm run content:check          (fails the build on problems)
 *      npm run content:check -- --gaps  (also lists the to-write queue)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';

const ROOT = new URL('..', import.meta.url).pathname;
const CONTENT = join(ROOT, 'content');
const PATHS = join(CONTENT, 'paths');
const CONCEPTS = join(CONTENT, 'concepts');

const RED = '\x1b[31m', YEL = '\x1b[33m', GRN = '\x1b[32m', DIM = '\x1b[2m', OFF = '\x1b[0m', BOLD = '\x1b[1m';

interface Problem { level: 'error' | 'warn'; msg: string; detail?: string }
const problems: Problem[] = [];
const err = (msg: string, detail?: string) => problems.push({ level: 'error', msg, detail });
const warn = (msg: string, detail?: string) => problems.push({ level: 'warn', msg, detail });

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ── load concepts ─────────────────────────────────────────────────────── */
const concepts = new Map<string, { title: string; blurb: string }>();
/** misconception id → the concept that owns it */
const misconceptions = new Map<string, string>();
for (const file of walk(CONCEPTS).filter((f) => f.endsWith('.yaml'))) {
  const id = relative(CONCEPTS, file).replace(/\.yaml$/, '').split(sep).join('/');
  try {
    const data = parseYaml(readFileSync(file, 'utf8'));
    if (!data?.title || !data?.blurb) err(`concept "${id}" is missing title or blurb`);

    for (const m of (data?.misconceptions ?? []) as Record<string, string>[]) {
      if (!m.id || !m.name || !m.signal || !m.correction) {
        err(`concept "${id}" has a misconception missing id, name, signal or correction`);
        continue;
      }
      const prev = misconceptions.get(m.id);
      if (prev) err(`duplicate misconception id "${m.id}"`, `in ${prev} and ${id} — ids are referenced from lessons and must be unique`);
      else misconceptions.set(m.id, id);
    }
    // A tab or newline here means a LaTeX macro was written in a
    // double-quoted YAML scalar, where \t and \n are escape sequences.
    for (const [k, v] of Object.entries(data ?? {})) {
      if (typeof v === 'string' && /[\t\n\r\f\v]/.test(v)) {
        err(`concept "${id}" field "${k}" contains a control character`,
            `Use a single-quoted YAML scalar for LaTeX: notation: '\\tfrac{1}{2}'`);
      }
    }
    concepts.set(id, data);
  } catch (e) {
    err(`concept "${id}" is not valid YAML`, (e as Error).message);
  }
}

/* ── load lessons ──────────────────────────────────────────────────────── */
interface Lesson {
  id: string; file: string; title: string; status: string; tier: string;
  teaches: string[]; requires: string[];
  widgets: { id: string; kind: string }[]; cards: string[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const GRADED = ['Predict', 'Tune', 'SketchCurve', 'RankOrder', 'Classify', 'Estimate'];

const lessons: Lesson[] = [];
const referencedMisconceptions: { id: string; lesson: string }[] = [];
for (const file of walk(PATHS).filter((f) => f.endsWith('.mdx'))) {
  const id = relative(PATHS, file).replace(/\.mdx$/, '').split(sep).join('/');
  const raw = readFileSync(file, 'utf8');
  const fm = FRONTMATTER.exec(raw);
  if (!fm) { err(`lesson "${id}" has no frontmatter`); continue; }

  let data: Record<string, unknown>;
  try { data = parseYaml(fm[1]) ?? {}; }
  catch (e) { err(`lesson "${id}" frontmatter is not valid YAML`, (e as Error).message); continue; }

  const body = raw.slice(fm[0].length);
  const widgets: { id: string; kind: string }[] = [];
  for (const kind of GRADED) {
    for (const m of body.matchAll(new RegExp(`<${kind}\\b[^>]*?\\bid=["']([^"']+)["']`, 'g'))) {
      widgets.push({ id: m[1], kind });
    }
    // A graded widget with no id can never record progress.
    for (const m of body.matchAll(new RegExp(`<${kind}\\b((?:[^>"']|"[^"]*"|'[^']*')*?)>`, 'g'))) {
      if (!/\bid=/.test(m[1])) err(`lesson "${id}" has a <${kind}> with no id`);
    }
  }
  const cards = [...body.matchAll(/<Recall\b[^>]*?\bid=["']([^"']+)["']/g)].map((m) => m[1]);

  // A mistyped misconception id would silently drop the most useful feedback
  // a wrong answer can give, so it fails the build rather than degrading.
  for (const m of body.matchAll(/misconception:\s*['"]([^'"]+)['"]/g)) {
    referencedMisconceptions.push({ id: m[1], lesson: id });
  }

  lessons.push({
    id, file,
    title: String(data.title ?? ''),
    status: String(data.status ?? 'draft'),
    tier: String(data.tier ?? 'core'),
    teaches: (data.teaches as string[]) ?? [],
    requires: (data.requires as string[]) ?? [],
    widgets, cards,
  });
}

/* ── misconception references resolve ──────────────────────────────────── */
for (const ref of referencedMisconceptions) {
  if (!misconceptions.has(ref.id)) {
    err(`lesson "${ref.lesson}" references unknown misconception "${ref.id}"`,
        `add it under \`misconceptions:\` in a concept file, or fix the spelling`);
  }
}

/* ── the single-owner rule ─────────────────────────────────────────────── */
const owners = new Map<string, string>();
for (const l of [...lessons].sort((a, b) => a.id.localeCompare(b.id))) {
  for (const c of l.teaches) {
    const prev = owners.get(c);
    if (prev) {
      err(`concept "${c}" is taught by two lessons`,
          `${prev} and ${l.id} — one should link to the other rather than re-teach it`);
    } else {
      owners.set(c, l.id);
      if (!concepts.has(c)) err(`lesson "${l.id}" teaches unknown concept "${c}"`, `create content/concepts/${c}.yaml`);
    }
  }
}

/* ── gaps and edges ────────────────────────────────────────────────────── */
const gaps = new Map<string, string[]>();
const edges = new Map<string, string[]>();
for (const l of lessons) {
  const deps: string[] = [];
  for (const c of l.requires) {
    if (!concepts.has(c)) err(`lesson "${l.id}" requires unknown concept "${c}"`, `create content/concepts/${c}.yaml`);
    const owner = owners.get(c);
    if (!owner) { gaps.set(c, [...(gaps.get(c) ?? []), l.id]); continue; }
    if (owner !== l.id) deps.push(owner);
  }
  edges.set(l.id, deps);
}

/* ── cycles ────────────────────────────────────────────────────────────── */
{
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      err('prerequisite cycle', [...stack.slice(stack.indexOf(id)), id].join(' → '));
      return;
    }
    state.set(id, 1); stack.push(id);
    for (const d of edges.get(id) ?? []) visit(d);
    stack.pop(); state.set(id, 2);
  };
  for (const l of lessons) visit(l.id);
}

/* ── per-lesson requirements ───────────────────────────────────────────── */
const seenWidget = new Map<string, string>();
const seenCard = new Map<string, string>();
for (const l of lessons) {
  for (const w of l.widgets) {
    const prev = seenWidget.get(w.id);
    if (prev) err(`duplicate widget id "${w.id}"`, `in ${prev} and ${l.id} — ids must be globally unique, they key stored progress`);
    else seenWidget.set(w.id, l.id);
  }
  for (const c of l.cards) {
    const prev = seenCard.get(c);
    if (prev) err(`duplicate recall id "${c}"`, `in ${prev} and ${l.id} — a card id keys its FSRS schedule`);
    else seenCard.set(c, l.id);
  }

  if (l.status === 'live') {
    if (l.widgets.length === 0) warn(`lesson "${l.id}" is live but has no graded interaction`, 'learn-by-doing means at least one graded interaction: <Predict>, <Tune>, <SketchCurve>, <RankOrder>, <Classify> or <Estimate>');
    if (l.cards.length === 0) warn(`lesson "${l.id}" is live but has no <Recall> card`, 'nothing from this lesson will ever come back for review');
    if (l.teaches.length === 0) warn(`lesson "${l.id}" is live but owns no concept`, 'nothing can link to it');
  }
}

/* ── report ────────────────────────────────────────────────────────────── */
const errors = problems.filter((p) => p.level === 'error');
const warns = problems.filter((p) => p.level === 'warn');

console.log(
  `\n${BOLD}content check${OFF}  ${DIM}${lessons.length} lessons · ${concepts.size} concepts · ` +
  `${owners.size} taught · ${misconceptions.size} misconceptions${OFF}\n`,
);

for (const p of errors) {
  console.log(`${RED}✗${OFF} ${p.msg}`);
  if (p.detail) console.log(`  ${DIM}${p.detail}${OFF}`);
}
for (const p of warns) {
  console.log(`${YEL}!${OFF} ${p.msg}`);
  if (p.detail) console.log(`  ${DIM}${p.detail}${OFF}`);
}

if (gaps.size) {
  console.log(`\n${YEL}${BOLD}gaps — required but unwritten (${gaps.size})${OFF}`);
  for (const [c, wanted] of [...gaps].sort((a, b) => b[1].length - a[1].length)) {
    const meta = concepts.get(c);
    console.log(`  ${YEL}◇${OFF} ${BOLD}${c}${OFF} ${DIM}needed by ${wanted.length}${OFF}`);
    if (meta) console.log(`    ${DIM}${meta.blurb}${OFF}`);
  }
}

const unused = [...concepts.keys()].filter((c) => !owners.has(c) && !gaps.has(c));
if (process.argv.includes('--gaps') && unused.length) {
  console.log(`\n${DIM}${unused.length} concept(s) defined but neither taught nor required yet${OFF}`);
  for (const c of unused) console.log(`  ${DIM}· ${c}${OFF}`);
}

if (errors.length === 0 && warns.length === 0) {
  console.log(`${GRN}✓ no problems${OFF}`);
}
console.log(
  `\n${errors.length ? RED : GRN}${errors.length} error(s)${OFF} · ` +
  `${warns.length ? YEL : DIM}${warns.length} warning(s)${OFF} · ` +
  `${DIM}${gaps.size} gap(s)${OFF}\n`,
);

process.exit(errors.length > 0 ? 1 : 0);
