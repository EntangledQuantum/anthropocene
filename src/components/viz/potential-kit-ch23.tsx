/**
 * Chapter 23's small kit: the potential as a height map, shaded per pixel on
 * the GPU under a scene's SVG stage, with a contour line every `step` volts.
 *
 * Rose is high ground (positive V), violet is low (negative V), the plain
 * background is V = 0. Contours are at equal steps of V, so where they crowd
 * the ground is steep and the field is strong. That spacing is the whole point,
 * and at contour resolution it lives in the fine detail a coarse CPU grid would
 * smear, which is why this is a shader.
 *
 * The GLSL sums k q / r exactly as `potentialAt` in src/lib/physics/fields.ts
 * does, in scene units (cm, nC). Nothing it paints is printed as a number;
 * every number a scene prints comes from src/lib/physics/potential-ch23.ts.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createShaderSurface, observeSize, type ShaderSurface } from './gl/webgl.ts';
import type { StageApi } from './scene.tsx';
import { K, NANO } from '../../lib/physics/potential-ch23.ts';

/** Volts at 1 cm from 1 nC: the shader's unit. */
const V_UNIT = (K * NANO) / 0.01;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec4 u_map;      // world = (vx - a) / b, (vy - c) / d, in view px
uniform vec2 u_view;     // view width, height
uniform vec3 u_src[4];   // x cm, y cm, q nC
uniform int u_n;
uniform float u_k;       // volts per nC/cm
uniform float u_step;    // volts between contours
uniform float u_scale;   // volts at which the shading is ~76% saturated
void main() {
  vec2 v = vec2(v_uv.x * u_view.x, (1.0 - v_uv.y) * u_view.y);
  vec2 p = vec2((v.x - u_map.x) / u_map.y, (v.y - u_map.z) / u_map.w);
  float V = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= u_n) break;
    vec2 d = p - u_src[i].xy;
    V += u_k * u_src[i].z / sqrt(dot(d, d) + 1e-4);
  }
  float t = tanh(V / u_scale);
  vec3 bg = vec3(0.082, 0.075, 0.106);
  vec3 rose = vec3(1.0, 0.541, 0.769);
  vec3 violet = vec3(0.561, 0.612, 0.961);
  vec3 col = t >= 0.0 ? mix(bg, rose * 0.55, pow(t, 1.1)) : mix(bg, violet * 0.55, pow(-t, 1.1));
  // a contour every u_step volts, faded where they crowd into a blur
  float l = V / u_step;
  float w = fwidth(l);
  float f = abs(fract(l + 0.5) - 0.5) / max(w, 1e-4);
  float band = (1.0 - clamp(f, 0.0, 1.0)) * (1.0 - smoothstep(0.3, 0.7, w));
  float zero = abs(l) < 0.5 ? 1.35 : 1.0;
  col = mix(col, vec3(0.93, 0.91, 0.96), 0.42 * band * zero);
  outColor = vec4(col, 1.0);
}`;

/**
 * A stage with the potential shaded underneath. `charges` are cm and nC.
 */
export function PotentialStage({ charges, step = 100, scale = 700, stage }: {
  charges: readonly { x: number; y: number; q: number }[];
  /** Volts between contour lines. */
  step?: number;
  scale?: number;
  /** Render the Stage; call `capture(s)` inside its children so the shading
   *  uses the stage's exact world-to-view map. */
  stage: (capture: (s: StageApi) => void) => ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const surf = useRef<ShaderSurface | null>(null);
  const api = useRef<StageApi | null>(null);
  const size = useRef<[number, number]>([0, 0]);

  const draw = () => {
    const g = surf.current, s = api.current;
    if (!g || !s) return;
    const [w, h] = size.current;
    if (w > 0) g.resize(w, h);
    const x0 = s.sx(0), x1 = s.sx(1), y0 = s.sy(0), y1 = s.sy(1);
    g.set('u_map', [x0, x1 - x0, y0, y1 - y0]);
    g.set('u_view', [s.W, s.H]);
    const flat = new Float32Array(12);
    charges.slice(0, 4).forEach((c, i) => { flat[i * 3] = c.x; flat[i * 3 + 1] = c.y; flat[i * 3 + 2] = c.q; });
    g.setArray('u_src', flat, 3);
    g.setInt('u_n', Math.min(4, charges.length));
    g.set('u_k', V_UNIT);
    g.set('u_step', step);
    g.set('u_scale', scale);
    g.draw();
  };

  useEffect(() => {
    if (!canvas.current || !wrap.current) return;
    surf.current = createShaderSurface(canvas.current, FRAG);
    const stop = observeSize(wrap.current, (w, h) => { size.current = [w, h]; draw(); });
    return () => { stop(); surf.current?.destroy(); surf.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(draw);

  return <div ref={wrap} style={{ position: 'relative' }}>
    <canvas ref={canvas} aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 6 }} />
    <div style={{ position: 'relative' }}>{stage((s) => { api.current = s; })}</div>
  </div>;
}

/** The legend the shading needs. */
export function PotentialKey({ step = 100 }: { step?: number }) {
  const sw = (c: string) => ({ width: 34, height: 10, borderRadius: 3, background: c, border: '1px solid var(--color-rule-bright)' });
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
    <span style={sw('color-mix(in srgb, var(--color-violet) 55%, var(--color-surface))')} />
    <span>low V</span>
    <span style={sw('color-mix(in srgb, var(--color-rose) 55%, var(--color-surface))')} />
    <span>high V; a contour every {step} V</span>
  </span>;
}

/** A 5 cm scale bar, bottom left of a cm stage. */
export function ScaleBar({ s, at }: { s: StageApi; at: readonly [number, number] }) {
  return <g pointerEvents="none">
    <line x1={s.sx(at[0])} x2={s.sx(at[0] + 5)} y1={s.sy(at[1])} y2={s.sy(at[1])} stroke="var(--color-ink-soft)" strokeWidth={2} />
    <text x={s.sx(at[0] + 2.5)} y={s.sy(at[1]) - 7} textAnchor="middle" fontSize={12} fill="var(--color-ink-soft)" fontFamily="var(--font-mono)"
      stroke="var(--color-surface)" strokeWidth={3} paintOrder="stroke">5 cm</text>
  </g>;
}
