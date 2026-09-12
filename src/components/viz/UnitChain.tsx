import { useMemo, useState } from 'react';
import {
  UNITS,
  conversionFactor,
  dimSymbol,
  mulDim,
  powDim,
  superscript,
  DIMENSIONLESS,
  type Dimension,
} from '../../lib/physics/dimensions.ts';
import { Button, Panel, Readout, ReadoutRow } from './controls.tsx';

/* ── the conversion chain ──────────────────────────────────────────────────
   "Conversion is multiplying by 1" is a sentence everybody nods at and almost
   nobody uses. Here it is the mechanic.

   The learner starts holding a quantity written in some units — 55 mi/h — and
   a rack of IDENTITIES, each of which is a true statement of the form
   1 mi = 1609.344 m. Applying one forwards substitutes the right side for the
   left: the tally of unit symbols changes, and the number changes with it, by
   the same factor, in the same click. Applying it backwards undoes that.

   Two things the world reports that a paragraph cannot:

     - units CANCEL. A symbol whose exponent reaches zero is struck out and
       stays on screen, so the learner watches the mile leave rather than
       being told it does.
     - the DIMENSION never moves. Every identity is a factor of 1, so however
       long the chain gets, the quantity is still a speed. That readout sitting
       perfectly still is the honest statement that nothing was done to the
       physics.

   Every factor comes from `conversionFactor` in src/lib/physics/dimensions.ts,
   where the composite units are themselves built from their primitives.
   ──────────────────────────────────────────────────────────────────────── */

export interface UnitChainProps {
  /** The quantity you start holding: a number and a tally of unit exponents. */
  start: { value: number; units: Record<string, number> };
  /** Identities available, written `from>to` — e.g. `mi>m` is 1 mi = 1609.344 m. */
  identities: string[];
  /** The unit tally the answer has to be written in. */
  target: Record<string, number>;
  title?: string;
  caption?: string;
  locked?: boolean;
}

const EPS = 1e-12;

function fmtNum(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(4);
  return String(Number(v.toPrecision(7)));
}

/** A tally of unit exponents rendered as a product: `mi h⁻¹`. */
function tallyText(tally: Record<string, number>): string {
  const parts = Object.entries(tally)
    .filter(([, e]) => Math.abs(e) > EPS)
    .map(([k, e]) => `${UNITS[k]?.symbol ?? k}${superscript(e)}`);
  return parts.length === 0 ? '(pure number)' : parts.join('·');
}

function tallyDim(tally: Record<string, number>): Dimension {
  let d = DIMENSIONLESS;
  for (const [k, e] of Object.entries(tally)) {
    if (Math.abs(e) <= EPS) continue;
    d = mulDim(d, powDim(UNITS[k].dim, e));
  }
  return d;
}

const sameTally = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) <= EPS);
};

export default function UnitChain({
  start, identities, target, title, caption, locked = false,
}: UnitChainProps) {
  const rack = useMemo(
    () =>
      identities.map((spec) => {
        const [from, to] = spec.split('>');
        return { spec, from, to, factor: conversionFactor(from, to) };
      }),
    [identities],
  );

  const [applied, setApplied] = useState<Record<string, number>>(() =>
    Object.fromEntries(identities.map((s) => [s, 0])),
  );

  /* Every symbol that could appear, so a cancelled one keeps its seat and can
     be seen leaving rather than vanishing from the layout. */
  const touched = useMemo(() => {
    const keys = new Set(Object.keys(start.units));
    for (const r of rack) { keys.add(r.from); keys.add(r.to); }
    for (const k of Object.keys(target)) keys.add(k);
    return [...keys];
  }, [start.units, rack, target]);

  const tally: Record<string, number> = Object.fromEntries(touched.map((k) => [k, start.units[k] ?? 0]));
  let value = start.value;
  for (const r of rack) {
    const e = applied[r.spec] ?? 0;
    if (e === 0) continue;
    // Applying "1 from = factor to" forwards: one `from` leaves, one `to`
    // arrives, and the number is multiplied by the factor. The two are the
    // same act, which is the whole point.
    tally[r.from] -= e;
    tally[r.to] += e;
    value *= r.factor ** e;
  }

  const hit = sameTally(tally, target);
  const dimension = tallyDim(tally);
  const startDimension = tallyDim(start.units);
  const dimensionHeld = dimSymbol(dimension) === dimSymbol(startDimension);

  return (
    <Panel
      title={title ?? 'multiply by one until the units read right'}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="hud-label" style={{ color: hit ? 'var(--sig-ok)' : 'var(--sig-warn)' }}>
            {hit ? 'units match' : `want ${tallyText(target)}`}
          </span>
          {!locked && (
            <Button
              onClick={() => setApplied(Object.fromEntries(identities.map((s) => [s, 0])))}
              accent="iris"
              title="Put every identity back to unused"
            >
              reset
            </Button>
          )}
        </div>
      }
    >
      {/* the quantity, large, because it is the thing being changed */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10,
          padding: '12px 14px', borderRadius: 10,
          border: `1px solid ${hit ? 'var(--sig-ok)' : 'var(--color-rule-bright)'}`,
          background: hit ? 'color-mix(in oklab, var(--sig-ok) 10%, transparent)' : 'var(--color-surface)',
        }}
      >
        <span className="readout" style={{ fontSize: 26, color: 'var(--color-ink)' }}>{fmtNum(value)}</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
          {touched.map((k) => {
            const e = tally[k] ?? 0;
            const gone = Math.abs(e) <= EPS;
            return (
              <span
                key={k}
                className="readout"
                style={{
                  fontSize: 18,
                  color: gone ? 'var(--color-ink-ghost)' : 'var(--color-aqua)',
                  textDecoration: gone ? 'line-through' : 'none',
                  opacity: gone ? 0.55 : 1,
                }}
              >
                {UNITS[k].symbol}
                {gone ? '' : superscript(e)}
              </span>
            );
          })}
        </span>
      </div>

      {/* the rack of identities */}
      <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        {rack.map((r) => {
          const e = applied[r.spec] ?? 0;
          const used = e !== 0;
          const set = (v: number) =>
            setApplied((prev) => ({ ...prev, [r.spec]: Math.max(-2, Math.min(2, v)) }));
          return (
            <div
              key={r.spec}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 10,
                padding: '7px 9px', borderRadius: 8,
                border: `1px solid ${used ? 'color-mix(in oklab, var(--color-cyan) 45%, transparent)' : 'var(--color-rule)'}`,
                background: used ? 'color-mix(in oklab, var(--color-cyan) 7%, transparent)' : 'transparent',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span className="readout" style={{ fontSize: 15, color: 'var(--color-ink)' }}>
                  1 {UNITS[r.from].symbol} = {fmtNum(r.factor)} {UNITS[r.to].symbol}
                </span>
                <div style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
                  {e === 0
                    ? 'unused'
                    : e > 0
                      ? `substituting ${UNITS[r.from].label} → ${UNITS[r.to].label}${e > 1 ? `, ${e} times` : ''}`
                      : `substituting ${UNITS[r.to].label} → ${UNITS[r.from].label}${e < -1 ? `, ${-e} times` : ''}`}
                </div>
              </div>
              {!locked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Button onClick={() => set(e - 1)} accent="iris" title="Apply this identity the other way round">
                    ÷
                  </Button>
                  <span
                    className="readout"
                    tabIndex={0}
                    role="spinbutton"
                    aria-label={`times 1 ${UNITS[r.from].symbol} = ${r.factor} ${UNITS[r.to].symbol} is applied`}
                    aria-valuenow={e}
                    onKeyDown={(ev) => {
                      if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') { ev.preventDefault(); set(e + 1); }
                      if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') { ev.preventDefault(); set(e - 1); }
                    }}
                    style={{
                      minWidth: 34, textAlign: 'center', fontSize: 16, outlineOffset: 3,
                      color: used ? 'var(--color-cyan)' : 'var(--color-ink-ghost)',
                    }}
                  >
                    {e > 0 ? `×${e}` : e < 0 ? `÷${-e}` : '—'}
                  </span>
                  <Button onClick={() => set(e + 1)} accent="iris" title="Apply this identity">
                    ×
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ReadoutRow>
        <Readout label="reads" value={`${fmtNum(value)} ${tallyText(tally)}`} accent={hit ? 'ok' : 'cyan'} />
        <Readout label="asked for" value={tallyText(target)} accent="magenta" />
        <Readout
          label="dimension"
          value={dimensionHeld ? `${dimSymbol(dimension)} — held` : `${dimSymbol(dimension)} — CHANGED`}
          accent={dimensionHeld ? 'aqua' : 'warn'}
        />
        <Readout label="net factor" value={`×${fmtNum(value / start.value)}`} accent="iris" />
      </ReadoutRow>

      {caption && (
        <p style={{ marginTop: 10, color: 'var(--color-ink-soft)', fontSize: '0.95rem', lineHeight: 1.6 }}>
          {caption}
        </p>
      )}
    </Panel>
  );
}
