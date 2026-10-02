import { useEffect, useRef, useState } from 'react';
import { MEV_PER_U, NUCLIDES, qValue } from '../../lib/physics/nuclear.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { NucleusGlyph } from './nuclear-kit-ch43.tsx';

/**
 * A beam balance, held level by a catch. The left pan carries deuterium and
 * tritium; the right pan carries what they fuse into, helium-4 and a
 * neutron. Slide the rider along the beam, then let go.
 *
 * The rider reads in MeV/c², the unit in which mass and energy are the same
 * number. The products are lighter by exactly the 17.6 MeV the reaction
 * releases, so the rider balances at 17.6 on the products' side. Whoever
 * expects mass to be conserved leaves it at zero and watches the reactants
 * sink. Masses: measured atomic masses in src/lib/physics/nuclear.ts.
 */
export interface WeighTheFusionProps {
  id: string;
  prompt?: string;
  /** MeV/c² of imbalance that still counts as level. */
  tolerance?: number;
  explanation?: string;
}

const W = 640, H = 300;
const PIV = { x: 320, y: 84 };
const L = 232;
const RIDER_MAX = 25; // MeV/c² at the end of an arm
const HANG = 96;
const LEFT = ['H-2', 'H-3'], RIGHT = ['He-4', 'n'];
const EXCESS = qValue(LEFT, RIGHT); // left − right, MeV/c²
const MAX_TILT = 11; // degrees
const SHORT: Record<string, string> = { 'H-2': 'D', 'H-3': 'T' };

export default function WeighTheFusion({ id, prompt, tolerance = 0.8, explanation }: WeighTheFusionProps) {
  const task = useTask(id, 'weigh-the-fusion');
  const [rider, setRider] = useState(0); // MeV/c², + on the right arm
  const [released, setReleased] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const beam = useRef<SVGGElement>(null);
  const pans = useRef<(SVGGElement | null)[]>([]);
  const theta = useRef(0);
  const target = useRef(0);
  const dragging = useRef(false);

  const imbalance = EXCESS - rider; // > 0: left heavier
  useEffect(() => {
    target.current = released ? MAX_TILT * Math.tanh(imbalance / 5) : 0;
  }, [released, imbalance]);

  // The swing lives in refs: an underdamped approach to the target tilt.
  useEffect(() => {
    let raf = 0, w = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const acc = 40 * (target.current - theta.current) - 5 * w;
      w += acc * dt;
      theta.current += w * dt;
      const th = theta.current;
      beam.current?.setAttribute('transform', `rotate(${-th} ${PIV.x} ${PIV.y})`);
      const rad = (th * Math.PI) / 180;
      [-1, 1].forEach((side, i) => {
        const x = PIV.x + side * L * Math.cos(rad), y = PIV.y - side * L * Math.sin(rad);
        pans.current[i]?.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const move = (m: number) => {
    setRider(Math.round(Math.min(RIDER_MAX, Math.max(-RIDER_MAX, m)) * 10) / 10);
    if (released) setReleased(false);
    task.touch();
  };
  const fromClient = (clientX: number) => {
    const el = svg.current;
    if (!el) return;
    const p = new DOMPoint(clientX, 0).matrixTransform(el.getScreenCTM()!.inverse());
    move(((p.x - PIV.x) / L) * RIDER_MAX);
  };
  const letGo = () => {
    setReleased(true);
    task.check(Math.abs(imbalance) <= tolerance, { rider });
  };

  const riderX = PIV.x + (rider / RIDER_MAX) * L;
  const side = rider > 0 ? 'right' : rider < 0 ? 'left' : 'middle';
  const pan = (keys: string[], i: number) => (
    <g ref={(el) => { pans.current[i] = el; }} transform={`translate(${PIV.x + (i ? 1 : -1) * L} ${PIV.y})`}>
      <line x1={-50} y1={HANG} x2={0} y2={0} stroke={C.faint} strokeWidth={1.2} />
      <line x1={50} y1={HANG} x2={0} y2={0} stroke={C.faint} strokeWidth={1.2} />
      <path d={`M-62,${HANG} Q0,${HANG + 26} 62,${HANG}`} fill="var(--color-raised)" stroke={C.soft} strokeWidth={2} />
      {keys.map((k, j) => {
        const n = NUCLIDES[k];
        const r = 9 * Math.cbrt(n.A) + 3;
        return <NucleusGlyph key={k} cx={(j - (keys.length - 1) / 2) * 46} cy={HANG - r + 2} A={n.A} Z={n.Z} r={r} />;
      })}
      <text x={0} y={HANG + 40} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.ink}>
        {keys.map((k) => SHORT[k] ?? k).join(' + ')}
      </text>
    </g>
  );

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Rider" value={`${Math.abs(rider).toFixed(1)}`} unit={`MeV/c², ${side}`} />
          <Meter label="Same mass in atomic units" value={(Math.abs(rider) / MEV_PER_U).toFixed(4)} unit="u" />
        </div>
        <CheckBar label="Let go" verdict={task.verdict} done={task.done} onCheck={letGo}
          miss={imbalance > 0
            ? `The beam drops left: D + T still outweighs He-4 + n by ${imbalance.toFixed(1)} MeV/c².`
            : `The beam drops right: that side is now heavier by ${(-imbalance).toFixed(1)} MeV/c².`}
          hit={explanation} />
      </div>}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Balance: deuterium and tritium on the left, helium-4 and a neutron on the right. Rider ${Math.abs(rider).toFixed(1)} MeV per c squared on the ${side}.${released ? ' Released.' : ' Held level.'}`}
        onPointerMove={(e) => { if (dragging.current) fromClient(e.clientX); }}
        onPointerUp={() => { dragging.current = false; }}>
        {/* stand */}
        <path d={`M${PIV.x},${PIV.y} L${PIV.x - 40},${H - 18} L${PIV.x + 40},${H - 18} Z`} fill="var(--color-raised)" stroke={C.rule} strokeWidth={2} />
        <line x1={PIV.x - 120} x2={PIV.x + 120} y1={H - 18} y2={H - 18} stroke={C.rule} strokeWidth={3} />
        {/* the catch that holds the beam level until you let go */}
        {!released && [-1, 1].map((s) => <rect key={s} x={PIV.x + s * 150 - 5} y={PIV.y + 8} width={10} height={H - 26 - PIV.y - 8} fill={C.ghost} rx={2} />)}
        {!released && <text x={PIV.x} y={H - 2} textAnchor="middle" fontSize={12} fill={C.faint}>the catch holds the beam level until you let go</text>}

        {pan(LEFT, 0)}
        {pan(RIGHT, 1)}

        <g ref={beam}>
          <rect x={PIV.x - L} y={PIV.y - 5} width={2 * L} height={10} rx={3} fill="var(--color-surface)" stroke={C.soft} strokeWidth={2} />
          {Array.from({ length: 11 }, (_, i) => (i - 5) * 5).map((m) => {
            const x = PIV.x + (m / RIDER_MAX) * L;
            return <g key={m}>
              <line x1={x} x2={x} y1={PIV.y - 5} y2={PIV.y - (m % 10 === 0 ? 13 : 10)} stroke={C.faint} />
              <text x={x} y={PIV.y - 17} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{Math.abs(m)}</text>
            </g>;
          })}
          <text x={PIV.x} y={PIV.y - 34} textAnchor="middle" fontSize={12} fill={C.soft}>rider scale, MeV/c²</text>
          <g style={{ cursor: 'ew-resize' }} tabIndex={0} role="slider" aria-label="Rider: slide along the beam"
            aria-valuemin={-RIDER_MAX} aria-valuemax={RIDER_MAX} aria-valuenow={rider} aria-valuetext={`${Math.abs(rider).toFixed(1)} MeV/c² on the ${side}`}
            onPointerDown={(e) => { dragging.current = true; svg.current?.setPointerCapture(e.pointerId); }}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              move(rider + d * (e.shiftKey ? 1 : 0.1));
            }}>
            <rect x={riderX - 18} y={PIV.y - 2} width={36} height={34} fill="transparent" />
            <path d={`M${riderX - 11},${PIV.y + 5} L${riderX + 11},${PIV.y + 5} L${riderX + 8},${PIV.y + 24} L${riderX - 8},${PIV.y + 24} Z`}
              fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={2.5} />
          </g>
        </g>
        <circle cx={PIV.x} cy={PIV.y} r={5} fill={C.soft} />
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        rose: protons · grey: neutrons · the rider adds the mass on the scale to whichever pan its arm leads to
      </p>
    </SceneCard>
  );
}
