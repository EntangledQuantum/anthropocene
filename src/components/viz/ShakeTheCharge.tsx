import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  C_NS, createNewsClock, fieldDirection, fieldLine, measuredSpeed, moveCharge, newsStep,
  startNews, type History, type NewsClock,
} from '../../lib/physics/emwaves.ts';
import { Handle, C, CheckBar, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A charge on a rod in empty space, and its field lines. Drag the charge and
 * let go: a kink in every field line runs outward, and outside it the lines
 * still point at where the charge used to be. A detector on the right shows
 * the field's direction where it sits and times the news from the moment the
 * charge leaves rest.
 *
 * `mode="around"` centres the charge and drops the detector, so the whole
 * pattern shows: no kink ever runs straight up or down the rod.
 * With `id` and `targetNs`, the detector can be dragged and the scene grades
 * itself: place it where the news arrives `targetNs` after the shake.
 *
 * Physics: the emission-rule field lines, retarded time and news stopwatch in
 * src/lib/physics/emwaves.ts. The rule is exact outside the ripple for a charge
 * that has come to rest and a first-order sketch inside it, so the charge is
 * capped at half the speed of light.
 */
export interface ShakeTheChargeProps {
  id?: string;
  prompt?: string;
  mode?: 'line' | 'around';
  /** Detector distance from the rod, m. */
  detectorAt?: number;
  /** Graded: place the detector where the news takes this long, ns. */
  targetNs?: number;
  explanation?: string;
}

const RATE = 8;          // nanoseconds of scene time per real second
const VMAX = 0.5 * C_NS; // the charge's speed limit, m/ns
const REACH = 1.1;       // how far the charge can go up or down the rod, m
const LINES = 16;
const R_CHARGE = 0.22;

export default function ShakeTheCharge({ id, prompt, mode = 'line', detectorAt = 9, targetNs, explanation }: ShakeTheChargeProps) {
  const graded = Boolean(id && targetNs !== undefined);
  const task = useTask(graded ? id : undefined, 'shake-the-charge');
  const around = mode === 'around';
  const [det, setDet] = useState(detectorAt);
  const detRef = useRef(detectorAt);
  const sim = useRef({ t: 0, y: 0, target: 0, dragging: false, rest: true });
  const hist = useRef<History>([{ t: -1e6, y: 0 }, { t: 0, y: 0 }]);
  const clock = useRef<NewsClock>(createNewsClock());
  const timedAt = useRef<number | null>(null);
  const api = useRef<StageApi | null>(null);
  const root = useRef<SVGGElement | null>(null);
  const els = useRef<{ lines: (SVGPolylineElement | null)[]; charge?: SVGGElement | null; eArrow?: SVGLineElement | null; eHead?: SVGPathElement | null; det?: SVGRectElement | null }>({ lines: [] });
  const [shown, setShown] = useState<{ since: number | null; delay: number | null; speed: number | null; armed: boolean }>({ since: null, delay: null, speed: null, armed: false });
  const rMax = around ? 8 : 16;

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05) * RATE;
      last = now;
      const s = sim.current, h = hist.current;
      const tPrev = s.t, yPrev = s.y;
      s.t += dt;
      s.y = moveCharge(s.y, s.target, dt, VMAX);
      const moving = s.y !== yPrev;
      if (moving && s.rest && !around) {
        // The charge leaves rest at the last frame: start the stopwatch there.
        startNews(clock.current, tPrev, yPrev, [detRef.current, 0]);
        timedAt.current = detRef.current;
      }
      s.rest = !moving;
      h.push({ t: s.t, y: s.y });
      const cutoff = s.t - rMax / C_NS - 2;
      while (h.length > 3 && h[1].t < cutoff) h.shift();
      if (!around) newsStep(clock.current, h, s.t);

      const a = api.current, e = els.current;
      if (a) {
        for (let k = 0; k < LINES; k++) {
          const pts = fieldLine(h, s.t, (2 * Math.PI * k) / LINES, rMax, 0.04, C_NS, R_CHARGE);
          e.lines[k]?.setAttribute('points', pts.map((p) => `${a.sx(p[0]).toFixed(1)},${a.sy(p[1]).toFixed(1)}`).join(' '));
        }
        e.charge?.setAttribute('transform', `translate(0, ${(a.sy(s.y) - a.sy(0)).toFixed(1)})`);
        if (!around) {
          const D: [number, number] = [detRef.current, 0];
          const d = fieldDirection(h, D, s.t);
          const x1 = a.sx(D[0]), y1 = a.sy(D[1]), L = 34;
          const x2 = x1 + d[0] * L, y2 = y1 - d[1] * L;
          e.eArrow?.setAttribute('x1', String(x1)); e.eArrow?.setAttribute('y1', String(y1));
          e.eArrow?.setAttribute('x2', String(x2)); e.eArrow?.setAttribute('y2', String(y2));
          const px = -d[1], py = -d[0]; // screen-space normal
          e.eHead?.setAttribute('d', `M${x2 + d[0] * 9},${y2 - d[1] * 9}L${x2 + px * 6},${y2 + py * 6}L${x2 - px * 6},${y2 - py * 6}Z`);
        }
      }
      if (now - lastShown > 120) {
        lastShown = now;
        const c = clock.current;
        setShown({
          since: c.state === 'idle' ? null : s.t - c.tStart,
          delay: c.delay, speed: measuredSpeed(c), armed: c.state === 'armed',
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [around, rMax]);

  const toWorldY = (clientY: number) => {
    const a = api.current, svg = root.current?.ownerSVGElement, ctm = svg?.getScreenCTM();
    if (!a || !ctm) return 0;
    const p = new DOMPoint(0, clientY).matrixTransform(ctm.inverse());
    return (p.y - a.sy(0)) / (a.sy(1) - a.sy(0));
  };
  const aim = (y: number) => { sim.current.target = Math.max(-REACH, Math.min(REACH, y)); task.touch(); };
  const onDrag = (e: RPointerEvent) => { if (sim.current.dragging) aim(toWorldY(e.clientY)); };

  const moveDetector = (x: number) => {
    const v = Math.round(Math.max(2, Math.min(12, x)) * 10) / 10;
    if (v === detRef.current) return;
    detRef.current = v; setDet(v);
    clock.current = createNewsClock();
    timedAt.current = null;
    task.touch();
  };

  const timedHere = shown.delay !== null && timedAt.current === det;
  const off = graded && timedHere ? Math.abs(shown.delay! - targetNs!) : Infinity;
  const hit = off <= 0.5;

  const xr: [number, number] = around ? [-5, 5] : [-2.8, 12.8];
  const yr: [number, number] = [-4.2, 4.2];

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        {!around && <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Since the charge moved" value={shown.since === null ? '—' : shown.since.toFixed(1)} unit={shown.since === null ? undefined : 'ns'} />
          <Meter label="News reached the detector" value={shown.armed ? 'waiting…' : shown.delay === null ? '—' : shown.delay.toFixed(1)} unit={shown.delay === null || shown.armed ? undefined : 'ns'} color={C.field} />
          <Meter label="Distance ÷ time" value={shown.speed === null || shown.armed ? '—' : (shown.speed / 1e8).toFixed(2)} unit={shown.speed === null || shown.armed ? undefined : '× 10⁸ m/s'} />
          {graded && <Meter label="Target" value={targetNs!.toFixed(0)} unit="ns" color={C.soft} />}
        </div>}
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { det, delay: shown.delay })}
          miss={shown.armed
            ? `The news has not reached the detector at ${det.toFixed(1)} m yet.`
            : !timedHere
              ? `The detector at ${det.toFixed(1)} m has not been timed. Move the charge.`
              : `At ${det.toFixed(1)} m the news took ${shown.delay!.toFixed(1)} ns, ${off.toFixed(1)} ns ${shown.delay! > targetNs! ? 'late' : 'early'}.`}
          hit={explanation} />}
      </div>}>
      <Stage x={xr} y={yr} height={around ? 330 : 340} equal
        label={around ? 'A charge on a vertical rod with sixteen field lines around it.' : `A charge on a vertical rod, its field lines, and a detector ${det.toFixed(1)} metres to the right.`}>
        {(s) => {
          api.current = s;
          return <g ref={root}>
            {/* distance scale along the axis */}
            {!around && [0, 3, 6, 9, 12].map((m) => <g key={m}>
              <line x1={s.sx(m)} x2={s.sx(m)} y1={s.sy(-3.55)} y2={s.sy(-3.75)} stroke={C.faint} />
              <text x={s.sx(m)} y={s.sy(-3.75) + 15} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{m} m</text>
            </g>)}
            {!around && <line x1={s.sx(0)} x2={s.sx(12)} y1={s.sy(-3.65)} y2={s.sy(-3.65)} stroke={C.faint} />}
            {Array.from({ length: LINES }, (_, k) => (
              <polyline key={k} ref={(el) => { els.current.lines[k] = el; }} fill="none" stroke={C.field} strokeWidth={1.8} strokeLinejoin="round" opacity={0.85} />
            ))}
            {/* the rod */}
            <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(REACH + 0.3)} y2={s.sy(-REACH - 0.3)} stroke={C.rule} strokeWidth={5} strokeLinecap="round" />
            {/* the detector */}
            {!around && <g>
              <rect ref={(el) => { els.current.det = el; }} x={s.sx(det) - 9} y={s.sy(0) - 9} width={18} height={18} rx={3} fill={C.surface} stroke={C.ink} strokeWidth={2} />
              <line ref={(el) => { els.current.eArrow = el; }} stroke={C.field} strokeWidth={3.2} strokeLinecap="round" />
              <path ref={(el) => { els.current.eHead = el; }} fill={C.field} />
              <text x={s.sx(det)} y={s.sy(0) + 30} textAnchor="middle" fontSize={13} fill={C.soft}
                stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">detector · {det.toFixed(1)} m</text>
              {graded && <Handle s={s} at={[det, -1.55]} r={8} step={0.1} label="Detector position: drag left or right"
                onChange={(p) => moveDetector(p[0])} clamp={(p) => [p[0], -1.55]} />}
            </g>}
            {/* the charge */}
            <g ref={(el) => { els.current.charge = el; }}>
              <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(R_CHARGE)} fill={C.surface} stroke={C.ink} strokeWidth={2.5} pointerEvents="none" />
              <text x={s.sx(0)} y={s.sy(0) + 6} textAnchor="middle" fontSize={17} fontWeight={600} fill={C.ink} pointerEvents="none">+</text>
              <circle cx={s.sx(0)} cy={s.sy(0)} r={26} fill="transparent" style={{ cursor: 'ns-resize' }}
                tabIndex={0} role="slider" aria-label="The charge: drag it up or down the rod. Arrow keys jump it to the top or bottom, Home to the middle."
                aria-valuetext={`${sim.current.target.toFixed(1)} metres`}
                onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); sim.current.dragging = true; aim(toWorldY(e.clientY)); }}
                onPointerMove={onDrag}
                onPointerUp={() => { sim.current.dragging = false; }}
                onKeyDown={(e) => {
                  const to = e.key === 'ArrowUp' ? REACH : e.key === 'ArrowDown' ? -REACH : e.key === 'Home' ? 0 : null;
                  if (to !== null) { e.preventDefault(); aim(to); }
                }} />
            </g>
          </g>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Empty space · orchid: electric field lines{!around && ', and the field’s direction at the detector'} · played 125 million times slower · the charge is held below half the speed of light · lines drawn by the slow-charge rule
      </p>
    </SceneCard>
  );
}
