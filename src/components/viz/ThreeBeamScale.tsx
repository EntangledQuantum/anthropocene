import { useState } from 'react';
import { QUANTITIES, superscript } from '../../lib/physics/dimensions.ts';
import { beamTilts } from '../../lib/physics/language-ch1.ts';
import { C, CheckBar, SceneCard, useTask } from './scene.tsx';

/**
 * Three beam balances, one per base dimension: mass, length, time.
 *
 * The left pans hold what the equation's left side is made of; the right
 * pans hold your expression. A beam tips toward the side with more of its
 * dimension, so an equation balances only when all three beams are level at
 * once. You change the power of one or two quantities on the right and watch
 * which beams move — which is how a mismatch stops being a red cross and
 * becomes a message about what is missing.
 *
 * Physics: `beamTilts` over `balance` from src/lib/physics/dimensions.ts.
 */
export interface ThreeBeamScaleProps {
  id?: string;
  prompt?: string;
  /** Fixed side, quantity keys from dimensions.ts QUANTITIES. */
  left: { key: string; exponent: number }[];
  /** Your side. Terms with `free` get a stepper (at most two). */
  right: { key: string; exponent: number; free?: boolean }[];
  explanation?: string;
}

const STEP = 0.5;
const LIMIT = 2;

/** An exponent as a person writes it above a symbol: 1, −2, ½, −3/2. */
const plainPower = (e: number) => {
  const sign = e < 0 ? '−' : '';
  const a = Math.abs(e);
  if (Number.isInteger(a)) return `${sign}${a}`;
  return a === 0.5 ? `${sign}½` : `${sign}${a * 2}/2`;
};

const powerText = (e: number) => (Math.abs(e) < 1e-9 ? '⁰' : Math.abs(e - 1) < 1e-9 ? '¹' : superscript(e));

export default function ThreeBeamScale({ id, prompt, left, right, explanation }: ThreeBeamScaleProps) {
  const task = useTask(id, 'three-beam-scale');
  const [powers, setPowers] = useState<number[]>(right.map((t) => t.exponent));
  const terms = right.map((t, i) => ({ key: t.key, exponent: powers[i] }));
  const r = beamTilts(left, terms);

  const bump = (i: number, d: number) => {
    setPowers((p) => p.map((v, j) => (j === i ? Math.max(-LIMIT, Math.min(LIMIT, v + d)) : v)));
    task.touch();
  };

  const tipped = r.beams.filter((b) => !b.level).map((b) => b.symbol);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={id ? <CheckBar verdict={task.verdict} done={task.done}
        onCheck={() => task.check(r.balanced, { powers })}
        miss={`Your side is ${r.rightSymbol}, but it has to be ${r.leftSymbol}. The ${tipped.join(' and ')} beam${tipped.length > 1 ? 's' : ''} still tip${tipped.length > 1 ? '' : 's'}.`}
        hit={explanation} /> : undefined}>

      {/* the equation, with steppers under the free powers */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 14, flexWrap: 'wrap', fontSize: 26, fontFamily: 'var(--font-display)', color: C.ink, marginBottom: 6 }}>
        {left.map((t) => (
          <span key={t.key} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
            <span>{QUANTITIES[t.key].symbol}{t.exponent !== 1 && <sup>{superscript(t.exponent)}</sup>}</span>
            <span className="hud-label" style={{ fontSize: 12, marginTop: 4 }}>{QUANTITIES[t.key].label}</span>
          </span>
        ))}
        <span style={{ color: C.faint }}>=</span>
        {right.map((t, i) => (
          <span key={t.key} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
            <span title={QUANTITIES[t.key].label}>
              {QUANTITIES[t.key].symbol}
              <sup style={{ color: t.free ? C.position : C.soft, fontFamily: 'var(--font-sans)', fontSize: 17, marginLeft: 2 }}>{plainPower(powers[i])}</sup>
            </span>
            {t.free && (
              <span style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <button type="button" className="anth-btn" style={{ padding: '2px 10px', fontSize: 14 }}
                  aria-label={`Lower the power of ${QUANTITIES[t.key].label}`} onClick={() => bump(i, -STEP)} disabled={task.done}>−</button>
                <button type="button" className="anth-btn" style={{ padding: '2px 10px', fontSize: 14 }}
                  aria-label={`Raise the power of ${QUANTITIES[t.key].label}`} onClick={() => bump(i, STEP)} disabled={task.done}>+</button>
              </span>
            )}
            <span className="hud-label" style={{ fontSize: 12, marginTop: 4 }}>{QUANTITIES[t.key].label}</span>
          </span>
        ))}
      </div>

      <svg viewBox="0 0 700 220" role="img" style={{ width: '100%', display: 'block' }}
        aria-label={`Three balances. ${r.beams.map((b) => `${b.name} ${b.level ? 'level' : 'tipped'}`).join(', ')}.`}>
        {r.beams.map((b, k) => <Beam key={b.symbol} cx={115 + k * 235} {...b} />)}
      </svg>
      <p className="hud-label" style={{ margin: '4px 0 0', textAlign: 'center' }}>
        Left pans: {r.leftSymbol} · right pans: {r.rightSymbol}
      </p>
    </SceneCard>
  );
}

function Beam({ cx, symbol, name, left, right, tilt, level }: {
  cx: number; symbol: string; name: string; left: number; right: number; tilt: number; level: boolean;
}) {
  const cy = 70, half = 68, drop = 40;
  // positive tilt: the left pan is heavier and sinks
  const deg = Math.max(-16, Math.min(16, tilt * 8));
  const phi = (deg * Math.PI) / 180;
  const lx = -half * Math.cos(phi), ly = half * Math.sin(phi);
  const col = level ? C.ok : C.warn;
  const ease = { transition: 'transform 450ms cubic-bezier(.3,.7,.4,1)' };
  const pan = (x: number, y: number, e: number, key: string) => (
    <g key={key} style={{ transform: `translate(${x}px, ${y}px)`, ...ease }}>
      <line x1={0} y1={0} x2={-20} y2={drop} stroke={C.faint} strokeWidth={1.2} />
      <line x1={0} y1={0} x2={20} y2={drop} stroke={C.faint} strokeWidth={1.2} />
      <path d={`M${-26},${drop} Q0,${drop + 14} ${26},${drop}`} fill="none" stroke={C.soft} strokeWidth={2.4} />
      <text x={0} y={drop + 30} textAnchor="middle" fontSize={17} fill={C.ink}>{symbol}{powerText(e)}</text>
    </g>
  );
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <path d="M0,4 L-16,112 L16,112 Z" fill="none" stroke={C.rule} strokeWidth={1.6} />
      <line x1={-40} x2={40} y1={112} y2={112} stroke={C.rule} strokeWidth={2} />
      <g style={{ transform: `rotate(${-deg}deg)`, ...ease }}>
        <line x1={-half} x2={half} y1={0} y2={0} stroke={col} strokeWidth={4} strokeLinecap="round" />
      </g>
      <circle cx={0} cy={0} r={5} fill={C.surface} stroke={col} strokeWidth={2} />
      {pan(lx, ly, left, 'l')}
      {pan(-lx, -ly, right, 'r')}
      <text x={0} y={140} textAnchor="middle" fontSize={15} fill={col} fontWeight={600}>{symbol} · {name}</text>
      <text x={0} y={-16} textAnchor="middle" fontSize={13} fill={col}>{level ? 'level' : `off by ${symbol}${powerText(Math.abs(tilt))}`}</text>
    </g>
  );
}
