import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { AREA_DISTANCE, AREA_FORCE_LIMIT, AREA_INITIAL_K, AREA_MASS, AREA_PROFILES, areaBreaks, areaProfile, inspectWorkArea, signedArea, workAreaTrial, type AreaProfile } from '../../lib/physics/work-area.ts';
import { Panel, Button } from './controls.tsx';

export interface WorkAreaProps {
  initial?: AreaProfile;
  lowEnergy?: boolean;
  /** Read force geometry first; the learner chooses when to expose the account. */
  hideAccount?: boolean;
  editable?: boolean;
  caption?: string;
}
const INK = 'var(--color-ink)', SOFT = 'var(--color-ink-soft)';
// Single validated hue; neutral dashed reference is additionally encoded by shape.
const SERIES = 'color-mix(in srgb, var(--color-orchid) 85%, var(--color-surface))';
const fmt = (n: number, dp = 2) => Math.abs(n) < 0.005 ? '0.00' : n.toFixed(dp);

/** No clock, requestAnimationFrame, or frame state. The slider selects distance
 * on a computed first-forward-passage trial. All physical values live in physics. */
export default function WorkArea({ initial = 'narrow', lowEnergy = false, hideAccount = false, editable = true, caption }: WorkAreaProps) {
  const uid = useId().replace(/:/g, '');
  const [points, setPoints] = useState(() => areaProfile(initial));
  const [preset, setPreset] = useState<AreaProfile | null>(initial);
  const [fraction, setFraction] = useState(1);
  const [probe, setProbe] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(!hideAccount);
  const [texture, setTexture] = useState(false);
  const [width, setWidth] = useState(640);
  const wrap = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  useEffect(() => {
    if (!wrap.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    observer.observe(wrap.current);
    return () => observer.disconnect();
  }, []);
  const initialK = lowEnergy ? AREA_INITIAL_K.low : AREA_INITIAL_K.ordinary;
  const trial = useMemo(() => workAreaTrial(points, initialK), [points, initialK]);
  const inspected = inspectWorkArea(trial, fraction * trial.limit);
  const hovered = inspectWorkArea(trial, probe ?? inspected.x);
  const full = areaBreaks(points);
  const shaded = areaBreaks(points, inspected.x);
  const blocked = trial.limit < AREA_DISTANCE - 0.001;
  const left = 56, right = width - 24, forceTop = 50, forceBottom = 250;
  const sx = (x: number) => left + (right - left) * x / AREA_DISTANCE;
  const fy = (f: number) => (forceTop + forceBottom) / 2 - f / AREA_FORCE_LIMIT * (forceBottom - forceTop) / 2;
  const energyTop = 355, energyBottom = 535;
  const maxWork = Math.max(20, ...trial.samples.map(s => Math.max(Math.abs(s.work), Math.abs(s.deltaK))));
  const energyMax = Math.ceil(maxWork / 20) * 20;
  const ey = (e: number) => (energyTop + energyBottom) / 2 - e / energyMax * (energyBottom - energyTop) / 2;
  const height = revealed ? 595 : 310;
  const path = (values: { x: number; y: number }[]) => values.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${p.y}`).join(' ');
  const choose = (name: AreaProfile) => { setPoints(areaProfile(name)); setPreset(name); setFraction(1); setProbe(null); };
  const reset = () => { choose(initial); setRevealed(!hideAccount); setTexture(false); };
  const setForce = (i: number, value: number) => {
    setPreset(null);
    setPoints(old => old.map((p, j) => j === i ? { ...p, force: Math.max(-AREA_FORCE_LIMIT, Math.min(AREA_FORCE_LIMIT, Math.round(value))) } : p));
    setProbe(null);
  };
  // Inverse screen CTM handles CSS scaling, viewBox and translations in BOTH axes.
  const local = (event: PointerEvent<SVGElement>) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  };
  const drag = (event: PointerEvent<SVGCircleElement>) => {
    if (dragging.current === null) return;
    const p = local(event);
    if (p) setForce(dragging.current, ((forceTop + forceBottom) / 2 - p.y) * AREA_FORCE_LIMIT / ((forceBottom - forceTop) / 2));
  };
  const hover = (event: PointerEvent<SVGRectElement>) => {
    const p = local(event);
    if (p) setProbe(Math.max(0, Math.min(trial.limit, (p.x - left) * AREA_DISTANCE / (right - left))));
  };
  const chartRows = [0, 1, 2, 3, 4].filter(x => x < trial.limit).concat(trial.limit).map(x => inspectWorkArea(trial, x));

  return <Panel title="The area keeps the score" right={<Button onClick={reset}>Reset</Button>}>
    <p style={{ color: SOFT, fontSize: 15 }}>Choose a force history along the track. {editable && 'Drag a handle vertically or use its slider.'} These are positions, not moments in time.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }} aria-label="Force histories">
      {(Object.keys(AREA_PROFILES) as AreaProfile[]).map(name => <Button key={name} active={preset === name} onClick={() => choose(name)}>{AREA_PROFILES[name].label}</Button>)}
    </div>
    <div ref={wrap}>
      <svg ref={svg} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Editable force against distance, linked to signed work and measured kinetic-energy change">
        <defs>
          {[45, 135].map((angle, i) => <pattern key={angle} id={`${uid}-area-${i}`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}><line x1="0" y1="0" x2="0" y2="9" stroke={SOFT} strokeWidth="2" /></pattern>)}
        </defs>
        <text x={16} y={23} fill={INK} fontSize={16}>Net force along +x (N)</text>
        {[-AREA_FORCE_LIMIT, 0, AREA_FORCE_LIMIT].map(f => <g key={f}>
          <line x1={left} x2={right} y1={fy(f)} y2={fy(f)} stroke={f === 0 ? 'var(--color-rule-bright)' : 'var(--color-rule)'} />
          <text x={left - 9} y={fy(f) + 5} textAnchor="end" fill={SOFT} fontSize={14}>{f}</text>
        </g>)}
        {revealed && shaded.slice(1).map((b, i) => {
          const a = shaded[i], negative = a.force + b.force < 0;
          return <path key={i} d={`M${sx(a.x)},${fy(0)}L${sx(a.x)},${fy(a.force)}L${sx(b.x)},${fy(b.force)}L${sx(b.x)},${fy(0)}Z`}
            fill={texture ? `url(#${uid}-area-${negative ? 1 : 0})` : SERIES} opacity={texture ? 0.5 : negative ? 0.28 : 0.14} />;
        })}
        <path d={path(full.map(p => ({ x: p.x, y: fy(p.force) })))} fill="none" stroke={SERIES} strokeWidth={2} />
        {blocked && <rect x={sx(trial.limit)} y={forceTop} width={Math.max(0, right - sx(trial.limit))} height={forceBottom - forceTop} fill="var(--color-surface)" opacity={0.58} />}
        <rect x={left} y={forceTop} width={right - left} height={forceBottom - forceTop} fill="transparent" onPointerMove={hover} onPointerLeave={() => setProbe(null)} />
        <line x1={sx(hovered.x)} x2={sx(hovered.x)} y1={forceTop} y2={forceBottom} stroke={SOFT} strokeWidth={1} />
        {editable && points.map((p, i) => <circle key={p.x} cx={sx(p.x)} cy={fy(p.force)} r={12} fill="var(--color-surface)" stroke={SERIES} strokeWidth={2}
          tabIndex={0} role="slider" aria-label={`Force handle at ${p.x} m`} aria-valuemin={-AREA_FORCE_LIMIT} aria-valuemax={AREA_FORCE_LIMIT} aria-valuenow={p.force} aria-valuetext={`${p.force} newtons`}
          style={{ cursor: 'ns-resize', touchAction: 'none' }}
          onPointerDown={e => { dragging.current = i; e.currentTarget.setPointerCapture(e.pointerId); drag(e); }} onPointerMove={drag}
          onPointerUp={e => { dragging.current = null; e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { dragging.current = null; }}
          onKeyDown={e => { if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) { e.preventDefault(); setForce(i, e.key === 'Home' ? -AREA_FORCE_LIMIT : e.key === 'End' ? AREA_FORCE_LIMIT : p.force + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)); } }} />)}
        {[0, 1, 2, 3, 4].map(x => <text key={x} x={sx(x)} y={277} textAnchor="middle" fill={SOFT} fontSize={14}>{x}</text>)}
        <text x={width / 2} y={302} textAnchor="middle" fill={SOFT} fontSize={14}>position along the track (m)</text>
        {revealed && <g>
          <text x={16} y={333} fill={INK} fontSize={16}>Two accounts of the transfer (J)</text>
          {[-energyMax, 0, energyMax].map(e => <g key={e}><line x1={left} x2={right} y1={ey(e)} y2={ey(e)} stroke="var(--color-rule)" /><text x={left - 9} y={ey(e) + 5} textAnchor="end" fill={SOFT} fontSize={14}>{e}</text></g>)}
          <path d={path(trial.samples.map(s => ({ x: s.x, y: ey(s.work) })))} fill="none" stroke={SERIES} strokeWidth={3} />
          <path d={path(trial.samples.map(s => ({ x: s.x, y: ey(s.deltaK) })))} fill="none" stroke={INK} strokeWidth={2} strokeDasharray="6 6" />
          <rect x={left} y={energyTop} width={right - left} height={energyBottom - energyTop} fill="transparent" onPointerMove={hover} onPointerLeave={() => setProbe(null)} />
          <line x1={sx(hovered.x)} x2={sx(hovered.x)} y1={energyTop} y2={energyBottom} stroke={SOFT} />
          <circle cx={sx(hovered.x)} cy={ey(hovered.work)} r={5} fill={SERIES} stroke="var(--color-surface)" strokeWidth={2} />
          {[0, 1, 2, 3, 4].map(x => <text key={x} x={sx(x)} y={562} textAnchor="middle" fill={SOFT} fontSize={14}>{x}</text>)}
          <text x={width / 2} y={587} textAnchor="middle" fill={SOFT} fontSize={14}>position along the track (m)</text>
        </g>}
      </svg>
    </div>
    <p style={{ color: SOFT, fontSize: 15 }} aria-label="Chart legend"><span style={{ color: SERIES }}>━</span> solid: net force / signed work W. {revealed && <>┄ dashed: measured ΔK. Above the force axis adds; below subtracts. The two energy traces overlap when the accounts agree.</>}</p>
    {editable && <details><summary style={{ color: INK, cursor: 'pointer' }}>Keyboard controls: reshape each force</summary><div style={{ display: 'grid', gap: 12, margin: '12px 0' }}>{points.map((p, i) => <label key={p.x} style={{ color: INK }}>Force at {p.x} m: <strong>{p.force} N</strong><input aria-label={`Force at ${p.x} m`} type="range" min={-AREA_FORCE_LIMIT} max={AREA_FORCE_LIMIT} step={1} value={p.force} onChange={e => setForce(i, Number(e.target.value))} style={{ width: '100%', accentColor: SERIES }} /></label>)}</div></details>}
    {!revealed && <Button onClick={() => setRevealed(true)}>Check the area and energy</Button>}
    {revealed && <>
      <label style={{ display: 'block', color: INK, marginTop: 16 }}>Inspect distance (not time): <strong>{fmt(inspected.x)} m</strong><input aria-label="Inspect distance (not time)" type="range" min={0} max={trial.limit} step={0.001} value={inspected.x} onChange={e => { setFraction(trial.limit > 0 ? Number(e.target.value) / trial.limit : 0); setProbe(null); }} style={{ width: '100%', accentColor: SERIES }} /></label>
      <label style={{ color: SOFT, fontSize: 15 }}><input type="checkbox" checked={texture} onChange={e => setTexture(e.target.checked)} /> Texture: / positive, \\ negative</label>
      <p style={{ color: INK, fontSize: 15 }} aria-live="off">At {fmt(hovered.x)} m: F = {fmt(hovered.force)} N; W = {fmt(hovered.work)} J; ΔK = {fmt(hovered.deltaK)} J; K = {fmt(hovered.K)} J.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', color: INK, fontSize: 15 }}><caption style={{ textAlign: 'left', color: SOFT }}>Signed account at the distance slider</caption><tbody>{[
        ['Area above zero', `+${fmt(inspected.positive)} J`], ['Area below zero (signed)', `${fmt(inspected.negative)} J`], ['Sum: actual work', `${fmt(inspected.work)} J`], ['Kinetic energy: start → here', `${fmt(initialK)} → ${fmt(inspected.K)} J`], ['Measured ΔK − work', `${fmt(inspected.deltaK - inspected.work, 4)} J`],
      ].map(([label, value]) => <tr key={label}><th scope="row" style={{ textAlign: 'left', fontWeight: 400, padding: '8px 4px', borderTop: '1px solid var(--color-rule)' }}>{label}</th><td style={{ textAlign: 'right', padding: '8px 4px', fontVariantNumeric: 'tabular-nums' }}>{value}</td></tr>)}</tbody></table>
      {blocked && <p style={{ color: INK }}><strong>First forward passage ends at {fmt(trial.limit)} m.</strong> {trial.stopped ? 'K reaches zero; the later force region cannot rescue this passage.' : 'This numerical trial does not reach the endpoint; no later kinetic-energy values are shown.'} The dim force remains the proposed field, not completed work. Its full-track geometric area is {fmt(trial.planned.work)} J.</p>}
      <details><summary style={{ color: INK, cursor: 'pointer' }}>Table of reachable positions</summary><table style={{ width: '100%', color: INK, fontSize: 14 }}><thead><tr>{['x (m)', 'F (N)', 'W (J)', 'K (J)'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{chartRows.map(s => <tr key={s.x}>{[s.x, s.force, s.work, s.K].map((v, i) => <td key={i} style={{ textAlign: 'center', padding: 6 }}>{fmt(v)}</td>)}</tr>)}</tbody></table></details>
    </>}
    <p style={{ color: SOFT, fontSize: 15 }}>A {AREA_MASS} kg particle starts with {fmt(initialK)} J on a fixed horizontal track. The graph gives the entire net force along the track; transverse forces do no work. K is measured from an independent Newtonian integration, not assigned from the shaded area. Small numerical differences are expected. This inspector ends at the first stop; it does not animate or model a return trip.</p>
    {caption && <p style={{ color: INK }}>{caption}</p>}
  </Panel>;
}
