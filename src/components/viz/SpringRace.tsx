import { useEffect, useRef, useState } from 'react';
import { springCart } from '../../lib/physics/periodic-ch14.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * Two carts on identical springs. The top one is pulled a fixed distance; you
 * drag how far to pull yours, then release both together.
 *
 * The strip underneath is the same run as position against time: the peaks
 * grow taller but never slide sideways. Positions and speeds are the exact SHM
 * solution from periodic-ch14.ts (via oscillator.ts), not a tuned animation.
 *
 * Graded (`id` + `ratio`): make yours cross the middle `ratio` times as fast as
 * the top cart. The only way is to pull it `ratio` times as far.
 */
export interface SpringRaceProps {
  id?: string;
  prompt?: string;
  /** Top cart's pull, metres. */
  reference?: number;
  /** Your cart's starting pull, metres. */
  start?: number;
  /** Graded: yours must cross the middle this many times as fast. */
  ratio?: number;
  explanation?: string;
}

const LANES = { ref: 0.62, you: -0.12 };
const WALL = -1.45;
const TR = { t: 10, x0: -1.3, x1: 1.12, y0: -2.05, y1: -0.9 }; // the trace, in stage units
const tx = (t: number) => TR.x0 + (t / TR.t) * (TR.x1 - TR.x0);
const ty = (x: number) => (TR.y0 + TR.y1) / 2 + (x / 1.05) * ((TR.y1 - TR.y0) / 2);

function coil(s: StageApi, x1: number, y: number) {
  const n = 12, pts = [`M${s.sx(WALL)},${s.sy(y)}`];
  for (let i = 1; i < 2 * n; i++) pts.push(`L${s.sx(WALL + ((x1 - WALL) * i) / (2 * n))},${s.sy(y) + (i % 2 ? -7 : 7)}`);
  pts.push(`L${s.sx(x1)},${s.sy(y)}`);
  return pts.join('');
}

export default function SpringRace({ id, prompt, reference = 0.4, start = 0.8, ratio, explanation }: SpringRaceProps) {
  const graded = Boolean(id && ratio);
  const task = useTask(graded ? id : undefined, 'spring-race');
  const [pull, setPull] = useState(start);
  const [running, setRunning] = useState(false);
  const [shown, setShown] = useState({ tripsRef: 0, tripsYou: 0, vRef: 0, vYou: 0 });
  const stage = useRef<StageApi | null>(null);
  const t = useRef(0);
  const run = useRef(false);
  const crossed = useRef({ ref: 0, you: 0 });
  const trips = useRef({ ref: 0, you: 0 });
  const els = useRef<Record<string, SVGElement | null>>({});
  const pullRef = useRef(pull);
  pullRef.current = pull;

  const paint = () => {
    const s = stage.current;
    if (!s) return;
    const time = t.current;
    for (const [key, A] of [['ref', reference], ['you', pullRef.current]] as const) {
      const { x, v } = springCart(A, time);
      const y = LANES[key];
      els.current[`spring-${key}`]?.setAttribute('d', coil(s, x - 0.11, y));
      els.current[`cart-${key}`]?.setAttribute('transform', `translate(${s.sx(x)},${s.sy(y)})`);
      const vx = s.sx(x) + s.len(v * 0.35);
      const arrow = els.current[`v-${key}`];
      if (arrow) {
        arrow.setAttribute('x1', String(s.sx(x)));
        arrow.setAttribute('x2', String(vx));
        arrow.setAttribute('opacity', Math.abs(v) > 0.05 ? '1' : '0');
      }
      const pts: string[] = [];
      for (let i = 0; i <= 240; i++) {
        const tt = (i / 240) * Math.min(time, TR.t);
        pts.push(`${s.sx(tx(tt)).toFixed(1)},${s.sy(ty(springCart(A, tt).x)).toFixed(1)}`);
      }
      els.current[`trace-${key}`]?.setAttribute('points', time > 0 ? pts.join(' ') : '');
    }
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (run.current) {
        const before = t.current;
        t.current += dt;
        // measure the speed at the first pass through the middle, from the run itself
        for (const [key, A] of [['ref', reference], ['you', pullRef.current]] as const) {
          const a = springCart(A, before), b = springCart(A, t.current);
          if (a.x > 0 && b.x <= 0 && !crossed.current[key]) crossed.current[key] = Math.abs(a.v + ((b.v - a.v) * a.x) / (a.x - b.x));
          // one round trip each time it turns round back at its starting point
          if (a.v > 0 && b.v <= 0) trips.current[key] += 1;
        }
      }
      paint();
      if (now - lastShown > 125) {
        lastShown = now;
        setShown({ tripsRef: trips.current.ref, tripsYou: trips.current.you, vRef: crossed.current.ref, vYou: crossed.current.you });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reference]);

  const reset = () => { run.current = false; setRunning(false); t.current = 0; crossed.current = { ref: 0, you: 0 }; trips.current = { ref: 0, you: 0 }; };
  const release = () => { reset(); run.current = true; setRunning(true); task.touch(); };

  const got = shown.vRef > 0 && shown.vYou > 0 ? shown.vYou / shown.vRef : 0;
  const hit = graded && got > 0 && Math.abs(got - ratio!) <= 0.1;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={release}>{running ? 'Release again' : 'Release both'}</button>
          <button type="button" className="anth-btn" onClick={reset}>Reset</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Round trips, top · yours" value={`${shown.tripsRef} · ${shown.tripsYou}`} />
            <Meter label="Top cart at the middle" value={shown.vRef ? shown.vRef.toFixed(2) : '–'} unit="m/s" color={C.velocity} />
            <Meter label="Yours at the middle" value={shown.vYou ? shown.vYou.toFixed(2) : '–'} unit="m/s" color={C.velocity} />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { pull, got })}
          miss={got > 0
            ? `Yours crossed the middle at ${shown.vYou.toFixed(2)} m/s, ${got.toFixed(2)}× the top cart's ${shown.vRef.toFixed(2)} m/s.`
            : 'Neither cart has reached the middle yet. Release them first.'}
          hit={explanation} />}
      </div>}>
      <Stage x={[-1.5, 1.2]} y={[-2.35, 1.05]} height={380}
        label={`Two carts on identical springs. Top pulled ${reference} metres, yours ${pull.toFixed(2)} metres.`}>
        {(s) => {
          stage.current = s;
          const cart = (key: 'ref' | 'you', A: number) => {
            const y = LANES[key], col = key === 'you' ? C.position : C.soft;
            return <g key={key}>
              <text x={s.sx(WALL) + 4} y={s.sy(y + 0.27)} fontSize={13} fill={col}>{key === 'you' ? 'yours' : 'top'}, pulled {A.toFixed(2)} m</text>
              <line x1={s.sx(-1.2)} x2={s.sx(1.15)} y1={s.sy(y) + 22} y2={s.sy(y) + 22} stroke={C.rule} strokeWidth={1.5} />
              <path ref={(el) => { els.current[`spring-${key}`] = el; }} d={coil(s, A - 0.11, y)} fill="none" stroke={C.soft} strokeWidth={1.6} />
              <g ref={(el) => { els.current[`cart-${key}`] = el; }} transform={`translate(${s.sx(A)},${s.sy(y)})`}>
                <rect x={-22} y={-18} width={44} height={36} rx={4} fill={C.surface} stroke={col} strokeWidth={2.2} />
              </g>
              <line ref={(el) => { els.current[`v-${key}`] = el; }} x1={0} x2={0} y1={s.sy(y) - 30} y2={s.sy(y) - 30}
                stroke={C.velocity} strokeWidth={3} markerEnd="url(#sr-head)" opacity={0} />
              <polyline ref={(el) => { els.current[`trace-${key}`] = el; }} points="" fill="none" stroke={col} strokeWidth={2.2} />
            </g>;
          };
          return <>
            <defs><marker id="sr-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0,0L10,5L0,10Z" fill={C.velocity} /></marker></defs>
            <rect x={s.sx(WALL) - 10} y={s.sy(1.0)} width={10} height={s.sy(-0.45) - s.sy(1.0)} fill={C.grid} stroke={C.soft} />
            <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(0.98)} y2={s.sy(-0.42)} stroke={C.faint} strokeDasharray="3 5" />
            <text x={s.sx(0)} y={s.sy(-0.56)} textAnchor="middle" fontSize={12} fill={C.faint}>middle (spring relaxed)</text>
            {/* the companion strip: position against time, same run */}
            {[-1, 0, 1].map((v) => <g key={v}>
              <line x1={s.sx(TR.x0)} x2={s.sx(TR.x1)} y1={s.sy(ty(v))} y2={s.sy(ty(v))} stroke={v === 0 ? C.rule : C.grid} />
              <text x={s.sx(TR.x0) - 6} y={s.sy(ty(v)) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{v}</text>
            </g>)}
            {[0, 2, 4, 6, 8, 10].map((v) => <text key={v} x={s.sx(tx(v))} y={s.sy(TR.y0) + 16} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{v}</text>)}
            <text x={s.sx(TR.x0) + 4} y={s.sy(TR.y1) - 8} fontSize={13} fill={C.soft}>position (m)</text>
            <text x={s.sx(TR.x1)} y={s.sy(TR.y0) + 16} textAnchor="end" fontSize={13} fill={C.soft}>time (s)</text>
            {cart('ref', reference)}
            {cart('you', pull)}
            {!running && <Handle s={s} at={[pull, LANES.you]} color={C.position} step={0.05} label="Your cart: drag to set how far it is pulled"
              onChange={(p) => { setPull(Math.round(Math.max(0.1, Math.min(1, p[0])) * 20) / 20); task.touch(); }} />}
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}
