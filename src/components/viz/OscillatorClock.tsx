import { useMemo, useState, type CSSProperties } from 'react';
import { clockFrame, pendulumClock, springClock } from '../../lib/physics/clock-ch14.ts';
import { shmX } from '../../lib/physics/oscillator.ts';

export interface OscillatorClockProps { mode?: 'spring' | 'pendulum'; amplitude?: number; angle?: number }
const solid = 'color-mix(in srgb, var(--color-iris) 80%, black)';
const dashed = 'color-mix(in srgb, var(--color-magenta) 80%, black)';
const ink = 'var(--color-ink)';
const rule = 'var(--color-rule-bright)';
const format = (n: number) => (Math.abs(n) < 0.0005 ? 0 : n).toFixed(3);

/** Deliberately learner-paced: one time cursor drives the world, graph and table.
 * No animation, hidden timer or frame-by-frame React state. Pointer and keyboard
 * scrubbing are equivalent, and changing a parameter preserves the comparison time. */
export default function OscillatorClock({ mode = 'spring', amplitude = 1, angle = 10 }: OscillatorClockProps) {
  const [A, setA] = useState(amplitude);
  const [mass, setMass] = useState(1);
  const [degrees, setDegrees] = useState(angle);
  const [time, setTime] = useState(0);
  const [table, setTable] = useState(false);
  const spring = useMemo(() => springClock(A, mass), [A, mass]);
  const reference = useMemo(() => springClock(0.5, 1), []);
  const pendulum = useMemo(() => pendulumClock(degrees), [degrees]);
  const isSpring = mode === 'spring';
  const end = isSpring ? 2 * Math.PI : 8;
  const frame = clockFrame(A, mass, time);
  const fixed = clockFrame(0.5, 1, time);
  const pSample = pendulum.samples[Math.min(pendulum.samples.length - 1, Math.round(time / 0.002))];
  const ghost = shmX({ A: pendulum.angle, omega: 2, phase: 0 }, time);
  const actual = isSpring ? spring.samples.map(s => ({ t: s.t, y: s.x }))
    : pendulum.samples.filter((_, i) => i % 10 === 0).map(s => ({ t: s.t, y: s.x / pendulum.angle }));
  const comparison = isSpring ? reference.samples.map(s => ({ t: s.t, y: s.x }))
    : pendulum.samples.filter((_, i) => i % 10 === 0).map(s => ({ t: s.t, y: shmX({ A: 1, omega: 2, phase: 0 }, s.t) }));
  const yMax = isSpring ? 1.25 : 1.1;
  const sx = (t: number) => 58 + t / end * 570;
  const sy = (y: number) => 118 - y / yMax * 86;
  const path = (rows: { t: number; y: number }[]) => rows.map((s, i) => `${i ? 'L' : 'M'}${sx(s.t)},${sy(s.y)}`).join(' ');
  const control = (label: string, value: number, min: number, max: number, step: number, change: (n: number) => void, unit: string) => (
    <label style={{ display: 'grid', gap: 6 }}>
      <span>{label}: <strong>{format(value)} {unit}</strong></span>
      <input className="anth-slider" type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => change(+e.target.value)} />
    </label>
  );
  const rowTimes = isSpring ? [0, spring.period / 4, spring.period / 2, 3 * spring.period / 4, spring.period] : [0, pendulum.referencePeriod / 4, pendulum.referencePeriod / 2, pendulum.referencePeriod, pendulum.period];
  return (
    <section className="hud" aria-label={isSpring ? 'Spring clock experiment' : 'Pendulum clock experiment'} style={{ padding: 18, color: ink, fontSize: '1rem' } as CSSProperties}>
      <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem' }}>{isSpring ? 'Can you make the bigger swing arrive late?' : 'Where does the shared clock break?'}</h3>
      <p style={{ margin: '0 0 14px', color: 'var(--color-ink-soft)' }}>{isSpring ? 'Both springs have k = 4 N/m. Compare against the fixed 0.5 m release of a 1 kg mass. Scrub one shared clock.' : 'An ideal pendulum, L = 1 m and g = 4 m/s². Compare its sine restoring force with the small-angle model. Both start at rest.'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 18 }}>
        {isSpring ? <>{control('Release distance', A, 0.25, 1.25, 0.05, setA, 'm')}{control('Moving mass', mass, 0.5, 4, 0.5, setMass, 'kg')}</> : control('Release angle', degrees, 5, 120, 1, setDegrees, '°')}
      </div>
      <svg viewBox={isSpring ? '0 0 660 255' : '0 -55 660 310'} style={{ width: '100%', display: 'block' }} role="img" aria-label={isSpring ? `Circle shadow and spring mass at x ${format(frame.px)} metres` : `Pendulum at ${format(pSample.x)} radians, small-angle model at ${format(ghost)} radians`}>
        {isSpring ? <>
          <circle cx={330} cy={86} r={A * 55} fill="none" stroke={rule} strokeWidth={2} />
          <line x1={330} y1={86} x2={330 + frame.px * 55} y2={86 - frame.py * 55} stroke={solid} strokeWidth={2} />
          <circle cx={330 + frame.px * 55} cy={86 - frame.py * 55} r={6} fill={solid} />
          <line x1={330 + frame.px * 55} x2={330 + frame.px * 55} y1={86 - frame.py * 55} y2={188} stroke={solid} strokeDasharray="4 4" />
          <text x={440} y={78} fill={ink} fontSize={16}>Rotating point</text><text x={440} y={102} fill={ink} fontSize={16}>shadow ↓</text>
          <line x1={100} x2={570} y1={188} y2={188} stroke={rule} />
          <line x1={100} x2={100} y1={162} y2={200} stroke={ink} strokeWidth={3} />
          <path d={Array.from({ length: 19 }, (_, i) => `${i ? 'L' : 'M'}${100 + (230 + frame.px * 55 - 12) * i / 18},${188 + (i === 0 || i === 18 ? 0 : i % 2 ? 8 : -8)}`).join(' ')} fill="none" stroke={solid} strokeWidth={2} />
          <rect x={318 + frame.px * 55} y={176} width={24} height={24} fill={solid} />
          <circle cx={330 + fixed.px * 55} cy={218} r={7} fill="none" stroke={dashed} strokeWidth={3} />
          <text x={100} y={244} fill={ink} fontSize={15}>Hollow marker: fixed reference spring</text>
          {[-1, 0, 1].map(x => <g key={x}><line x1={330 + x * 55} x2={330 + x * 55} y1={162} y2={168} stroke={ink} /><text x={330 + x * 55} y={156} textAnchor="middle" fontSize={15} fill={ink}>{x} m</text></g>)}
        </> : <>
          <line x1={330} x2={330} y1={30} y2={185} stroke={rule} strokeDasharray="3 4" />
          {[{ theta: pSample.x, color: solid, dash: undefined }, { theta: ghost, color: dashed, dash: '6 4' }].map((p, i) => <g key={i}><line x1={330} y1={45} x2={330 + 140 * Math.sin(p.theta)} y2={45 + 140 * Math.cos(p.theta)} stroke={p.color} strokeWidth={3} strokeDasharray={p.dash} /><circle cx={330 + 140 * Math.sin(p.theta)} cy={45 + 140 * Math.cos(p.theta)} r={9} fill={i ? 'var(--color-surface)' : p.color} stroke={p.color} strokeWidth={3} /></g>)}
          <text x={330} y={229} textAnchor="middle" fill={ink} fontSize={16}>Solid bob: sine force · hollow bob: small-angle model</text>
        </>}
      </svg>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 8 }}>
        <span><span style={{ color: solid }}>━━</span> {isSpring ? 'Your spring' : 'Actual pendulum'}</span>
        <span><span style={{ color: dashed }}>┄┄</span> {isSpring ? 'Fixed reference' : 'Small-angle model'}</span>
      </div>
      <svg viewBox="0 0 660 260" style={{ width: '100%', display: 'block', touchAction: 'pan-y' }} role="img" aria-label="Displacement histories with a shared time cursor; use the time slider or point on the graph"
        onPointerMove={e => { if (e.pointerType === 'mouse' || e.buttons) { const box = e.currentTarget.getBoundingClientRect(); setTime(Math.max(0, Math.min(end, ((e.clientX - box.left) * 660 / box.width - 58) / 570 * end))); } }}
        onPointerDown={e => { const box = e.currentTarget.getBoundingClientRect(); setTime(Math.max(0, Math.min(end, ((e.clientX - box.left) * 660 / box.width - 58) / 570 * end))); }}>
        <text x={58} y={19} fill={ink} fontSize={16}>{isSpring ? 'Displacement (m)' : 'Angle / release angle'}</text>
        {[-1, 0, 1].map(y => <g key={y}><line x1={58} x2={628} y1={sy(y)} y2={sy(y)} stroke={rule} /><text x={47} y={sy(y) + 5} fill={ink} fontSize={15} textAnchor="end">{y}</text></g>)}
        {[0, 2, 4, 6, ...(isSpring ? [] : [8])].map(t => <g key={t}><line x1={sx(t)} x2={sx(t)} y1={32} y2={212} stroke={rule} /><text x={sx(t)} y={234} fill={ink} fontSize={15} textAnchor="middle">{t}</text></g>)}
        <path d={path(comparison)} fill="none" stroke={dashed} strokeWidth={2.5} strokeDasharray="7 5" />
        <path d={path(actual)} fill="none" stroke={solid} strokeWidth={2.5} />
        <line x1={sx(time)} x2={sx(time)} y1={32} y2={212} stroke={ink} strokeDasharray="2 3" />
        <circle cx={sx(time)} cy={sy(isSpring ? frame.px : pSample.x / pendulum.angle)} r={5} fill={solid} stroke="var(--color-surface)" strokeWidth={2} />
        <text x={628} y={256} fill={ink} fontSize={15} textAnchor="end">Time (s)</text>
      </svg>
      {control('Shared time cursor', time, 0, end, 0.002, setTime, 's')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '12px 0' }}>
        <button className="anth-btn" type="button" onClick={() => setTime((isSpring ? spring.period : pendulum.period) / 4)}>Quarter cycle</button>
        <button className="anth-btn" type="button" onClick={() => setTime(isSpring ? spring.period : pendulum.period)}>One full cycle</button>
        <button className="anth-btn" type="button" onClick={() => { setA(amplitude); setMass(1); setDegrees(angle); setTime(0); }}>Reset experiment</button>
      </div>
      <p role="status" style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.8 }}>
        {isSpring ? <>Your period: <strong>{format(spring.period)} s</strong> · reference: {format(reference.period)} s<br />At {format(time)} s: x = {format(frame.px)} m · v = {format(frame.vx)} m/s · a = {format(frame.ax)} m/s²</>
          : <>Actual period: <strong>{format(pendulum.period)} s</strong> · small-angle: {format(pendulum.referencePeriod)} s<br />Period excess: <strong>{format(pendulum.excessPercent)}%</strong> · angle now: {format(pSample.x)} rad</>}
      </p>
      <button className="anth-btn" type="button" aria-expanded={table} onClick={() => setTable(v => !v)}>{table ? 'Hide' : 'Show'} sampled values</button>
      {table && <div style={{ overflowX: 'auto', marginTop: 10 }}><table style={{ width: '100%', fontVariantNumeric: 'tabular-nums' }}><caption>Same model, sampled through one cycle</caption><thead><tr><th>Time (s)</th><th>{isSpring ? 'x (m)' : 'Angle (rad)'}</th><th>{isSpring ? 'v (m/s)' : 'Angular v (rad/s)'}</th></tr></thead><tbody>{rowTimes.map(t => { const f = clockFrame(A, mass, t); const p = pendulum.samples[Math.round(t / 0.002)]; return <tr key={t}><td>{format(t)}</td><td>{format(isSpring ? f.px : p.x)}</td><td>{format(isSpring ? f.vx : p.v)}</td></tr>; })}</tbody></table></div>}
    </section>
  );
}
