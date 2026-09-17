import { useId, useMemo, useRef, useState } from 'react';
import { turningPointsOf } from '../../lib/physics/landscape.ts';
import { ALL_LANDSCAPES, forceAt, landscapeOf, shiftLandscape, slopeProfile } from '../../lib/physics/landscapes-ch7.ts';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';

export interface ForceFromSlopeProps {
  landscape?: string;
  landscapes?: string[];
  probeX?: number;
  showEnergy?: boolean;
  energy?: number;
  floorShift?: boolean;
  floorRange?: [number, number];
  hideForce?: boolean;
  height?: number;
  caption?: string;
}

const fmt = (v: number) => Math.abs(v) > 0 && Math.abs(v) < 0.005
  ? v.toExponential(1)
  : String(Math.round(v * 100) / 100);

/** Two linked plots, one physics model. The energy ruler stays fixed when its
 * reference shifts. No animation; pointer events and keyboard sliders own state. */
export default function ForceFromSlope({
  landscape = 'staircase', landscapes, probeX, showEnergy = false, energy,
  floorShift = false, floorRange = [-3, 3], hideForce = false, height = 470, caption,
}: ForceFromSlopeProps) {
  const id = useId().replace(/:/g, '');
  const [key, setKey] = useState(landscape);
  const base = landscapeOf(key);
  const [a, b] = base.domain;
  const [probe, setProbe] = useState(probeX ?? (a + b) / 2);
  const x = Math.max(a, Math.min(b, probe));
  const [offset, setOffset] = useState(0);
  const [visible, setVisible] = useState(!hideForce);
  const svg = useRef<SVGSVGElement>(null);
  const land = useMemo(() => shiftLandscape(base, offset), [base, offset]);
  const profile = useMemo(() => slopeProfile(base, 420), [base]);
  const lo = Math.min(...profile.map(p => p.U)) + (floorShift ? floorRange[0] : 0) - 0.8;
  const hi = Math.max(...profile.map(p => p.U)) + (floorShift ? floorRange[1] : 0) + 0.8;
  const fmax = Math.max(1, ...profile.map(p => Math.abs(p.F))) * 1.15;
  const W = 760, L = 70, R = 735, top = 24, uh = 215, ft = 290, fh = 105;
  const sx = (v: number) => L + (v - a) / (b - a) * (R - L);
  const yu = (v: number) => top + uh - (v - lo) / (hi - lo) * uh;
  const yf = (v: number) => ft + fh / 2 - v / fmax * fh / 2;
  const path = (points: { x: number; y: number }[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');
  const E = (energy ?? base.suggestedE ?? 0) + offset;
  const turns = showEnergy ? turningPointsOf(land, E) : [];
  const ticks = Array.from({ length: 5 }, (_, i) => a + (b - a) * i / 4);
  const U = land.U(x), F = forceAt(land, x), slope = base.dU(x);
  const dx = (b - a) * 0.09;
  const move = (clientX: number) => {
    const rect = svg.current?.getBoundingClientRect();
    if (rect) setProbe(Math.max(a, Math.min(b, a + ((clientX - rect.left) / rect.width * W - L) / (R - L) * (b - a))));
  };
  const reset = () => { setKey(landscape); setProbe(probeX ?? (landscapeOf(landscape).domain[0] + landscapeOf(landscape).domain[1]) / 2); setOffset(0); setVisible(!hideForce); };
  return <Panel title={base.label}>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      {landscapes && <Toggle options={landscapes.map(k => ({ key: k, label: ALL_LANDSCAPES[k]?.label.split('—')[0].trim() ?? k }))} value={[key]} onChange={next => next[0] && setKey(next[0])} />}
      {hideForce && <Button onClick={() => setVisible(v => !v)}>{visible ? 'hide force' : 'reveal force'}</Button>}
      <Button onClick={reset}>reset probe and floor</Button>
    </div>
    <p style={{ color: 'var(--color-ink-soft)', fontSize: '0.95rem' }}>Solid curve: potential U. Dashed tangent: local slope. {visible ? 'Lower panel and arrow: force F.' : 'Predict first, then reveal force.'}</p>
    <svg ref={svg} viewBox={`0 0 ${W} 470`} width="100%" style={{ display: 'block', maxHeight: height, touchAction: 'none' }} role="img"
      aria-label={`At x ${fmt(x)}, U is ${fmt(U)} joules.${visible ? ` Force is ${fmt(F)} newtons.` : ' Force hidden.'}`}
      onPointerDown={ev => { ev.currentTarget.setPointerCapture(ev.pointerId); move(ev.clientX); }}
      onPointerMove={ev => { if (ev.buttons) move(ev.clientX); }}>
      <defs><clipPath id={`u-${id}`}><rect x={L} y={top} width={R - L} height={uh} /></clipPath></defs>
      {Array.from({ length: 5 }, (_, i) => lo + (hi - lo) * i / 4).map(u => <g key={u}>
        <line x1={L} x2={R} y1={yu(u)} y2={yu(u)} stroke="var(--color-rule)" />
        <text x={L - 9} y={yu(u) + 5} textAnchor="end" fill="var(--color-ink-soft)" fontSize={14}>{fmt(u)}</text>
      </g>)}
      <text x={L} y={17} fill="var(--color-ink)" fontSize={15}>U (J)</text>
      <g clipPath={`url(#u-${id})`}>
        <path d={path(profile.map(p => ({ x: sx(p.x), y: yu(p.U + offset) })))} fill="none" stroke="var(--color-orchid)" strokeWidth={2.5} />
        <line x1={sx(x - dx)} x2={sx(x + dx)} y1={yu(U - slope * dx)} y2={yu(U + slope * dx)} stroke="var(--color-cyan)" strokeWidth={2} strokeDasharray="6 4" />
        {showEnergy && <line x1={L} x2={R} y1={yu(E)} y2={yu(E)} stroke="var(--color-magenta)" strokeWidth={2} strokeDasharray="8 5" />}
        <circle cx={sx(x)} cy={yu(U)} r={6} fill="var(--color-cyan)" />
        {visible && Math.abs(F) > 0.015 && <g stroke="var(--color-cyan)" strokeWidth={3} fill="none">
          <path d={`M${sx(x)},${yu(U) - 16}h${F / fmax * 90}`} />
          <path d={`M${sx(x) + F / fmax * 90 - Math.sign(F) * 7},${yu(U) - 21}l${Math.sign(F) * 7},5l${-Math.sign(F) * 7},5`} />
        </g>}
      </g>
      {turns.map(t => <line key={t} x1={sx(t)} x2={sx(t)} y1={top} y2={ft + fh} stroke="var(--color-magenta)" strokeDasharray="3 5" />)}
      <line x1={sx(x)} x2={sx(x)} y1={top} y2={ft + fh} stroke="var(--color-ink-soft)" opacity={0.35} />
      {visible ? <g>
        <text x={L} y={ft - 14} fill="var(--color-ink)" fontSize={15}>F (N) — positive/negative x</text>
        {[-fmax / 1.15, 0, fmax / 1.15].map(f => <g key={f}>
          <line x1={L} x2={R} y1={yf(f)} y2={yf(f)} stroke="var(--color-rule)" />
          <text x={L - 9} y={yf(f) + 5} textAnchor="end" fill="var(--color-ink-soft)" fontSize={14}>{fmt(f)}</text>
        </g>)}
        <path d={path(profile.map(p => ({ x: sx(p.x), y: yf(p.F) })))} fill="none" stroke="var(--color-cyan)" strokeWidth={2.5} />
        <circle cx={sx(x)} cy={yf(F)} r={6} fill="var(--color-cyan)" />
      </g> : <text x={(L + R) / 2} y={ft + fh / 2} textAnchor="middle" fill="var(--color-ink-soft)" fontSize={16}>Where would the force be strongest?</text>}
      {ticks.map(t => <g key={t}>
        <line x1={sx(t)} x2={sx(t)} y1={ft + fh} y2={ft + fh + 6} stroke="var(--color-ink-soft)" />
        <text x={sx(t)} y={ft + fh + 25} textAnchor="middle" fill="var(--color-ink-soft)" fontSize={14}>{fmt(t)}</text>
      </g>)}
      <text x={R} y={455} textAnchor="end" fill="var(--color-ink)" fontSize={15}>{base.xLabel ?? 'position (m)'}</text>
    </svg>
    <Slider spec={{ key: 'x', label: 'probe position', min: a, max: b, step: 0.01, value: x, unit: 'm' }} value={x} onChange={setProbe} />
    {floorShift && <Slider spec={{ key: 'floor', label: 'add a constant to U', min: floorRange[0], max: floorRange[1], step: 0.01, value: offset, unit: 'J' }} value={offset} onChange={setOffset} />}
    <ReadoutRow>
      <Readout label="position" value={`${fmt(x)} m`} />
      <Readout label="U here" value={`${fmt(U)} J`} />
      {visible && <Readout label="slope dU/dx" value={`${fmt(slope)} J/m`} />}
      {visible && <Readout label="force −dU/dx" value={`${fmt(F)} N`} />}
      {showEnergy && <Readout label="K = E − U" value={E < U ? 'forbidden: E < U' : `${fmt(E - U)} J`} />}
    </ReadoutRow>
    {visible && <details style={{ marginTop: 12 }}><summary>Table of the same landscape</summary>
      <table style={{ width: '100%', textAlign: 'right' }}><thead><tr><th>x (m)</th><th>U (J)</th><th>F (N)</th></tr></thead>
        <tbody>{ticks.map(t => <tr key={t}><td>{fmt(t)}</td><td>{fmt(land.U(t))}</td><td>{fmt(forceAt(land, t))}</td></tr>)}</tbody></table>
    </details>}
    {caption && <p style={{ color: 'var(--color-ink-soft)', lineHeight: 1.6 }}>{caption}</p>}
  </Panel>;
}
