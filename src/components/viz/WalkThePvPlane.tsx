import { useEffect, useState } from 'react';
import {
  CH19_A, CH19_B, CH19_GAS, KPA, L, enclosedArea, ledgerAlong, routeOver, routeUnder, segmentHeat, temperatureOf, type State,
} from '../../lib/physics/thermo.ts';
import { C, CheckBar, Handle, Meter, SceneCard, useTask, type StageApi } from './scene.tsx';
import { Cylinder, Flame, Ice, PxArrow, gasFill, joules } from './cylinder-kit.tsx';

/**
 * One mole of air, drawn twice: as a cylinder, and as a point on the p–V
 * plane. Drag the point; the piston follows the volume, and a flame or ice
 * appears under the floor whenever that stretch of path needs heat in or out.
 * The area under the path you trace is shaded: it is the work.
 *
 * Graded with `id` and `target`: reach B (or, with `loop`, come back to A)
 * having had the gas do `target` joules of work.
 * Physics: ledgerAlong / segmentHeat / enclosedArea in thermo.ts.
 */
export interface WalkThePvPlaneProps {
  id?: string;
  prompt?: string;
  /** Show state B and snap to it. */
  toB?: boolean;
  /** Ghost the two textbook routes from A to B. */
  routes?: boolean;
  /** Graded: finish back at A instead of at B. */
  loop?: boolean;
  /** Work the gas must do, J. */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

type P = [number, number];   // [V in L, p in kPa]
const PL = 215, PR = 625, PT = 22, PB = 292;
const api: StageApi = {
  sx: (V) => PL + (V / 40) * (PR - PL), sy: (p) => PB - (p / 300) * (PB - PT), len: (d) => (d / 40) * (PR - PL),
  W: 640, H: 340, x: [0, 40], y: [0, 300],
};
const toState = ([V, p]: P): State => ({ V: V * L, p: p * KPA });
const A: P = [CH19_A.V / L, CH19_A.p / KPA];
const B: P = [CH19_B.V / L, CH19_B.p / KPA];
const near = (a: P, b: P) => Math.abs(a[0] - b[0]) < 1.2 && Math.abs(a[1] - b[1]) < 12;
const pts = (path: P[]) => path.map(([V, p]) => `${api.sx(V).toFixed(1)},${api.sy(p).toFixed(1)}`).join(' ');

export default function WalkThePvPlane({ id, prompt, toB, routes, loop, target, tolerance = 150, explanation }: WalkThePvPlaneProps) {
  const task = useTask(id && target !== undefined ? id : undefined, 'walk-the-pv-plane');
  const [path, setPath] = useState<P[]>([A]);
  const [flow, setFlow] = useState<{ q: number; dV: number; at: number }>({ q: 0, dV: 0, at: 0 });
  const [, tick] = useState(0);
  // let the flame or ice go out a moment after the drag stops
  useEffect(() => { if (!flow.at) return; const t = setTimeout(() => tick((n) => n + 1), 450); return () => clearTimeout(t); }, [flow]);

  const here = path[path.length - 1];
  const move = (q: P) => {
    let p: P = [Math.max(4, Math.min(40, q[0])), Math.max(20, Math.min(300, q[1]))];
    if (toB && near(p, B)) p = B;
    if (path.some((q) => !near(q, A)) && near(p, A)) p = A;
    if (p[0] === here[0] && p[1] === here[1]) return;
    setFlow({ q: segmentHeat(CH19_GAS, toState(here), toState(p)), dV: p[0] - here[0], at: performance.now() });
    setPath([...path, p]);
    task.touch();
  };
  const reset = () => { setPath([A]); setFlow({ q: 0, dV: 0, at: 0 }); task.touch(); };

  const states = path.map(toState);
  const { Q, W, dU } = ledgerAlong(CH19_GAS, states);
  const T = temperatureOf(CH19_GAS, states[states.length - 1]);
  const atA = here === A && path.some((q) => !near(q, A)), atB = here === B;
  const live = performance.now() - flow.at < 400;
  const cw = enclosedArea(states) >= 0;

  // area under each segment, split by the direction the piston moved
  const under = (sign: 1 | -1) => path.slice(1).map((b, i) => {
    const a = path[i];
    if (Math.sign(b[0] - a[0]) !== sign) return '';
    return `M${api.sx(a[0])},${api.sy(0)}L${api.sx(a[0])},${api.sy(a[1])}L${api.sx(b[0])},${api.sy(b[1])}L${api.sx(b[0])},${api.sy(0)}Z`;
  }).join('');

  const where = loop ? atA : atB;
  const ok = where && target !== undefined && Math.abs(W - target) <= tolerance;
  const miss = !where
    ? (loop ? `The gas is at ${here[0].toFixed(1)} L and ${here[1].toFixed(0)} kPa. Bring it back to A to close the loop.`
      : `The gas is at ${here[0].toFixed(1)} L and ${here[1].toFixed(0)} kPa, not at B yet.`)
    : loop
      ? `Back at A, the gas has done ${joules(W)} J of net work${W < 0 ? ': the loop runs anticlockwise, so the piston was pushed in harder than it pushed out' : ''}. The target is ${target} J.`
      : `The area under your path is ${joules(W)} J, ${joules(Math.abs(W - target!))} J ${W < target! ? 'short of' : 'over'} ${target} J.`;

  const gasTop = 292 - (here[0] / 40) * 230;
  return (
    <SceneCard id={id && target !== undefined ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={reset}>Back to A, clear the path</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Meter label="Heat in, Q" value={joules(Q)} unit="J" color={C.energy} />
            <Meter label="Work by the gas, W" value={joules(W)} unit="J" color={C.energy} />
            <Meter label="Change in U" value={joules(dU)} unit="J" color={C.energy} />
          </span>
        </div>
        {id && target !== undefined && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { W, end: here })} miss={miss} hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 340" role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Gas at ${here[0].toFixed(1)} litres and ${here[1].toFixed(0)} kilopascals, ${T.toFixed(0)} kelvin. Work so far ${W.toFixed(0)} joules.`}>
        {/* the cylinder */}
        <Cylinder x={40} w={110} bottom={292} top={56} gasTop={gasTop} T={T} fill={gasFill(T, 100, 900)} />
        <line x1={95} x2={95} y1={gasTop - 14} y2={gasTop - 34} stroke={C.soft} strokeWidth={5} strokeLinecap="round" />
        {live && flow.q > 1 && <Flame cx={95} y={294} size={0.7} />}
        {live && flow.q < -1 && <Ice cx={95} y={292} />}
        {live && Math.abs(flow.q) > 1 && (flow.q > 0
          ? <PxArrow x1={24} y1={288} x2={24} y2={236} label="heat in" anchor="start" dx={-18} dy={-34} />
          : <PxArrow x1={24} y1={236} x2={24} y2={288} label="heat out" anchor="start" dx={-18} dy={-34} />)}
        {live && Math.abs(flow.dV) > 0.01 && (flow.dV > 0
          ? <PxArrow x1={170} y1={gasTop - 4} x2={170} y2={gasTop - 44} label="work out" anchor="start" dx={-10} dy={-30} />
          : <PxArrow x1={170} y1={gasTop - 44} x2={170} y2={gasTop - 4} label="work in" anchor="start" dx={-10} dy={-30} />)}

        {/* the plane */}
        {[0, 100, 200, 300].map((p) => <g key={p}>
          <line x1={PL} x2={PR} y1={api.sy(p)} y2={api.sy(p)} stroke={C.grid} />
          <text x={PL - 8} y={api.sy(p) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{p}</text>
        </g>)}
        {[0, 10, 20, 30, 40].map((V) => <g key={V}>
          <line x1={api.sx(V)} x2={api.sx(V)} y1={PT} y2={PB} stroke={C.grid} />
          <text x={api.sx(V)} y={PB + 17} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{V}</text>
        </g>)}
        <line x1={PL} x2={PR} y1={PB} y2={PB} stroke={C.rule} strokeWidth={1.4} />
        <text x={PR} y={PB + 36} textAnchor="end" fontSize={13} fill={C.soft}>volume V (L)</text>
        <text x={PL + 6} y={PT + 12} fontSize={13} fill={C.soft}>pressure p (kPa)</text>

        {loop && path.length > 2
          ? <polygon points={pts(path)} fill={cw ? C.energy : 'var(--color-rose)'} opacity={atA ? 0.32 : 0.14} />
          : <>
            <path d={under(1)} fill={C.energy} opacity={0.22} />
            <path d={under(-1)} fill="var(--color-rose)" opacity={0.22} />
          </>}
        {routes && <g>
          <polyline points={pts(routeOver(CH19_A, CH19_B).map((s) => [s.V / L, s.p / KPA]))} fill="none" stroke={C.soft} strokeWidth={1.5} strokeDasharray="6 5" />
          <polyline points={pts(routeUnder(CH19_A, CH19_B).map((s) => [s.V / L, s.p / KPA]))} fill="none" stroke={C.soft} strokeWidth={1.5} strokeDasharray="6 5" />
          <text x={api.sx(20)} y={api.sy(200) - 8} textAnchor="middle" fontSize={13} fill={C.soft}>route 1</text>
          <text x={api.sx(20)} y={api.sy(100) + 18} textAnchor="middle" fontSize={13} fill={C.soft}>route 2</text>
        </g>}
        <polyline points={pts(path)} fill="none" stroke={C.ink} strokeWidth={2.5} strokeLinejoin="round" />
        {([['A', A], ...(toB ? [['B', B]] : [])] as [string, P][]).map(([name, q]) => <g key={name}>
          <circle cx={api.sx(q[0])} cy={api.sy(q[1])} r={5} fill={C.position} />
          <text x={api.sx(q[0]) + 9} y={api.sy(q[1]) - 9} fontSize={15} fontWeight={600} fill={C.position}>{name}</text>
        </g>)}
        {loop && atA && <text x={PR - 6} y={PT + 14} textAnchor="end" fontSize={13} fill={C.ink}>
          loop closed, {cw ? 'clockwise' : 'anticlockwise'}</text>}
        <Handle s={api} at={here} onChange={(p) => move(p as P)} step={1} color={C.position} label="State of the gas: drag in the p–V plane" />
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        One mole of air · aqua: area under a stretch where the gas expanded · rose: where it was squeezed · 1 kPa × 1 L = 1 J
      </p>
    </SceneCard>
  );
}
