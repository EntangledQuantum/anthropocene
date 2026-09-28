import { useState } from 'react';
import { TUNE, abs, add, deg, seriesRLC } from '../../lib/physics/ac.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { Bulb, Wire } from './circuit-kit.tsx';

/**
 * A 10 V supply of adjustable frequency drives a lamp (80 Ω), a coil (40 mH)
 * and a capacitor (0.25 µF) in series. One control: the frequency.
 *
 * Left, the loop with each part's voltmeter reading and the lamp glowing by
 * the power it takes. Right, the phasors to one scale, drawn with the current
 * pointing right: the lamp's voltage along it, the coil's straight up, the
 * capacitor's straight down. Laid tip to tail they must close on the supply's
 * 10 V arrow, and that is what fixes the current. Tune until the coil and the
 * capacitor stand exactly opposite and equal: the supply arrow falls onto the
 * lamp's, the phase is zero and the lamp is brightest.
 *
 * Graded (`id`): tune until the phase is within `tolerance` degrees of zero.
 * Physics: seriesRLC in src/lib/physics/ac.ts. No animation: nothing here
 * changes except when you move the slider.
 */
export interface TuneTillTheyCancelProps {
  id?: string;
  prompt?: string;
  /** Starting frequency, Hz. */
  start?: number;
  tolerance?: number;
  explanation?: string;
}

const LO = Math.log10(400), HI = Math.log10(6400);
const O = { x: 400, y: 200 }, K = 3.4; // phasor origin, px per volt

export default function TuneTillTheyCancel({ id, prompt, start = 700, tolerance = 5, explanation }: TuneTillTheyCancelProps) {
  const task = useTask(id, 'tune-till-they-cancel');
  const [lf, setLf] = useState(Math.log10(start));
  const f = 10 ** lf, w = 2 * Math.PI * f;
  const r = seriesRLC(TUNE, TUNE.Vs, w);
  // draw with the current along +x: rotate everything by −arg(I)
  const turn = -Math.atan2(r.I.im, r.I.re), cs = Math.cos(turn), sn = Math.sin(turn);
  const rot = (z: { re: number; im: number }) => [z.re * cs - z.im * sn, z.re * sn + z.im * cs] as const;
  const P = (z: { re: number; im: number }) => { const [a, b] = rot(z); return [O.x + K * a, O.y - K * b] as const; };
  const VR = abs(r.VR), VL = abs(r.VL), VC = abs(r.VC), I = abs(r.I);
  const pLamp = I * I * TUNE.R, pMax = (TUNE.Vs / TUNE.R) ** 2 * TUNE.R;
  const phi = deg(r.phase);
  const hit = Math.abs(phi) <= tolerance;
  const tipR = P(r.VR), tipS = P(add(r.VR, r.VL, r.VC)), tipL = P(r.VL), tipC = P(r.VC);

  const arrow = (from: readonly [number, number], to: readonly [number, number], col: string, wd = 3, dash?: string) => {
    const L = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (L < 2) return null;
    const ux = (to[0] - from[0]) / L, uy = (to[1] - from[1]) / L, h = Math.min(11, L * 0.6);
    return <g>
      <line x1={from[0]} y1={from[1]} x2={to[0] - ux * h} y2={to[1] - uy * h} stroke={col} strokeWidth={wd} strokeDasharray={dash} strokeLinecap="round" />
      <path d={`M${to[0]},${to[1]} L${to[0] - ux * h - uy * 5.5},${to[1] - uy * h + ux * 5.5} L${to[0] - ux * h + uy * 5.5},${to[1] - uy * h - ux * 5.5}Z`} fill={col} />
    </g>;
  };
  const lab = (x: number, y: number, s: string, col: string, anchor: 'start' | 'end' | 'middle' = 'start') =>
    <text x={x} y={y} textAnchor={anchor} fontSize={13} fontWeight={600} fill={col} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{s}</text>;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 220px' }}>
            <span className="hud-label">Supply frequency</span>
            <input type="range" className="anth-slider" min={LO} max={HI} step={0.001} value={lf} aria-label="Supply frequency"
              onChange={(e) => { setLf(+e.target.value); task.touch(); }} />
          </label>
          <span style={{ display: 'flex', gap: 22 }}>
            <Meter label="Frequency" value={f.toFixed(0)} unit="Hz" />
            <Meter label="Current" value={(I * 1000).toFixed(0)} unit="mA" color={C.velocity} />
            <Meter label="Current ahead by" value={`${phi >= 0 ? '' : '−'}${Math.abs(phi).toFixed(0)}`} unit="°" />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { f })}
          miss={`At ${f.toFixed(0)} Hz the coil takes ${VL.toFixed(1)} V and the capacitor ${VC.toFixed(1)} V, so ${Math.abs(VL - VC).toFixed(1)} V of them is left over. The current is ${(I * 1000).toFixed(0)} mA, ${Math.abs(phi).toFixed(0)}° ${phi > 0 ? 'ahead of' : 'behind'} the supply.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 400" role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
        aria-label={`At ${f.toFixed(0)} hertz: lamp ${VR.toFixed(1)} volts, coil ${VL.toFixed(1)} volts, capacitor ${VC.toFixed(1)} volts, current ${(I * 1000).toFixed(0)} milliamps`}>
        {/* the loop */}
        <Wire pts={[[60, 180], [60, 70], [140, 70]]} />
        <Wire pts={[[172, 70], [250, 70], [250, 138]]} />
        <Wire pts={[[250, 222], [250, 330], [168, 330]]} />
        <Wire pts={[[152, 330], [60, 330], [60, 220]]} />
        <circle cx={60} cy={200} r={20} fill={C.surface} stroke={C.ink} strokeWidth={2} />
        <path d="M48,200 C52,189 56,189 60,200 C64,211 68,211 72,200" fill="none" stroke={C.ink} strokeWidth={2} />
        <text x={30} y={204} textAnchor="end" fontSize={13} fill={C.ink}>10 V</text>
        <Bulb x={156} y={70} power={pLamp} pMax={pMax} />
        <text x={156} y={112} textAnchor="middle" fontSize={12} fill={C.faint}>lamp 80 Ω</text>
        <path d={`M250,138 ${[0, 1, 2, 3, 4].map((k) => `a 8.4 8.4 0 0 1 0 16.8`).join(' ')}`} fill="none" stroke={C.ink} strokeWidth={2.2} />
        <text x={236} y={184} textAnchor="end" fontSize={12} fill={C.faint}>40 mH</text>
        <line x1={152} x2={152} y1={308} y2={352} stroke={C.ink} strokeWidth={3} />
        <line x1={168} x2={168} y1={308} y2={352} stroke={C.ink} strokeWidth={3} />
        <text x={160} y={372} textAnchor="middle" fontSize={12} fill={C.faint}>0.25 µF</text>
        {lab(156, 40, `${VR.toFixed(1)} V`, C.position, 'middle')}
        {lab(270, 184, `${VL.toFixed(1)} V`, C.position)}
        {lab(160, 300, `${VC.toFixed(1)} V`, C.position, 'middle')}

        {/* the phasors, current pointing right */}
        <line x1={O.x - 60} x2={630} y1={O.y} y2={O.y} stroke={C.grid} />
        <line x1={O.x} x2={O.x} y1={16} y2={384} stroke={C.grid} />
        {[-50, -25, 25, 50].map((v) => <g key={v}>
          <line x1={O.x - 4} x2={O.x + 4} y1={O.y - K * v} y2={O.y - K * v} stroke={C.faint} />
          <text x={O.x - 8} y={O.y - K * v + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{Math.abs(v)} V</text>
        </g>)}
        {arrow([O.x, O.y], tipL, C.position)}
        {arrow([O.x, O.y], tipC, C.position)}
        {arrow([O.x, O.y], tipR, C.position)}
        {arrow(tipR, tipS, C.faint, 2, '5 4')}
        {arrow([O.x, O.y], tipS, C.ink, 3)}
        {lab(tipL[0] + 10, Math.max(tipL[1], 24) + 4, `coil ${VL.toFixed(1)} V`, C.position)}
        {lab(tipC[0] + 10, Math.min(tipC[1], 384) + 4, `capacitor ${VC.toFixed(1)} V`, C.position)}
        {lab(Math.max(tipS[0], tipR[0]) + 12, (tipS[1] + O.y) / 2 + 4, `supply ${TUNE.Vs} V`, C.ink)}
        <text x={630} y={O.y + 18} textAnchor="end" fontSize={12} fill={C.velocity}>current →</text>
        <text x={630} y={392} textAnchor="end" fontSize={11} fill={C.faint}>lamp's arrow lies along the current</text>
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        right: every voltage as an arrow, one scale · dashed: coil and capacitor together · white: the supply
      </p>
    </SceneCard>
  );
}
