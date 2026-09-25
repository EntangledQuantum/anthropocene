import { useEffect, useRef, useState } from 'react';
import { beadVelocity, ropeHeight, type Pulse } from '../../lib/physics/waves.ts';
import { Arrow, C, CheckBar, Handle, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * A rope frozen mid-motion, with one painted bead. The humps' travel arrows
 * say which way the pattern is going; the bead's own velocity is yours to
 * draw. Drag its arrow, check, then play the rope forward and watch the
 * bead's real velocity (cyan) beside yours (white).
 *
 * The truth is the travelling form: each pulse moving at speed s gives the
 * bead −s × (its slope under the bead), and the pulses simply add
 * (`beadVelocity` in waves.ts). With two pulses the dashed components are
 * drawn as well, so the flat rope can still be read.
 */
export interface AimTheBeadProps {
  id: string;
  prompt?: string;
  pulses: Pulse[];
  /** The painted bead's position along the rope, m. */
  bead: number;
  explanation?: string;
}

const VS = 0.15;       // metres of arrow per m/s
const X: [number, number] = [-3, 3];
const PLAY = 0.25, T0 = -0.5, T1 = 0.7;
const LOOK = 0.05;     // seconds ahead, for the miss line

const pts = (s: StageApi, pulses: readonly Pulse[], t: number) => {
  const out: string[] = [];
  for (let i = 0; i <= 240; i++) {
    const x = X[0] + ((X[1] - X[0]) * i) / 240;
    out.push(`${s.sx(x).toFixed(1)},${s.sy(ropeHeight(pulses, x, t)).toFixed(1)}`);
  }
  return out.join(' ');
};

export default function AimTheBead({ id, prompt, pulses, bead, explanation }: AimTheBeadProps) {
  const task = useTask(id, 'aim-the-bead');
  const y0 = ropeHeight(pulses, bead);
  const [tip, setTip] = useState<Vec>([bead, y0]);
  const [playing, setPlaying] = useState(false);
  const api = useRef<StageApi | null>(null);
  const els = useRef<{ rope?: SVGPolylineElement | null; bead?: SVGCircleElement | null; truth?: SVGLineElement | null; comps: (SVGPolylineElement | null)[] }>({ comps: [] });

  const vt = beadVelocity(pulses, bead);
  const u: Vec = [(tip[0] - bead) / VS, (tip[1] - y0) / VS];
  const um = Math.hypot(u[0], u[1]);
  const angle = (Math.acos(Math.max(-1, Math.min(1, (u[1] * Math.sign(vt)) / (um || 1)))) * 180) / Math.PI;
  const hit = um >= 0.3 * Math.abs(vt) && angle <= 25;
  const moveCm = Math.abs(ropeHeight(pulses, bead, LOOK) - y0) * 100;
  const way = (v: number) => (v > 0 ? 'rises' : 'falls');

  const miss = um < 0.15
    ? `Your arrow says the bead is at rest. Over the next ${LOOK} s it moves ${moveCm.toFixed(0)} cm.`
    : Math.abs(u[0]) > Math.abs(u[1])
      ? `Your arrow points ${u[0] > 0 ? 'right' : 'left'}, along the rope. Over the next ${LOOK} s the bead moves 0 cm sideways.`
      : u[1] * vt < 0
        ? `Your arrow points ${u[1] > 0 ? 'up' : 'down'}. Over the next ${LOOK} s the rope at the bead ${way(vt)} ${moveCm.toFixed(0)} cm.`
        : angle > 25
          ? `Your arrow leans ${angle.toFixed(0)}° off the line the bead moves along.`
          : `Your arrow says ${um.toFixed(1)} m/s. Over the next ${LOOK} s the bead moves ${moveCm.toFixed(0)} cm.`;

  // Play the rope forward from refs; React is not told per frame.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = T0 + ((now - start) / 1000) * PLAY;
      const s = api.current, e = els.current;
      if (s) {
        const tt = Math.min(t, T1);
        e.rope?.setAttribute('points', pts(s, pulses, tt));
        pulses.forEach((p, i) => e.comps[i]?.setAttribute('points', pts(s, [p], tt)));
        const yb = ropeHeight(pulses, bead, tt), vb = beadVelocity(pulses, bead, tt);
        e.bead?.setAttribute('cy', String(s.sy(yb)));
        e.truth?.setAttribute('y1', String(s.sy(yb)));
        e.truth?.setAttribute('y2', String(s.sy(yb + vb * VS)));
      }
      if (t < T1 + 0.15) raf = requestAnimationFrame(frame);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, pulses, bead]);

  // Between plays, everything rests on the frozen instant.
  useEffect(() => {
    const s = api.current, e = els.current;
    if (playing || !s) return;
    e.rope?.setAttribute('points', pts(s, pulses, 0));
    pulses.forEach((p, i) => e.comps[i]?.setAttribute('points', pts(s, [p], 0)));
    e.bead?.setAttribute('cy', String(s.sy(y0)));
    e.truth?.setAttribute('y1', String(s.sy(y0)));
    e.truth?.setAttribute('y2', String(s.sy(y0)));
  }, [playing, pulses, y0]);

  const tried = task.attempts > 0 || task.done;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        {tried && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" className="anth-btn" onClick={() => setPlaying(true)} disabled={playing}>
            {playing ? 'Playing…' : 'Play it forward'}
          </button>
          <span className="hud-label">cyan: the bead’s real velocity · white: yours · quarter speed</span>
        </div>}
        <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hit, { u })} miss={miss}
          hit={<>The bead {way(vt)} at {Math.abs(vt).toFixed(1)} m/s and never moves along the rope. {explanation}</>} />
      </div>}>
      <Stage x={X} y={[-1.15, 1.15]} height={280} equal
        label={`A frozen rope with a painted bead at ${bead} metres. Your velocity arrow for the bead is ${um.toFixed(1)} metres per second.`}>
        {(s) => {
          api.current = s;
          return <>
            <line x1={s.sx(bead)} x2={s.sx(bead)} y1={s.sy(-1.05)} y2={s.sy(-0.95)} stroke={C.position} strokeWidth={2} />
            {pulses.length > 1 && pulses.map((p, i) => (
              <polyline key={i} ref={(el) => { els.current.comps[i] = el; }} points={pts(s, [p], 0)} fill="none"
                stroke={C.faint} strokeWidth={1.5} strokeDasharray="5 5" />
            ))}
            {pulses.map((p, i) => {
              const yTop = p.amp > 0 ? p.amp + 0.25 : p.amp - 0.25;
              return <Arrow key={`v${i}`} s={s} from={[p.centre, yTop]} to={[p.centre + p.speed * 0.3, yTop]} color={C.velocity} width={2.5}
                label={`hump ${Math.abs(p.speed)} m/s`} labelSide={p.amp > 0 ? 1 : -1} />;
            })}
            <polyline ref={(el) => { els.current.rope = el; }} points={pts(s, pulses, 0)} fill="none" stroke={C.ink} strokeWidth={3} strokeLinejoin="round" />
            <line ref={(el) => { els.current.truth = el; }} x1={s.sx(bead)} x2={s.sx(bead)} y1={s.sy(y0)} y2={s.sy(y0)}
              stroke={C.velocity} strokeWidth={4} strokeLinecap="round" opacity={0.85} />
            {um > 0.05 && <Arrow s={s} from={[bead, y0]} to={tip} color={C.ink} width={2.5} label={`${um.toFixed(1)} m/s`} />}
            <Handle s={s} at={tip} step={0.03} label="The bead's velocity: drag the arrow tip"
              onChange={(p) => { setTip([Math.max(X[0], Math.min(X[1], p[0])), Math.max(-1.1, Math.min(1.1, p[1]))]); task.touch(); }} />
            <circle ref={(el) => { els.current.bead = el; }} cx={s.sx(bead)} cy={s.sy(y0)} r={6} fill={C.position} pointerEvents="none" />
            <line x1={s.sx(-2.8)} x2={s.sx(-1.8)} y1={s.sy(-1.0)} y2={s.sy(-1.0)} stroke={C.faint} strokeWidth={1.2} />
            <text x={s.sx(-2.3)} y={s.sy(-1.0) - 6} textAnchor="middle" fontSize={12} fill={C.faint}>1 m</text>
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Frozen at one instant · the dot is the painted bead, the tick under it its floor mark{pulses.length > 1 ? ' · dashed: each hump on its own' : ''} · arrow scale 1 m/s = {Math.round(VS * 100)} cm
      </p>
    </SceneCard>
  );
}
