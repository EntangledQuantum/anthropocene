import { useEffect, useRef, useState } from 'react';
import { BEAD_RIG, beadBarMass, spoolDropTime, spoolState } from '../../lib/physics/rotation.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A bar with two beads on it, free to spin on an axle. A string wound on the
 * axle's spool holds a weight above the floor. One control: slide the beads
 * (they move as a pair, mirrored). Release, and the falling weight spins the
 * bar up; it lands sooner or later depending only on where the beads sit.
 * The mass on the bar never changes. After landing the bar keeps turning:
 * that spin is where the weight's energy went.
 *
 * Physics: `spoolState` / `spoolDropTime` from rotation.ts (energy shared
 * between ½mv² and ½Iω², with I = I_bar + 2 m r²).
 *
 * With `id` and `target`, the scene grades itself on the landing time.
 */
export interface BeadsOnTheBarProps {
  id?: string;
  prompt?: string;
  /** Where the beads start, m from the axle. */
  r?: number;
  /** Landing time to hit, s. */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const RIG = BEAD_RIG;
const AXLE = 1.0, HALF = RIG.barLength / 2, R_MIN = 0.03, R_MAX = 0.23, BOX = 0.07, BEAD = 0.026;

export default function BeadsOnTheBar({ id, prompt, r: r0 = 0.03, target, tolerance = 0.1, explanation }: BeadsOnTheBarProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'beads-on-the-bar');
  const [r, setR] = useState(r0);
  const rRef = useRef(r0);
  rRef.current = r;
  const released = useRef(false);
  const tRel = useRef(0);
  const [shown, setShown] = useState({ released: false, t: 0, landed: false });
  const bar = useRef<SVGGElement>(null), weight = useRef<SVGGElement>(null), string = useRef<SVGLineElement>(null);
  const stage = useRef<StageApi | null>(null);

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (released.current) tRel.current += dt;
      const st = spoolState(RIG, rRef.current, released.current ? tRel.current : 0);
      const s = stage.current;
      if (s) {
        bar.current?.setAttribute('transform', `rotate(${(st.angle * 180) / Math.PI},${s.sx(0)},${s.sy(AXLE)})`);
        const dy = s.len(st.fallen);
        weight.current?.setAttribute('transform', `translate(0,${dy})`);
        string.current?.setAttribute('y2', `${s.sy(RIG.drop + BOX) + dy}`);
      }
      if (now - lastShown > 120) {
        lastShown = now;
        setShown({ released: released.current, t: st.landed ? st.tLand : tRel.current, landed: released.current && st.landed });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const release = () => {
    if (released.current) { released.current = false; tRel.current = 0; } else released.current = true;
    setShown({ released: released.current, t: 0, landed: false });
    task.touch();
  };

  const tLand = spoolDropTime(RIG, r);
  const off = target !== undefined ? tLand - target : 0;
  const hit = graded && shown.landed && Math.abs(off) <= tolerance;
  const miss = !shown.released
    ? 'Release it first: this placement has not been tried.'
    : !shown.landed
      ? 'Wait for the weight to land.'
      : `With the beads ${(r * 100).toFixed(1)} cm out, the weight landed after ${tLand.toFixed(2)} s: ${Math.abs(off).toFixed(2)} s ${off < 0 ? 'early' : 'late'}.`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={release}>{shown.released ? 'Wind it back up' : 'Release'}</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Mass on the bar" value={beadBarMass(RIG).toFixed(2)} unit="kg" />
            <Meter label={shown.landed ? 'Landed after' : 'Time falling'} value={shown.t.toFixed(2)} unit="s" />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { r })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-0.45, 0.45]} y={[-0.06, 1.32]} height={380} equal
        label={`A bar with two beads ${(r * 100).toFixed(1)} centimetres from the axle. A weight hangs from a string wound on the axle, ${RIG.drop} metres above the floor.`}>
        {(s) => {
          stage.current = s;
          const P = (x: number, y: number) => `${s.sx(x)},${s.sy(y)}`;
          return <>
            <line x1={s.sx(-1.2)} x2={s.sx(1.2)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />
            <polyline points={`${P(-0.34, 0)} ${P(0, AXLE)} ${P(0.34, 0)}`} fill="none" stroke={C.grid} strokeWidth={4} strokeLinejoin="round" />
            {/* the drop, with a scale */}
            <line x1={s.sx(0.2)} x2={s.sx(0.2)} y1={s.sy(0)} y2={s.sy(RIG.drop)} stroke={C.faint} />
            {[0, 0.2, 0.4, 0.6].map((h) => <g key={h}>
              <line x1={s.sx(0.2)} x2={s.sx(0.215)} y1={s.sy(h)} y2={s.sy(h)} stroke={C.faint} />
              <text x={s.sx(0.225)} y={s.sy(h) + 4} fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{h} m</text>
            </g>)}
            <line ref={string} x1={s.sx(RIG.spoolR)} x2={s.sx(RIG.spoolR)} y1={s.sy(AXLE)} y2={s.sy(RIG.drop + BOX)} stroke={C.soft} strokeWidth={1.5} />
            <g ref={weight}>
              <rect x={s.sx(RIG.spoolR - BOX / 2)} y={s.sy(RIG.drop + BOX)} width={s.len(BOX)} height={s.len(BOX)} rx={3} fill={C.surface} stroke={C.soft} strokeWidth={2} />
              <text x={s.sx(RIG.spoolR + BOX / 2 + 0.02)} y={s.sy(RIG.drop + BOX / 2) + 4} fontSize={12} fill={C.soft}>{RIG.weight * 1000} g</text>
            </g>
            <g ref={bar}>
              <rect x={s.sx(-HALF)} y={s.sy(AXLE + 0.011)} width={s.len(2 * HALF)} height={s.len(0.022)} rx={3} fill={C.surface} stroke={C.soft} strokeWidth={2} />
              <circle cx={s.sx(0)} cy={s.sy(AXLE)} r={s.len(RIG.spoolR)} fill={C.surface} stroke={C.faint} strokeWidth={2} />
              {[-r, r].map((x) => <circle key={x} cx={s.sx(x)} cy={s.sy(AXLE)} r={s.len(BEAD)} fill={C.soft} stroke={C.ink} strokeWidth={1.5} />)}
            </g>
            <circle cx={s.sx(0)} cy={s.sy(AXLE)} r={3.5} fill={C.ink} />
            {!shown.released && <>
              {[-r, r].map((x) => <text key={x} x={s.sx(x)} y={s.sy(AXLE + 0.06)} textAnchor="middle" fontSize={12} fill={C.soft}>{RIG.beadMass * 1000} g</text>)}
              <text x={s.sx(r / 2)} y={s.sy(AXLE - 0.055)} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{(r * 100).toFixed(1)} cm</text>
              <Handle s={s} at={[r, AXLE]} step={0.0025} label="Right bead: drag along the bar"
                onChange={(p) => { setR(Math.round(Math.max(R_MIN, Math.min(R_MAX, p[0])) * 2000) / 2000); task.touch(); }} />
            </>}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Seen side-on · the beads move as a pair · the string unwinds from a 3 cm spool on the axle
      </p>
    </SceneCard>
  );
}
