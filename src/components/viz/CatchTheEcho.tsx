import { useRef, useState } from 'react';
import { NICKEL, echoPeakAngle, electronWavelength, extraPath, rowIntensity } from '../../lib/physics/matterwaves.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * Davisson and Germer, 1927. A beam of 54 V electrons falls straight down on
 * a nickel face; the surface atoms sit in rows 0.215 nm apart. One control:
 * swing the detector round its arc.
 *
 * Two neighbouring rows are drawn magnified with their rays towards the
 * detector. The iris segment is how much farther one row's echo travels than
 * its neighbour's (D·sinφ), and beside it a bar one wavelength long, to the
 * same scale. Firing (Check) reveals the measured pattern, the phasor sum over
 * all the rows (`rowIntensity`), which stays on screen from then on.
 */
export interface CatchTheEchoProps {
  id?: string;
  prompt?: string;
  /** Starting detector angle from the beam, degrees. */
  startDeg?: number;
  /** Degrees either side of the peak that count as catching it. */
  toleranceDeg?: number;
  explanation?: string;
}

const W = 640, HT = 380;
const O = { x: 250, y: 322 };      // where the beam lands
const R = 250;                      // detector arc
const PX_NM = 70 / (NICKEL.D * 1e9); // magnification of the atom drawing
const DEG = Math.PI / 180;
const MIN = 12, MAX = 88;

export default function CatchTheEcho({ id, prompt, startDeg = 30, toleranceDeg = 3, explanation }: CatchTheEchoProps) {
  const task = useTask(id, 'catch-the-echo');
  const [deg, setDeg] = useState(startDeg);
  const [fired, setFired] = useState(false);
  const drag = useRef(false);
  const lam = electronWavelength(NICKEL.V);
  const phi = deg * DEG;
  const peak = echoPeakAngle(lam) / DEG;
  const lags = extraPath(phi) / lam;
  const I = rowIntensity(phi, lam);
  const hit = Math.abs(deg - peak) <= toleranceDeg;
  const set = (d: number) => { setDeg(Math.max(MIN, Math.min(MAX, Math.round(d * 2) / 2))); task.touch(); };

  const det = { x: O.x + R * Math.sin(phi), y: O.y - R * Math.cos(phi) };
  const ux = Math.sin(phi), uy = -Math.cos(phi);
  const D = NICKEL.D * 1e9 * PX_NM;           // row spacing, px
  const A = { x: O.x, y: O.y }, B = { x: O.x + D, y: O.y };
  // B's ray is shorter towards the detector; the extra path lies along A's ray
  const ex = extraPath(phi) * 1e9 * PX_NM;
  const foot = { x: A.x + ux * ex, y: A.y + uy * ex };
  const lamPx = lam * 1e9 * PX_NM;

  const lobe = Array.from({ length: 361 }, (_, k) => {
    const a = (-90 + k * 0.5) * DEG, rr = 20 + 190 * rowIntensity(a, lam);
    return `${(O.x + rr * Math.sin(a)).toFixed(1)},${(O.y - rr * Math.cos(a)).toFixed(1)}`;
  }).join(' ');

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Meter label="Detector angle" value={deg.toFixed(1)} unit="°" />
          <Meter label="Extra path" value={lags.toFixed(2)} unit="λ" color={C.position} />
          <Meter label="Detector current" value={fired ? `${(I * 100).toFixed(0)}` : '—'} unit={fired ? '% of the strongest' : ''} color={C.velocity} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} label="Fire and check"
          onCheck={() => { setFired(true); task.check(hit, { deg }); }}
          miss={`At ${deg.toFixed(1)}° each row's echo is ${lags.toFixed(2)} λ behind its neighbour's, and the detector catches ${(I * 100).toFixed(0)} % of the strongest beam.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox={`0 0 ${W} ${HT}`} role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Detector at ${deg.toFixed(1)} degrees from the beam. Extra path ${lags.toFixed(2)} wavelengths.`}>
        {/* the measured pattern, once fired */}
        {fired && <polygon points={lobe} fill={C.velocity} fillOpacity={0.12} stroke={C.velocity} strokeOpacity={0.6} strokeWidth={1.2} />}
        {fired && <text x={O.x + 230 * Math.sin(peak * DEG) + 8} y={O.y - 230 * Math.cos(peak * DEG)} fontSize={12} fill={C.velocity}>electrons come off here</text>}

        {/* detector arc, with degree marks */}
        <path d={`M${O.x},${O.y - R} A${R},${R} 0 0 1 ${O.x + R},${O.y}`} fill="none" stroke={C.rule} strokeWidth={1.2} strokeDasharray="3 5" />
        {[0, 30, 60, 90].map((a) => <text key={a} x={O.x + (R + 18) * Math.sin(a * DEG)} y={O.y - (R + 18) * Math.cos(a * DEG) + 4}
          textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{a}°</text>)}

        {/* incoming beam from the gun */}
        <rect x={O.x - 9} y={O.y - R - 20} width={18} height={24} rx={2} fill={C.surface} stroke={C.soft} />
        <text x={O.x - 16} y={O.y - R - 4} textAnchor="end" fontSize={11} fill={C.faint}>gun, 54 V</text>
        <line x1={O.x} y1={O.y - R + 4} x2={O.x} y2={O.y - 12} stroke={C.velocity} strokeWidth={2} />
        <path d={`M${O.x},${O.y - 6} l-6,-11 l12,0 Z`} fill={C.velocity} />

        {/* the nickel face: rows seen end-on */}
        <rect x={20} y={O.y + 10} width={W - 40} height={40} fill={C.surface} stroke={C.rule} />
        {Array.from({ length: 9 }, (_, j) => O.x + (j - 3) * D).filter((x) => x > 30 && x < W - 30).map((x) => (
          <circle key={x} cx={x} cy={O.y} r={9} fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
        ))}
        <text x={30} y={O.y + 34} fontSize={11} fill={C.faint}>nickel · rows 0.215 nm apart (magnified)</text>

        {/* two rays and the extra path */}
        <line x1={A.x} y1={A.y} x2={A.x + ux * 230} y2={A.y + uy * 230} stroke={C.soft} strokeWidth={1.2} />
        <line x1={B.x} y1={B.y} x2={B.x + ux * 230} y2={B.y + uy * 230} stroke={C.soft} strokeWidth={1.2} />
        <line x1={B.x} y1={B.y} x2={foot.x} y2={foot.y} stroke={C.faint} strokeDasharray="3 3" />
        <line x1={A.x} y1={A.y} x2={foot.x} y2={foot.y} stroke={C.position} strokeWidth={5} strokeLinecap="round" />
        {/* one wavelength, same scale, laid alongside */}
        <line x1={A.x - uy * 16} y1={A.y + ux * 16} x2={A.x - uy * 16 + ux * lamPx} y2={A.y + ux * 16 + uy * lamPx} stroke={C.ink} strokeWidth={2} />
        <text x={A.x - uy * 30 + ux * lamPx / 2 - 6} y={A.y + ux * 30 + uy * lamPx / 2 + 4} textAnchor="end" fontSize={12} fill={C.ink}>λ</text>
        <text x={foot.x + 10} y={foot.y + 16} fontSize={12} fill={C.position}>extra path</text>

        {/* the detector */}
        <g transform={`rotate(${deg} ${det.x} ${det.y})`}>
          <rect x={det.x - 13} y={det.y - 10} width={26} height={20} rx={3} fill={C.surface} stroke={task.done ? C.ok : C.ink} strokeWidth={2} />
        </g>
        <circle cx={det.x} cy={det.y} r={24} fill="transparent" style={{ cursor: 'grab' }}
          tabIndex={0} role="slider" aria-label="Detector angle" aria-valuetext={`${deg.toFixed(1)} degrees`}
          onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const svg = (e.target as SVGElement).ownerSVGElement!, ctm = svg.getScreenCTM();
            if (!ctm) return;
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
            set((Math.atan2(p.x - O.x, O.y - p.y) * 180) / Math.PI);
          }}
          onPointerUp={() => { drag.current = false; }}
          onKeyDown={(e) => {
            const d = { ArrowRight: 0.5, ArrowDown: 0.5, ArrowLeft: -0.5, ArrowUp: -0.5 }[e.key];
            if (d === undefined) return;
            e.preventDefault(); set(deg + d);
          }} />
        <text x={det.x + 22} y={det.y - 12} fontSize={12} fill={C.ink}>detector</text>
      </svg>
    </SceneCard>
  );
}
