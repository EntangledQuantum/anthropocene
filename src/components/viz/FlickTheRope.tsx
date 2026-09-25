import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  crossingTime, createRope, createStopwatch, flick, hangerTension, maxHeight, ropeDt, setTension,
  stepRope, stillRope, stopwatchStep, type Rope, type Stopwatch,
} from '../../lib/physics/waves.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A heavy rope runs from your hand over a pulley to a hanger. Drag your end
 * up and let go: a hump runs down the rope, lifts the painted bead and sets
 * it back where it was. A stopwatch times the hump from your hand to the bead.
 *
 * Flick big or small, quick or slow: the time does not change. With `id` and
 * `targetRatio`, the hanger becomes the one thing you may change, and the
 * scene grades itself: make the hump reach the bead in `targetRatio` of the
 * time it takes with the starting load.
 *
 * Physics: the leapfrog rope and the stopwatch in src/lib/physics/waves.ts.
 */
export interface FlickTheRopeProps {
  id?: string;
  prompt?: string;
  /** Starting hanger mass, kg (whole kilograms). */
  load?: number;
  /** Graded: reach the bead in this fraction of the starting time. */
  targetRatio?: number;
  explanation?: string;
}

const L = 6, BEAD = 4, MU = 2, CELLS = 240, PLAY = 0.5, REACH = 0.6, MAX_LOAD = 20;
const BRICK_H = 0.052, HOOK_Y = -0.62, PULLEY_R = 0.2;

export default function FlickTheRope({ id, prompt, load: load0 = 4, targetRatio, explanation }: FlickTheRopeProps) {
  const graded = Boolean(id && targetRatio);
  const task = useTask(graded ? id : undefined, 'flick-the-rope');
  const [load, setLoad] = useState(load0);
  const rope = useRef<Rope>(createRope({ length: L, cells: CELLS, tension: hangerTension(load0), mu: MU }));
  const sw = useRef<Stopwatch>(createStopwatch());
  const hand = useRef({ y: 0, target: 0, mode: 'rest' as 'rest' | 'drag' | 'flick' | 'return', t0: 0, from: 0, amp: 0.3, dur: 0.25 });
  const trail = useRef({ lo: 0, hi: 0 });
  const timedLoad = useRef<number | null>(null);
  const api = useRef<StageApi | null>(null);
  const svgRef = useRef<SVGGElement | null>(null);
  const els = useRef<{ rope?: SVGPolylineElement | null; hand?: SVGGElement | null; bead?: SVGCircleElement | null; trail?: SVGLineElement | null }>({});
  const [shown, setShown] = useState<{ crossing: number | null; timing: boolean }>({ crossing: null, timing: false });

  const target = targetRatio ? targetRatio * crossingTime(BEAD, load0, MU) : null;
  const beadNode = Math.round(BEAD / rope.current.dx);

  /** A fresh, still rope and a fresh stopwatch. */
  const settle = () => {
    stillRope(rope.current);
    sw.current = createStopwatch();
    trail.current = { lo: 0, hi: 0 };
    hand.current.y = hand.current.target = 0;
  };

  const startFlick = (amp: number) => {
    settle();
    Object.assign(hand.current, { mode: 'flick', t0: rope.current.t, amp, dur: 0.25 });
    task.touch();
  };

  const changeLoad = (m: number) => {
    const next = Math.max(1, Math.min(MAX_LOAD, Math.round(m)));
    if (next === load) return;
    setLoad(next);
    setTension(rope.current, hangerTension(next));
    settle();
    timedLoad.current = null;
    setShown({ crossing: null, timing: false });
    task.touch();
  };

  // The loop lives in refs; React only hears about it at ~8 Hz.
  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0, acc = 0;
    const frame = (now: number) => {
      acc += Math.min((now - last) / 1000, 0.05) * PLAY;
      last = now;
      const r = rope.current, h = hand.current, dt = ropeDt(r);
      const n = Math.floor(acc / dt);
      acc -= n * dt;
      const fromY = h.y;
      for (let k = 1; k <= n; k++) {
        const t = r.t + dt;
        let y = h.y;
        if (h.mode === 'drag') y = fromY + ((h.target - fromY) * k) / n;
        else if (h.mode === 'flick') { y = flick(t - h.t0, h.amp, h.dur); if (t - h.t0 >= h.dur) h.mode = 'rest'; }
        else if (h.mode === 'return') {
          const u = Math.min(1, (t - h.t0) / 0.12);
          y = h.from * Math.cos((u * Math.PI) / 2) ** 2;
          if (u >= 1) h.mode = 'rest';
        } else y = 0;
        h.y = y;
        const still = maxHeight(r) < 0.002;
        stepRope(r, y);
        stopwatchStep(sw.current, r.t, y, r.y[beadNode], still);
        if (sw.current.state === 'armed' || sw.current.state === 'done') {
          const b = r.y[beadNode];
          trail.current.lo = Math.min(trail.current.lo, b);
          trail.current.hi = Math.max(trail.current.hi, b);
        }
      }
      if (sw.current.state === 'done' && timedLoad.current === null) timedLoad.current = rope.current.tension;
      const s = api.current, e = els.current;
      if (s) {
        e.rope?.setAttribute('points', Array.from(r.y, (v, i) => `${s.sx(i * r.dx).toFixed(1)},${s.sy(v).toFixed(1)}`).join(' '));
        e.hand?.setAttribute('transform', `translate(0, ${s.sy(h.y) - s.sy(0)})`);
        e.bead?.setAttribute('cy', String(s.sy(r.y[beadNode])));
        e.trail?.setAttribute('y1', String(s.sy(trail.current.hi)));
        e.trail?.setAttribute('y2', String(s.sy(trail.current.lo)));
      }
      if (now - lastShown > 120) {
        lastShown = now;
        setShown({ crossing: sw.current.crossing, timing: sw.current.state === 'armed' });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [beadNode]);

  const toWorld = (clientX: number, clientY: number): [number, number] | null => {
    const s = api.current, g = svgRef.current;
    const svg = g?.ownerSVGElement;
    const ctm = svg?.getScreenCTM();
    if (!s || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [(p.x - s.sx(0)) / (s.sx(1) - s.sx(0)), (p.y - s.sy(0)) / (s.sy(1) - s.sy(0))];
  };
  const dragHand = (e: RPointerEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    if (w) hand.current.target = Math.max(-REACH, Math.min(REACH, w[1]));
  };
  const loadFromY = (clientY: number) => {
    const w = toWorld(0, clientY);
    if (w) changeLoad((HOOK_Y - w[1]) / BRICK_H);
  };

  const timedHere = shown.crossing !== null && timedLoad.current === hangerTension(load);
  const off = target && shown.crossing !== null ? Math.abs(shown.crossing - target) : Infinity;
  const hit = graded && timedHere && off <= 0.025 * target!;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Hand to bead" value={shown.timing ? 'timing…' : shown.crossing === null ? '—' : shown.crossing.toFixed(2)} unit={shown.crossing === null || shown.timing ? undefined : 's'} />
          {target !== null && <Meter label="Target" value={target.toFixed(2)} unit="s" color={C.soft} />}
          <Meter label="Hanger" value={String(load)} unit="kg" color={C.force} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { load, crossing: shown.crossing })}
          miss={!timedHere
            ? `Flick it first: ${load} kg has not been timed yet.`
            : `With ${load} kg the hump reached the bead in ${shown.crossing!.toFixed(2)} s, ${shown.crossing! > target! ? 'slower' : 'faster'} than the ${target!.toFixed(2)} s target.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-0.5, 7]} y={[-2.3, 1.06]} height={300} equal
        label={`A rope from your hand over a pulley to a ${load} kilogram hanger, with a painted bead 4 metres along.`}>
        {(s) => {
          api.current = s;
          const px = (d: number) => s.len(d);
          const stackBottom = HOOK_Y - load * BRICK_H;
          return <g ref={svgRef}>
            {/* the bead's floor mark and the path it has traced */}
            <line x1={s.sx(BEAD)} x2={s.sx(BEAD)} y1={s.sy(-0.75)} y2={s.sy(-0.85)} stroke={C.position} strokeWidth={2} />
            <text x={s.sx(BEAD)} y={s.sy(-0.85) + 16} textAnchor="middle" fontSize={12} fill={C.faint}>{BEAD} m</text>
            <line ref={(el) => { els.current.trail = el; }} x1={s.sx(BEAD)} x2={s.sx(BEAD)} y1={s.sy(0)} y2={s.sy(0)}
              stroke={C.position} strokeWidth={6} strokeLinecap="round" opacity={0.35} />
            {/* the pulley, the drop and the hanger */}
            <circle cx={s.sx(L)} cy={s.sy(-PULLEY_R)} r={px(PULLEY_R)} fill="none" stroke={C.soft} strokeWidth={2} />
            <line x1={s.sx(L)} x2={s.sx(L + 0.35)} y1={s.sy(-PULLEY_R)} y2={s.sy(-1.4)} stroke={C.grid} strokeWidth={3} />
            <line x1={s.sx(L + PULLEY_R)} x2={s.sx(L + PULLEY_R)} y1={s.sy(-PULLEY_R)} y2={s.sy(HOOK_Y)} stroke={C.soft} strokeWidth={2.5} />
            <g tabIndex={graded ? 0 : -1} role={graded ? 'slider' : undefined} aria-label="Hanger load: drag the bottom of the stack, or use the arrow keys"
              aria-valuetext={`${load} kilograms`} style={{ cursor: graded ? 'ns-resize' : 'default' }}
              onPointerDown={(e) => { if (!graded) return; (e.target as Element).setPointerCapture(e.pointerId); loadFromY(e.clientY); }}
              onPointerMove={(e) => { if (graded && (e.buttons & 1)) loadFromY(e.clientY); }}
              onKeyDown={(e) => {
                if (!graded) return;
                const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
                if (d) { e.preventDefault(); changeLoad(load + d); }
              }}>
              <rect x={s.sx(L + PULLEY_R - 0.3)} y={s.sy(HOOK_Y)} width={px(0.6)} height={px(load * BRICK_H + 0.25)} fill="transparent" />
              {Array.from({ length: load }, (_, k) => (
                <rect key={k} x={s.sx(L + PULLEY_R - 0.17)} y={s.sy(HOOK_Y - k * BRICK_H)} width={px(0.34)} height={px(BRICK_H) - 1.5}
                  rx={1.5} fill={C.surface} stroke={C.force} strokeWidth={1.4} />
              ))}
              <text x={s.sx(L + PULLEY_R + 0.24)} y={s.sy(stackBottom) - 2} fontSize={13} fill={C.force}>{load} kg</text>
            </g>
            {/* the rope */}
            <polyline ref={(el) => { els.current.rope = el; }} points={`${s.sx(0)},${s.sy(0)} ${s.sx(L)},${s.sy(0)}`}
              fill="none" stroke={C.ink} strokeWidth={3} strokeLinejoin="round" />
            <circle ref={(el) => { els.current.bead = el; }} cx={s.sx(BEAD)} cy={s.sy(0)} r={7} fill={C.position} stroke={C.surface} strokeWidth={2} />
            {/* your hand */}
            <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(REACH)} y2={s.sy(-REACH)} stroke={C.grid} strokeWidth={2} strokeDasharray="3 5" />
            <g ref={(el) => { els.current.hand = el; }}>
              <circle cx={s.sx(0)} cy={s.sy(0)} r={24} fill="transparent" style={{ cursor: 'grab' }}
                tabIndex={0} role="button" aria-label="Your end of the rope. Drag it up and let go. Keys: space for a flick, arrow up for a big one, arrow down for a small one."
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture(e.pointerId);
                  if (maxHeight(rope.current) > 0.002 || sw.current.state !== 'idle') settle();
                  hand.current.mode = 'drag';
                  dragHand(e);
                  task.touch();
                }}
                onPointerMove={(e) => { if (hand.current.mode === 'drag') dragHand(e); }}
                onPointerUp={() => { const h = hand.current; if (h.mode === 'drag') Object.assign(h, { mode: 'return', from: h.y, t0: rope.current.t }); }}
                onKeyDown={(e) => {
                  const amp = e.key === ' ' || e.key === 'Enter' ? 0.3 : e.key === 'ArrowUp' ? 0.55 : e.key === 'ArrowDown' ? 0.12 : 0;
                  if (amp && !e.repeat) { e.preventDefault(); startFlick(amp); }
                }} />
              <circle cx={s.sx(0)} cy={s.sy(0)} r={11} fill={C.surface} stroke={C.ink} strokeWidth={2.5} pointerEvents="none" />
              <text x={s.sx(0)} y={s.sy(0) - 18} textAnchor="middle" fontSize={13} fill={C.soft} pointerEvents="none">you</text>
            </g>
            {/* scale */}
            <line x1={s.sx(0)} x2={s.sx(1)} y1={s.sy(-1.9)} y2={s.sy(-1.9)} stroke={C.faint} strokeWidth={1.2} />
            <text x={s.sx(0.5)} y={s.sy(-1.9) - 6} textAnchor="middle" fontSize={12} fill={C.faint}>1 m</text>
          </g>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Rope {MU} kg per metre · each brick 1 kg · played at half speed · grabbing the end stills the rope
      </p>
    </SceneCard>
  );
}
