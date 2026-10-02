import { useMemo, useRef, useState } from 'react';
import { bestCut, cutQ } from '../../lib/physics/nuclear.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { NucleusGlyph, ValleyGround, nucleusRadius, nuclideLabel, packNucleons, valleyFrame } from './nuclear-kit-ch43.tsx';

/**
 * A uranium-236 drop (U-235 that has just swallowed a neutron) and one cut
 * through it. Drag the cut, split, and watch the two fragments drop onto the
 * valley below. The energy freed is how much deeper the fragments sit,
 * summed over every nucleon.
 *
 * A chip off the edge barely pays: the small piece lands no deeper than the
 * big one started. An even split puts both pieces near the floor. Each
 * fragment keeps the parent's share of protons, as real fission fragments do
 * at the instant they part. Drop model: cutQ / bestCut in
 * src/lib/physics/nuclear.ts.
 */
export interface SplitTheUraniumProps {
  id: string;
  prompt?: string;
  /** Fraction of the best possible release that counts as the most. */
  tolerance?: number;
  explanation?: string;
}

const A = 236, Z = 92;
const W = 640, TOP = 240, VH = 250;
const DROP = { x: 150, y: 116, r: 78 };
const f = valleyFrame(W, VH, { l: 56, r: 14, t: 26, b: 40 });
const best = bestCut(A, Z);

/** Nucleons on the left of a vertical chord at offset c·R, from the area of the segment. */
function leftCount(c: number): number {
  const right = (Math.acos(c) - c * Math.sqrt(1 - c * c)) / Math.PI;
  return Math.min(A - 4, Math.max(4, Math.round(A * (1 - right))));
}

export default function SplitTheUranium({ id, prompt, tolerance = 0.98, explanation }: SplitTheUraniumProps) {
  const task = useTask(id, 'split-the-uranium');
  const [c, setC] = useState(-0.72);
  const [phase, setPhase] = useState<'whole' | 'launch' | 'landed'>('whole');
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const pts = useMemo(() => packNucleons(A, Z, 7), []);

  const A1 = leftCount(c), A2 = A - A1;
  const r = cutQ(A, Z, A1);
  const Z1 = r.Z1, Z2 = Z - Z1;
  const hit = r.Q >= tolerance * best.Q;
  const split = phase !== 'whole';

  const move = (nc: number) => {
    setC(Math.min(0.97, Math.max(-0.97, nc)));
    if (phase !== 'whole') setPhase('whole');
    task.touch();
  };
  const fromClient = (clientX: number) => {
    const el = svg.current;
    if (!el) return;
    const p = new DOMPoint(clientX, 0).matrixTransform(el.getScreenCTM()!.inverse());
    move((p.x - DROP.x) / DROP.r);
  };
  const doSplit = () => {
    setPhase('launch');
    requestAnimationFrame(() => requestAnimationFrame(() => setPhase('landed')));
    task.check(hit, { A1, Q: r.Q });
  };

  const cutX = DROP.x + c * DROP.r;
  const ball = (a: number, depth: number) => ({ x: f.ax(a), y: f.dy(depth) - nucleusRadius(a) - 2 });
  const parent = ball(A, r.depthParent);
  const b1 = ball(A1, r.depth1), b2 = ball(A2, r.depth2);
  const high = r.depth1 < r.depth2 ? { a: A1, z: Z1, d: r.depth1 } : { a: A2, z: Z2, d: r.depth2 };
  const at = (b: { x: number; y: number }) => (phase === 'landed' ? b : parent);

  // the two pieces, side by side on the right, sized as real nuclei (R ∝ A^{1/3})
  const k = DROP.r / Math.cbrt(A);
  const R1 = k * Math.cbrt(A1), R2 = k * Math.cbrt(A2);
  const gap = split ? 26 : 8;
  const px1 = 300 + R1, px2 = px1 + R1 + gap + R2;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Pieces" value={`${A1} + ${A2}`} unit="nucleons" />
          <Meter label="Energy released" value={split ? `${r.Q >= 0 ? '' : '−'}${Math.abs(r.Q).toFixed(0)}` : '?'} unit="MeV" color={C.energy} />
        </div>
        <CheckBar label="Split" verdict={task.verdict} done={task.done} onCheck={doSplit}
          miss={r.Q < 0
            ? `This split costs ${(-r.Q).toFixed(0)} MeV: a ${Math.min(A1, A2)}-nucleon chip is held more loosely than it was inside the uranium.`
            : `This split frees ${r.Q.toFixed(0)} MeV. The ${high.a}-nucleon piece is still high on the slope, at ${high.d.toFixed(2)} MeV per nucleon.`}
          hit={explanation} />
      </div>}>
      <svg ref={svg} viewBox={`0 0 ${W} ${TOP + VH}`} role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Uranium-236 cut into ${A1} and ${A2} nucleons.${split ? ` Releases ${r.Q.toFixed(0)} MeV.` : ''}`}
        onPointerMove={(e) => { if (dragging.current) fromClient(e.clientX); }}
        onPointerUp={() => { dragging.current = false; }}>
        {/* the drop and the cut */}
        <text x={DROP.x} y={16} textAnchor="middle" fontSize={13} fill={C.soft}>uranium-236: 92 protons, 144 neutrons</text>
        {pts.map((p, i) => {
          const x = DROP.x + p.x * (DROP.r - 3), y = DROP.y + 6 + p.y * (DROP.r - 3);
          return <circle key={i} cx={x} cy={y} r={2.9} fill={p.proton ? 'var(--color-rose)' : 'var(--color-ink-faint)'}
            opacity={x < cutX ? 1 : 0.55} />;
        })}
        <line x1={cutX} x2={cutX} y1={DROP.y + 6 - DROP.r - 8} y2={DROP.y + 6 + DROP.r + 8} stroke="var(--color-accent)" strokeWidth={2.5} strokeDasharray="6 4" />
        <g style={{ cursor: 'ew-resize' }} tabIndex={0} role="slider" aria-label="The cut: drag left or right"
          aria-valuemin={4} aria-valuemax={A - 4} aria-valuenow={A1} aria-valuetext={`${A1} and ${A2} nucleons`}
          onPointerDown={(e) => { dragging.current = true; svg.current?.setPointerCapture(e.pointerId); }}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            move(c + d * (e.shiftKey ? 0.1 : 0.02));
          }}>
          <rect x={cutX - 16} y={DROP.y + 6 - DROP.r - 12} width={32} height={2 * DROP.r + 24} fill="transparent" />
          <circle cx={cutX} cy={DROP.y + 6 - DROP.r - 8} r={8} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={2.5} />
          <circle cx={cutX} cy={DROP.y + 6 + DROP.r + 8} r={8} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={2.5} />
        </g>

        {/* the two pieces */}
        <text x={300} y={16} fontSize={13} fill={C.soft}>{split ? 'after the split' : 'the two pieces'}</text>
        <g style={{ transition: 'transform 500ms ease-out', transform: `translateX(${split ? -10 : 0}px)` }}>
          <NucleusGlyph cx={px1} cy={DROP.y + 6} A={A1} Z={Z1} r={R1} dot={2.9} />
        </g>
        <g style={{ transition: 'transform 500ms ease-out', transform: `translateX(${split ? 10 : 0}px)` }}>
          <NucleusGlyph cx={px2} cy={DROP.y + 6} A={A2} Z={Z2} r={R2} dot={2.9} />
        </g>
        <text x={px1 - (split ? 10 : 0)} y={DROP.y + 6 + Math.max(R1, R2) + 20} textAnchor="middle" fontSize={13} fontWeight={600} fill={C.ink}>{nuclideLabel(Z1, A1)}</text>
        <text x={px2 + (split ? 10 : 0)} y={DROP.y + 6 + Math.max(R1, R2) + 20} textAnchor="middle" fontSize={13} fontWeight={600} fill={C.ink}>{nuclideLabel(Z2, A2)}</text>

        {/* the valley: where each lands */}
        <g transform={`translate(0, ${TOP})`}>
          <ValleyGround f={f} landmarks={false} />
          <NucleusGlyph cx={parent.x} cy={parent.y} A={A} Z={Z} ghost={split} />
          <text x={f.right} y={f.top - 8} textAnchor="end" fontSize={12} fill={C.soft}>uranium-236 started at {r.depthParent.toFixed(2)} MeV</text>
          {split && [{ b: b1, a: A1, z: Z1, d: r.depth1 }, { b: b2, a: A2, z: Z2, d: r.depth2 }].map((q, i) => {
            const p = at(q.b);
            return <g key={i} style={{ transition: 'transform 700ms cubic-bezier(.3,.7,.4,1)', transform: `translate(${p.x}px, ${p.y}px)` }}>
              <NucleusGlyph cx={0} cy={0} A={q.a} Z={q.z} />
              {phase === 'landed' && <text x={0} y={-nucleusRadius(q.a) - 8} textAnchor="middle" fontSize={12} fontWeight={600} fill={C.energy}
                stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{q.d.toFixed(2)} MeV</text>}
            </g>;
          })}
        </g>
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        rose: protons · grey: neutrons · below: how tightly each piece holds its nucleons, deeper is tighter
      </p>
    </SceneCard>
  );
}
