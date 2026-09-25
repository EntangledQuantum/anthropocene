import { useEffect, useRef, useState } from 'react';
import { rpmToRadPerSec, tangentialSpeed } from '../../lib/physics/rotation.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * A turntable seen from above, with two bugs riding one painted stripe.
 * Bug A is fixed; bug B is yours to place while the platter is stopped.
 * Spin it and both bugs sweep the same wedge, but B's arc and B's velocity
 * arrow grow with its distance from the centre: one ω, every v = ωr.
 *
 * The whole picture is fixed in the turntable's frame, so the loop only
 * rotates one <g>. Physics: `rpmToRadPerSec` / `tangentialSpeed` from
 * src/lib/physics/rotation.ts.
 *
 * With `id` and `target`, the scene grades itself: spin with B placed so it
 * moves at `target` m/s.
 */
export interface TurntableBugsProps {
  id?: string;
  prompt?: string;
  rpm?: number;
  /** Bug A's distance from the centre, m. */
  rA?: number;
  /** Where bug B starts, m. */
  rB?: number;
  /** Speed bug B must reach, m/s. */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const RADIUS = 0.16;
const R_MIN = 0.02, R_MAX = 0.155;
const TRAIL_S = 0.3;   // seconds of path drawn behind each bug
const V_SCALE = 0.12;  // metres of arrow per m/s

export default function TurntableBugs({
  id, prompt, rpm = 45, rA = 0.05, rB: rB0 = 0.09, target, tolerance = 0.02, explanation,
}: TurntableBugsProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'turntable-bugs');
  const omega = rpmToRadPerSec(rpm);
  const [rB, setRB] = useState(rB0);
  const [spinning, setSpinning] = useState(false);
  const [ran, setRan] = useState(false);
  const [angle, setAngle] = useState(0); // where the stripe points while stopped
  const theta = useRef(0);
  const spin = useRef(false);
  const platter = useRef<SVGGElement>(null);
  const stage = useRef<StageApi | null>(null);

  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (spin.current) theta.current = (theta.current + omega * dt) % (2 * Math.PI);
      const s = stage.current;
      if (s && platter.current) {
        platter.current.setAttribute('transform', `rotate(${(-theta.current * 180) / Math.PI},${s.sx(0)},${s.sy(0)})`);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [omega]);

  const toggle = () => {
    const on = !spin.current;
    spin.current = on;
    setSpinning(on);
    if (on) setRan(true); else setAngle(theta.current);
    task.touch();
  };

  const vA = tangentialSpeed(omega, rA), vB = tangentialSpeed(omega, rB);
  const off = target !== undefined ? vB - target : 0;
  const hit = graded && ran && Math.abs(off) <= tolerance;
  const miss = !ran
    ? 'Spin it first: bug B has not ridden from here yet.'
    : `At ${(rB * 100).toFixed(1)} cm bug B moves at ${vB.toFixed(2)} m/s: ${Math.abs(off).toFixed(2)} m/s too ${off < 0 ? 'slow' : 'fast'}.`;
  const u: Vec = [Math.cos(angle), Math.sin(angle)];
  const sweep = omega * TRAIL_S;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={toggle}>{spinning ? 'Stop' : 'Spin'}</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Turntable" value={spinning ? `${rpm}` : '0'} unit="rpm" />
            <Meter label="Bug A" value={(spinning ? vA : 0).toFixed(2)} unit="m/s" color={C.velocity} />
            <Meter label="Bug B" value={(spinning ? vB : 0).toFixed(2)} unit="m/s" color={C.velocity} />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { rB })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-0.2, 0.2]} y={[-0.19, 0.19]} height={340} equal
        label={`Turntable seen from above, ${spinning ? `spinning at ${rpm} rpm` : 'stopped'}. Bug A is ${(rA * 100).toFixed(0)} cm from the centre, bug B ${(rB * 100).toFixed(1)} cm.`}>
        {(s) => {
          stage.current = s;
          const P = (x: number, y: number) => `${s.sx(x)},${s.sy(y)}`;
          const arc = (r: number) => `M${P(r * Math.cos(-sweep), r * Math.sin(-sweep))} A${s.len(r)},${s.len(r)} 0 0 0 ${P(r, 0)}`;
          const rOut = Math.max(rA, rB);
          return <>
            <g ref={platter}>
              <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(RADIUS)} fill={C.surface} stroke={C.rule} strokeWidth={2} />
              {[0.05, 0.1, 0.15].map((r) => <circle key={r} cx={s.sx(0)} cy={s.sy(0)} r={s.len(r)} fill="none" stroke={C.grid} />)}
              <line x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(RADIUS)} y2={s.sy(0)} stroke={C.soft} strokeWidth={3} strokeLinecap="round" />
              {[5, 10, 15].map((cm) => <text key={cm} x={s.sx(cm / 100)} y={s.sy(0) + 18} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{cm} cm</text>)}
              {spinning && <>
                <path d={`M${P(0, 0)} L${P(rOut * Math.cos(-sweep), rOut * Math.sin(-sweep))} ${arc(rOut).slice(arc(rOut).indexOf('A'))} Z`}
                  fill={C.position} fillOpacity={0.08} stroke="none" />
                {[rA, rB].map((r, i) => <path key={i} d={arc(r)} fill="none" stroke={C.position} strokeWidth={3} strokeLinecap="round" />)}
                {[rA, rB].map((r, i) => {
                  const L = tangentialSpeed(omega, r) * V_SCALE;
                  const x = s.sx(r), y0 = s.sy(0), y1 = s.sy(L);
                  return <g key={`v${i}`}>
                    <line x1={x} y1={y0} x2={x} y2={y1 + 10} stroke={C.velocity} strokeWidth={3} strokeLinecap="round" />
                    <path d={`M${x},${y1}L${x - 6},${y1 + 12}L${x + 6},${y1 + 12}Z`} fill={C.velocity} />
                  </g>;
                })}
              </>}
              {[['A', rA], ['B', rB]].map(([name, r]) => (
                <g key={name as string}>
                  <ellipse cx={s.sx(r as number)} cy={s.sy(0)} rx={9} ry={6} fill={C.surface} stroke={name === 'B' ? C.ink : C.soft} strokeWidth={2} />
                  <text x={s.sx(r as number) - 12} y={s.sy(0) - 10} fontSize={13} fontWeight={600} fill={name === 'B' ? C.ink : C.soft}>{name}</text>
                </g>
              ))}
            </g>
            <circle cx={s.sx(0)} cy={s.sy(0)} r={4} fill={C.soft} />
            {!spinning && <Handle s={s} at={[rB * u[0], rB * u[1]]} step={0.0025} label="Bug B: drag along the stripe"
              onChange={(p) => {
                const r = Math.max(R_MIN, Math.min(R_MAX, p[0] * u[0] + p[1] * u[1]));
                setRB(Math.round(r * 2000) / 2000);
                setRan(false);
                task.touch();
              }} />}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Seen from above · purple arcs: where each bug was 0.3 s ago · cyan: velocity
      </p>
    </SceneCard>
  );
}
