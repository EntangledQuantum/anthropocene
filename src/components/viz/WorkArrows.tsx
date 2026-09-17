import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { constantForceTrial, splitForWork, workOfConstantForce } from '../../lib/physics/work.ts';
import type { Vec2 } from '../../lib/physics/vectors.ts';
import { Button, Panel } from './controls.tsx';

/** One editable force; its projection, signed area, and work cannot disagree.
 *  The distance control is a path inspector, NOT a time animation. In ledger
 *  mode the speed/K account is integrated independently with Newton's law.
 *  Reusable for any constant-force / straight-path projection question. */
export interface WorkArrowsProps {
  distance?: number;
  force?: number;
  angleDeg?: number;
  maxForce?: number;
  locked?: boolean;
  showArea?: boolean;
  agent?: string;
  caption?: string;
  /** Add a backward force and an independently measured kinetic-energy account. */
  showLedger?: boolean;
  brake?: number;
  mass?: number;
  speed0?: number;
}

const fmt = (v: number, dp = 1) => Math.abs(v) < 0.0005 ? '0' : v.toFixed(dp);
const INK = 'var(--color-ink)';
const SOFT = 'var(--color-ink-soft)';
// Token-derived orchid step: sRGB 85% orchid + 15% surface = #b36cca.
// The dataviz validator passes this step on the project's dark surface.
const FORCE = 'color-mix(in srgb, var(--color-orchid) 85%, var(--color-surface))';

function Arrow({ x1, y1, x2, y2, color = INK, width = 2, dash }: {
  x1: number; y1: number; x2: number; y2: number; color?: string; width?: number; dash?: string;
}) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 0.5) return null;
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  const h = Math.min(9, length * 0.45);
  const bx = x2 - ux * h;
  const by = y2 - uy * h;
  return <g>
    <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeDasharray={dash} />
    <path d={`M${x2},${y2}L${bx - uy * h / 2},${by + ux * h / 2}L${bx + uy * h / 2},${by - ux * h / 2}Z`} fill={color} />
  </g>;
}

export default function WorkArrows({
  distance = 4, force = 60, angleDeg = 35, maxForce = 120,
  locked = false, showArea = true, agent = 'the pull', caption,
  showLedger = false, brake = 30, mass = 10, speed0 = 6,
}: WorkArrowsProps) {
  const uid = useId();
  const [magnitude, setMagnitude] = useState(force);
  const [angle, setAngle] = useState(angleDeg);
  const [brakeForce, setBrakeForce] = useState(brake);
  const [fraction, setFraction] = useState(1);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [texture, setTexture] = useState(false);
  const [width, setWidth] = useState(680);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const F = useMemo<Vec2>(() => [
    magnitude * Math.cos(angle * Math.PI / 180),
    magnitude * Math.sin(angle * Math.PI / 180),
  ], [angle, magnitude]);
  const split = useMemo(() => splitForWork(F, [distance, 0]), [F, distance]);
  const trial = useMemo(() => showLedger ? constantForceTrial({
    applied: F, brake: brakeForce, distance, mass, speed0,
  }) : null, [showLedger, F, brakeForce, distance, mass, speed0]);
  const reachable = trial?.samples.at(-1)?.x ?? distance;
  const requestedX = fraction * reachable;
  const sample = trial?.samples.find(s => s.x >= requestedX) ?? trial?.samples.at(-1);
  const inspected = sample?.x ?? requestedX;
  const inspectedSplit = splitForWork(F, [inspected, 0]);
  const work = inspectedSplit.work;
  const stopped = trial?.run.outcome === 'turned-back';
  const workColor = split.sign === 'zero' ? 'var(--color-ink-faint)'
    : split.sign === 'positive' ? 'var(--color-cyan)' : 'var(--color-magenta)';

  // Force geometry has its own labelled N scale, never shares the metre scale.
  // Centre the origin so backward arrows have as much room as forward arrows.
  const ax = width / 2;
  const ay = 145;
  const radius = Math.min(95, (width - 70) / 2);
  const scale = radius / maxForce;
  const tip = { x: ax + F[0] * scale, y: ay - F[1] * scale };
  const left = 54;
  const right = width - 26;
  const sx = (x: number) => left + (right - left) * x / distance;
  const zero = 413;
  const sy = (f: number) => zero - 64 * f / maxForce;
  const areaH = Math.abs(sy(split.fParallel) - zero);
  const areaY = Math.min(sy(split.fParallel), zero);

  const reset = () => { setMagnitude(force); setAngle(angleDeg); setBrakeForce(brake); setFraction(1); setHoverX(null); };
  const drag = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!dragging.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * width / rect.width - ax;
    const y = ay - (e.clientY - rect.top);
    setAngle(Math.max(0, Math.min(180, Math.atan2(Math.max(0, y), x) * 180 / Math.PI)));
    // Preserve magnitude: angle is the experimental variable. Size has its own control.
  };

  const range = (name: string, value: number, min: number, max: number, step: number, unit: string, change: (v: number) => void) => <label style={{ display: 'grid', gap: 6, color: INK }}>
    <span>{name} <strong>{fmt(value)} {unit}</strong></span>
    <input type="range" min={min} max={max} step={step} value={value} disabled={locked} aria-label={name}
      onChange={e => change(Number(e.target.value))} style={{ width: '100%', accentColor: FORCE }} />
  </label>;
  const rows: [string, string][] = [
    [`${agent}: force along displacement`, `${fmt(split.fParallel)} N`],
    [`${agent}: work over inspected displacement`, `${fmt(work)} J (${inspectedSplit.sign})`],
    ...(sample && trial ? [
      ['Brake work', `${fmt(sample.brakeWork)} J`],
      ['Net work (sum)', `${fmt(sample.netWork)} J`],
      ['Measured change in kinetic energy', `${fmt(sample.deltaK)} J`],
      ['Kinetic energy: start → inspected point', `${fmt(trial.initialK)} → ${fmt(sample.K)} J`],
      ['Speed: start → inspected point', `${fmt(speed0, 2)} → ${fmt(sample.v, 2)} m/s`],
    ] as [string, string][] : []),
  ];
  const probe = Math.min(hoverX ?? inspected, reachable);

  return <Panel title={showLedger ? 'Two forces, one motion' : 'Only the shared piece'} right={!locked && <Button onClick={reset}>Reset</Button>}>
    {!locked && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 12 }}>
      {range('Force angle', angle, 0, 180, 1, '°', setAngle)}
      {range('Force magnitude', magnitude, 10, maxForce, 1, 'N', setMagnitude)}
      {showLedger && range('Backward brake force', brakeForce, 0, maxForce, 1, 'N', setBrakeForce)}
    </div>}
    <div ref={wrapRef} style={{ width: '100%' }}>
      <svg ref={svgRef} width="100%" height={showArea ? 522 : 307} style={{ display: 'block' }}
        role="group" aria-label={`Force and displacement. ${fmt(magnitude)} N at ${fmt(angle)} degrees; parallel component ${fmt(split.fParallel)} N.`}>
        <defs><pattern id={`${uid}-hatch`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform={`rotate(${split.sign === 'negative' ? -45 : 45})`}>
          <line x1="0" y1="0" x2="0" y2="9" stroke={workColor} strokeWidth="2" />
        </pattern></defs>
        <text x={16} y={22} fill={INK} fontSize={15}>Force direction — drag the tip</text>
        <line x1={ax - radius} x2={ax + radius} y1={ay} y2={ay} stroke="var(--color-rule-bright)" />
        <Arrow x1={ax} y1={ay + 16} x2={ax + radius} y2={ay + 16} dash="5 4" />
        <text x={ax} y={ay + 43} textAnchor="middle" fill={SOFT} fontSize={14}>displacement points right</text>
        <Arrow x1={ax} y1={ay} x2={tip.x} y2={ay} width={6} />
        <line x1={tip.x} x2={tip.x} y1={ay} y2={tip.y} stroke={SOFT} strokeDasharray="4 4" />
        <Arrow x1={ax} y1={ay} x2={tip.x} y2={tip.y} color={FORCE} />
        <circle cx={ax} cy={ay} r={4} fill={INK} />
        {!locked && <circle cx={tip.x} cy={tip.y} r={13} fill="var(--color-surface)" stroke={FORCE} strokeWidth={2}
          tabIndex={0} role="slider" aria-label="Force angle handle" aria-valuemin={0} aria-valuemax={180} aria-valuenow={Math.round(angle)}
          aria-valuetext={`${fmt(angle, 0)} degrees; ${fmt(magnitude)} newtons`}
          style={{ cursor: 'grab', touchAction: 'none' }}
          onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); drag(e); }}
          onPointerMove={drag} onPointerUp={e => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
          onPointerCancel={() => { dragging.current = false; }}
          onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setAngle(a => Math.max(0, Math.min(180, a + (e.key === 'ArrowLeft' ? 1 : -1) * (e.shiftKey ? 10 : 1)))); } }} />}
        <text x={ax} y={211} textAnchor="middle" fill={INK} fontSize={15}>Parallel piece {fmt(split.fParallel)} N · angle {fmt(angle, 0)}°</text>
        <text x={ax} y={233} textAnchor="middle" fill={SOFT} fontSize={13}>Force scale: centre to full reach = {maxForce} N</text>
        <line x1={left} x2={right} y1={272} y2={272} stroke="var(--color-rule-bright)" />
        <rect x={sx(inspected) - 9} y={253} width={18} height={18} rx={3} fill="var(--color-raised)" stroke={INK} />
        {[0, distance / 2, distance].map(x => <g key={x}>
          <line x1={sx(x)} x2={sx(x)} y1={272} y2={279} stroke={SOFT} />
          <text x={sx(x)} y={298} textAnchor="middle" fill={SOFT} fontSize={14}>{fmt(x)} m</text>
        </g>)}
        {showArea && <g>
          <text x={16} y={329} fill={INK} fontSize={15}>Parallel force × distance: signed work</text>
          {[-maxForce, 0, maxForce].map(f => <g key={f}>
            <line x1={left} x2={right} y1={sy(f)} y2={sy(f)} stroke="var(--color-rule)" />
            <text x={left - 8} y={sy(f) + 5} textAnchor="end" fill={SOFT} fontSize={13}>{f}</text>
          </g>)}
          <text x={16} y={350} fill={SOFT} fontSize={13}>N</text>
          <rect x={left} y={areaY} width={Math.max(0, sx(inspected) - left)} height={areaH}
            fill={texture ? `url(#${uid}-hatch)` : workColor} opacity={texture ? 0.6 : 0.14} />
          <line x1={left} x2={right} y1={sy(split.fParallel)} y2={sy(split.fParallel)} stroke={workColor} strokeWidth={2} />
          <line x1={sx(probe)} x2={sx(probe)} y1={sy(maxForce)} y2={sy(-maxForce)} stroke={SOFT} />
          <rect x={left} y={sy(maxForce)} width={right - left} height={128} fill="transparent"
            onPointerMove={e => { const rect = svgRef.current!.getBoundingClientRect(); setHoverX(Math.max(0, Math.min(distance, ((e.clientX - rect.left) - left) / (right - left) * distance))); }}
            onPointerLeave={() => setHoverX(null)} />
          {[0, distance / 2, distance].map(x => <text key={x} x={sx(x)} y={499} textAnchor="middle" fill={SOFT} fontSize={14}>{fmt(x)} m</text>)}
          <text x={width / 2} y={520} textAnchor="middle" fill={SOFT} fontSize={13}>displacement along track (m)</text>
        </g>}
      </svg>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, color: SOFT, fontSize: 14, margin: '10px 0' }} aria-label="Diagram key">
      <span><span style={{ color: FORCE }}>━</span> applied force</span>
      <span>━ thick: parallel piece</span><span>┄ displacement direction</span>
      {showArea && <label><input type="checkbox" checked={texture} onChange={e => setTexture(e.target.checked)} /> Texture for signed area</label>}
    </div>
    {!locked && range('Inspect displacement (not time)', inspected, 0, reachable, 0.01, 'm', x => setFraction(reachable > 0 ? x / reachable : 0))}
    {showArea && <p style={{ color: SOFT, fontSize: 14 }} aria-live="off">Inspect x = {fmt(probe)} m: F∥ = {fmt(split.fParallel)} N; work by {agent} = {fmt(workOfConstantForce(F, [probe, 0]))} J.</p>}
    {showLedger && <p style={{ color: SOFT, lineHeight: 1.6 }}>
      {mass} kg particle on a fixed horizontal track; starts at {speed0} m/s. Pull and brake stay constant.
      Weight and the track’s transverse reaction each do zero work.
      {stopped && <> <strong style={{ color: INK }}>Stops at {fmt(trial!.samples.at(-1)!.x, 2)} m, before the {distance} m endpoint.</strong> The trial ends at the first stop; it does not assign negative kinetic energy.</>}
    </p>}
    <table style={{ width: '100%', borderCollapse: 'collapse', color: INK, fontSize: 15, marginTop: 12 }}>
      <caption style={{ textAlign: 'left', color: SOFT, marginBottom: 8 }}>At {fmt(inspected)} m along the path</caption>
      <tbody>{rows.map(([label, value]) => <tr key={label}>
        <th scope="row" style={{ textAlign: 'left', fontWeight: 400, padding: '8px 8px 8px 0', borderTop: '1px solid var(--color-rule)' }}>{label}</th>
        <td style={{ textAlign: 'right', padding: '8px 0', borderTop: '1px solid var(--color-rule)', fontVariantNumeric: 'tabular-nums' }}>{value}</td>
      </tr>)}</tbody>
    </table>
    {!showLedger && <p style={{ color: SOFT, fontSize: 14 }}>This measures one force’s work over a given displacement. It does not by itself predict the speed.</p>}
    {caption && <p style={{ color: SOFT, lineHeight: 1.6 }}>{caption}</p>}
  </Panel>;
}
