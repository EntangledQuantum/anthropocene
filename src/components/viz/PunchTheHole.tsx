import { useEffect, useRef, useState } from 'react';
import { G, jetPath, jetRange, torricelliSpeed } from '../../lib/physics/fluids.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { WATER_FILL, WATER_LINE } from './fluid-kit.tsx';

/**
 * A tank on the floor, kept full to the same level by a tap, and a plugged
 * hole you slide up and down its wall. Pull the plug and the jet leaps out
 * at the speed Bernoulli allows (`torricelliSpeed`) and falls like any
 * projectile. Aim it into the drain in the floor.
 *
 * The low hole is fastest and still falls short: it has nowhere to fall. Once
 * you land it, the mirror hole appears — the same range from the other side
 * of halfway. Graded with `id`.
 */
export interface PunchTheHoleProps {
  id?: string;
  prompt?: string;
  /** Distance of the drain from the tank wall, m. */
  drain?: number;
  explanation?: string;
}

const H = 1.0, WALL = 1.15, HALF = 0.05, SLOW = 3;

export default function PunchTheHole({ id, prompt, drain = 0.8, explanation }: PunchTheHoleProps) {
  const task = useTask(id, 'punch-the-hole');
  const [y, setY] = useState(0.1);
  const [open, setOpen] = useState<{ y: number; landed: boolean } | null>(null);
  const jet = useRef<SVGPathElement>(null);
  const stage = useRef<StageApi | null>(null);
  const run = useRef<{ y: number; t0: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const r = run.current, s = stage.current, el = jet.current;
      if (r && s && el) {
        const T = Math.sqrt((2 * r.y) / G);
        const t = Math.min(T, (now - r.t0) / 1000 / SLOW);
        const pts = jetPath(r.y, H, 40).filter((_, i) => (i / 40) * T <= t + 1e-9);
        el.setAttribute('d', pts.map((p, i) => `${i ? 'L' : 'M'}${s.sx(p[0]).toFixed(1)},${s.sy(p[1]).toFixed(1)}`).join(''));
        if (t >= T) { run.current = null; setOpen({ y: r.y, landed: true }); }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pull = () => {
    run.current = { y, t0: performance.now() };
    setOpen({ y, landed: false });
    task.touch();
  };
  const move = (ny: number) => {
    setY(ny);
    run.current = null;
    setOpen(null);
    jet.current?.setAttribute('d', '');
    task.touch();
  };

  const v = torricelliSpeed(H - y);
  const R = jetRange(y, H);
  const landed = open?.landed ?? false;
  const off = R - drain;
  const mirror = H - y;
  const m = (x: number) => `${x.toFixed(2)} m`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={pull} disabled={!!open}>{open ? 'Unplugged' : 'Pull the plug'}</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Hole height" value={m(y)} />
            <Meter label="Jet speed" value={open ? v.toFixed(2) : '—'} unit="m/s" color={C.velocity} />
            <Meter label="Lands at" value={landed ? m(R) : '—'} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(landed && Math.abs(off) <= HALF, { y })}
          miss={!landed
            ? `The hole at ${m(y)} is still plugged. Pull the plug and watch where the jet lands.`
            : `From ${m(y)} up, the jet leaves at ${v.toFixed(2)} m/s and lands at ${m(R)}, ${m(Math.abs(off))} ${off > 0 ? 'past' : 'short of'} the drain.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-0.72, 1.25]} y={[-0.12, 1.25]} height={360} equal
        label={`A tank full to ${H} m with a hole ${m(y)} up. ${landed ? `The jet lands ${m(R)} from the wall.` : ''}`}>
        {(s) => { stage.current = s; return <>
          {/* floor with the drain cut into it */}
          <line x1={s.sx(-0.72)} x2={s.sx(drain - HALF)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />
          <line x1={s.sx(drain + HALF)} x2={s.sx(1.25)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />
          <path d={`M${s.sx(drain - HALF)},${s.sy(0)}L${s.sx(drain - HALF)},${s.sy(-0.05)}L${s.sx(drain + HALF)},${s.sy(-0.05)}L${s.sx(drain + HALF)},${s.sy(0)}`} fill="none" stroke={C.ink} strokeWidth={2} />
          <text x={s.sx(drain)} y={s.sy(-0.1)} textAnchor="middle" fontSize={12} fill={C.ink}>drain</text>
          {[0.2, 0.4, 0.6, 1.0, 1.2].map((x) => <g key={x}>
            <line x1={s.sx(x)} x2={s.sx(x)} y1={s.sy(0)} y2={s.sy(-0.025)} stroke={C.faint} />
            <text x={s.sx(x)} y={s.sy(-0.08)} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{x}</text>
          </g>)}
          {/* the tank, kept full by a tap */}
          <rect x={s.sx(-0.5)} y={s.sy(H)} width={s.len(0.5)} height={s.sy(0) - s.sy(H)} fill={WATER_FILL} />
          <line x1={s.sx(-0.5)} x2={s.sx(0)} y1={s.sy(H)} y2={s.sy(H)} stroke={WATER_LINE} strokeWidth={2} />
          <path d={`M${s.sx(-0.5)},${s.sy(WALL)}L${s.sx(-0.5)},${s.sy(0)}L${s.sx(0)},${s.sy(0)}L${s.sx(0)},${s.sy(WALL)}`} fill="none" stroke={C.soft} strokeWidth={2.5} />
          <path d={`M${s.sx(-0.6)},${s.sy(1.22)}L${s.sx(-0.35)},${s.sy(1.22)}L${s.sx(-0.35)},${s.sy(1.17)}`} fill="none" stroke={C.soft} strokeWidth={4} />
          <line x1={s.sx(-0.35)} x2={s.sx(-0.35)} y1={s.sy(1.16)} y2={s.sy(H)} stroke={WATER_LINE} strokeWidth={2} strokeDasharray="3 3" />
          {[0.2, 0.4, 0.6, 0.8, 1.0].map((h) => <g key={h}>
            <line x1={s.sx(-0.52)} x2={s.sx(-0.56)} y1={s.sy(h)} y2={s.sy(h)} stroke={C.faint} />
            <text x={s.sx(-0.58)} y={s.sy(h) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{h}</text>
          </g>)}
          <text x={s.sx(-0.25)} y={s.sy(H) + 18} textAnchor="middle" fontSize={12} fill={C.faint}>surface held at {H} m</text>
          {/* the mirror hole, once solved */}
          {task.done && Math.abs(mirror - y) > 0.02 && <>
            <path d={jetPath(mirror, H).map((p, i) => `${i ? 'L' : 'M'}${s.sx(p[0]).toFixed(1)},${s.sy(p[1]).toFixed(1)}`).join('')} fill="none" stroke={WATER_LINE} strokeWidth={2} strokeDasharray="5 5" />
            <text x={s.sx(0.06)} y={s.sy(mirror) - 8} fontSize={12} fill={C.soft}>a hole at {m(mirror)} lands here too</text>
          </>}
          <path ref={jet} fill="none" stroke={WATER_LINE} strokeWidth={4} strokeLinecap="round" />
          {open && <Arrow s={s} from={[0.02, y]} to={[0.02 + v * 0.08, y]} color={C.velocity} label={`${v.toFixed(2)} m/s`} labelSide={-1} />}
          {!open && <rect x={s.sx(0)} y={s.sy(y) - 5} width={10} height={10} rx={2} fill={C.soft} />}
          <Handle s={s} at={[0, y]} color={C.ink} step={0.01} r={7} label="The hole: drag it up or down the wall"
            onChange={(p) => move(Math.round(Math.min(0.95, Math.max(0.05, p[1])) * 100) / 100)} />
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Heights and distances in metres · no friction in the hole · the jet shown {SLOW}× slower than life
      </p>
    </SceneCard>
  );
}
