import { useState, type ReactNode } from 'react';
import { DIMENSIONLESS, dimSymbol, mulDim, powDim, UNITS } from '../../lib/physics/dimensions.ts';
import { applyCards, inSI, sameUnits, unitLabel, type Card, type Written } from '../../lib/physics/language-ch1.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * A speed and two conversion cards. Each card is an identity, so it is worth
 * exactly 1 whichever way up it sits; click a card to turn it over.
 *
 * Symbols that cancel are struck through. Turned the wrong way, a symbol
 * doubles instead — and the car's arrow underneath does not change by a
 * pixel either way, because nothing you do here can change the speed. Only
 * the costume it is written in.
 *
 * Physics: `applyCards` / `inSI` in language-ch1.ts over the unit registry.
 */
export interface FlipToCancelProps {
  id?: string;
  prompt?: string;
  start: Written;
  cards: Card[];
  /** Which cards begin turned over. */
  flipped?: boolean[];
  /** The units to finish in, e.g. { m: 1, s: -1 }. */
  target: Record<string, number>;
  explanation?: string;
}

const fmt = (v: number) => v.toLocaleString('en-US', { maximumSignificantDigits: 4, maximumFractionDigits: 12 });

export default function FlipToCancel({ id, prompt, start, cards, flipped: flip0, target, explanation }: FlipToCancelProps) {
  const task = useTask(id, 'flip-to-cancel');
  const [flipped, setFlipped] = useState<boolean[]>(flip0 ?? cards.map(() => false));
  const out = applyCards(start, cards, flipped);
  const si = inSI(out);
  const dimension = Object.entries(out.units).reduce((d, [u, e]) => mulDim(d, powDim(UNITS[u].dim, e)), DIMENSIONLESS);
  const done = sameUnits(out.units, target);
  const gone = (u: string) => (out.units[u] ?? 0) === 0;
  const stacked = Object.entries(out.units).filter(([, e]) => Math.abs(e) > 1).map(([u]) => UNITS[u].symbol);

  const sym = (u: string) => (
    <span style={{ textDecoration: gone(u) ? 'line-through' : 'none', color: gone(u) ? C.faint : C.ink, textDecorationThickness: 2 }}>
      {UNITS[u].symbol}
    </span>
  );

  const flipCard = (i: number) => {
    if (task.done) return;
    setFlipped((f) => f.map((v, j) => (j === i ? !v : v)));
    task.touch();
  };

  const startNum = Object.entries(start.units).filter(([, e]) => e > 0).map(([u]) => u);
  const startDen = Object.entries(start.units).filter(([, e]) => e < 0).map(([u]) => u);
  const frac = (top: ReactNode, bottom: ReactNode) => (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25 }}>
      <span style={{ padding: '0 6px' }}>{top}</span>
      <span style={{ alignSelf: 'stretch', borderTop: `2px solid ${C.soft}` }} />
      <span style={{ padding: '0 6px' }}>{bottom}</span>
    </span>
  );
  const arrowLen = Math.min(420, si * 12);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={id ? <CheckBar verdict={task.verdict} done={task.done}
        onCheck={() => task.check(done, { flipped })}
        miss={`It is written in ${unitLabel(out.units)}${stacked.length ? `: ${stacked.join(' and ')} ${stacked.length > 1 ? 'appear' : 'appears'} squared instead of cancelling` : ''}.`}
        hit={explanation} /> : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap', fontSize: 20, fontFamily: 'var(--font-sans)', color: C.ink, margin: '6px 0 14px' }}>
        <span>{start.value}&nbsp;{frac(<>{startNum.map((u, k) => <span key={u}>{k > 0 && '·'}{sym(u)}</span>)}</>, <>{startDen.map((u, k) => <span key={u}>{k > 0 && '·'}{sym(u)}</span>)}</>)}</span>
        {cards.map((c, i) => {
          const up = flipped[i] ? c.bottom : c.top;
          const down = flipped[i] ? c.top : c.bottom;
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
              <span style={{ color: C.faint }}>×</span>
              <button type="button" onClick={() => flipCard(i)} aria-label={`Card ${up.n} ${UNITS[up.unit].label} over ${down.n} ${UNITS[down.unit].label}. Turn it over.`}
                style={{ font: 'inherit', color: 'inherit', background: 'var(--color-surface)', border: `1.5px solid ${C.rule}`, borderRadius: 8, padding: '8px 10px', cursor: task.done ? 'default' : 'pointer' }}>
                {frac(<>{up.n} {sym(up.unit)}</>, <>{down.n} {sym(down.unit)}</>)}
              </button>
            </span>
          );
        })}
        <span style={{ color: C.faint }}>=</span>
        <span style={{ color: done ? C.ok : C.ink }}>{fmt(out.value)} {unitLabel(out.units)}</span>
      </div>

      <svg viewBox="0 0 640 80" role="img" style={{ width: '100%', display: 'block' }}
        aria-label={`The car's speed arrow, unchanged: ${si.toFixed(2)} metres per second`}>
        <line x1={0} x2={640} y1={70} y2={70} stroke={C.rule} strokeWidth={2} />
        <rect x={40} y={36} width={60} height={26} rx={7} fill={C.surface} stroke={C.soft} strokeWidth={2} />
        <line x1={106} x2={106 + arrowLen - 10} y1={49} y2={49} stroke={C.velocity} strokeWidth={3} strokeLinecap="round" />
        <path d={`M${106 + arrowLen},49 l-12,-6 l0,12 z`} fill={C.velocity} />
        <text x={110} y={30} fontSize={15} fill={C.velocity} fontFamily="var(--font-mono)">{fmt(out.value)} {unitLabel(out.units)}</text>
      </svg>
      <div style={{ display: 'flex', gap: 26, marginTop: 8 }}>
        <Meter label="The same speed in SI" value={si.toFixed(2)} unit="m/s" color={C.velocity} />
        <Meter label="Dimension" value={dimSymbol(dimension)} />
      </div>
    </SceneCard>
  );
}
