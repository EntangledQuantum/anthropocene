import { useMemo, useState } from 'react';
import {
  BASE,
  DIMENSIONLESS,
  QUANTITIES,
  QUANTITY_TABLE,
  type Dimension,
  type Term,
  dimEqual,
  dimSymbol,
  divDim,
  evaluateMonomial,
  monomialLabel,
  searchMonomials,
  siUnitSymbol,
} from '../../lib/physics/dimensions.ts';
import { Button, Panel, Readout, ReadoutRow } from './controls.tsx';

/* ── the dimension ledger ──────────────────────────────────────────────────
   Chapter 1's first world. The learner assembles a product of physical
   quantities by stepping each one's exponent, and the ledger reports where the
   expression lands in the seven-dimensional space of base dimensions.

   Two questions, one world:

     mode="build"    hit a target dimension with the palette you are given
     mode="balance"  match a fixed side of an equation you cannot edit

   Everything printed here comes from `src/lib/physics/dimensions.ts` — the
   exponent arithmetic, the mismatch, the name of the mismatch, and in build
   mode the exhaustive search that establishes the answer is unique. Nothing is
   typed in, which matters: the claim "the period cannot depend on mass" is the
   RESULT of a search over the whole exponent grid, not a sentence.

   No animation loop, so ordinary state is safe here: every change is a
   discrete click or key press by the learner.
   ──────────────────────────────────────────────────────────────────────── */

export interface DimensionBalanceProps {
  /** 'build' hits a target dimension; 'balance' matches a fixed reference side. */
  mode?: 'build' | 'balance';
  /** Palette keys into `QUANTITIES` — the tiles the learner may use. */
  palette: string[];
  /** Starting exponents, keyed by palette key. Anything omitted starts at 0. */
  initial?: Record<string, number>;
  /** balance mode: the side of the equation that is given. */
  reference?: { label: string; terms: Record<string, number> };
  /** build mode: the dimension to reach, named by a quantity key. */
  target?: string;
  /** Exponent limits and granularity. Halves by default, because roots happen. */
  range?: number;
  step?: number;
  title?: string;
  caption?: string;
  /** Read-only figure: show the expression, hide the steppers. */
  locked?: boolean;
}

const EPS = 1e-9;

/** Name a dimension if any everyday quantity sits on the same point. Used for
 *  the diagnostic: "you are short by L T⁻¹ — that is a velocity." */
function nameOf(d: Dimension): string | null {
  if (dimEqual(d, DIMENSIONLESS)) return 'a pure number';
  const hit = Object.values(QUANTITIES).find((q) => dimEqual(q.dim, d));
  if (!hit) return null;
  const vowel = /^[aeiou]/i.test(hit.label);
  return `${vowel ? 'an' : 'a'} ${hit.label}`;
}

/** `+1`, `−1/2`, `0`. Plain text rather than superscripts: in the stepper
 *  column these are values being changed, not exponents being read. */
function fmtExp(e: number): string {
  if (Math.abs(e) < EPS) return '0';
  const a = Math.abs(e);
  const halves = Math.round(a * 2);
  const body = Number.isInteger(a) ? String(a) : Math.abs(halves / 2 - a) < EPS ? `${halves}/2` : String(a);
  return `${e > 0 ? '+' : '−'}${body}`;
}

/** One quantity, one exponent. Steppers rather than a slider: exponents are
 *  discrete and the learner should feel them click. */
function ExponentRow({
  label, symbol, dimText, value, step, range, locked, onChange,
}: {
  label: string; symbol: string; dimText: string;
  value: number; step: number; range: number; locked: boolean;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(Math.max(-range, Math.min(range, Math.round(v / step) * step)));
  const active = Math.abs(value) > EPS;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) auto',
        alignItems: 'center',
        gap: 10,
        padding: '6px 8px',
        borderRadius: 8,
        border: `1px solid ${active ? 'color-mix(in oklab, var(--color-cyan) 40%, transparent)' : 'var(--color-rule)'}`,
        background: active ? 'color-mix(in oklab, var(--color-cyan) 7%, transparent)' : 'transparent',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--color-ink)' }}>
          <span className="readout" style={{ color: 'var(--color-aqua)', fontSize: 14 }}>{symbol}</span>
          <span style={{ color: 'var(--color-ink-soft)' }}>{'  '}{label}</span>
        </div>
        <div className="readout" style={{ fontSize: 11, color: 'var(--color-ink-faint)' }}>{dimText}</div>
      </div>

      {locked ? (
        <span className="readout" style={{ fontSize: 15, color: 'var(--color-cyan)' }}>{fmtExp(value)}</span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Button onClick={() => set(value - step)} accent="iris" title={`decrease the exponent on ${label}`}>
            −
          </Button>
          <span
            className="readout"
            tabIndex={0}
            role="spinbutton"
            aria-label={`exponent on ${label}`}
            aria-valuenow={value}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set(value + step); }
              if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set(value - step); }
            }}
            style={{
              minWidth: 42, textAlign: 'center', fontSize: 16,
              color: active ? 'var(--color-cyan)' : 'var(--color-ink-ghost)',
              outlineOffset: 3,
            }}
          >
            {fmtExp(value)}
          </span>
          <Button onClick={() => set(value + step)} accent="iris" title={`increase the exponent on ${label}`}>
            +
          </Button>
        </div>
      )}
    </div>
  );
}

/** A signed exponent as a bar that grows left for negative and right for
 *  positive, so "this side has one too many powers of time" is a shape. */
function Bar({ value, scale, color, outline }: { value: number; scale: number; color: string; outline?: boolean }) {
  const frac = Math.min(1, Math.abs(value) / scale) * 50;
  return (
    <div style={{ position: 'relative', height: 11, background: 'var(--color-abyss)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--color-rule-bright)' }} />
      <div
        style={{
          position: 'absolute', top: 1, bottom: 1,
          left: value >= 0 ? '50%' : `${50 - frac}%`,
          width: `${frac}%`,
          background: outline ? 'transparent' : color,
          border: outline ? `1px solid ${color}` : 'none',
          borderRadius: 2,
        }}
      />
    </div>
  );
}

export default function DimensionBalance({
  mode = 'build',
  palette,
  initial,
  reference,
  target,
  range = 2,
  step = 0.5,
  title,
  caption,
  locked = false,
}: DimensionBalanceProps) {
  const start = useMemo(
    () => Object.fromEntries(palette.map((k) => [k, initial?.[k] ?? 0])),
    [palette, initial],
  );
  const [values, setValues] = useState<Record<string, number>>(start);

  const terms: Term[] = palette.map((k) => ({ key: k, exponent: values[k] ?? 0 }));
  const yours = evaluateMonomial(terms, QUANTITY_TABLE).dim;

  const referenceTerms: Term[] = reference
    ? Object.entries(reference.terms).map(([key, exponent]) => ({ key, exponent }))
    : [];

  const targetDim: Dimension =
    mode === 'balance'
      ? evaluateMonomial(referenceTerms, QUANTITY_TABLE).dim
      : target
        ? QUANTITIES[target].dim
        : DIMENSIONLESS;

  const hit = dimEqual(yours, targetDim);
  const mismatch = divDim(yours, targetDim);

  /* The rows worth showing: any base dimension in play on either side. A
     seven-row table where four rows are zero is noise, not information. */
  const rows = BASE.map((b, i) => ({ ...b, mine: yours[i], theirs: targetDim[i] }))
    .filter((r) => Math.abs(r.mine) > EPS || Math.abs(r.theirs) > EPS);
  const scale = Math.max(2, ...rows.map((r) => Math.max(Math.abs(r.mine), Math.abs(r.theirs))));

  /* Build mode, once solved: how many of the exponent combinations on this grid
     actually work. Computed by exhaustive search — the uniqueness is the
     payoff and it should be measured, not asserted. */
  const search = useMemo(() => {
    if (mode !== 'build' || !target) return null;
    const found = searchMonomials(palette, QUANTITIES[target].dim, QUANTITY_TABLE, range, step);
    const perKey = Math.round((2 * range) / step) + 1;
    return { found: found.length, total: perKey ** palette.length };
  }, [mode, target, palette, range, step]);

  const yourLabel = monomialLabel(terms, QUANTITY_TABLE);
  const mismatchName = nameOf(mismatch);

  return (
    <Panel
      title={title ?? (mode === 'build' ? 'build the dimension' : 'does it balance?')}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="hud-label"
            style={{ color: hit ? 'var(--sig-ok)' : 'var(--sig-warn)' }}
          >
            {hit ? 'balanced' : 'mismatch'}
          </span>
          {!locked && (
            <Button onClick={() => setValues(start)} accent="iris" title="Back to the starting expression">
              reset
            </Button>
          )}
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
        {/* the builder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {palette.map((k) => {
            const q = QUANTITIES[k];
            return (
              <ExponentRow
                key={k}
                label={q.label}
                symbol={q.symbol}
                dimText={dimSymbol(q.dim)}
                value={values[k] ?? 0}
                step={step}
                range={range}
                locked={locked}
                onChange={(v) => setValues((prev) => ({ ...prev, [k]: v }))}
              />
            );
          })}
        </div>

        {/* the ledger */}
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '18px minmax(60px,1fr) 92px',
              gap: '6px 10px',
              alignItems: 'center',
            }}
          >
            <span />
            <span className="hud-label" style={{ fontSize: 9 }}>exponent</span>
            <span className="hud-label" style={{ fontSize: 9, textAlign: 'right' }}>
              yours / {mode === 'balance' ? 'given' : 'target'}
            </span>

            {rows.length === 0 && (
              <>
                <span />
                <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.9rem' }}>
                  both sides are pure numbers
                </span>
                <span />
              </>
            )}

            {rows.map((r) => {
              const off = Math.abs(r.mine - r.theirs) > EPS;
              return (
                <div key={r.key} style={{ display: 'contents' }}>
                  <span
                    className="readout"
                    style={{ fontSize: 15, color: off ? 'var(--sig-warn)' : 'var(--color-ink-soft)' }}
                  >
                    {r.symbol}
                  </span>
                  <div style={{ display: 'grid', gap: 2 }}>
                    <Bar value={r.mine} scale={scale} color={off ? 'var(--color-warn)' : 'var(--color-cyan)'} />
                    <Bar value={r.theirs} scale={scale} color="var(--color-magenta)" outline />
                  </div>
                  <span
                    className="readout"
                    style={{ fontSize: 13, textAlign: 'right', color: off ? 'var(--sig-warn)' : 'var(--color-ink-soft)' }}
                  >
                    {fmtExp(r.mine)} / {fmtExp(r.theirs)}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${hit ? 'var(--sig-ok)' : 'var(--color-rule-bright)'}`,
              background: hit ? 'color-mix(in oklab, var(--sig-ok) 10%, transparent)' : 'var(--color-surface)',
              fontSize: '0.95rem', lineHeight: 1.55, color: 'var(--color-ink-soft)',
            }}
          >
            <div className="readout" style={{ fontSize: 15, color: 'var(--color-ink)', marginBottom: 6 }}>
              {mode === 'balance' ? (
                <>
                  <span style={{ color: 'var(--color-magenta)' }}>{reference?.label ?? 'given'}</span>
                  {' = '}
                  <span style={{ color: 'var(--color-cyan)' }}>{yourLabel}</span>
                </>
              ) : (
                <>
                  <span style={{ color: 'var(--color-cyan)' }}>{yourLabel}</span>
                  {' → '}
                  <span style={{ color: hit ? 'var(--sig-ok)' : 'var(--sig-warn)' }}>{dimSymbol(yours)}</span>
                </>
              )}
            </div>

            {hit ? (
              <>
                <strong style={{ color: 'var(--sig-ok)' }}>Balanced. </strong>
                Both sides are <span className="readout">{dimSymbol(yours)}</span> —{' '}
                <span className="readout">{siUnitSymbol(yours)}</span>.
                {search && search.found > 0 && (
                  <>
                    {' '}Of the <span className="readout">{search.total.toLocaleString('en-US')}</span> exponent
                    combinations on this grid, <span className="readout">{search.found}</span>{' '}
                    {search.found === 1 ? 'works' : 'work'}.
                  </>
                )}
              </>
            ) : (
              <>
                <strong style={{ color: 'var(--sig-warn)' }}>Not balanced. </strong>
                Your side is heavier by <span className="readout">{dimSymbol(mismatch)}</span>
                {mismatchName && mismatchName !== 'a pure number' ? <> — that is {mismatchName}</> : null}.
              </>
            )}
          </div>
        </div>
      </div>

      <ReadoutRow>
        <Readout label="your side" value={dimSymbol(yours)} accent="cyan" />
        <Readout label={mode === 'balance' ? 'given side' : 'target'} value={dimSymbol(targetDim)} accent="magenta" />
        <Readout label="in SI base units" value={siUnitSymbol(yours)} accent="aqua" />
        <Readout label="mismatch" value={dimSymbol(mismatch)} accent={hit ? 'ok' : 'warn'} />
      </ReadoutRow>

      {caption && (
        <p style={{ marginTop: 10, color: 'var(--color-ink-soft)', fontSize: '0.95rem', lineHeight: 1.6 }}>
          {caption}
        </p>
      )}
    </Panel>
  );
}
