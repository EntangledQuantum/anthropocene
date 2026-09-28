import { useEffect, useRef, useState } from 'react';
import { DEG, frequencyInside, frequencyOf, snell, speedIn, wavelengthIn } from '../../lib/physics/light.ts';
import { C, Handle, Meter, SceneCard, Stage } from './scene.tsx';

/**
 * Wave crests of light marching down out of air into a material whose index
 * you set. One control: the index below.
 *
 * Each crest is a line of constant phase, `planeWavePhase` in light.ts: in air
 * it moves at c, below at c/n. The two families of crests must meet along the
 * boundary (the surface cannot make or swallow a crest), so they arrive at the
 * boundary at the same rate, which is the frequency, and the slower side packs
 * them closer, which is the shorter wavelength. The rays drawn across them are
 * their normals, and they bend. The readouts come from the same file.
 *
 * Ungraded: the payoff of a bet. Loop in refs, readouts only on drag.
 */
export interface CrestsAtTheBoundaryProps {
  prompt?: string;
  /** Incidence angle in air, degrees. */
  incidence?: number;
  n0?: number;
}

const LAMBDA0_NM = 600;
const PX_PER_LAMBDA = 46;
const CRESTS_PER_S = 0.7; // slowed for the eye

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';
}

export default function CrestsAtTheBoundary({ prompt, incidence = 40, n0 = 1.5 }: CrestsAtTheBoundaryProps) {
  const [n, setN] = useState(n0);
  const nRef = useRef(n0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const t1 = incidence * DEG;

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const col = { surf: cssVar('--color-surface'), ink: cssVar('--color-ink'), faint: cssVar('--color-ink-faint'), rule: cssVar('--color-rule-bright'), field: cssVar('--color-orchid'), soft: cssVar('--color-ink-soft') };
    const frame = (now: number) => {
      const el = canvas.current;
      if (el) {
        const dpr = window.devicePixelRatio || 1;
        const W = el.clientWidth, H = el.clientHeight;
        if (el.width !== Math.round(W * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
        const g = el.getContext('2d')!;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        const oy = H / 2, ox = W * 0.42; // boundary height, and where the middle ray crosses it
        const nn = nRef.current;
        const t2 = snell(1, nn, t1) ?? 0;
        const cyc = ((now - start) / 1000) * CRESTS_PER_S;
        // world (x right, y up) about (ox, oy) → canvas
        const drawSide = (idx: number, th: number, sign: 1 | -1) => {
          g.save();
          g.beginPath();
          if (sign > 0) g.rect(0, 0, W, oy); else g.rect(0, oy, W, H - oy);
          g.clip();
          if (sign < 0) { g.fillStyle = col.rule; g.globalAlpha = 0.25; g.fillRect(0, oy, W, H - oy); g.globalAlpha = 1; }
          const d = [Math.sin(th), -Math.cos(th)], tng = [Math.cos(th), Math.sin(th)];
          const lam = PX_PER_LAMBDA / idx;
          g.strokeStyle = col.field; g.lineWidth = 2;
          for (let k = -30; k <= 30; k++) {
            const s = lam * (k + (cyc % 1));
            const px = ox + d[0] * s, py = oy - d[1] * s;
            g.beginPath();
            g.moveTo(px - tng[0] * 900, py + tng[1] * 900);
            g.lineTo(px + tng[0] * 900, py - tng[1] * 900);
            g.stroke();
          }
          g.restore();
        };
        drawSide(1, t1, 1);
        drawSide(nn, t2, -1);
        // the boundary and the normal
        g.strokeStyle = col.soft; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, oy); g.lineTo(W, oy); g.stroke();
        g.setLineDash([5, 5]); g.strokeStyle = col.faint; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(ox, oy - 120); g.lineTo(ox, oy + 120); g.stroke(); g.setLineDash([]);
        // three rays: normals to the crests
        for (const off of [-150, 0, 150]) {
          const bx = ox + off;
          const a = [bx - Math.sin(t1) * 150 / Math.cos(t1) * 1, oy - 150];
          const b = [bx + Math.tan(t2) * 150, oy + 150];
          g.strokeStyle = col.ink; g.lineWidth = 2.4;
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(bx, oy); g.lineTo(b[0], b[1]); g.stroke();
          const hx = b[0], hy = b[1], ux = Math.sin(t2), uy = Math.cos(t2);
          g.fillStyle = col.ink;
          g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - ux * 12 - uy * 5, hy - uy * 12 + ux * 5); g.lineTo(hx - ux * 12 + uy * 5, hy - uy * 12 - ux * 5); g.fill();
        }
        g.font = '13px Inter, sans-serif'; g.lineWidth = 5; g.strokeStyle = col.surf; g.fillStyle = col.ink;
        const label = (t: string, x: number, y: number, align: CanvasTextAlign) => { g.textAlign = align; g.strokeText(t, x, y); g.fillText(t, x, y); };
        label('air, n = 1', 10, 20, 'left');
        label(`below: n = ${nn.toFixed(2)}`, 10, H - 12, 'left');
        label(`${incidence.toFixed(0)}° in air`, W - 10, 20, 'right');
        label(`${(t2 / DEG).toFixed(1)}° inside`, W - 10, H - 12, 'right');
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [t1, incidence]);

  const set = (v: number) => { const c = Math.round(Math.max(1, Math.min(2.4, v)) * 100) / 100; nRef.current = c; setN(c); };
  const lam0 = LAMBDA0_NM * 1e-9;

  return (
    <SceneCard prompt={prompt}
      footer={<span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Meter label="Wavelength in air" value={LAMBDA0_NM.toFixed(0)} unit="nm" color={C.field} />
        <Meter label="Wavelength inside" value={(wavelengthIn(lam0, n) * 1e9).toFixed(0)} unit="nm" color={C.field} />
        <Meter label="Speed inside" value={(speedIn(n) / 1e8).toFixed(2)} unit="× 10⁸ m/s" />
        <Meter label="Frequency, air · inside" value={`${(frequencyOf(lam0) / 1e12).toFixed(0)} · ${(frequencyInside(lam0, n) / 1e12).toFixed(0)}`} unit="THz" />
      </span>}>
      <canvas ref={canvas} style={{ width: '100%', height: 320, display: 'block' }}
        aria-label={`Wave crests crossing from air into a material of index ${n.toFixed(2)}. Inside, the wavelength is ${(wavelengthIn(lam0, n) * 1e9).toFixed(0)} nanometres.`} />
      <Stage x={[0.9, 2.5]} y={[0, 1]} height={62} label={`Index of the lower material: ${n.toFixed(2)}`}>
        {(s) => <>
          <line x1={s.sx(1)} x2={s.sx(2.4)} y1={s.sy(0.5)} y2={s.sy(0.5)} stroke={C.rule} strokeWidth={6} strokeLinecap="round" />
          {[1, 1.33, 1.5, 2, 2.4].map((v) => <g key={v}>
            <text x={s.sx(v)} y={s.sy(0.5) - 14} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{v}</text>
          </g>)}
          <text x={s.sx(1)} y={s.sy(0.5) + 24} fontSize={12} fill={C.faint}>index of the material below</text>
          <Handle s={s} at={[n, 0.5]} step={0.01} label="Index of the lower material" clamp={(p) => [p[0], 0.5]} onChange={(p) => set(p[0])} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Orchid: wave crests, drawn slowed down · white: rays, square to the crests
      </p>
    </SceneCard>
  );
}
