import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyMatch, loadIndex, type ContentIndex } from '../../lib/search-index.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Spotlight for the whole site. ⌘K / Ctrl-K from anywhere.

   Thesis §7: "ask in your own words → route into the right lesson". A search
   PAGE makes finding something a destination you have to travel to first;
   a palette makes it a reflex you can fire mid-sentence without losing your
   place. Everything indexed — lessons, concepts, chapters, paths — with
   concepts showing which lesson owns them, so jumping to an idea lands you
   where it is actually taught.

   The index is fetched on first open, not on page load: nobody pays 35 KB
   for a feature they did not use.
   ───────────────────────────────────────────────────────────────────────── */

type Kind = 'lesson' | 'concept' | 'chapter' | 'path';

interface Row {
  kind: Kind;
  id: string;
  title: string;
  subtitle: string;
  url: string | null;
  /** Extra context shown on the right — where it lives, or who teaches it. */
  meta?: string;
  score: number;
}

const KIND_LABEL: Record<Kind, string> = {
  lesson: 'lesson', concept: 'concept', chapter: 'chapter', path: 'path',
};
const KIND_TONE: Record<Kind, string> = {
  lesson: 'var(--color-cyan)',
  concept: 'var(--color-orchid)',
  chapter: 'var(--color-iris)',
  path: 'var(--color-magenta)',
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<ContentIndex | null>(null);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  /* ── open / close ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" opens too, but never while the learner is typing into a widget.
      if (e.key === '/' && !open) {
        const el = document.activeElement;
        const typing = el instanceof HTMLElement &&
          (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        if (!typing) { e.preventDefault(); setOpen(true); }
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);

    // Anything can ask for the palette — the nav item does.
    const onOpen = () => setOpen(true);
    window.addEventListener('anthropocene:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('anthropocene:palette', onOpen);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    inputRef.current?.focus();
    inputRef.current?.select();
    if (!index && !failed) {
      loadIndex().then(setIndex).catch(() => setFailed(true));
    }
    // Stop the page scrolling behind the overlay.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, index, failed]);

  /* ── candidates ────────────────────────────────────────────────────────── */
  const rows = useMemo<Row[]>(() => {
    if (!index) return [];

    const lessonById = new Map(index.lessons.map((l) => [l.id, l]));
    const chapterTitle = new Map<string, string>();
    for (const p of index.paths) for (const c of p.chapters) chapterTitle.set(c.id, c.title);

    const candidates: Omit<Row, 'score'>[] = [
      ...index.paths.map((p) => ({
        kind: 'path' as const, id: p.id, title: p.title,
        subtitle: p.subtitle, url: p.url, meta: `${p.chapters.length} chapters`,
      })),
      ...index.paths.flatMap((p) =>
        p.chapters.map((c) => ({
          kind: 'chapter' as const, id: c.id, title: c.title,
          subtitle: c.question ?? c.blurb, url: c.url, meta: `${c.lessonIds.length} lessons`,
        })),
      ),
      ...index.lessons.map((l) => ({
        kind: 'lesson' as const, id: l.id, title: l.title,
        subtitle: l.blurb, url: l.url,
        meta: `${chapterTitle.get(l.chapterId) ?? ''} · ${l.minutes} min`,
      })),
      ...index.concepts.map((c) => ({
        kind: 'concept' as const, id: c.id, title: c.title,
        subtitle: c.blurb, url: c.ownerUrl,
        meta: c.ownerId
          ? `taught in ${lessonById.get(c.ownerId)?.title ?? c.ownerId}`
          : 'not yet written',
      })),
    ];

    if (!query.trim()) {
      // Empty query: show a useful starting set rather than nothing.
      return candidates
        .filter((c) => c.kind === 'path' || c.kind === 'chapter')
        .map((c) => ({ ...c, score: 0 }));
    }

    return candidates
      .map((c) => {
        const onTitle = fuzzyMatch(query, c.title);
        const onId = fuzzyMatch(query, c.id);
        const onSub = fuzzyMatch(query, c.subtitle);
        // Title matches dominate; a blurb hit is a weak signal on its own.
        const score = Math.max(
          onTitle ? onTitle.score + 8 : -Infinity,
          onId ? onId.score + 2 : -Infinity,
          onSub ? onSub.score * 0.35 : -Infinity,
        );
        return Number.isFinite(score) ? { ...c, score } : null;
      })
      .filter((r): r is Row => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);
  }, [index, query]);

  const go = useCallback((row: Row) => {
    if (!row.url) return;
    setOpen(false);
    window.location.href = row.url;
  }, []);

  /* ── keyboard nav ──────────────────────────────────────────────────────── */
  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = rows[active]; if (r) go(r); }
  };

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search everything"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'color-mix(in oklab, var(--color-void) 74%, transparent)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', justifyContent: 'center',
        padding: '12vh 20px 20px',
      }}
    >
      <div
        className="hud hud-brackets"
        style={{
          width: '100%', maxWidth: 680, height: 'fit-content', maxHeight: '72vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 30px 90px -20px rgba(0,0,0,0.85)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--color-rule)' }}>
          <span style={{ color: 'var(--color-magenta)', fontSize: 17 }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onInputKey}
            placeholder="Jump to a lesson, concept, chapter…"
            spellCheck={false}
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 'none',
              color: 'var(--color-ink)', fontFamily: 'var(--font-sans)', fontSize: '1.06rem',
            }}
          />
          <span className="hud-label" style={{ color: 'var(--color-ink-ghost)' }}>esc</span>
        </div>

        <div ref={listRef} style={{ overflowY: 'auto', padding: '8px 0' }}>
          {failed && (
            <p style={{ padding: '20px', margin: 0, color: 'var(--sig-warn)' }}>
              Could not load the index.
            </p>
          )}
          {!index && !failed && (
            <p className="hud-label" style={{ padding: '20px', margin: 0 }}>loading…</p>
          )}
          {index && rows.length === 0 && (
            <div style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 10px', color: 'var(--color-ink-soft)' }}>
                Nothing matches “{query}”.
              </p>
              <a href={`${base}/search/`} className="hud-label" style={{ color: 'var(--color-cyan)' }}>
                search the full text instead →
              </a>
            </div>
          )}

          {rows.map((row, i) => (
            <button
              key={`${row.kind}:${row.id}`}
              type="button"
              data-active={i === active ? 'true' : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(row)}
              disabled={!row.url}
              style={{
                display: 'flex', width: '100%', gap: 14, alignItems: 'baseline',
                padding: '11px 20px', textAlign: 'left', border: 0, cursor: row.url ? 'pointer' : 'not-allowed',
                background: i === active ? 'color-mix(in oklab, var(--color-cyan) 10%, transparent)' : 'transparent',
                borderLeft: `2px solid ${i === active ? KIND_TONE[row.kind] : 'transparent'}`,
                font: 'inherit', opacity: row.url ? 1 : 0.5,
              }}
            >
              <span className="hud-label" style={{ color: KIND_TONE[row.kind], minWidth: 62, flexShrink: 0 }}>
                {KIND_LABEL[row.kind]}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: 'var(--color-ink)', fontSize: '1rem' }}>{row.title}</span>
                <span style={{
                  display: 'block', color: 'var(--color-ink-faint)', fontSize: '0.9rem',
                  marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {row.subtitle}
                </span>
              </span>
              {row.meta && (
                <span className="hud-label" style={{ flexShrink: 0, color: 'var(--color-ink-ghost)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.meta}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 18, padding: '10px 20px', borderTop: '1px solid var(--color-rule)', flexWrap: 'wrap' }}>
          <span className="hud-label">↑↓ move</span>
          <span className="hud-label">⏎ open</span>
          <a href={`${base}/graph/`} className="hud-label" style={{ marginLeft: 'auto', color: 'var(--color-orchid)', textDecoration: 'none' }}>
            see the whole graph →
          </a>
        </div>
      </div>
    </div>
  );
}
