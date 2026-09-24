import { useEffect, useRef, useState } from 'react';
import { offTheTable, type TableFlight } from '../../lib/physics/motion-ch03.ts';
import { BALLS, ballDrag, terminalSpeed } from '../../lib/physics/motion2d.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * Two balls at the edge of a table. Drag the cyan arrow to set how hard one is
 * pushed; the other is simply let go at the same instant. Both leave strobe
 * marks, and a dashed rule joins them while they fall.
 *
 * In a vacuum the rule stays level and the clocks agree to the millisecond,
 * whatever the push. With `ball` set, quadratic drag acts on both, and the
 * faster ball, which feels more of it, falls behind: the two stories are no
 * longer separate. With `bucket` set the scene grades itself: land in it.
 * Physics: `offTheTable` in motion-ch03.ts.
 */
export interface OffTheTableEdgeProps {
  id?: string;
  prompt?: string;
  /** Height of the edge above the floor, m. */
  height?: number;
  /** Starting push, m/s. */
  push?: number;
  maxPush?: number;
  /** Right-hand edge of the view, m from the table. */
  reach?: number;
  /** Centre of a bucket on the floor, m from the edge. Makes the scene graded. */
  bucket?: number;
  bucketHalf?: number;
  /** A key of BALLS: switches on air resistance for both balls. */
  ball?: string;
  explanation?: string;
}

const STROBE = 0.1; // s between strobe marks

export default function OffTheTableEdge({
  id, prompt, height = 1.25, push = 1.5, maxPush = 6, reach = 4, bucket, bucketHalf = 0.15, ball, explanation,
}: OffTheTableEdgeProps) {
  const graded = Boolean(id && bucket !== undefined);
  const task = useTask(graded ? id : undefined, 'off-the-table-edge');
  const drag = ball && BALLS[ball] ? ballDrag(BALLS[ball]) : 0;
  const KV = (reach * 0.45) / maxPush; // m of arrow per m/s
  const [v0, setV0] = useState(push);
  const [runs, setRuns] = useState<{ a: TableFlight; b: TableFlight } | null>(null);
  const [landed, setLanded] = useState(false);
  const [clock, setClock] = useState(0);
  const sRef = useRef<StageApi | null>(null);
  const A = useRef<SVGCircleElement>(null), B = useRef<SVGCircleElement>(null);
  const rule = useRef<SVGLineElement>(null), strobes = useRef<SVGGElement>(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const put = (el: SVGCircleElement | null, x: number, y: number) => {
    const s = sRef.current; if (!s || !el) return;
    el.setAttribute('cx', `${s.sx(x)}`); el.setAttribute('cy', `${s.sy(y)}`);
  };
  const at = (f: TableFlight, t: number) => f.path[Math.min(f.path.length - 1, Math.round(t / 0.002))];

  const release = () => {
    const s = sRef.current; if (!s) return;
    cancelAnimationFrame(raf.current);
    const a = offTheTable(v0, height, { drag }), b = offTheTable(0, height, { drag });
    setRuns({ a, b }); setLanded(false); task.touch();
    const g = strobes.current; while (g?.firstChild) g.removeChild(g.firstChild);
    const end = Math.max(a.landTime, b.landTime);
    const rate = b.landTime / 2; // the dropped ball's fall always takes two seconds on screen
    const t0 = performance.now();
    let nextStrobe = 0, lastShown = 0;
    const frame = (now: number) => {
      const t = Math.min(end, ((now - t0) / 1000) * rate);
      const pa = at(a, Math.min(t, a.landTime)), pb = at(b, Math.min(t, b.landTime));
      put(A.current, pa.x, pa.y); put(B.current, pb.x, pb.y);
      rule.current?.setAttribute('x1', `${s.sx(pb.x)}`); rule.current?.setAttribute('y1', `${s.sy(pb.y)}`);
      rule.current?.setAttribute('x2', `${s.sx(pa.x)}`); rule.current?.setAttribute('y2', `${s.sy(pa.y)}`);
      while (t >= nextStrobe && g) {
        for (const [p, dash] of [[at(a, Math.min(nextStrobe, a.landTime)), ''], [at(b, Math.min(nextStrobe, b.landTime)), '2 2']] as const) {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('cx', `${s.sx(p.x)}`); c.setAttribute('cy', `${s.sy(p.y)}`); c.setAttribute('r', '5');
          c.setAttribute('fill', 'none'); c.setAttribute('stroke', C.faint); if (dash) c.setAttribute('stroke-dasharray', dash);
          g.appendChild(c);
        }
        nextStrobe += STROBE;
      }
      if (now - lastShown > 120) { lastShown = now; setClock(t); }
      if (t < end) { raf.current = requestAnimationFrame(frame); return; }
      setClock(end); setLanded(true);
      if (graded) task.check(Math.abs(a.landX - bucket!) <= bucketHalf, { v0, landX: a.landX });
    };
    raf.current = requestAnimationFrame(frame);
  };

  const edit = (p: Vec) => {
    cancelAnimationFrame(raf.current);
    setV0(+Math.max(0.2, Math.min(maxPush, p[0] / KV)).toFixed(2));
    setRuns(null); setLanded(false); setClock(0); task.touch();
    const g = strobes.current; while (g?.firstChild) g.removeChild(g.firstChild);
    put(A.current, 0, height); put(B.current, 0, height);
    rule.current?.setAttribute('x2', rule.current.getAttribute('x1') ?? '0');
    rule.current?.setAttribute('y2', rule.current.getAttribute('y1') ?? '0');
  };

  const a = runs?.a, b = runs?.b;
  const off = a && bucket !== undefined ? a.landX - bucket : 0;
  const idle = !runs || landed;
  const fmt = (f: TableFlight | undefined) => (f && landed ? f.landTime.toFixed(3) : clock.toFixed(2));

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          {!graded && <button type="button" className="anth-btn" onClick={release} disabled={!idle}>Release both</button>}
          <Meter label="Push" value={v0.toFixed(2)} unit="m/s" color={C.velocity} />
          <Meter label="Pushed ball, in the air" value={fmt(a)} unit="s" />
          <Meter label="Dropped ball, in the air" value={fmt(b)} unit="s" />
          {drag > 0 && <Meter label={`Terminal speed, ${BALLS[ball!].label}`} value={terminalSpeed(drag).toFixed(1)} unit="m/s" />}
        </div>
        {graded && <CheckBar label="Push" onCheck={release} verdict={task.verdict} done={task.done} disabled={!idle}
          miss={a ? `Landed at ${a.landX.toFixed(2)} m, ${Math.abs(off).toFixed(2)} m ${off > 0 ? 'past' : 'short of'} the bucket. It was in the air ${a.landTime.toFixed(3)} s, the same as the dropped ball.` : undefined}
          hit={explanation} />}
      </div>}>
      <Stage x={[-0.9, reach]} y={[-0.05, Math.max(height * 1.22, (reach + 0.9) * (296 / 616) - 0.05)]} height={320} equal ground
        label={`Two balls at the edge of a ${height} metre table. One is pushed at ${v0.toFixed(1)} metres per second, the other dropped.`}>
        {(s) => { sRef.current = s; return <>
          <rect x={s.sx(-0.9)} y={s.sy(height)} width={s.len(0.9)} height={s.len(0.06)} fill={C.grid} stroke={C.soft} />
          <line x1={s.sx(-0.8)} x2={s.sx(-0.8)} y1={s.sy(height)} y2={s.sy(0)} stroke={C.soft} strokeWidth={3} />
          <line x1={s.sx(-0.1)} x2={s.sx(-0.1)} y1={s.sy(height)} y2={s.sy(0)} stroke={C.soft} strokeWidth={3} />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].filter((m) => m <= reach + 0.8).map((m) => <g key={m}>
            <line x1={s.sx(m)} x2={s.sx(m)} y1={s.sy(0)} y2={s.sy(0) + 6} stroke={C.faint} />
            <text x={s.sx(m)} y={s.sy(0) + 20} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{m} m</text>
          </g>)}
          {bucket !== undefined && <path d={`M${s.sx(bucket - bucketHalf)},${s.sy(0.16)}L${s.sx(bucket - bucketHalf * 0.8)},${s.sy(0)}L${s.sx(bucket + bucketHalf * 0.8)},${s.sy(0)}L${s.sx(bucket + bucketHalf)},${s.sy(0.16)}`}
            fill="none" stroke={C.ink} strokeWidth={2.5} />}
          <g ref={strobes} />
          <line ref={rule} stroke={C.field} strokeWidth={1.5} strokeDasharray="5 4" />
          <circle ref={B} cx={s.sx(0)} cy={s.sy(height)} r={8} fill={C.surface} stroke={C.soft} strokeWidth={2} strokeDasharray="3 2" />
          <circle ref={A} cx={s.sx(0)} cy={s.sy(height)} r={8} fill={C.surface} stroke={C.ink} strokeWidth={2} />
          {idle && <>
            <line x1={s.sx(0)} y1={s.sy(height + 0.14)} x2={s.sx(v0 * KV)} y2={s.sy(height + 0.14)} stroke={C.velocity} strokeWidth={3} />
            <path d={`M${s.sx(v0 * KV) + 9},${s.sy(height + 0.14)}l-11,-6v12z`} fill={C.velocity} />
            <Handle s={s} at={[v0 * KV, height + 0.14]} color={C.velocity} step={0.1 * KV} label="Push speed: drag the arrow tip"
              onChange={edit} clamp={(p) => [p[0], height + 0.14]} />
          </>}
          {landed && a && b && <>
            <text x={s.sx(a.landX)} y={s.sy(0) - 16} textAnchor="middle" fontSize={13} fill={C.ink}>{a.landTime.toFixed(3)} s</text>
            <text x={s.sx(0) + 4} y={s.sy(0) - 16} textAnchor="start" fontSize={13} fill={C.soft}>{b.landTime.toFixed(3)} s</text>
          </>}
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        solid: pushed · dashed: dropped at the same instant · marks every {STROBE} s · slowed so the fall takes 2 s
      </p>
    </SceneCard>
  );
}
