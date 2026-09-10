/**
 * Minimal WebGL2 helpers for full-screen fragment-shader visualizations.
 *
 * These widgets evaluate a function per pixel over a domain — a stability
 * region, a field magnitude, a basin of attraction. That is exactly what a
 * fragment shader is for, and doing it on the CPU would cap us at a coarse
 * grid where the interesting structure lives in the fine detail.
 */

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export interface ShaderSurface {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  /** Sets a uniform by name; silently ignores names the shader dropped. */
  set(name: string, value: number | number[]): void;
  draw(): void;
  resize(cssWidth: number, cssHeight: number, dpr?: number): void;
  destroy(): void;
}

export function createShaderSurface(
  canvas: HTMLCanvasElement,
  fragmentSource: string,
): ShaderSurface | null {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: true,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('shader compile failed:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('program link failed:', gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  // One full-viewport triangle pair.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const locate = (name: string) => {
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  };

  return {
    gl,
    program,
    set(name, value) {
      const u = locate(name);
      if (!u) return;
      gl.useProgram(program);
      if (typeof value === 'number') gl.uniform1f(u, value);
      else if (value.length === 2) gl.uniform2fv(u, value);
      else if (value.length === 3) gl.uniform3fv(u, value);
      else if (value.length === 4) gl.uniform4fv(u, value);
    },
    draw() {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize(cssWidth, cssHeight, dpr = Math.min(window.devicePixelRatio || 1, 2)) {
      const w = Math.max(1, Math.round(cssWidth * dpr));
      const h = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      gl.viewport(0, 0, w, h);
    },
    destroy() {
      gl.deleteProgram(program);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
    },
  };
}

/** Tracks an element's CSS size. */
export function observeSize(
  el: HTMLElement,
  onResize: (w: number, h: number) => void,
): () => void {
  const ro = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0) onResize(width, height);
  });
  ro.observe(el);
  return () => ro.disconnect();
}
