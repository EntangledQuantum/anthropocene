import { useEffect, useRef, useState } from 'react';
import { columnHeight, pipeArea, venturiAt, waistDiameter, type Venturi } from '../../lib/physics/fluids.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { WATER_FILL, WATER_LINE } from './fluid-kit.tsx';

/**
 * Water pumped steadily along a round pipe with a waist you can pinch (drag
 * the waist's wall). Three open glass tubes stand on the pipe: the height the
 * water stands in each is the pressure there. Tracer dots ride the flow.
 *
 * Pinch, and the dots race through the waist while the middle column drops:
 * the fast water is at low pressure. Pinch hard and the waist falls below the
 * air's pressure, and the middle tube sucks air in instead.
 *
 * Graded with `id` and `target`: make the waist water `target` times as fast.
 * The waist's speed is covered until you check. Physics: `venturiAt`.
 */
export interface PinchThePipeProps {
  id?: string;
  prompt?: string;
  /** Speed ratio to reach, waist over pipe. */
  target?: number;
  /** Starting waist diameter as a fraction of the pipe's. */
  start?: number;
  explanation?: string;
}

const D = 0.12, XC = 0.8, HW = 0.28, LEN = 1.6, SLOW = 4;
const TUBES = [0.25, XC, 1.35];
const LANES = [-0.66, -0.33, 0, 0.33, 0.66];

export default function PinchThePipe({ id, prompt, target, start = 1, explanation }: PinchThePipeProps) {
  const graded = Boolean(id && target);
  const task = useTask(graded ? id : undefined, 'pinch-the-pipe');
  const [d, setD] = useState(D * start);
  const dRef = useRef(d);
  dRef.current = d;
  const dots = useRef<SVGPathElement>(null);
  const stage = useRef<StageApi | null>(null);
  const vt: Venturi = { D, d, xc: XC, hw: HW, v1: 1, p1: 0.4 * 1000 * 9.81 };

  useEffect(() => {
    // tracers, evenly spaced in *volume*, so their spacing stretches where the water is fast
    const xs = LANES.map(() => Array.from({ length: 22 }, (_, i) => (i * LEN) / 22));
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05) / SLOW;
      last = now;
      const s = stage.current, el = dots.current;
      if (s && el) {
        const v: Venturi = { ...vt, d: dRef.current };
        let path = '';
        for (let l = 0; l < LANES.length; l++) for (let i = 0; i < xs[l].length; i++) {
          let x = xs[l][i];
          // midpoint step: speed changes across the waist
          const vm = venturiAt(v, x + 0.5 * venturiAt(v, x).v * dt).v;
          x += vm * dt;
          if (x > LEN) x -= LEN;
          xs[l][i] = x;
          const y = (LANES[l] * waistDiameter(x, D, v.d, XC, HW)) / 2;
          const px = s.sx(x), py = s.sy(y);
          path += `M${(px - 2.6).toFixed(1)},${py.toFixed(1)}a2.6,2.6 0 1,0 5.2,0a2.6,2.6 0 1,0 -5.2,0`;
        }
        el.setAttribute('d', path);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const waist = venturiAt(vt, XC);
  const ratio = waist.v / vt.v1;
  const revealed = !graded || task.verdict !== 'none' || task.done;
  const cm = (m: number) => `${(m * 100).toFixed(1)} cm`;
  const wall = (sgn: 1 | -1, s: StageApi, back = false) => Array.from({ length: 81 }, (_, i) => {
    const x = -0.12 + ((back ? 80 - i : i) * (LEN + 0.24)) / 80;
    return `${i ? 'L' : 'M'}${s.sx(x).toFixed(1)},${s.sy((sgn * waistDiameter(x, D, d, XC, HW)) / 2).toFixed(1)}`;
  }).join('');

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Speed in the pipe" value={vt.v1.toFixed(2)} unit="m/s" color={C.velocity} />
          <Meter label="Speed in the waist" value={revealed ? waist.v.toFixed(2) : 'covered'} unit={revealed ? 'm/s' : undefined} color={C.velocity} />
          <Meter label="Waist across" value={cm(d)} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(Math.abs(ratio - target!) <= 0.1, { d })}
          miss={`The waist is ${cm(d)} across, ${((d / D) * 100).toFixed(0)}% of the pipe's width, so its area is ${((pipeArea(d) / pipeArea(D)) * 100).toFixed(0)}% and the water there runs ${ratio.toFixed(2)}× as fast.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-0.12, LEN + 0.12]} y={[-0.12, 0.76]} height={320} equal label={`A pipe 12 cm across pinched to ${cm(d)}. Water stands ${cm(columnHeight(waist.p))} high over the waist.`}>
        {(s) => { stage.current = s; return <>
          {/* the water in the pipe */}
          <path d={`${wall(1, s)}${wall(-1, s, true).replace(/^M/, 'L')}Z`} fill={WATER_FILL} />
          {LANES.map((f) => <path key={f} d={Array.from({ length: 61 }, (_, i) => { const x = -0.12 + (i * (LEN + 0.24)) / 60; return `${i ? 'L' : 'M'}${s.sx(x).toFixed(1)},${s.sy((f * waistDiameter(x, D, d, XC, HW)) / 2).toFixed(1)}`; }).join('')} fill="none" stroke={C.ghost} strokeWidth={1} />)}
          <path ref={dots} fill={C.velocity} />
          <path d={wall(1, s)} fill="none" stroke={C.soft} strokeWidth={2.5} />
          <path d={wall(-1, s)} fill="none" stroke={C.soft} strokeWidth={2.5} />
          {/* height scale for the columns, measured from the pipe's axis */}
          {[0.1, 0.2, 0.3, 0.4, 0.5].map((h) => <g key={h}>
            <line x1={s.sx(0.1)} x2={s.sx(1.5)} y1={s.sy(h)} y2={s.sy(h)} stroke={C.grid} />
            <text x={s.sx(0.08)} y={s.sy(h) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{h}</text>
          </g>)}
          <text x={s.sx(-0.1)} y={s.sy(0.6)} fontSize={12} fill={C.faint}>height (m)</text>
          {TUBES.map((x) => {
            const { p } = venturiAt(vt, x);
            const h = columnHeight(p), base = waistDiameter(x, D, d, XC, HW) / 2, w = 0.035;
            const sucking = h < base;
            return <g key={x}>
              {!sucking && <rect x={s.sx(x - w / 2)} y={s.sy(h)} width={s.len(w)} height={s.sy(base) - s.sy(h)} fill={WATER_FILL} />}
              {!sucking && <line x1={s.sx(x - w / 2)} x2={s.sx(x + w / 2)} y1={s.sy(h)} y2={s.sy(h)} stroke={WATER_LINE} strokeWidth={2.5} />}
              <line x1={s.sx(x - w / 2)} x2={s.sx(x - w / 2)} y1={s.sy(base)} y2={s.sy(0.55)} stroke={C.soft} strokeWidth={2} />
              <line x1={s.sx(x + w / 2)} x2={s.sx(x + w / 2)} y1={s.sy(base)} y2={s.sy(0.55)} stroke={C.soft} strokeWidth={2} />
              {sucking && <>
                {[0, 1, 2].map((k) => <circle key={k} cx={s.sx(x + (k - 1) * 0.012)} cy={s.sy(base - 0.012 - k * 0.008)} r={3} fill="none" stroke={C.ink} />)}
                <text x={s.sx(x)} y={s.sy(0.58)} textAnchor="middle" fontSize={12} fill={C.warn}>below air pressure: sucks air in</text>
              </>}
            </g>;
          })}
          <text x={s.sx(-0.1)} y={s.sy(-0.1)} fontSize={12} fill={C.faint}>pipe 12 cm across</text>
          <text x={s.sx(XC)} y={s.sy(-d / 2 - 0.035)} textAnchor="middle" fontSize={12} fill={C.soft}>waist {cm(d)}</text>
          <Handle s={s} at={[XC, d / 2]} color={C.ink} step={0.001} r={7} label="The waist's wall: drag down to pinch"
            onChange={(p) => { setD(Math.min(D, Math.max(0.05, 2 * p[1]))); task.touch(); }} />
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Water pumped at 1 m/s, no friction · shown {SLOW}× slower than life · each column stands as high as the pressure under it can hold
      </p>
    </SceneCard>
  );
}
