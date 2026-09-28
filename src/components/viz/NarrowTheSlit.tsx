import { useMemo, useState } from 'react';
import { firstDarkOnWall, sourcesFor, wallIntensity } from '../../lib/physics/diffraction.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { GL_HEAD, GlStage, LIGHT } from './diffraction-kit-ch36.tsx';

/**
 * Light through a slit, seen from above, with a wall 46 wavelengths away.
 * One handle: the edge of the upper jaw (the lower one mirrors it).
 *
 * The waves are painted per pixel on the GPU: to the right of the slit every
 * pixel sums 48 Huygens wavelets from across the gap, e^{i(kr − ωt)}/√r with
 * the obliquity factor, exactly the sum `slitField` does. The dark directions
 * are where the wavelets cancel. The wall's brightness and the curve beside
 * it are `wallIntensity`, and the band width is `firstDarkOnWall`, summed in
 * src/lib/physics/diffraction.ts; the shader's picture is never measured.
 *
 * Graded (`id` + `markAt`): set the slit so the first dark bands land on the
 * two marks. Narrowing the slit is what pushes them out.
 */
export interface NarrowTheSlitProps {
  id?: string;
  prompt?: string;
  /** Starting slit width, wavelengths. */
  start?: number;
  /** Height of the two marks on the wall, wavelengths from the centre. */
  markAt?: number;
  /** How far a dark band may sit from its mark, wavelengths. */
  tolerance?: number;
  explanation?: string;
}

const L = 46;          // slit to wall, wavelengths
const YH = 22;         // half-height of the picture
const A_MIN = 1, A_MAX = 10;

const FRAG = GL_HEAD + `
uniform float u_a;
const int NS = 48;
const float TAU = 6.2831853;
void main() {
  vec2 p = worldPos();
  vec3 light = vec3(0.93, 0.91, 0.96);
  if (p.x > ${L}.0) { outColor = vec4(BG, 1.0); return; }
  float t = u_t * 0.8;          // wave periods shown per second
  float f, amp2;
  if (p.x < 0.0) {
    f = 0.75 * cos(TAU * (p.x - t));
    amp2 = 0.56;
  } else {
    vec2 s = vec2(0.0);
    for (int j = 0; j < NS; j++) {
      float yj = -0.5 * u_a + (float(j) + 0.5) * u_a / float(NS);
      float r = length(vec2(p.x, p.y - yj)) + 1e-4;
      float amp = 0.5 * (1.0 + p.x / r) / sqrt(r);
      float ph = TAU * r - 0.7853982;
      s += amp * vec2(cos(ph), sin(ph));
    }
    s *= u_a / float(NS);
    f = s.x * cos(TAU * t) + s.y * sin(TAU * t);
    amp2 = dot(s, s);
    // boost with distance so the spreading light stays visible
    float g2 = 1.0 + length(p) / (u_a * u_a);
    f *= sqrt(g2);
    amp2 *= g2;
  }
  float b = clamp(0.3 * amp2 + 0.7 * f * f, 0.0, 1.2);
  outColor = vec4(mix(BG, light * 0.8, pow(min(b, 1.0), 0.85)), 1.0);
}`;

export default function NarrowTheSlit({
  id, prompt, start = 6, markAt, tolerance = 1, explanation,
}: NarrowTheSlitProps) {
  const graded = Boolean(id && markAt !== undefined);
  const task = useTask(graded ? id : undefined, 'narrow-the-slit');
  const [a, setA] = useState(start);

  const { wall, peak, dark } = useMemo(() => {
    const n = sourcesFor(a, 1);
    const ys = Array.from({ length: 111 }, (_, i) => -YH + (2 * YH * i) / 110);
    const wall = ys.map((y) => ({ y, I: wallIntensity(a, 1, L, y, n) }));
    const peak = Math.max(...wall.map((w) => w.I));
    return { wall, peak, dark: firstDarkOnWall(a, 1, L, YH) };
  }, [a]);

  const off = dark === null || markAt === undefined ? Infinity : Math.abs(dark - markAt);
  const hitNow = graded && off <= tolerance;
  const band = dark === null ? 'wider than the wall' : `${(2 * dark).toFixed(1)} λ`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Slit width" value={`${a.toFixed(1)} λ`} color={C.position} />
          <Meter label="Central bright band on the wall" value={band} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { a })}
          miss={dark === null
            ? `The first dark bands are off the wall altogether; the marks are at ±${markAt} λ.`
            : `The first dark bands sit ±${dark.toFixed(1)} λ from the centre; the marks are at ±${markAt} λ.`}
          hit={explanation} />}
      </div>}>
      <GlStage frag={FRAG} animate uniforms={(g) => g.set('u_a', a)} stage={(capture) =>
        <Stage x={[-8, 58]} y={[-YH, YH]} height={400} equal
          label={`Waves through a slit ${a.toFixed(1)} wavelengths wide. Central band on the wall: ${band}.`}>
          {(s) => {
            capture(s);
            const jaw = (y0: number, y1: number) => <rect x={s.sx(-0.3)} y={s.sy(Math.max(y0, y1))} width={s.len(1)}
              height={Math.abs(s.sy(y0) - s.sy(y1))} fill={C.soft} />;
            const cw = s.len(1.2), step = (2 * YH) / 110;
            return <>
              {jaw(a / 2, YH)}
              {jaw(-YH, -a / 2)}
              {/* the wall: brightness summed in diffraction.ts */}
              {wall.map((w, i) => <rect key={i} x={s.sx(L)} y={s.sy(w.y + step / 2)} width={cw} height={s.len(step) + 0.6}
                fill={LIGHT} opacity={0.08 + 0.92 * Math.sqrt(w.I / peak)} />)}
              <path d={wall.map((w, i) => `${i ? 'L' : 'M'}${s.sx(L + 1.8 + 8.5 * (w.I / peak))},${s.sy(w.y)}`).join('')}
                fill="none" stroke={C.soft} strokeWidth={1.8} />
              <line x1={s.sx(L + 1.8)} x2={s.sx(L + 1.8)} y1={s.sy(-YH)} y2={s.sy(YH)} stroke={C.grid} />
              <text x={s.sx(L + 2.2)} y={s.sy(YH) + 14} fontSize={12} fill={C.faint}>wall</text>
              {dark !== null && [dark, -dark].map((y) => <line key={y} x1={s.sx(L - 1.4)} x2={s.sx(L)} y1={s.sy(y)} y2={s.sy(y)}
                stroke={C.faint} strokeWidth={1.5} />)}
              {markAt !== undefined && [markAt, -markAt].map((y) => <g key={`m${y}`}>
                <path d={`M${s.sx(L - 3.2)},${s.sy(y) - 6}L${s.sx(L - 1.2)},${s.sy(y)}L${s.sx(L - 3.2)},${s.sy(y) + 6}Z`} fill={C.ink} />
                <text x={s.sx(L - 3.6)} y={s.sy(y) + 4} textAnchor="end" fontSize={12} fill={C.ink}
                  stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">mark</text>
              </g>)}
              {/* scale bar */}
              <line x1={s.sx(-6)} x2={s.sx(-1)} y1={s.sy(-YH + 1.5)} y2={s.sy(-YH + 1.5)} stroke={C.ink} strokeWidth={2} />
              <text x={s.sx(-3.5)} y={s.sy(-YH + 1.5) - 7} textAnchor="middle" fontSize={12} fill={C.ink} fontFamily="var(--font-mono)"
                stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">5 λ</text>
              <line x1={s.sx(1.4)} x2={s.sx(1.4)} y1={s.sy(a / 2)} y2={s.sy(-a / 2)} stroke={C.position} strokeWidth={2} />
              <Handle s={s} at={[0.2, a / 2]} color={C.position} step={0.05} r={10} label="Upper jaw of the slit: drag up or down"
                clamp={(q) => [0.2, Math.max(A_MIN / 2, Math.min(A_MAX / 2, q[1]))]}
                onChange={(q) => { setA(Math.round(q[1] * 2 * 20) / 20); task.touch(); }} />
            </>;
          }}
        </Stage>} />
      <p className="hud-label" style={{ margin: '8px 0 0' }}>
        Light arrives from the left · the wall is {L} λ from the slit · brightness boosted with distance so the spreading light stays visible · the curve is the wall’s brightness, scaled to its peak
      </p>
    </SceneCard>
  );
}
