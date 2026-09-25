import { useEffect, useRef, useState } from 'react';
import {
  SWING, deg, peakAngle, pendulumStep, rad, shove, shoveGain, swingGL, swingJoules,
} from '../../lib/physics/periodic-ch14.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A child on a swing, barely moving, and one button: shove. Each shove is a
 * quick push away from you that adds the same angular velocity (`shove`). The
 * energy it adds is ω·Δω + ½Δω² (`shoveGain`): large when the seat is already
 * rushing away, almost nothing at a standstill, negative when it is coming
 * back at you. The swing itself is the real damped sine pendulum
 * (`pendulumStep`), so the ropes lose a little every cycle.
 *
 * Graded (`id`): reach the dashed 30° mark within ten shoves.
 */
export interface PumpTheSwingProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const SUB = 1 / 1000;

export default function PumpTheSwing({ id, prompt, explanation }: PumpTheSwingProps) {
  const graded = Boolean(id);
  const task = useTask(id, 'pump-the-swing');
  const limit = graded ? SWING.shoves : Infinity;
  const stage = useRef<StageApi | null>(null);
  const sim = useRef({ th: rad(SWING.start), w: 0, best: SWING.start, flash: 0 });
  const log = useRef({ used: 0, against: 0, idle: 0, last: 0 });
  const els = useRef<Record<string, SVGElement | null>>({});
  const [shown, setShown] = useState({ peak: SWING.start, best: SWING.start, used: 0, last: 0, against: 0, idle: 0 });

  const read = () => {
    const m = sim.current, l = log.current;
    setShown({ peak: deg(peakAngle(m.th, m.w)), best: m.best, used: l.used, last: l.last, against: l.against, idle: l.idle });
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const m = sim.current, s = stage.current;
      for (let k = 0; k < Math.round(dt / SUB); k++) [m.th, m.w] = pendulumStep(m.th, m.w, swingGL, SWING.beta, SUB);
      m.best = Math.max(m.best, deg(peakAngle(m.th, m.w)));
      m.flash = Math.max(0, m.flash - dt);
      if (s) {
        const x = Math.sin(m.th), y = -Math.cos(m.th);
        els.current.rope?.setAttribute('x2', String(s.sx(x)));
        els.current.rope?.setAttribute('y2', String(s.sy(y)));
        els.current.seat?.setAttribute('transform', `translate(${s.sx(x)},${s.sy(y)}) rotate(${-deg(m.th)})`);
        const vx = s.sx(x) + s.len(Math.cos(m.th) * m.w * 0.35), vy = s.sy(y + Math.sin(m.th) * m.w * 0.35);
        const v = els.current.v;
        v?.setAttribute('x1', String(s.sx(x))); v?.setAttribute('y1', String(s.sy(y)));
        v?.setAttribute('x2', String(vx)); v?.setAttribute('y2', String(vy));
        v?.setAttribute('opacity', Math.abs(m.w) > 0.05 ? '1' : '0');
        const f = els.current.push;
        f?.setAttribute('transform', `translate(${s.sx(x)},${s.sy(y)}) rotate(${-deg(m.th)})`);
        f?.setAttribute('opacity', m.flash > 0 ? '1' : '0');
      }
      if (now - lastShown > 125) { lastShown = now; read(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const doShove = () => {
    const m = sim.current, l = log.current;
    if (l.used >= limit) return;
    const before = m.w, speedScale = Math.sqrt(2 * (0.5 * m.w * m.w + swingGL * (1 - Math.cos(m.th))));
    l.last = swingJoules(shoveGain(before));
    if (l.last < 0) l.against += 1;
    else if (Math.abs(before) < 0.3 * speedScale) l.idle += 1;
    l.used += 1;
    m.w = shove(before);
    m.flash = 0.35;
    task.touch();
    read();
  };
  const restart = () => {
    sim.current = { th: rad(SWING.start), w: 0, best: SWING.start, flash: 0 };
    log.current = { used: 0, against: 0, idle: 0, last: 0 };
    task.touch();
    read();
  };

  const hit = shown.best >= SWING.target - 0.5;
  const left = limit - shown.used;
  const why = [
    shown.against ? `${shown.against} met the seat coming toward you and took energy out` : '',
    shown.idle ? `${shown.idle} landed near a standstill and added almost nothing` : '',
  ].filter(Boolean).join('; ');

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 22px', fontSize: 15 }} onClick={doShove} disabled={left <= 0}>
            Shove{graded ? ` (${left} left)` : ''}
          </button>
          <button type="button" className="anth-btn" onClick={restart}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Swinging to" value={`${shown.peak.toFixed(0)}°`} color={C.position} />
            <Meter label="Last shove added" value={shown.used ? `${shown.last >= 0 ? '+' : '−'}${Math.abs(shown.last).toFixed(1)}` : '–'} unit="J" color={C.energy} />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { best: shown.best, used: shown.used })}
          miss={`Highest swing ${shown.best.toFixed(0)}°, ${(SWING.target - shown.best).toFixed(0)}° short of the mark after ${shown.used} shoves${why ? `. Of those, ${why}` : ''}.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-1.2, 1.2]} y={[-1.28, 0.1]} height={330} equal label={`A swing, now reaching ${shown.peak.toFixed(0)} degrees`}>
        {(s) => {
          stage.current = s;
          const ray = (a: number, r0: number, r1: number) => ({ x1: s.sx(r0 * Math.sin(a)), y1: s.sy(-r0 * Math.cos(a)), x2: s.sx(r1 * Math.sin(a)), y2: s.sy(-r1 * Math.cos(a)) });
          const t = rad(SWING.target), b = rad(shown.best);
          const th = sim.current.th;
          return <>
            <defs>
              <marker id="pts-v" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0L10,5L0,10Z" fill={C.velocity} /></marker>
            </defs>
            <line x1={s.sx(-0.4)} x2={s.sx(0.4)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={4} />
            <line x1={s.sx(-1.2)} x2={s.sx(1.2)} y1={s.sy(-1.2)} y2={s.sy(-1.2)} stroke={C.rule} strokeWidth={2} />
            {[t, -t].map((a, i) => <line key={i} {...ray(a, 0.55, 1.12)} stroke={C.ink} strokeDasharray="5 5" strokeWidth={1} />)}
            <text x={s.sx(1.12 * Math.sin(t)) + 6} y={s.sy(-1.12 * Math.cos(t)) + 4} fontSize={13} fill={C.ink}>{SWING.target}° mark</text>
            {[b, -b].map((a, i) => <line key={`b${i}`} {...ray(a, 0.93, 1.07)} stroke={C.position} strokeWidth={2.5} />)}
            {/* you, standing behind the swing */}
            <g stroke={C.soft} strokeWidth={2} fill="none">
              <circle cx={s.sx(-0.72)} cy={s.sy(-0.62)} r={11} />
              <line x1={s.sx(-0.72)} x2={s.sx(-0.72)} y1={s.sy(-0.68)} y2={s.sy(-0.98)} />
              <line x1={s.sx(-0.72)} x2={s.sx(-0.6)} y1={s.sy(-0.75)} y2={s.sy(-0.82)} />
              <line x1={s.sx(-0.72)} x2={s.sx(-0.8)} y1={s.sy(-0.98)} y2={s.sy(-1.2)} />
              <line x1={s.sx(-0.72)} x2={s.sx(-0.64)} y1={s.sy(-0.98)} y2={s.sy(-1.2)} />
            </g>
            <text x={s.sx(-0.72)} y={s.sy(-0.5)} textAnchor="middle" fontSize={13} fill={C.soft}>you</text>
            <line ref={(el) => { els.current.rope = el; }} x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(Math.sin(th))} y2={s.sy(-Math.cos(th))} stroke={C.soft} strokeWidth={1.8} />
            <g ref={(el) => { els.current.seat = el; }} transform={`translate(${s.sx(Math.sin(th))},${s.sy(-Math.cos(th))}) rotate(${-deg(th)})`}>
              <rect x={-18} y={-3} width={36} height={7} rx={2} fill={C.surface} stroke={C.soft} strokeWidth={2} />
              <circle cx={0} cy={-30} r={10} fill={C.surface} stroke={C.position} strokeWidth={2.2} />
              <line x1={0} x2={0} y1={-20} y2={-4} stroke={C.position} strokeWidth={2.2} />
            </g>
            <g ref={(el) => { els.current.push = el; }} opacity={0}>
              <line x1={-62} x2={-26} y1={-14} y2={-14} stroke={C.force} strokeWidth={4} />
              <path d="M-22,-14L-32,-21L-32,-7Z" fill={C.force} />
            </g>
            <line ref={(el) => { els.current.v = el; }} stroke={C.velocity} strokeWidth={3} markerEnd="url(#pts-v)" opacity={0} />
            <g fontSize={13}>
              <line x1={s.sx(0.62)} x2={s.sx(0.72)} y1={s.sy(-1.0)} y2={s.sy(-1.0)} stroke={C.position} strokeWidth={2.5} />
              <text x={s.sx(0.75)} y={s.sy(-1.0) + 4} fill={C.soft}>highest so far</text>
              <line x1={s.sx(0.62)} x2={s.sx(0.72)} y1={s.sy(-1.09)} y2={s.sy(-1.09)} stroke={C.velocity} strokeWidth={3} />
              <text x={s.sx(0.75)} y={s.sy(-1.09) + 4} fill={C.soft}>velocity</text>
            </g>
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}
