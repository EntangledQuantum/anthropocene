/**
 * Content scaffolder.
 *
 *   npm run new:path    -- --id quantum-computing --title "Quantum Computing"
 *   npm run new:chapter -- --path quantum-computing --id 01-qubits --title "Qubits"
 *   npm run new:lesson  -- --path quantum-computing --chapter 01-qubits \
 *                          --id 01-superposition --title "Superposition" \
 *                          --teaches qubit,superposition --requires complex-numbers
 *   npm run new:concept -- --id qubit --title "Qubit" --blurb "..."
 *
 * Creating a lesson under a path that does not exist creates the path too, so
 * "give it a category and it makes a learning path" is one command.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CONTENT = join(ROOT, 'content');

const GRN = '\x1b[32m', DIM = '\x1b[2m', YEL = '\x1b[33m', OFF = '\x1b[0m';

function args(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith('--') ? (i++, next) : 'true';
  }
  return out;
}

/** YAML single-quoted scalar — no escape processing, so LaTeX survives. */
const sq = (v: string) => `'${v.replace(/'/g, "''")}'`;
const list = (items: string[]) => (items.length ? items.map((i) => `\n  - '${i}'`).join('') : ' []');
const split = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

function write(path: string, body: string, what: string) {
  if (existsSync(path)) { console.log(`${YEL}!${OFF} ${what} already exists — left alone\n  ${DIM}${path}${OFF}`); return false; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  console.log(`${GRN}✓${OFF} ${what}\n  ${DIM}${path}${OFF}`);
  return true;
}

const a = args();
const mode = process.env.NEW_KIND ?? a.kind;
const need = (k: string) => {
  if (!a[k]) { console.error(`missing --${k}`); process.exit(1); }
  return a[k];
};

const slug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.replace(/^\d+-/, ''));

if (mode === 'concept') {
  const id = need('id');
  write(join(CONTENT, 'concepts', `${id}.yaml`),
`title: ${sq(a.title ?? id)}
blurb: ${sq(a.blurb ?? 'One sentence, plain language. Shown in hovercards and the gap report.')}
${a.notation ? `notation: ${sq(a.notation)}\n` : ''}tags:${list(split(a.tags))}
`, `concept "${id}"`);
}

if (mode === 'path' || mode === 'lesson' || mode === 'chapter') {
  const pathId = need(mode === 'path' ? 'id' : 'path');
  if (!slug(pathId)) { console.error(`path id "${pathId}" must be lowercase-hyphenated`); process.exit(1); }

  // A path is created implicitly when a lesson names one that does not exist.
  write(join(CONTENT, 'paths', pathId, 'path.yaml'),
`title: ${sq(a.title ?? pathId)}
subtitle: ${sq(a.subtitle ?? 'what this path is really about')}
blurb: >-
  ${a.blurb ?? 'Two or three sentences. What you will be able to do afterwards, and what makes this path different from a textbook chapter on the same subject.'}
accent: ${sq(a.accent ?? 'cyan')}
status: 'draft'
chapters: []
`, `path "${pathId}"`);
}

if (mode === 'chapter' || mode === 'lesson') {
  const pathId = need('path');
  const chapterId = need(mode === 'chapter' ? 'id' : 'chapter');

  write(join(CONTENT, 'paths', pathId, chapterId, 'chapter.yaml'),
`title: ${sq(a.chapterTitle ?? a.title ?? chapterId)}
question: ${sq(a.question ?? 'The question this chapter exists to answer.')}
blurb: >-
  ${a.chapterBlurb ?? 'Why this chapter comes here, and what changes once you have it.'}
order: ${a.order ?? Number(chapterId.match(/^(\d+)/)?.[1] ?? 1)}
status: 'draft'
`, `chapter "${pathId}/${chapterId}"`);
}

if (mode === 'lesson') {
  const pathId = need('path');
  const chapterId = need('chapter');
  const id = need('id');
  const title = a.title ?? id;
  const teaches = split(a.teaches);
  const requires = split(a.requires);

  // Concept files referenced but absent are created as stubs, so the graph
  // stays resolvable and `content:check` has something to report against.
  for (const c of [...teaches, ...requires]) {
    const p = join(CONTENT, 'concepts', `${c}.yaml`);
    if (!existsSync(p)) {
      writeFileSync(p, `title: ${sq(c.replace(/-/g, ' '))}\nblurb: 'TODO: one sentence, plain language.'\ntags: []\n`);
      console.log(`${GRN}✓${OFF} concept stub "${c}"\n  ${DIM}${p}${OFF}`);
    }
  }

  write(join(CONTENT, 'paths', pathId, chapterId, `${id}.mdx`),
`---
title: ${sq(title)}
blurb: ${sq(a.blurb ?? 'One line. What the learner will be able to do, not what the lesson covers.')}
order: ${a.order ?? Number(id.match(/^(\\d+)/)?.[1] ?? 1)}
tier: ${sq(a.tier ?? 'core')}
minutes: ${a.minutes ?? 20}
teaches:${list(teaches)}
requires:${list(requires)}
runtime: ${sq(a.runtime ?? 'none')}
status: 'draft'
---

Open with the tension, not the definition. What does the reader currently believe that
this lesson is going to complicate?

## The idea

Build it up. Use \`$inline$\` and \`$$display$$\` for math.

<Predict
  id="${id}-first-prediction"
  question="Ask something the reader can be productively wrong about."
  options={[
    { key: 'a', label: 'The intuitive answer', why: 'Why it is tempting, and exactly where it breaks.' },
    { key: 'b', label: 'The correct answer', why: 'Why it is right, in one or two sentences.' },
  ]}
  correct="b"
>

The payoff, revealed only after they commit. Usually a simulation.

</Predict>

<Recall id="${id}-card" concept="${teaches[0] ?? 'TODO'}">
  <div slot="front">The question to answer from memory in three months.</div>

The answer, written so it teaches rather than merely confirms.

</Recall>

<Tier level="advanced">

The treatment for someone who already has the working version. Derivations, edge cases,
the reason the standard explanation is a simplification.

</Tier>

## What to carry forward

Two or three lines connecting to what comes next.
`, `lesson "${pathId}/${chapterId}/${id}"`);

  console.log(`\n${DIM}next: add "${chapterId}" to content/paths/${pathId}/path.yaml chapters, then run npm run content:check${OFF}`);
}

if (!mode) {
  console.error('usage: npm run new:path | new:chapter | new:lesson | new:concept -- --help');
  process.exit(1);
}
