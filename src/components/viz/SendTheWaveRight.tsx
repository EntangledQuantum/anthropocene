import { useEffect, useRef, useState } from 'react';
import { evolveSnapshot, leftFraction, poyntingX } from '../../lib/physics/emwaves.ts';
import { C, CheckBar, Handle, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A frozen stretch of electromagnetic wave: E up and down the page, B in and
 * out of it, drawn in perspective. E is fixed. You slide B's pattern along
 * the axis by its crest, then let the snapshot go.
 *
 * Under the axis, aqua arrows show which way energy flows at each point
 * (E × B). Only with B in step with E do they all point right, and only then
 * does the whole pattern slide right toward the receiver. Flipped, it runs
 * left; a quarter out, half runs each way and the rest sloshes in place.
 *
 * Graded with `id`: send the wave to the receiver.
 * Physics: `evolveSnapshot` / `leftFraction` / `poyntingX` in
 * src/lib/physics/emwaves.ts, the exact one-dimensional solution.
 */
export interface SendTheWaveRightProps {
  id?: string;
  prompt?: string;
  /** Where B's crest starts, degrees behind E's. */
  startPhase?: number;
  explanation?: string;
}

const LAMBDA = 2, K = Math.PI, SPAN = 6, N = 17, AMP = 1.05;
const OX = -0.55, OY = -0.34;   // the z axis (out of the page) drawn down-left
const SPEED = 0.5;              // world units of ct per real second while running
const S_ROW = -1.62;

export default function SendTheWaveRight({ id, prompt, startPhase = 90, explanation }: SendTheWaveRightProps) {
  const task = useTask(id, 'send-the-wave-right');
  const [xc, setXc] = useState(((startPhase / 360) * LAMBDA) % LAMBDA);
  const phi = useRef(K * xc);
  const run = useRef({ on: false, ct: 0 });
  const [running, setRunning] = useState(false);
  const api = useRef<StageApi | null>(null);
  const els = useRef<{ e: (SVGGElement | null)[]; b: (SVGGElement | null)[]; s: (SVGGElement | null)[]; eCurve?: SVGPolylineElement | null; bCurve?: SVGPolylineElement | null }>({ e: [], b: [], s: [] });

  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const r = run.current;
      if (r.on) r.ct += dt * SPEED;
      const s = api.current, e = els.current;
      if (s) {
        const eP: string[] = [], bP: string[] = [];
        for (let i = 0; i <= 120; i++) {
          const x = (SPAN * i) / 120, f = evolveSnapshot(phi.current, x, K, r.ct);
          eP.push(`${s.sx(x).toFixed(1)},${s.sy(f.E * AMP).toFixed(1)}`);
          bP.push(`${s.sx(x + f.cB * AMP * OX).toFixed(1)},${s.sy(f.cB * AMP * OY).toFixed(1)}`);
        }
        e.eCurve?.setAttribute('points', eP.join(' '));
        e.bCurve?.setAttribute('points', bP.join(' '));
        for (let i = 0; i < N; i++) {
          const x = (SPAN * i) / (N - 1), f = evolveSnapshot(phi.current, x, K, r.ct);
          place(e.e[i], s.sx(x), s.sy(0), s.sx(x), s.sy(f.E * AMP));
          place(e.b[i], s.sx(x), s.sy(0), s.sx(x + f.cB * AMP * OX), s.sy(f.cB * AMP * OY));
          const q = poyntingX(f.E, f.cB) * 0.16;
          place(e.s[i], s.sx(x - q), s.sy(S_ROW), s.sx(x + q), s.sy(S_ROW));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setCrest = (x: number) => {
    const v = Math.max(0, Math.min(LAMBDA, x));
    phi.current = K * v;
    setXc(v);
    task.touch();
  };
  const toggle = () => {
    const on = !run.current.on;
    run.current = { on, ct: 0 };
    setRunning(on);
  };

  const deg = ((K * xc * 180) / Math.PI) % 360;
  const outBy = Math.min(deg, 360 - deg);
  const left = leftFraction(K * xc);
  const hit = outBy <= 10;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" className="anth-btn" onClick={toggle}>{running ? 'Freeze it again' : 'Let it go'}</button>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { phase: deg })}
          miss={left > 0.97
            ? 'E × B points left at every point: all of this wave runs left, away from the receiver.'
            : `B's crests sit ${outBy.toFixed(0)}° out of step with E's, so ${(left * 100).toFixed(0)}% of the energy runs left.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-0.9, 7.2]} y={[-2.0, 1.4]} height={320} equal
        label={`A frozen electromagnetic wave. B's crests sit ${outBy.toFixed(0)} degrees out of step with E's.`}>
        {(s) => {
          api.current = s;
          return <g>
            {/* the floor: the plane B swings in, drawn in perspective */}
            {(() => {
              const z = 1.25, p = (x: number, zz: number) => `${s.sx(x + zz * OX).toFixed(1)},${s.sy(zz * OY).toFixed(1)}`;
              return <polygon points={`${p(-0.3, -z)} ${p(SPAN + 0.3, -z)} ${p(SPAN + 0.3, z)} ${p(-0.3, z)}`} fill={C.ink} opacity={0.05} stroke={C.grid} />;
            })()}
            {/* axes: travel, E, B */}
            <line x1={s.sx(-0.5)} x2={s.sx(SPAN + 0.3)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={1.5} />
            <text x={s.sx(-0.55)} y={s.sy(AMP) + 5} textAnchor="end" fontSize={15} fontWeight={600} fill={C.field}>E</text>
            <text x={s.sx(-0.35 + AMP * OX)} y={s.sy(AMP * OY) + 5} textAnchor="end" fontSize={15} fontWeight={600} fill={C.ink}>B</text>
            <polyline ref={(el) => { els.current.eCurve = el; }} fill="none" stroke={C.field} strokeWidth={1.4} opacity={0.6} />
            <polyline ref={(el) => { els.current.bCurve = el; }} fill="none" stroke={C.ink} strokeWidth={1.4} opacity={0.45} />
            {Array.from({ length: N }, (_, i) => <g key={i}>
              <g ref={(el) => { els.current.b[i] = el; }} style={{ display: 'none' }}><line stroke={C.ink} strokeWidth={2} strokeLinecap="round" /><path fill={C.ink} /></g>
              <g ref={(el) => { els.current.e[i] = el; }} style={{ display: 'none' }}><line stroke={C.field} strokeWidth={2.4} strokeLinecap="round" /><path fill={C.field} /></g>
              <g ref={(el) => { els.current.s[i] = el; }} style={{ display: 'none' }}><line stroke={C.energy} strokeWidth={2.4} strokeLinecap="round" /><path fill={C.energy} /></g>
            </g>)}
            <line x1={s.sx(-0.5)} x2={s.sx(SPAN + 0.3)} y1={s.sy(S_ROW)} y2={s.sy(S_ROW)} stroke={C.grid} />
            <text x={s.sx(-0.3)} y={s.sy(S_ROW) - 12} fontSize={13} fill={C.energy}>energy flow, E × B</text>
            {/* the receiver */}
            <rect x={s.sx(SPAN + 0.45)} y={s.sy(0.9)} width={s.len(0.28)} height={s.len(1.8)} rx={3} fill={C.surface} stroke={C.soft} strokeWidth={2} />
            <text x={s.sx(SPAN + 0.59)} y={s.sy(1.0)} textAnchor="middle" fontSize={12} fill={C.soft}>receiver</text>
            {!running && <Handle s={s} at={[xc + AMP * OX, AMP * OY]} step={0.05} color={C.ink}
              label="B's crest: drag it along the axis" onChange={(p) => setCrest(p[0] - AMP * OX)}
              clamp={(p) => [Math.max(AMP * OX, Math.min(LAMBDA + AMP * OX, p[0])), AMP * OY]} />}
          </g>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Orchid: E, in the page · white: B, out of the page, drawn in perspective · cB drawn to the same scale as E · aqua: which way energy flows
      </p>
    </SceneCard>
  );
}

/** Set an arrow group (line + head) in view coordinates; hide it when tiny. */
function place(g: SVGGElement | null, x1: number, y1: number, x2: number, y2: number) {
  if (!g) return;
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 5) { g.style.display = 'none'; return; }
  g.style.display = '';
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, h = Math.min(9, L * 0.45);
  const bx = x2 - ux * h, by = y2 - uy * h;
  const line = g.firstChild as SVGLineElement, head = g.lastChild as SVGPathElement;
  line.setAttribute('x1', x1.toFixed(1)); line.setAttribute('y1', y1.toFixed(1));
  line.setAttribute('x2', bx.toFixed(1)); line.setAttribute('y2', by.toFixed(1));
  head.setAttribute('d', `M${x2.toFixed(1)},${y2.toFixed(1)}L${(bx - uy * h * 0.55).toFixed(1)},${(by + ux * h * 0.55).toFixed(1)}L${(bx + uy * h * 0.55).toFixed(1)},${(by - ux * h * 0.55).toFixed(1)}Z`);
}
