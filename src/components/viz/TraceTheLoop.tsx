import { useRef, useState } from 'react';
import { MU0, circulation, siUnit, type Wire } from '../../lib/physics/biot.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';
import { CurrentMark, FieldKey, FieldLinesStage, ScaleBar } from './magnet-kit-ch28.tsx';

/**
 * Long wires seen end-on, and a loop you draw by hand: press, drag round,
 * release. The meter walks the loop and adds up B·dl all the way round
 * (`circulation` in biot.ts, integrated numerically along exactly the path
 * you drew). Whatever the shape, it only ever reads μ₀ times the current the
 * loop wraps, and it counts that current backwards if you walk clockwise.
 *
 * Graded (`id` + `target`): make the meter read μ₀ × target amperes.
 */
export interface TraceTheLoopProps {
  id?: string;
  prompt?: string;
  /** Wires in cm; I in A, + out of the page. */
  wires: { x: number; y: number; I: number }[];
  /** Enclosed current to aim for, A. */
  target?: number;
  /** Error that still counts, as a fraction of μ₀ × 1 A. */
  tolerance?: number;
  explanation?: string;
}

const WIRE_R = 0.5; // cm, the drawn wire's radius

export default function TraceTheLoop({ id, prompt, wires, target, tolerance = 0.06, explanation }: TraceTheLoopProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'trace-the-loop');
  const [pts, setPts] = useState<Vec[]>([]);
  const [closed, setClosed] = useState(false);
  const drawing = useRef(false);

  const si: Wire[] = wires.map((w) => ({ x: w.x / 100, y: w.y / 100, I: w.I, a: WIRE_R / 100 }));
  const circ = closed && pts.length > 2 ? circulation(si, pts.map(([x, y]) => [x / 100, y / 100] as const)) : null;
  const goal = target !== undefined ? MU0 * target : 0;
  const hit = circ !== null && Math.abs(circ - goal) <= tolerance * MU0;

  const toWorld = (s: StageApi, el: SVGElement, cx: number, cy: number): Vec => {
    const svg = el.ownerSVGElement ?? (el as SVGSVGElement);
    const ctm = svg.getScreenCTM();
    if (!ctm) return [0, 0];
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    const x0 = s.sx(0), x1 = s.sx(1), y0 = s.sy(0), y1 = s.sy(1);
    return [(p.x - x0) / (x1 - x0), (p.y - y0) / (y1 - y0)];
  };

  const miss = () => {
    if (circ === null) return 'There is no loop yet: press, drag all the way round, and let go.';
    if (Math.abs(circ + goal) <= tolerance * MU0 && goal !== 0)
      return `The meter reads ${siUnit(circ, 'T·m')}: your loop runs clockwise, and walking clockwise counts every current backwards.`;
    return `The meter reads ${siUnit(circ, 'T·m')}, ${siUnit(Math.abs(circ - goal), 'T·m')} ${circ > goal ? 'above' : 'below'} the target.`;
  };

  // direction chevrons at a few points round the loop
  const chevrons = closed && pts.length > 8 ? [0.12, 0.37, 0.62, 0.87].map((f) => {
    const i = Math.floor(f * pts.length);
    const a = pts[i], b = pts[(i + 3) % pts.length];
    return { at: a, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }) : [];

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Round your loop, B·dl adds to" value={circ === null ? '—' : siUnit(circ, 'T·m')} color={C.field} />
          {target !== undefined && <Meter label="Target" value={siUnit(goal, 'T·m')} color={C.faint} />}
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { circ, n: pts.length })} miss={miss()} hit={explanation} />}
      </div>}>
      <FieldLinesStage wires={wires} range={[-2.2, 2.4]} lineStep={1.1} stage={(capture) =>
        <Stage x={[-12, 12]} y={[-7, 7]} height={340} equal
          label={`Wires seen end on: ${wires.map((w) => `${Math.abs(w.I)} amperes ${w.I < 0 ? 'into' : 'out of'} the page`).join(', ')}. ${circ === null ? 'No loop drawn.' : `Your loop's circulation is ${siUnit(circ, 'tesla metres')}.`}`}>
          {(s) => { capture(s); return <>
            <rect x={0} y={0} width={s.W} height={s.H} fill="transparent" style={{ cursor: 'crosshair' }}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture(e.pointerId);
                drawing.current = true;
                setClosed(false);
                setPts([toWorld(s, e.target as SVGElement, e.clientX, e.clientY)]);
                task.touch();
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                const p = toWorld(s, e.target as SVGElement, e.clientX, e.clientY);
                setPts((old) => {
                  const last = old[old.length - 1];
                  return last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.2 ? old : [...old, p];
                });
              }}
              onPointerUp={() => {
                drawing.current = false;
                setPts((old) => (old.length > 5 ? old : []));
                setClosed(true);
              }} />
            <ScaleBar s={s} at={[-11, -6.3]} length={2} label="2 cm" />
            {pts.length > 1 && <path pointerEvents="none"
              d={`M${pts.map(([x, y]) => `${s.sx(x).toFixed(1)},${s.sy(y).toFixed(1)}`).join('L')}${closed ? 'Z' : ''}`}
              fill={closed ? 'var(--color-iris)' : 'none'} fillOpacity={0.07} stroke={C.position} strokeWidth={2.5} strokeLinejoin="round" />}
            {chevrons.map((c, i) => <path key={i} pointerEvents="none" fill={C.position}
              transform={`translate(${s.sx(c.at[0])},${s.sy(c.at[1])}) rotate(${(-c.ang * 180) / Math.PI})`} d="M8,0L-6,-7L-6,7Z" />)}
            {wires.map((w, i) => <CurrentMark key={i} s={s} at={[w.x, w.y]} I={w.I} r={12} label={`${Math.abs(w.I)} A`} />)}
          </>; }}
        </Stage>} />
      <p className="hud-label" style={{ margin: '8px 0 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>Dot: current out of the page · cross: into it · press and drag to draw a loop</span>
        <FieldKey />
      </p>
    </SceneCard>
  );
}
