/**
 * Chapter 36's small kit: a GPU-painted picture under a scene-kit <Stage>.
 *
 * `GlStage` lays a WebGL2 canvas exactly under a Stage's SVG and hands the
 * fragment shader the Stage's world-to-view map, so the shader can work in
 * world units (wavelengths, arcseconds) while the SVG draws the slit jaws,
 * handles and labels on top. With `animate`, a requestAnimationFrame loop
 * advances `u_t` (seconds) and redraws; nothing in the loop touches React
 * state. The uniform callback is kept in a ref, so a re-render only changes
 * what the next frame reads.
 *
 * What the shaders paint is a picture; every number a scene prints comes
 * from src/lib/physics/diffraction.ts.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createShaderSurface, observeSize, type ShaderSurface } from './gl/webgl.ts';
import type { StageApi } from './scene.tsx';

/** Shared GLSL prelude: world coordinates of this fragment in `p`. */
export const GL_HEAD = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec4 u_map;   // view = a + b * world, per axis: (ax, bx, ay, by)
uniform vec2 u_view;  // view width, height
uniform float u_t;    // seconds
vec2 worldPos() {
  vec2 v = vec2(v_uv.x * u_view.x, (1.0 - v_uv.y) * u_view.y);
  return vec2((v.x - u_map.x) / u_map.y, (v.y - u_map.z) / u_map.w);
}
const vec3 BG = vec3(0.082, 0.075, 0.106);
`;

export function GlStage({ frag, uniforms, animate, stage }: {
  frag: string;
  /** Set the scene's own uniforms before each draw. */
  uniforms: (g: ShaderSurface) => void;
  animate?: boolean;
  /** Render the Stage; call `capture(s)` inside its children. */
  stage: (capture: (s: StageApi) => void) => ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const surf = useRef<ShaderSurface | null>(null);
  const api = useRef<StageApi | null>(null);
  const size = useRef<[number, number]>([0, 0]);
  const set = useRef(uniforms);
  set.current = uniforms;
  const t0 = useRef(performance.now());

  const draw = () => {
    const g = surf.current, s = api.current;
    if (!g || !s) return;
    const [w, h] = size.current;
    if (w > 0) g.resize(w, h, Math.min(window.devicePixelRatio || 1, 1.5));
    const x0 = s.sx(0), x1 = s.sx(1), y0 = s.sy(0), y1 = s.sy(1);
    g.set('u_map', [x0, x1 - x0, y0, y1 - y0]);
    g.set('u_view', [s.W, s.H]);
    g.set('u_t', (performance.now() - t0.current) / 1000);
    set.current(g);
    g.draw();
  };

  useEffect(() => {
    if (!canvas.current || !wrap.current) return;
    surf.current = createShaderSurface(canvas.current, frag);
    const stop = observeSize(wrap.current, (w, h) => { size.current = [w, h]; draw(); });
    let raf = 0;
    if (animate) {
      const loop = () => { draw(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    return () => { cancelAnimationFrame(raf); stop(); surf.current?.destroy(); surf.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frag, animate]);
  useEffect(() => { if (!animate) draw(); });

  return <div ref={wrap} style={{ position: 'relative' }}>
    <canvas ref={canvas} aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 6 }} />
    <div style={{ position: 'relative' }}>{stage((s) => { api.current = s; })}</div>
  </div>;
}

/** Light has no physics colour of its own: white, as in chapter 33. The
 *  mercury lamp's yellow is the colour of that light, used only for its lines. */
export const LIGHT = 'var(--color-ink)';
export const HG_YELLOW: readonly [number, number, number] = [255, 214, 92];

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';
}
