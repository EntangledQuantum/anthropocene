import { useState, type ReactNode } from 'react';

export type TierLevel = 'foundation' | 'core' | 'advanced' | 'frontier';

const TONE: Record<TierLevel, string> = {
  foundation: 'var(--color-cyan)',
  core: 'var(--color-ink-soft)',
  advanced: 'var(--color-violet)',
  frontier: 'var(--color-magenta)',
};

const BLURB: Record<TierLevel, string> = {
  foundation: 'the version you need before anything else makes sense',
  core: 'the working understanding',
  advanced: 'where it stops being a recipe',
  frontier: 'open questions and current practice',
};

/**
 * Depth-gated content inside a single lesson.
 *
 * This is what keeps a topic from bottoming out. One page carries the
 * first-pass explanation and the graduate-level treatment of the same idea,
 * and the learner chooses how far down to go — rather than the platform
 * deciding that everyone gets the shallow version.
 *
 * Collapsed by default for `advanced` and `frontier`, open for the rest.
 */
export default function Tier({
  level, children, title,
}: { level: TierLevel; children: ReactNode; title?: string }) {
  const deep = level === 'advanced' || level === 'frontier';
  const [open, setOpen] = useState(!deep);

  return (
    <section
      className="not-prose"
      style={{
        margin: '1.75rem 0',
        borderLeft: `2px solid ${TONE[level]}`,
        paddingLeft: 16,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 10, width: '100%',
          background: 'none', border: 0, padding: '2px 0 8px', cursor: 'pointer',
          textAlign: 'left', font: 'inherit',
        }}
        aria-expanded={open}
      >
        <span className="hud-label" style={{ color: TONE[level] }}>
          {open ? '▾' : '▸'} {level}
        </span>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-faint)' }}>
          {title ?? BLURB[level]}
        </span>
      </button>

      {open && <div className="prose-anth" style={{ maxWidth: 'none' }}>{children}</div>}
    </section>
  );
}
