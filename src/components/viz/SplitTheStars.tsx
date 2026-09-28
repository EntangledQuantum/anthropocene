import { useMemo, useState } from 'react';
import { ARCSEC, STARS, airyAt, apertureToSplit, dipBetween, firstRingAngle, twoPointProfile } from '../../lib/physics/diffraction.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { GL_HEAD, GlStage } from './diffraction-kit-ch36.tsx';

/**
 * A double star one arcsecond apart, seen through a telescope whose mirror
 * you widen. Left: the mirror, drawn to scale, with one handle on its rim.
 * Right: what the eyepiece shows, painted per pixel on the GPU as the sum of
 * two Airy patterns, (2 J₁(x)/x)² with x = π D sin r / λ (brightness on a
 * gamma so the faint rings show). The dashed circle is star A's first dark
 * ring, at 1.22 λ/D. Under it, the brightness along the line through both
 * stars, from `twoPointProfile`.
 *
 * With `zoom`, an ungraded button doubles the eyepiece's magnification: the
 * blobs and their spacing grow together, which is why magnifying does not
 * split them.
 *
 * Graded (`id`): widen the mirror until B's centre sits on A's first dark ring,
 * Rayleigh's "just split": D = 1.22 λ / θ (`apertureToSplit`).
 */
export interface SplitTheStarsProps {
  id?: string;
  prompt?: string;
  /** Starting mirror diameter, cm. */
  start?: number;
  /** Offer the ×2 eyepiece (ungraded demonstrations only). */
  zoom?: boolean;
  /** Fractional slack on the mirror size. */
  tolerance?: number;
  explanation?: string;
}

const D_MIN = 3, D_MAX = 30;          // cm
const SEP = STARS.sep / ARCSEC;       // arcsec
const EYE = { x0: 17, x1: 64, y0: 1, y1: 29, cx: 40.5, cy: 15 };
const MIR = { x: 7, y: 15, k: 0.42 }; // world units per cm of mirror

const FRAG = GL_HEAD + `
uniform float u_D;      // m
uniform float u_scale;  // world units per arcsec
uniform float u_sep;    // arcsec
uniform float u_peak;
uniform vec4 u_rect;
const float PI = 3.14159265;
float j1(float x) {
  if (x > 12.0) return sqrt(2.0 / (PI * x)) * cos(x - 0.75 * PI);
  const int N = 48;
  float h = PI / float(N), s = 0.0;
  for (int i = 0; i <= N; i++) {
    float t = float(i) * h;
    float w = (i == 0 || i == N) ? 1.0 : (i % 2 == 1 ? 4.0 : 2.0);
    s += w * cos(t - x * sin(t));
  }
  return s * h / 3.0 / PI;
}
float airy(float x) { if (x < 1e-4) return 1.0; float r = 2.0 * j1(x) / x; return r * r; }
void main() {
  vec2 p = worldPos();
  if (p.x < u_rect.x || p.x > u_rect.z || p.y < u_rect.y || p.y > u_rect.w) { outColor = vec4(0.0); return; }
  vec2 a = (p - vec2(${EYE.cx.toFixed(1)}, ${EYE.cy.toFixed(1)})) / u_scale;
  float k = PI * u_D / 550e-9 * 4.8481368e-6;
  float I = airy(k * length(a - vec2(-0.5 * u_sep, 0.0))) + airy(k * length(a - vec2(0.5 * u_sep, 0.0)));
  float b = pow(clamp(I / u_peak, 0.0, 1.0), 0.42);
  outColor = vec4(mix(vec3(0.03, 0.03, 0.05), vec3(0.97, 0.95, 1.0), b), 1.0);
}`;

export default function SplitTheStars({ id, prompt, start = 5, zoom, tolerance = 0.04, explanation }: SplitTheStarsProps) {
  const task = useTask(id, 'split-the-stars');
  const [Dcm, setD] = useState(start);
  const [z, setZ] = useState(1);
  const D = Dcm / 100;
  const scale = 5.5 * z;                                  // world units per arcsec
  const half = (EYE.x1 - EYE.cx) / scale;                 // arcsec shown each side
  const ring = firstRingAngle(D, STARS.lambda) / ARCSEC;  // arcsec
  const DR = apertureToSplit(STARS.sep, STARS.lambda) * 100;
  const dip = dipBetween(D, STARS.lambda, STARS.sep);
  const hitNow = Math.abs(Dcm / DR - 1) <= tolerance;

  const prof = useMemo(() => Array.from({ length: 241 }, (_, i) => {
    const t = -half + (2 * half * i) / 240;
    const r = t * ARCSEC;
    return { t, I: twoPointProfile(D, STARS.lambda, STARS.sep, r) };
  }), [D, half]);
  const peak = Math.max(...prof.map((p) => p.I));

  const A = EYE.cx - (SEP / 2) * scale, B = EYE.cx + (SEP / 2) * scale;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Mirror" value={`${Dcm.toFixed(1)} cm`} color={C.position} />
          <Meter label="A’s first dark ring" value={`${ring.toFixed(2)}″`} />
          <Meter label="Stars apart" value={`${SEP.toFixed(2)}″`} />
          <Meter label="Dip between them" value={`${(100 * dip).toFixed(0)}%`} />
          {zoom && <button type="button" className="anth-btn" style={{ marginLeft: 'auto' }}
            onClick={() => setZ(z === 1 ? 2 : 1)}>{z === 1 ? 'Eyepiece ×2' : 'Eyepiece ×1'}</button>}
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { Dcm })}
          miss={Dcm < DR
            ? `B sits inside A’s blur: A’s first dark ring is ${ring.toFixed(2)}″ out and the stars are only ${SEP.toFixed(2)}″ apart.`
            : `B sits well outside A’s first dark ring (${ring.toFixed(2)}″ against ${SEP.toFixed(2)}″). Split, with room to spare: a smaller mirror would do.`}
          hit={explanation} />}
      </div>}>
      <GlStage frag={FRAG} uniforms={(g) => {
        g.set('u_D', D); g.set('u_scale', scale); g.set('u_sep', SEP); g.set('u_peak', peak);
        g.set('u_rect', [EYE.x0, EYE.y0, EYE.x1, EYE.y1]);
      }} stage={(capture) =>
        <Stage x={[0, 64]} y={[0, 30]} height={300} equal
          label={`Mirror ${Dcm.toFixed(1)} cm. Two stars one arcsecond apart; dip between them ${(100 * dip).toFixed(0)} percent.`}>
          {(s) => {
            capture(s);
            const ry = MIR.k * Dcm;
            const clip = `eye${id ?? 'demo'}`;
            return <>
              <defs><clipPath id={clip}><rect x={s.sx(EYE.x0)} y={s.sy(EYE.y1)} width={s.len(EYE.x1 - EYE.x0)} height={s.sy(EYE.y0) - s.sy(EYE.y1)} /></clipPath></defs>
              {/* the mirror, face on, to scale */}
              <ellipse cx={s.sx(MIR.x)} cy={s.sy(MIR.y)} rx={s.len(ry * 0.42)} ry={s.len(ry)} fill="color-mix(in oklab, var(--color-iris) 16%, var(--color-surface))"
                stroke={C.position} strokeWidth={2.5} />
              <line x1={s.sx(MIR.x - 3.5)} x2={s.sx(MIR.x + 3.5)} y1={s.sy(MIR.y + MIR.k * 30)} y2={s.sy(MIR.y + MIR.k * 30)} stroke={C.grid} strokeDasharray="3 4" />
              <text x={s.sx(MIR.x)} y={s.sy(MIR.y + MIR.k * 30) - 6} textAnchor="middle" fontSize={11} fill={C.faint}>30 cm</text>
              <text x={s.sx(MIR.x)} y={s.sy(0.6)} textAnchor="middle" fontSize={13} fill={C.soft}>mirror</text>
              <Handle s={s} at={[MIR.x, MIR.y + ry]} color={C.position} step={0.042} r={10} label="Mirror rim: drag up to widen"
                clamp={(q) => [MIR.x, MIR.y + Math.max(D_MIN, Math.min(D_MAX, (q[1] - MIR.y) / MIR.k)) * MIR.k]}
                onChange={(q) => { setD(Math.round(((q[1] - MIR.y) / MIR.k) * 10) / 10); task.touch(); }} />
              {/* the eyepiece: shaded by the GPU underneath; overlays here */}
              <rect x={s.sx(EYE.x0)} y={s.sy(EYE.y1)} width={s.len(EYE.x1 - EYE.x0)} height={s.sy(EYE.y0) - s.sy(EYE.y1)}
                fill="none" stroke={C.rule} strokeWidth={1.5} rx={4} />
              <g clipPath={`url(#${clip})`}>
                <circle cx={s.sx(A)} cy={s.sy(EYE.cy)} r={s.len(ring * scale)} fill="none" stroke={C.soft} strokeWidth={1.8} strokeDasharray="6 5" />
                <text x={s.sx(A)} y={s.sy(EYE.cy + ring * scale) - 6} textAnchor="middle" fontSize={12} fill={C.soft}
                  stroke="var(--color-void)" strokeWidth={4} paintOrder="stroke">A’s first dark ring</text>
              </g>
              {[['A', A], ['B', B]].map(([n, x]) => <text key={n as string} x={s.sx(x as number)} y={s.sy(EYE.y0 + 2)} textAnchor="middle"
                fontSize={13} fontWeight={600} fill={C.ink} stroke="var(--color-void)" strokeWidth={4} paintOrder="stroke">{n}</text>)}
              {[A, B].map((x) => <line key={x} x1={s.sx(x)} x2={s.sx(x)} y1={s.sy(EYE.y0)} y2={s.sy(EYE.y0 + 0.9)} stroke={C.ink} strokeWidth={1.5} />)}
              <text x={s.sx(EYE.x1) - 6} y={s.sy(EYE.y1) + 16} textAnchor="end" fontSize={12} fill={C.faint}
                stroke="var(--color-void)" strokeWidth={4} paintOrder="stroke">eyepiece{z === 2 ? ' ×2' : ''}</text>
            </>;
          }}
        </Stage>} />
      <Stage x={[-half, half]} y={[0, 2.1]} height={150} axes={{ x: 'angle on the sky (″)', y: 'brightness', yTicks: [0, 1, 2] }}
        label={`Brightness along the line through both stars. Dip ${(100 * dip).toFixed(0)} percent.`}>
        {(s) => <>
          {[-SEP / 2, SEP / 2].map((c) => <path key={c} fill="none" stroke={C.faint} strokeWidth={1.2} strokeDasharray="4 4"
            d={prof.map((p, i) => `${i ? 'L' : 'M'}${s.sx(p.t)},${s.sy(airyAt(D, STARS.lambda, (p.t - c) * ARCSEC))}`).join('')} />)}
          <path fill="none" stroke={C.ink} strokeWidth={2.4} d={prof.map((p, i) => `${i ? 'L' : 'M'}${s.sx(p.t)},${s.sy(p.I)}`).join('')} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Green light, 550 nm · white curve: both stars together · dashed: each star alone · the eyepiece is brightened so the faint rings show
      </p>
    </SceneCard>
  );
}
