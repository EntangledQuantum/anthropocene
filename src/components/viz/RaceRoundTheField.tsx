import { useEffect, useMemo, useRef, useState } from 'react';
import { E_CHARGE, M_PROTON, intoPage, lapInField } from '../../lib/physics/magnetism.ts';
import { Arrow, C, Handle, Meter, SceneCard, Stage, type StageApi, type Vec } from './scene.tsx';
import { FieldMarks } from './magnet-kit-ch27.tsx';

/**
 * Two protons leave the same gate together, in the same direction, in the
 * same field into the page. Proton A always goes at 1.0 × 10⁶ m/s; proton B's
 * speed is set by dragging the tip of its cyan arrow. Release, and both go
 * round once.
 *
 * The faster one runs a bigger circle, exactly in proportion, so they arrive
 * back at the gate at the same instant. The lap times printed are measured
 * from each Boris-integrated path (`lapInField`), not from the formula.
 * Ungraded: this is the payoff of a prediction.
 */
export interface RaceRoundTheFieldProps {
  prompt?: string;
  /** Proton B's starting speed, in units of 10⁶ m/s. */
  start?: number;
}

const BT = 0.2;
const CM = 0.01;
const K = 3.6; // cm of arrow per 10⁶ m/s
const VMIN = 0.4, VMAX = 3;
const LAP_S = 3.2; // one lap on screen
const STEPS = 720;

export default function RaceRoundTheField({ prompt, start = 2 }: RaceRoundTheFieldProps) {
  const [vB, setVB] = useState(start);
  const [running, setRunning] = useState(false);
  const [shown, setShown] = useState({ t: 0, done: false });
  const api = useRef<StageApi | null>(null);
  const trails = [useRef<SVGPolylineElement>(null), useRef<SVGPolylineElement>(null)];
  const dots = [useRef<SVGCircleElement>(null), useRef<SVGCircleElement>(null)];
  const t0 = useRef(0);

  const laps = useMemo(() => [1, vB].map((v) => lapInField(M_PROTON, E_CHARGE, v * 1e6, intoPage(BT), STEPS)), [vB]);
  const T = laps[0].lap;

  useEffect(() => {
    let raf = 0, lastShown = 0;
    const frame = (now: number) => {
      const s = api.current;
      if (s) {
        const frac = running ? Math.min(1, Math.max(0, (now - t0.current) / 1000 / LAP_S)) : 0;
        laps.forEach((lap, k) => {
          const n = Math.min(lap.path.length - 1, Math.round(frac * STEPS));
          let pts = '';
          for (let i = 0; i <= n; i += 4) pts += `${s.sx(lap.path[i].x[0] / CM).toFixed(1)},${s.sy(lap.path[i].x[1] / CM).toFixed(1)} `;
          const p = lap.path[n].x;
          pts += `${s.sx(p[0] / CM).toFixed(1)},${s.sy(p[1] / CM).toFixed(1)}`;
          trails[k].current?.setAttribute('points', running ? pts : '');
          dots[k].current?.setAttribute('cx', `${s.sx(p[0] / CM)}`);
          dots[k].current?.setAttribute('cy', `${s.sy(p[1] / CM)}`);
        });
        if (now - lastShown > 120) { lastShown = now; setShown({ t: frac * T, done: frac >= 1 }); }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, laps]);

  const ns = (t: number) => (t * 1e9).toFixed(0);
  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn" style={{ padding: '10px 20px', fontSize: 15 }}
          onClick={() => { t0.current = performance.now(); setRunning(true); }} disabled={running && !shown.done}>
          {running && !shown.done ? 'Racing…' : 'Release both'}
        </button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Clock" value={ns(shown.t)} unit="ns" />
          <Meter label="Lap, A" value={shown.done ? ns(laps[0].lap) : '–'} unit="ns" color={C.soft} />
          <Meter label="Lap, B" value={shown.done ? ns(laps[1].lap) : '–'} unit="ns" color={C.position} />
        </span>
      </div>}>
      <Stage x={[-22, 22]} y={[-5, 33]} height={400} equal
        label={`Two protons in a 0.2 tesla field into the page. A at 1.0, B at ${vB.toFixed(1)} million metres per second.`}>
        {(s) => {
          api.current = s;
          const d = (k: number) => laps[k].diameter / CM;
          const tipB: Vec = [vB * K, 0];
          return <>
            <FieldMarks s={s} x={[-22, 22]} y={[-5, 33]} into strength={0.3} gap={4} label="B into the page, 0.20 T" />
            {[0, 1].map((k) => <circle key={k} cx={s.sx(0)} cy={s.sy(d(k) / 2)} r={s.len(d(k) / 2)} fill="none"
              stroke={C.ghost} strokeDasharray="3 6" />)}
            <polyline ref={trails[0]} fill="none" stroke={C.soft} strokeWidth={2.2} />
            <polyline ref={trails[1]} fill="none" stroke={C.position} strokeWidth={2.2} />
            <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(-3)} y2={s.sy(3)} stroke={C.ok} strokeWidth={3} />
            <text x={s.sx(-0.8)} y={s.sy(-2.6)} textAnchor="end" fontSize={13} fill={C.ok}>gate</text>
            {(!running || shown.done) && <>
              <Arrow s={s} from={[0, -1.8]} to={[K, -1.8]} color={C.velocity} width={2} />
              <text x={s.sx(K + 1)} y={s.sy(-1.8) + 5} fontSize={13} fontWeight={600} fill={C.soft}>A, 1.0 × 10⁶ m/s</text>
              <Arrow s={s} from={[0, 1.8]} to={[tipB[0], 1.8]} color={C.velocity} width={3} />
              <text x={s.sx(tipB[0] + 1.4)} y={s.sy(1.8) + 5} fontSize={13} fontWeight={600} fill={C.position}>B, {vB.toFixed(1)} × 10⁶ m/s</text>
            </>}
            <circle ref={dots[0]} r={6} fill={C.surface} stroke={C.soft} strokeWidth={2.5} />
            <circle ref={dots[1]} r={6} fill={C.surface} stroke={C.position} strokeWidth={2.5} />
            {(!running || shown.done) && <Handle s={s} at={[tipB[0], 1.8]} color={C.velocity} step={0.1 * K} r={7}
              label="Proton B's speed: drag its arrow tip"
              onChange={(p) => { setRunning(false); setVB(Math.round(Math.min(VMAX, Math.max(VMIN, p[0] / K)) * 10) / 10); }} />}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Seen from above · grey: proton A · iris: proton B · cyan: launch velocities · one lap is {ns(T)} ns, shown slowed
      </p>
    </SceneCard>
  );
}
