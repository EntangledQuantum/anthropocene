import { useEffect, useRef, useState } from 'react';
import { HCL, ISOTOPES, absorptionTHz, atomOffsets } from '../../lib/physics/solids.ts';
import { C, Meter, SceneCard } from './scene.tsx';

/**
 * Two molecules plucked at the same instant: H–Cl above, D–Cl below. Same
 * bond, same stretch; only the light atom differs. Played 10¹⁴ times slower
 * so a vibration takes about a second. Each atom moves about the pair's
 * centre of mass, so the chlorine barely stirs and the hydrogen does the
 * travelling. Counters tally whole vibrations, and the two fall out of step
 * at once.
 *
 * Each rings at the frequency its gas absorbs. Ungraded: the payoff for the
 * opening bet. Physics: absorptionTHz and
 * atomOffsets in src/lib/physics/solids.ts.
 */
export interface PluckTwoIsotopesProps {
  prompt?: string;
}

const SLOW = 1e14;           // display seconds per real second
const STRETCH = 0.35;        // Å, exaggerated so the motion reads
const PX = 150;              // px per Å
const XCM = 330;             // centre of mass, px
const ROWS = [
  { light: 'H' as const, y: 70 },
  { light: 'D' as const, y: 190 },
];

export default function PluckTwoIsotopes({ prompt }: PluckTwoIsotopesProps) {
  const f = ROWS.map((r) => absorptionTHz(HCL, ISOTOPES[r.light], ISOTOPES.Cl35));
  const t0 = useRef(performance.now());
  const atoms = useRef<(SVGGElement | null)[]>([]);
  const springs = useRef<(SVGPolylineElement | null)[]>([]);
  const [count, setCount] = useState([0, 0]);

  useEffect(() => {
    let raf = 0, lastShown = 0;
    const frame = (now: number) => {
      const tDisplay = (now - t0.current) / 1000;
      const tReal = tDisplay / SLOW;
      ROWS.forEach((r, i) => {
        const s = STRETCH * Math.cos(2 * Math.PI * f[i] * 1e12 * tReal);
        const [xl, xcl] = atomOffsets(ISOTOPES[r.light], ISOTOPES.Cl35, HCL.re + s);
        const xL = XCM + xl * PX, xC = XCM + xcl * PX;
        atoms.current[2 * i]?.setAttribute('transform', `translate(${xL.toFixed(2)},${r.y})`);
        atoms.current[2 * i + 1]?.setAttribute('transform', `translate(${xC.toFixed(2)},${r.y})`);
        const a = xL + 16, b = xC - 30, n = 14;
        const pts = Array.from({ length: n + 1 }, (_, j) => `${(a + ((b - a) * j) / n).toFixed(1)},${r.y + (j === 0 || j === n ? 0 : j % 2 ? -9 : 9)}`);
        springs.current[i]?.setAttribute('points', pts.join(' '));
      });
      if (now - lastShown > 120) {
        lastShown = now;
        setCount(f.map((fi) => Math.floor(fi * 1e12 * (tDisplay / SLOW))));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn" onClick={() => { t0.current = performance.now(); setCount([0, 0]); }}>Pluck both again</button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="H–Cl rings at" value={f[0].toFixed(1)} unit="THz" color={C.position} />
          <Meter label="D–Cl rings at" value={f[1].toFixed(1)} unit="THz" color={C.position} />
          <Meter label="D–Cl ÷ H–Cl" value={(f[1] / f[0]).toFixed(2)} />
        </span>
      </div>}>
      <svg viewBox="0 0 640 250" role="img" aria-label={`Two molecules vibrating. H–Cl has made ${count[0]} vibrations, D–Cl ${count[1]}.`}
        style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}>
        {ROWS.map((r, i) => <g key={r.light}>
          <line x1={XCM} x2={XCM} y1={r.y - 42} y2={r.y + 42} stroke={C.grid} strokeDasharray="3 4" />
          <polyline ref={(el) => { springs.current[i] = el; }} fill="none" stroke={C.soft} strokeWidth={2} />
          <g ref={(el) => { atoms.current[2 * i] = el; }}>
            <circle r={r.light === 'H' ? 14 : 18} fill={C.surface} stroke={C.position} strokeWidth={2.5} />
            <text y={5} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.position}>{r.light}</text>
          </g>
          <g ref={(el) => { atoms.current[2 * i + 1] = el; }}>
            <circle r={30} fill={C.surface} stroke={C.soft} strokeWidth={2} />
            <text y={5} textAnchor="middle" fontSize={14} fill={C.soft}>Cl</text>
          </g>
          <text x={24} y={r.y + 5} fontSize={15} fill={C.ink}>{r.light}–Cl</text>
          <text x={620} y={r.y - 2} textAnchor="end" fontSize={13} fill={C.faint}>vibrations</text>
          <text x={620} y={r.y + 20} textAnchor="end" fontSize={20} fontFamily="var(--font-mono)" fill={C.ink}>{count[i]}</text>
        </g>)}
        <text x={XCM} y={244} textAnchor="middle" fontSize={12} fill={C.faint}>dashed line: centre of mass · shown 10¹⁴ times slower · stretch exaggerated</text>
      </svg>
    </SceneCard>
  );
}
