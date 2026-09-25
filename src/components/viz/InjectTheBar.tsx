import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NANO, SETTLE_CAP, SETTLE_RATE, chargesAsRods, chargesInside, clusterAt, contains, dropOutline, nearestOnLoop, rodField, settleStep,
} from '../../lib/physics/gauss.ts';
import type { Vec2 } from '../../lib/physics/vectors.ts';
import { Button } from './controls.tsx';
import { C, Handle, Meter, SceneCard, Stage, type StageApi } from './scene.tsx';
import { ChargeSpeck, DROP, DROP_CHARGES as N, METAL_FILL, METAL_LINE, metalPath } from './gauss-kit.tsx';

/**
 * A long copper bar with a teardrop cross-section, seen end-on. Put the
 * nozzle anywhere in the metal and inject: 48 equal charges land in a lump
 * there, then drift apart under their own repulsion (`settleStep`, gauss.ts)
 * until every one sits on the surface. The readouts show the charge left
 * inside and the strongest field anywhere inside, both falling to nothing.
 *
 * The loop lives in refs and moves the SVG specks directly; React hears about
 * it at ~8 Hz. Ungraded: the payoff for a bet about where the charge goes.
 */
export interface InjectTheBarProps {
  prompt?: string;
  /** Charge injected, nC per metre of bar. */
  lambda?: number;
}


export default function InjectTheBar({ prompt, lambda = 6 }: InjectTheBarProps) {
  const metal = useMemo(() => dropOutline(DROP.cx, DROP.cy, DROP.rho), []);
  // Interior sample points at least 12 cm from the surface, where "inside" is unambiguous.
  const deep = useMemo(() => {
    const pts: Vec2[] = [];
    for (let x = -0.95; x <= 0.85; x += 0.08) for (let y = -0.6; y <= 0.6; y += 0.08) {
      if (contains(metal, x, y) && nearestOnLoop(metal, [x, y]).d > 0.12) pts.push([x, y]);
    }
    return pts;
  }, [metal]);
  const [nozzle, setNozzle] = useState<Vec2>([-0.2, 0.1]);
  const [injected, setInjected] = useState(false);
  const [shown, setShown] = useState({ inside: 0, eIn: 0 });
  const pos = useRef<Vec2[]>([]);
  const frames = useRef(0);
  const stage = useRef<StageApi | null>(null);
  const specks = useRef<SVGGElement>(null);

  const inject = () => {
    pos.current = clusterAt(nozzle[0], nozzle[1], N, 0.07);
    frames.current = 0;
    setInjected(true);
  };

  useEffect(() => {
    let raf = 0, lastShown = 0;
    const frame = (now: number) => {
      const p = pos.current;
      const s = stage.current;
      if (p.length && s) {
        // Slow at first so the drift can be watched, then faster to finish the slide along the surface.
        const k = frames.current++;
        const steps = Math.min(24, 1 + Math.floor(k / 40));
        const cap = k < 90 ? 0.008 : SETTLE_CAP;
        for (let j = 0; j < steps; j++) settleStep(p, metal, SETTLE_RATE, cap);
        const g = specks.current;
        if (g) for (let i = 0; i < p.length; i++) {
          (g.children[i] as SVGGElement | undefined)?.setAttribute('transform', `translate(${s.sx(p[i][0]).toFixed(1)},${s.sy(p[i][1]).toFixed(1)})`);
        }
        if (now - lastShown > 120) {
          lastShown = now;
          const rods = chargesAsRods(p, lambda * NANO);
          const eIn = Math.max(...deep.map((q) => Math.hypot(...rodField(rods, q[0], q[1]))));
          setShown({ inside: chargesInside(p, metal), eIn });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [metal, deep, lambda]);

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Button onClick={inject}>{injected ? 'Inject again' : 'Inject'}</Button>
        <Meter label="Charge still inside the metal" value={injected ? `${Math.round((100 * shown.inside) / N)}` : '–'} unit="%" />
        <Meter label="Strongest field inside the metal" value={injected ? shown.eIn.toFixed(1) : '–'} unit="N/C" color={C.field} />
      </div>}>
      <Stage x={[-1.2, 1.1]} y={[-0.8, 0.8]} height={300} equal label="A copper bar with a teardrop cross-section, seen end-on, and charge injected into it">
        {(s) => { stage.current = s; return <>
          <path d={metalPath(s, metal)} fill={METAL_FILL} stroke={METAL_LINE} strokeWidth={2} />
          <text x={s.sx(-0.35)} y={s.sy(-0.72)} textAnchor="middle" fontSize={13} fill={C.faint}>copper</text>
          <g ref={specks} style={{ display: injected ? undefined : 'none' }}>
            {Array.from({ length: N }, (_, i) => <ChargeSpeck key={i} x={-99} y={-99} />)}
          </g>
          <Handle s={s} at={nozzle} step={0.04} color={C.ink} r={8} label="Nozzle: drag it anywhere inside the metal"
            onChange={(p) => { if (contains(metal, p[0], p[1]) && nearestOnLoop(metal, p).d > 0.05) setNozzle([p[0], p[1]]); }} />
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {lambda} nC per metre of bar, as 48 equal charges free to move in the metal · ringed dot: the nozzle
      </p>
    </SceneCard>
  );
}
