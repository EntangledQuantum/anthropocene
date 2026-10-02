import { useEffect, useId, useRef, useState } from 'react';
import { CH44_SHEET, H0, farthestFrom, seenFrom, stretchedAbout } from '../../lib/physics/cosmos.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * Galaxies on a sheet that stretches uniformly. Click any galaxy to stand on
 * it: the stretch is drawn from there, every other galaxy carries a cyan arrow
 * pointing straight away from you, and the strip beside the sheet writes its
 * distance and speed as a dot. From every home the dots fall on the same line,
 * v = H₀ d. There is no centre to find.
 *
 * Galaxies themselves do not grow as the sheet stretches: they are held
 * together. With `id` and `target` the scene grades itself: stand where the
 * marked galaxy Q is fleeing fastest. Physics: src/lib/physics/cosmos.ts.
 */
export interface StandOnAnyGalaxyProps {
  id?: string;
  prompt?: string;
  /** Index of the galaxy marked Q. Graded together with `id`. */
  target?: number;
  /** Where you stand at the start. */
  home?: number;
  explanation?: string;
}

const SHEET = CH44_SHEET;
const PX = 0.88, X0 = 12, Y0 = 12, PAD = 16, SW = 420 * PX + 2 * PAD, SH = 300 * PX + 2 * PAD;
const GX0 = 470, GX1 = 628, GY0 = 30, GY1 = 280, DMAX = 500, VMAX = 35000;
const sx = (x: number) => X0 + PAD + x * PX, sy = (y: number) => Y0 + PAD + y * PX;
const gx = (d: number) => GX0 + (d / DMAX) * (GX1 - GX0), gy = (v: number) => GY1 - (v / VMAX) * (GY1 - GY0);
const ARROW = 0.2, GROW = 0.06, RUN = 2.6, REST = 0.6;

export default function StandOnAnyGalaxy({ id, prompt, target, home: home0 = 17, explanation }: StandOnAnyGalaxyProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'stand-on-any-galaxy');
  const [home, setHome] = useState(home0);
  const homeRef = useRef(home);
  homeRef.current = home;
  const gal = useRef<(SVGGElement | null)[]>([]);
  const arr = useRef<(SVGLineElement | null)[]>([]);
  const grid = useRef<SVGGElement | null>(null);
  const uid = useId().replace(/:/g, '');

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const tau = ((now - t0) / 1000) % (RUN + REST);
      const s = 1 + GROW * Math.min(tau, RUN) / RUN;
      const h = SHEET[homeRef.current];
      const hx = sx(h[0]), hy = sy(h[1]);
      grid.current?.setAttribute('transform', `translate(${hx},${hy}) scale(${s}) translate(${-hx},${-hy})`);
      SHEET.forEach((p, i) => {
        const q = stretchedAbout(h, p, s);
        const x = sx(q[0]), y = sy(q[1]);
        gal.current[i]?.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
        const a = arr.current[i];
        if (a) {
          a.setAttribute('x1', x.toFixed(1)); a.setAttribute('y1', y.toFixed(1));
          a.setAttribute('x2', (x + ARROW * (x - hx)).toFixed(1)); a.setAttribute('y2', (y + ARROW * (y - hy)).toFixed(1));
        }
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seen = seenFrom(SHEET[home], SHEET);
  const ratios = seen.filter((g) => g.d > 0).map((g) => g.v / g.d);
  const q = target !== undefined ? seen[target] : null;
  const best = target !== undefined ? farthestFrom(target, SHEET) : -1;
  const hitNow = graded && home === best;
  const pick = (i: number) => { setHome(i); task.touch(); };

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          {q && <Meter label="Q, seen from home" value={q.d.toFixed(0)} unit="Mpc away" color={C.position} />}
          {q && <Meter label="Q recedes at" value={q.v.toFixed(0)} unit="km/s" color={C.velocity} />}
          <Meter label="Speed ÷ distance, every galaxy" value={`${Math.min(...ratios).toFixed(1)} to ${Math.max(...ratios).toFixed(1)}`} unit="km/s per Mpc" />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { home })}
          miss={home === target
            ? 'You are standing on Q. From Q, Q is not moving at all.'
            : `From here Q is ${q!.d.toFixed(0)} Mpc away and recedes at ${q!.v.toFixed(0)} km/s.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 330" role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
        aria-label={`A stretching sheet of ${SHEET.length} galaxies seen from galaxy ${home + 1}. Every other galaxy recedes at ${H0} kilometres per second for each megaparsec of distance.`}>
        <defs>
          <clipPath id={`sheet-${uid}`}><rect x={X0} y={Y0} width={SW} height={SH} rx={8} /></clipPath>
          <marker id={`head-${uid}`} viewBox="0 0 10 10" refX={8} refY={5} markerWidth={5} markerHeight={5} orient="auto-start-reverse">
            <path d="M0,0L10,5L0,10Z" fill={C.velocity} />
          </marker>
        </defs>
        <rect x={X0} y={Y0} width={SW} height={SH} rx={8} fill="none" stroke={C.rule} />
        <g clipPath={`url(#sheet-${uid})`}>
          <g ref={grid}>
            {Array.from({ length: 15 }, (_, i) => (i - 3) * 50).map((m) => <g key={m}>
              <line x1={sx(m)} x2={sx(m)} y1={sy(-200)} y2={sy(500)} stroke={C.grid} vectorEffect="non-scaling-stroke" />
              <line x1={sx(-200)} x2={sx(700)} y1={sy(m)} y2={sy(m)} stroke={C.grid} vectorEffect="non-scaling-stroke" />
            </g>)}
          </g>
          {SHEET.map((_, i) => i !== home && (
            <line key={`a${i}-${home}`} ref={(el) => { arr.current[i] = el; }} stroke={C.velocity} strokeWidth={1.8} markerEnd={`url(#head-${uid})`} />
          ))}
          {SHEET.map((_, i) => {
            const isHome = i === home, isQ = i === target;
            return (
              <g key={i} ref={(el) => { gal.current[i] = el; }} style={{ cursor: 'pointer' }}
                role="button" tabIndex={0} aria-label={`Stand on galaxy ${i + 1}${isQ ? ', Q' : ''}`} aria-pressed={isHome}
                onClick={() => pick(i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); } }}>
                <circle r={12} fill="transparent" />
                <ellipse rx={5.5} ry={3.4} transform={`rotate(${(i * 47) % 180})`} fill={isHome ? C.position : C.soft} />
                {(isHome || isQ) && <circle r={10} fill="none" stroke={isHome ? C.position : C.ink} strokeWidth={2} />}
                {isHome && <text y={SHEET[i][1] < 40 ? 26 : -15} textAnchor="middle" fontSize={13} fill={C.position} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">home</text>}
                {isQ && !isHome && <text x={SHEET[i][0] > 300 ? -16 : 16} y={5} textAnchor={SHEET[i][0] > 300 ? 'end' : 'start'} fontSize={14} fontWeight={700} fill={C.ink} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">Q</text>}
              </g>
            );
          })}
        </g>
        <text x={X0 + 8} y={Y0 + SH + 14} fontSize={12} fill={C.faint}>grid: 50 Mpc today</text>
        {/* the companion strip: distance and speed, from home */}
        <g fontSize={12} fill={C.faint}>
          {[0, 10000, 20000, 30000].map((v) => <g key={v}>
            <line x1={GX0} x2={GX1} y1={gy(v)} y2={gy(v)} stroke={C.grid} />
            <text x={GX0 - 5} y={gy(v) + 4} textAnchor="end" fontFamily="var(--font-mono)">{v / 1000}</text>
          </g>)}
          {[0, 250, 500].map((d) => <text key={d} x={gx(d)} y={GY1 + 16} textAnchor="middle" fontFamily="var(--font-mono)">{d}</text>)}
          <text x={GX0 - 26} y={GY0 - 12} fontSize={12} fill={C.soft}>speed, 1000 km/s</text>
          <text x={GX1} y={GY1 + 30} textAnchor="end" fontSize={12} fill={C.soft}>distance, Mpc</text>
        </g>
        <line x1={gx(0)} y1={gy(0)} x2={gx(VMAX / H0)} y2={gy(VMAX)} stroke={C.velocity} strokeOpacity={0.35} strokeWidth={1.5} />
        {seen.map((g, i) => i !== home && (
          <circle key={i} cx={gx(g.d)} cy={gy(g.v)} r={i === target ? 5 : 3} fill={i === target ? C.ink : C.velocity} />
        ))}
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        click any galaxy to stand on it · cyan arrows: how each moves as seen from home · strip: each galaxy's distance and speed
      </p>
    </SceneCard>
  );
}
