import { useRef, useState } from 'react';
import { fuseTwinQ, splitHalfQ, stableZ, valleyDepth, valleyFloor } from '../../lib/physics/nuclear.ts';
import { C, Meter, SceneCard } from './scene.tsx';
import { A_MAX, NucleusGlyph, ValleyGround, nucleusRadius, nuclideLabel, valleyFrame } from './nuclear-kit-ch43.tsx';

/**
 * The reusable picture of chapter 43: a nucleus sitting on the valley of
 * binding, which you drag from carbon to uranium. Two ghosts show where it
 * would land if it fused with an identical twin or split into two halves,
 * each settling onto the valley. A move pays when its products land deeper.
 *
 * Light nuclei pay by fusing, heavy ones by splitting, and around iron
 * neither move pays: the floor. Ungraded: the payoff for the opening bet.
 * Physics: valleyDepth, fuseTwinQ, splitHalfQ from src/lib/physics/nuclear.ts.
 */
export interface RollTowardIronProps {
  prompt?: string;
  /** Starting nucleon number. */
  start?: number;
}

const W = 640, H = 340;
const A_LO = 12, A_HI = 240;
const f = valleyFrame(W, H);
const floor = valleyFloor();

export default function RollTowardIron({ prompt, start = 20 }: RollTowardIronProps) {
  const [A, setA] = useState(Math.min(A_HI, Math.max(A_LO, Math.round(start))));
  const dragging = useRef(false);
  const svg = useRef<SVGSVGElement>(null);

  const setFromClient = (clientX: number) => {
    const el = svg.current;
    if (!el) return;
    const p = new DOMPoint(clientX, 0).matrixTransform(el.getScreenCTM()!.inverse());
    setA(Math.min(A_HI, Math.max(A_LO, Math.round(f.xa(p.x)))));
  };

  const Z = stableZ(A);
  const fuse = fuseTwinQ(A);
  const split = splitHalfQ(A);
  const ball = (a: number) => ({ x: f.ax(a), y: f.dy(valleyDepth(a)) - nucleusRadius(a) - 2 });
  const me = ball(A);
  const twinA = 2 * A, halfA = Math.floor(A / 2);
  const showTwin = twinA <= A_MAX;
  const tw = showTwin ? ball(twinA) : null;
  const hf = ball(halfA);
  const tone = (q: number) => (q > 0 ? C.energy : C.faint);
  const sign = (q: number) => `${q > 0 ? '+' : '−'}${Math.abs(q).toFixed(0)} MeV`;

  const arc = (from: { x: number; y: number }, to: { x: number; y: number }, q: number, up: number) => {
    const mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) - up;
    return <path d={`M${from.x},${from.y - 8} Q${mx},${my} ${to.x},${to.y - 8}`} fill="none" stroke={tone(q)}
      strokeWidth={2} strokeDasharray={q > 0 ? undefined : '5 5'} markerEnd={`url(#rti-head-${q > 0 ? 'pay' : 'cost'})`} />;
  };

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <Meter label="Nucleus" value={nuclideLabel(Z, A)} />
        <Meter label="Each nucleon held by" value={valleyDepth(A).toFixed(2)} unit="MeV" />
        <Meter label="Fuse with a twin" value={showTwin ? sign(fuse) : 'off the map'} color={showTwin ? tone(fuse) : C.faint} />
        <Meter label="Split in half" value={sign(split)} color={tone(split)} />
      </div>}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`${nuclideLabel(Z, A)} on the valley. Fusing with a twin ${fuse > 0 ? 'releases' : 'costs'} ${Math.abs(fuse).toFixed(0)} MeV; splitting in half ${split > 0 ? 'releases' : 'costs'} ${Math.abs(split).toFixed(0)} MeV.`}
        onPointerMove={(e) => { if (dragging.current) setFromClient(e.clientX); }}
        onPointerUp={() => { dragging.current = false; }}>
        <defs>
          {(['pay', 'cost'] as const).map((k) => <marker key={k} id={`rti-head-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0L10,5L0,10z" fill={k === 'pay' ? C.energy : C.faint} />
          </marker>)}
        </defs>
        <ValleyGround f={f} />
        <line x1={f.left} x2={f.right} y1={f.dy(floor.depth)} y2={f.dy(floor.depth)} stroke={C.ok} strokeDasharray="3 6" opacity={0.6} />
        <text x={f.left + 8} y={f.dy(floor.depth) + 16} fontSize={12} fill={C.ok}>the floor: iron and nickel</text>

        {showTwin && tw && <>
          <NucleusGlyph cx={tw.x} cy={tw.y} A={twinA} Z={2 * Z} ghost />
          {arc(me, tw, fuse, 70)}
          <text x={tw.x} y={tw.y - nucleusRadius(twinA) - 8} textAnchor="middle" fontSize={13} fontWeight={600} fill={tone(fuse)}
            stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">fuse {sign(fuse)}</text>
        </>}
        <NucleusGlyph cx={hf.x} cy={hf.y} A={halfA} Z={Z / 2} ghost />
        {arc(me, hf, split, 50)}
        <text x={hf.x} y={hf.y - nucleusRadius(halfA) - 8} textAnchor="middle" fontSize={13} fontWeight={600} fill={tone(split)}
          stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">split {sign(split)}</text>

        <g style={{ cursor: 'grab' }} tabIndex={0} role="slider" aria-label="Nucleus: drag along the valley"
          aria-valuemin={A_LO} aria-valuemax={A_HI} aria-valuenow={A} aria-valuetext={nuclideLabel(Z, A)}
          onPointerDown={(e) => { dragging.current = true; svg.current?.setPointerCapture(e.pointerId); }}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            setA((a) => Math.min(A_HI, Math.max(A_LO, a + d * (e.shiftKey ? 10 : 1))));
          }}>
          <circle cx={me.x} cy={me.y} r={nucleusRadius(A) + 12} fill="transparent" />
          <NucleusGlyph cx={me.x} cy={me.y} A={A} Z={Z} />
          <circle cx={me.x} cy={me.y} r={nucleusRadius(A) + 4} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
          <text x={me.x} y={me.y + nucleusRadius(A) + 34} textAnchor="middle" fontSize={13} fontWeight={600} fill={C.ink}
            stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{nuclideLabel(Z, A)}</text>
        </g>
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        rose: protons · grey: neutrons · ghosts: where the products would settle · solid aqua arrow: the move releases energy · dashed: it costs energy
      </p>
    </SceneCard>
  );
}
