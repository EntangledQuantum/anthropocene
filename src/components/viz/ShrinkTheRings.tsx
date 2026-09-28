import { useEffect, useRef, useState } from 'react';
import { HALF_RING, TUBE, braggAngle, electronWavelength, ringRadius } from '../../lib/physics/matterwaves.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * A teaching electron-diffraction tube. Electrons fall through a voltage,
 * pass a thin film of graphite and land on a phosphor screen, one dot each.
 * Left: the screen face-on, with the dots building up where the waves from
 * the crystal planes add (Bragg, 2d·sinθ = λ). Right: the same beam side-on,
 * each cone drawn at its true angle 2θ. One control: the voltage.
 *
 * Graded (`id` + `halve`): the dashed circle is half the inner ring's radius
 * at `startV`; turn the voltage until the ring sits on it (about 4×, not 2×).
 * Physics: electronWavelength / braggAngle / ringRadius in matterwaves.ts.
 */
export interface ShrinkTheRingsProps {
  id?: string;
  prompt?: string;
  startV?: number;
  /** Graded: put the inner ring on a mark half its starting size. */
  halve?: boolean;
  explanation?: string;
}

const W = 640, HT = 360;
const SC = { x: 190, y: 172, R: 150 };           // the screen, face-on
const PX_MM = SC.R / TUBE.screenMm;
const SIDE = { x0: 400, x1: 612, y: 172, gun: 368 }; // side view: film at x0, screen at x1
const MAXDOTS = 4200, RATE = 2600, FADE = 0.9;

function cssVar(n: string) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#ccc'; }
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export default function ShrinkTheRings({ id, prompt, startV = 2500, halve, explanation }: ShrinkTheRingsProps) {
  const graded = Boolean(id && halve);
  const task = useTask(graded ? id : undefined, 'shrink-the-rings');
  const [V, setV] = useState(graded ? HALF_RING.startV : startV);
  const vRef = useRef(V);
  vRef.current = V;
  const canvas = useRef<HTMLCanvasElement>(null);
  const dots = useRef({ x: new Float32Array(MAXDOTS), y: new Float32Array(MAXDOTS), t: new Float32Array(MAXDOTS), i: 0 });

  const target = graded ? HALF_RING.target() : undefined;
  const r0 = ringRadius(V, TUBE.d[0]), r1 = ringRadius(V, TUBE.d[1]);
  const lam = electronWavelength(V, true);
  const off = target !== undefined ? (r0 - target) * 1e3 : 0;
  const hit = target !== undefined && Math.abs(off) <= HALF_RING.toleranceMm;

  useEffect(() => {
    let raf = 0, last = performance.now();
    const col = { dot: cssVar('--color-ok'), faint: cssVar('--color-ink-faint'), rule: cssVar('--color-rule-bright'), grid: cssVar('--color-rule') };
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const el = canvas.current;
      if (el) {
        const D = dots.current, v = vRef.current, t = now / 1000;
        const radii = [ringRadius(v, TUBE.d[0]) * 1e3, ringRadius(v, TUBE.d[1]) * 1e3];
        const n = Math.round(RATE * dt);
        for (let k = 0; k < n; k++) {
          // each electron lands once: spot, inner ring or outer ring
          const u = Math.random();
          const rMm = u < TUBE.share.spot ? Math.abs(gauss()) * TUBE.blurMm * 1.3
            : u < TUBE.share.spot + TUBE.share.rings[0] ? radii[0] + gauss() * TUBE.blurMm
            : radii[1] + gauss() * TUBE.blurMm;
          const a = Math.random() * 2 * Math.PI;
          D.x[D.i] = SC.x + rMm * PX_MM * Math.cos(a);
          D.y[D.i] = SC.y + rMm * PX_MM * Math.sin(a);
          D.t[D.i] = t;
          D.i = (D.i + 1) % MAXDOTS;
        }
        const dpr = window.devicePixelRatio || 1;
        const cw = el.clientWidth, s = cw / W;
        if (el.width !== Math.round(cw * dpr)) { el.width = Math.round(cw * dpr); el.height = Math.round(HT * s * dpr); }
        const g = el.getContext('2d')!;
        g.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
        g.clearRect(0, 0, W, HT);
        g.fillStyle = col.dot;
        for (let k = 0; k < MAXDOTS; k++) {
          const age = t - D.t[k];
          if (!(age >= 0) || age > 3 * FADE || D.t[k] === 0) continue;
          g.globalAlpha = Math.exp(-age / FADE) * 0.85;
          g.fillRect(D.x[k] - 0.9, D.y[k] - 0.9, 1.8, 1.8);
        }
        g.globalAlpha = 1;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // side view: cones at their true angle 2θ, drawn to the screen at x1
  const L = SIDE.x1 - SIDE.x0;
  const cone = (d: number) => 2 * braggAngle(d, lam);

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="hud-label" style={{ minWidth: 150 }}>Accelerating voltage</span>
          <input type="range" min={TUBE.vMin} max={TUBE.vMax} step={10} value={V} style={{ flex: 1, minWidth: 200 }}
            aria-label="Accelerating voltage in volts"
            onChange={(e) => { setV(+e.target.value); task.touch(); }} />
        </label>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Meter label="Voltage" value={(V / 1000).toFixed(2)} unit="kV" />
          <Meter label="Wavelength" value={(lam * 1e12).toFixed(1)} unit="pm" color={C.position} />
          <Meter label="Inner ring radius" value={(r0 * 1e3).toFixed(1)} unit="mm" />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { V })}
          miss={`At ${(V / 1000).toFixed(2)} kV the inner ring's radius is ${(r0 * 1e3).toFixed(1)} mm, ${Math.abs(off).toFixed(1)} mm ${off > 0 ? 'outside' : 'inside'} the mark.`}
          hit={explanation} />}
      </div>}>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${HT}`} role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
          aria-label={`Phosphor screen with diffraction rings. Inner ring radius ${(r0 * 1e3).toFixed(1)} millimetres at ${(V / 1000).toFixed(2)} kilovolts.`}>
          {/* the screen */}
          <circle cx={SC.x} cy={SC.y} r={SC.R} fill={C.surface} stroke={C.rule} strokeWidth={2} />
          {target !== undefined && <circle cx={SC.x} cy={SC.y} r={target * 1e3 * PX_MM} fill="none" stroke={task.done ? C.ok : C.ink} strokeWidth={1.4} strokeDasharray="5 5" />}
          {target !== undefined && <text x={SC.x + target * 1e3 * PX_MM * 0.71 + 6} y={SC.y - target * 1e3 * PX_MM * 0.71 - 6} fontSize={12} fill={C.ink}>mark</text>}
          {/* a millimetre scale along one radius */}
          {[0, 10, 20, 30, 40, 50].map((mm) => <g key={mm}>
            <line x1={SC.x + mm * PX_MM} x2={SC.x + mm * PX_MM} y1={SC.y + SC.R + 6} y2={SC.y + SC.R + 12} stroke={C.faint} />
            <text x={SC.x + mm * PX_MM} y={SC.y + SC.R + 25} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{mm}</text>
          </g>)}
          <line x1={SC.x} x2={SC.x + SC.R} y1={SC.y + SC.R + 6} y2={SC.y + SC.R + 6} stroke={C.faint} />
          <text x={SC.x - 12} y={SC.y + SC.R + 25} textAnchor="end" fontSize={11} fill={C.faint}>mm</text>
          <text x={SC.x} y={16} textAnchor="middle" fontSize={12} fill={C.soft}>the screen, face on: one dot per electron</text>

          {/* side view */}
          <text x={(SIDE.x0 + SIDE.x1) / 2 - 20} y={16} textAnchor="middle" fontSize={12} fill={C.soft}>side on, angles true</text>
          <rect x={SIDE.gun} y={SIDE.y - 7} width={18} height={14} rx={2} fill={C.surface} stroke={C.soft} />
          <text x={SIDE.gun + 9} y={SIDE.y + 26} textAnchor="middle" fontSize={11} fill={C.faint}>gun</text>
          <line x1={SIDE.gun + 18} x2={SIDE.x0} y1={SIDE.y} y2={SIDE.y} stroke={C.velocity} strokeWidth={2} />
          <line x1={SIDE.x0} x2={SIDE.x0} y1={SIDE.y - 22} y2={SIDE.y + 22} stroke={C.ink} strokeWidth={3} />
          <text x={SIDE.x0} y={SIDE.y + 40} textAnchor="middle" fontSize={11} fill={C.faint}>graphite</text>
          <line x1={SIDE.x1} x2={SIDE.x1} y1={SIDE.y - SC.R * 0.9} y2={SIDE.y + SC.R * 0.9} stroke={C.rule} strokeWidth={3} />
          <text x={SIDE.x1} y={SIDE.y + SC.R * 0.9 + 16} textAnchor="middle" fontSize={11} fill={C.faint}>screen</text>
          <line x1={SIDE.x0} x2={SIDE.x1} y1={SIDE.y} y2={SIDE.y} stroke={C.velocity} strokeWidth={1.2} strokeOpacity={0.6} />
          {[TUBE.d[0], TUBE.d[1]].map((d, i) => {
            const a = cone(d), dy = L * Math.tan(a);
            return <g key={i} opacity={i === 0 ? 0.95 : 0.55}>
              <line x1={SIDE.x0} y1={SIDE.y} x2={SIDE.x1} y2={SIDE.y - dy} stroke={C.velocity} strokeWidth={1.4} />
              <line x1={SIDE.x0} y1={SIDE.y} x2={SIDE.x1} y2={SIDE.y + dy} stroke={C.velocity} strokeWidth={1.4} />
              {i === 0 && <text x={SIDE.x0 + 34} y={SIDE.y - 8 - 34 * Math.tan(a)} fontSize={12} fill={C.velocity}>{((a * 180) / Math.PI).toFixed(1)}°</text>}
            </g>;
          })}
          <text x={(SIDE.x0 + SIDE.x1) / 2} y={HT - 12} textAnchor="middle" fontSize={11} fill={C.faint}>film to screen 13.5 cm</text>
        </svg>
        <canvas ref={canvas} aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: '100%', aspectRatio: `${W} / ${HT}`, pointerEvents: 'none' }} />
      </div>
    </SceneCard>
  );
}
