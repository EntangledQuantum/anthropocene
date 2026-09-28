/**
 * Chapter 35's small kit: a ripple tank drawn per pixel on the GPU, under a
 * scene's SVG stage.
 *
 * `RippleStage` paints the water height h = Σ a cos(k r − ωt + φ) of up to two
 * dippers, live: bright where crests stack, dark where troughs stack, and the
 * flat grey of still water where they cancel. The quiet lines are not drawn
 * by anyone; they are simply where the sum is zero, and a coarse CPU grid
 * would blur them into the ripples. With `barrier` set, the water on the near
 * side carries the straight plane wave that drives the gaps. The GLSL is the
 * same sum as `waveHeight` in src/lib/physics/interference.ts, which is what
 * every printed number comes from.
 *
 * The loop runs from refs (never React state). `onFrame(t)` lets a scene draw
 * its own companion trace, or bob its cork, in the same frame.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { Source } from '../../lib/physics/interference.ts';
import { createShaderSurface, observeSize, type ShaderSurface } from './gl/webgl.ts';
import { C, type StageApi } from './scene.tsx';

export interface RippleSpec {
  sources: readonly Source[];
  lambda: number;
  freq: number;
  /** Frequency offset of source 1, Hz: two motors that drift out of step. */
  detune?: number;
  /** x of a barrier; the water left of it carries a plane wave. */
  barrier?: number;
  /** x range that is water; outside it is the tank's edge. */
  water: readonly [number, number];
}

/** The phase source i carries at time t (the drift, if any). */
export const phaseAt = (spec: RippleSpec, i: number, t: number) =>
  (spec.sources[i]?.phase ?? 0) + (i === 1 ? 2 * Math.PI * (spec.detune ?? 0) * t : 0);

/** The sources as they are at time t, for asking the physics library. */
export const sourcesAt = (spec: RippleSpec, t: number): Source[] =>
  spec.sources.map((s, i) => ({ ...s, phase: phaseAt(spec, i, t) }));

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec4 u_map;      // world = (vx - a) / b, (vy - c) / d, in view px
uniform vec2 u_view;
uniform vec4 u_src[2];   // x, y, amplitude, phase
uniform float u_k;
uniform float u_wt;
uniform float u_barrier;
uniform vec2 u_water;
void main() {
  vec2 v = vec2(v_uv.x * u_view.x, (1.0 - v_uv.y) * u_view.y);
  vec2 p = vec2((v.x - u_map.x) / u_map.y, (v.y - u_map.z) / u_map.w);
  vec3 bank = vec3(0.075, 0.07, 0.095);
  if (p.x < u_water.x || p.x > u_water.y) { outColor = vec4(bank, 1.0); return; }
  float h = 0.0;
  if (p.x < u_barrier) {
    h = cos(u_k * (p.x - u_barrier) - u_wt);
  } else {
    for (int i = 0; i < 2; i++) {
      float r = length(p - u_src[i].xy);
      h += u_src[i].z * cos(u_k * r - u_wt + u_src[i].w);
    }
  }
  float t = clamp(h * 0.8, -1.0, 1.0);   // gain: loud water saturates, so still water reads as a line
  vec3 still = vec3(0.21, 0.25, 0.31);
  vec3 crest = vec3(0.66, 0.84, 0.93);
  vec3 trough = vec3(0.045, 0.05, 0.075);
  vec3 col = t > 0.0 ? mix(still, crest, t) : mix(still, trough, -t);
  outColor = vec4(col, 1.0);
}`;

export function RippleStage({ spec, stage, onFrame }: {
  spec: RippleSpec;
  /** Render the Stage; call `capture(s)` inside its children. */
  stage: (capture: (s: StageApi) => void) => ReactNode;
  onFrame?: (t: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const specRef = useRef(spec);
  const frameRef = useRef(onFrame);
  const api = useRef<StageApi | null>(null);
  specRef.current = spec;
  frameRef.current = onFrame;

  useEffect(() => {
    if (!canvas.current || !wrap.current) return;
    const surf: ShaderSurface | null = createShaderSurface(canvas.current, FRAG);
    let size: [number, number] = [0, 0];
    const stop = observeSize(wrap.current, (w, h) => { size = [w, h]; });
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const s = api.current, sp = specRef.current;
      if (surf && s && size[0] > 0) {
        surf.resize(size[0], size[1]);
        surf.set('u_map', [s.sx(0), s.sx(1) - s.sx(0), s.sy(0), s.sy(1) - s.sy(0)]);
        surf.set('u_view', [s.W, s.H]);
        const flat = new Float32Array(8);
        sp.sources.slice(0, 2).forEach((q, i) => {
          flat[i * 4] = q.x; flat[i * 4 + 1] = q.y; flat[i * 4 + 2] = q.amp ?? 1; flat[i * 4 + 3] = phaseAt(sp, i, t);
        });
        surf.setArray('u_src', flat, 4);
        surf.set('u_k', (2 * Math.PI) / sp.lambda);
        surf.set('u_wt', 2 * Math.PI * sp.freq * t);
        surf.set('u_barrier', sp.barrier ?? -1e6);
        surf.set('u_water', [sp.water[0], sp.water[1]]);
        surf.draw();
      }
      frameRef.current?.(t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); stop(); surf?.destroy(); };
  }, []);

  return <div ref={wrap} style={{ position: 'relative' }}>
    <canvas ref={canvas} aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 6 }} />
    <div style={{ position: 'relative' }}>{stage((s) => { api.current = s; })}</div>
  </div>;
}

/** A dipper seen from above: a ring with a dot. */
export function Dipper({ s, at, label, faint }: { s: StageApi; at: readonly [number, number]; label?: string; faint?: boolean }) {
  const cx = s.sx(at[0]), cy = s.sy(at[1]);
  return <g opacity={faint ? 0.35 : 1} pointerEvents="none">
    <circle cx={cx} cy={cy} r={8} fill={C.surface} stroke={C.ink} strokeWidth={2} />
    <circle cx={cx} cy={cy} r={2.5} fill={C.ink} />
    {label && <text x={cx + 13} y={cy + 5} fontSize={13} fill={C.ink}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>}
  </g>;
}

/** A scale bar one wavelength long. */
export function LambdaBar({ s, at, lambda, unit }: { s: StageApi; at: readonly [number, number]; lambda: number; unit: string }) {
  const x0 = s.sx(at[0]), x1 = s.sx(at[0] + lambda), y = s.sy(at[1]);
  return <g pointerEvents="none">
    <line x1={x0} x2={x1} y1={y} y2={y} stroke={C.ink} strokeWidth={2} />
    <line x1={x0} x2={x0} y1={y - 5} y2={y + 5} stroke={C.ink} strokeWidth={2} />
    <line x1={x1} x2={x1} y1={y - 5} y2={y + 5} stroke={C.ink} strokeWidth={2} />
    <text x={(x0 + x1) / 2} y={y - 9} textAnchor="middle" fontSize={12} fill={C.ink} fontFamily="var(--font-mono)"
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">λ = {lambda} {unit}</text>
  </g>;
}

/** What the shading means. */
export function WaterKey() {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <span style={{ width: 90, height: 10, borderRadius: 3, border: '1px solid var(--color-rule-bright)',
      background: 'linear-gradient(90deg, rgb(11,13,19), rgb(54,64,79), rgb(168,214,237))' }} />
    <span>trough, still water, crest</span>
  </span>;
}
