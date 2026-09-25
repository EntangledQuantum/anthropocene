import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  beltSpeed, drivenOmega, openBelt, radPerSecToRpm, rpmToRadPerSec,
} from '../../lib/physics/rotation.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A motor pulley and a drum pulley joined by a belt. One control: the size
 * of the drum's pulley (drag its rim). Run the motor and the belt carries
 * one speed round both rims, so the bigger pulley turns slower:
 * ω₁r₁ = ω₂r₂. Both rim arrows are the same length whatever you choose.
 *
 * Only the spokes and the belt's dashes move, set through refs.
 * Physics: `drivenOmega`, `beltSpeed`, `openBelt` from rotation.ts.
 *
 * With `id` and `targetRpm`, the scene grades itself.
 */
export interface SizeThePulleyProps {
  id?: string;
  prompt?: string;
  motorRpm?: number;
  /** Motor pulley radius, m. */
  motorR?: number;
  /** Drum pulley starting radius, m. */
  drumR?: number;
  targetRpm?: number;
  tolerance?: number;
  explanation?: string;
}

const D = 0.34;            // distance between the axles, m
const R_MIN = 0.02, R_MAX = 0.12;
const V_SCALE = 0.25;      // metres of arrow per m/s
const DASH = 0.018;        // belt dash, m

export default function SizeThePulley({
  id, prompt, motorRpm = 90, motorR = 0.04, drumR: drumR0 = 0.06, targetRpm, tolerance = 2, explanation,
}: SizeThePulleyProps) {
  const graded = Boolean(id && targetRpm !== undefined);
  const task = useTask(graded ? id : undefined, 'size-the-pulley');
  const [drumR, setDrumR] = useState(drumR0);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const run = useRef(false);
  const angles = useRef({ motor: 0, drum: 0, belt: 0 });
  const motorG = useRef<SVGGElement>(null), drumG = useRef<SVGGElement>(null), belt = useRef<SVGPathElement>(null);
  const stage = useRef<StageApi | null>(null);
  const radii = useRef(drumR);
  radii.current = drumR;

  const w1 = rpmToRadPerSec(motorRpm);
  const w2 = drivenOmega(w1, motorR, drumR);
  const vBelt = beltSpeed(w1, motorR);

  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const a = angles.current;
      if (run.current) {
        a.motor -= w1 * dt; // clockwise: the top of the belt runs to the right
        a.drum -= drivenOmega(w1, motorR, radii.current) * dt;
        a.belt += beltSpeed(w1, motorR) * dt;
      }
      const s = stage.current;
      if (s) {
        const deg = (x: number) => (-x * 180) / Math.PI;
        motorG.current?.setAttribute('transform', `rotate(${deg(a.motor)},${s.sx(0)},${s.sy(0)})`);
        drumG.current?.setAttribute('transform', `rotate(${deg(a.drum)},${s.sx(D)},${s.sy(0)})`);
        belt.current?.setAttribute('stroke-dashoffset', `${-s.len(a.belt % (2 * DASH))}`);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [w1, motorR]);

  const toggle = () => {
    const on = !run.current;
    run.current = on;
    setRunning(on);
    if (on) setRan(true);
    task.touch();
  };

  const rpm2 = radPerSecToRpm(w2);
  const off = targetRpm !== undefined ? rpm2 - targetRpm : 0;
  const hit = graded && ran && Math.abs(off) <= tolerance;
  const miss = !ran
    ? 'Run the motor first: this pulley has not been tried.'
    : `With a ${(drumR * 100).toFixed(1)} cm pulley the drum turns at ${rpm2.toFixed(0)} rpm: ${Math.abs(off).toFixed(0)} rpm too ${off > 0 ? 'fast' : 'slow'}.`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={toggle}>{running ? 'Stop the motor' : 'Run the motor'}</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Motor" value={running ? `${motorRpm}` : '0'} unit="rpm" />
            <Meter label="Belt" value={(running ? vBelt : 0).toFixed(2)} unit="m/s" color={C.velocity} />
            <Meter label="Drum" value={running ? rpm2.toFixed(0) : '0'} unit="rpm" />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { drumR })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-0.1, 0.48]} y={[-0.19, 0.21]} height={340} equal
        label={`A ${(motorR * 100).toFixed(0)} centimetre motor pulley belted to a ${(drumR * 100).toFixed(1)} centimetre drum pulley.`}>
        {(s) => {
          stage.current = s;
          const b = openBelt(motorR, drumR, D);
          const pts: [number, number][] = [];
          const arcPts = (cx: number, r: number, from: number, to: number) => {
            const n = 48;
            for (let i = 0; i <= n; i++) { const t = from + ((to - from) * i) / n; pts.push([cx + r * Math.cos(t), r * Math.sin(t)]); }
          };
          // top run → around the drum (clockwise) → bottom run → around the motor
          arcPts(D, drumR, b.phiTop, -b.phiTop);
          arcPts(0, motorR, -b.phiTop, b.phiTop - 2 * Math.PI);
          pts.push(pts[0]);
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${s.sx(p[0])},${s.sy(p[1])}`).join('');
          const pulley = (cx: number, r: number, ref: RefObject<SVGGElement | null>, label: string) => <g>
            <g ref={ref}>
              <circle cx={s.sx(cx)} cy={s.sy(0)} r={s.len(r)} fill={C.surface} stroke={C.soft} strokeWidth={2} />
              {[0, 1, 2].map((k) => {
                const t = (k * 2 * Math.PI) / 3;
                return <line key={k} x1={s.sx(cx)} y1={s.sy(0)} x2={s.sx(cx + r * 0.85 * Math.cos(t))} y2={s.sy(r * 0.85 * Math.sin(t))} stroke={C.faint} strokeWidth={2} />;
              })}
              <circle cx={s.sx(cx + r * 0.7)} cy={s.sy(0)} r={4} fill={C.ink} />
            </g>
            <circle cx={s.sx(cx)} cy={s.sy(0)} r={3.5} fill={C.soft} />
            <text x={s.sx(cx)} y={s.sy(-Math.max(r, 0.04) - 0.035)} textAnchor="middle" fontSize={13} fill={C.soft}>{label}</text>
          </g>;
          const L = vBelt * V_SCALE;
          return <>
            {pulley(0, motorR, motorG, `motor, ${(motorR * 100).toFixed(0)} cm`)}
            {pulley(D, drumR, drumG, `drum, ${(drumR * 100).toFixed(1)} cm`)}
            <path d={d} fill="none" stroke={C.rule} strokeWidth={4} strokeLinejoin="round" />
            <path ref={belt} d={d} fill="none" stroke={C.ink} strokeWidth={2} strokeDasharray={`${s.len(DASH)} ${s.len(DASH)}`} />
            {running && [[0, motorR], [D, drumR]].map(([cx, r]) => (
              <Arrow key={cx} s={s} from={[cx - L / 2, r + 0.05]} to={[cx + L / 2, r + 0.05]} color={C.velocity}
                label={`${vBelt.toFixed(2)} m/s`} />
            ))}
            {!running && <Handle s={s} at={[D + drumR, 0]} step={0.0025} label="Drum pulley rim: drag to resize"
              onChange={(p) => {
                const r = Math.max(R_MIN, Math.min(R_MAX, Math.hypot(p[0] - D, p[1])));
                setDrumR(Math.round(r * 2000) / 2000);
                setRan(false);
                task.touch();
              }} />}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        The belt neither stretches nor slips · cyan: rim speed, drawn over each pulley
      </p>
    </SceneCard>
  );
}
