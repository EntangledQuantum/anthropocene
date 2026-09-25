import { useRef, useState } from 'react';
import { L_FUSION, MATERIALS, coolBoxAt, thinnestWall, type CoolBox } from '../../lib/physics/heat.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { HEAT, Thermometer, useSim } from './heat-kit-ch17.tsx';

/**
 * A cool box on a hot day, in cross-section. One control: drag the thickness
 * of the foam wall. Heat leaks in through every wall (aqua, as thick as the
 * current); run the day and the ice shrinks while the inside sits at 0 °C.
 * Underneath, ice left against the hour.
 *
 * Graded with `id`: the thinnest wall that still leaves `keepKg` of ice at the
 * end of the day, within `slack` cm. Physics: `coolBoxAt` and `thinnestWall`
 * in heat.ts (Fourier's law through the wall, latent heat inside).
 */
export interface CoolBoxDayProps {
  id?: string;
  prompt?: string;
  iceKg?: number;
  keepKg?: number;
  hours?: number;
  Tout?: number;
  /** Total wall area, m². */
  area?: number;
  /** Starting wall thickness, cm. */
  L0?: number;
  /** How much thicker than the thinnest wall still counts, cm. */
  slack?: number;
  explanation?: string;
}

const MAX_L = 8, MIN_L = 0.5;   // cm
const RUN_SECONDS = 7;          // real seconds for the whole day

export default function CoolBoxDay({
  id, prompt, iceKg = 3, keepKg = 1, hours = 12, Tout = 30, area = 0.5, L0 = 2, slack = 0.5, explanation,
}: CoolBoxDayProps) {
  const task = useTask(id, 'cool-box-day');
  const [L, setL] = useState(L0);
  const [running, setRunning] = useState(false);
  const t = useRef(0);
  const day = hours * 3600;

  const box: CoolBox = { ice: iceKg, k: MATERIALS.polystyrene.k, A: area, L: L / 100, Tout };
  const Lstar = thinnestWall(box, keepKg, day) * 100;

  useSim((dt) => {
    if (!running) return false;
    t.current = Math.min(day, t.current + (dt * day) / RUN_SECONDS);
    if (t.current >= day) setRunning(false);
    return true;
  });

  const now = coolBoxAt(box, t.current);
  const end = coolBoxAt(box, day);
  const finished = t.current >= day;
  const Pmax = coolBoxAt({ ...box, L: MIN_L / 100 }, 0).P;
  const f = now.P / Pmax;

  const run = () => { t.current = 0; setRunning(true); task.touch(); };
  const morning = () => { t.current = 0; setRunning(false); task.touch(); };

  const P0 = coolBoxAt(box, 0).P;
  const ok = end.ice >= keepKg - 1e-9 && L <= Lstar + slack;
  const frac = Math.cbrt(now.ice / iceKg);
  const melt = (iceKg - now.ice) / iceKg;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {t.current > 0
            ? <button type="button" className="anth-btn" onClick={morning} disabled={running}>Back to morning</button>
            : <button type="button" className="anth-btn" onClick={run}>Run the day</button>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Wall" value={L.toFixed(1)} unit="cm" />
            <Meter label="Heat leaking in" value={now.P.toFixed(1)} unit="W" color={HEAT} />
            <Meter label="Ice left" value={now.ice.toFixed(2)} unit="kg" />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(finished && ok, { L, ice: end.ice })}
          miss={!finished ? 'Run the whole day first.'
            : end.ice < keepKg ? `Only ${end.ice.toFixed(2)} kg of ice left at hour ${hours}. Through ${L.toFixed(1)} cm of foam ${P0.toFixed(1)} W leaks in, and ${hours} hours of that is ${(P0 * day / 1e6).toFixed(2)} MJ: enough to melt ${(P0 * day / L_FUSION).toFixed(1)} kg.`
              : `${end.ice.toFixed(2)} kg left: plenty, but ${(L - Lstar).toFixed(1)} cm thicker than it needs to be. Every centimetre of foam is food you cannot pack.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-30, 30]} y={[-10, 26]} height={340} equal
        label={`A cool box with ${L.toFixed(1)} centimetre foam walls holding ${now.ice.toFixed(2)} kilograms of ice. Hour ${(t.current / 3600).toFixed(1)}.`}>
        {(s) => {
          const w = 12 * frac, h = 9 * frac;
          return <>
            {/* foam walls, drawn to scale against the 20 cm cavity */}
            <rect x={s.sx(-10 - L)} y={s.sy(16 + L)} width={s.len(20 + 2 * L)} height={s.len(16 + 2 * L)} rx={3}
              fill={C.faint} opacity={0.22} stroke={C.soft} strokeWidth={1.5} />
            <rect x={s.sx(-10)} y={s.sy(16)} width={s.len(20)} height={s.len(16)} fill="var(--color-void)" stroke={C.soft} strokeWidth={1.5} />
            {/* meltwater, then the ice on the floor */}
            {melt > 0.001 && <rect x={s.sx(-10)} y={s.sy(3 * melt)} width={s.len(20)} height={s.len(3 * melt)} fill="var(--color-cyan)" opacity={0.18} />}
            {now.ice > 0 && <rect x={s.sx(-2 - w / 2)} y={s.sy(h)} width={s.len(w)} height={s.len(h)} rx={2}
              fill={C.ink} opacity={0.22} stroke={C.ink} strokeWidth={1.5} />}
            {now.ice > 0 && w > 4 && <text x={s.sx(-2)} y={s.sy(h / 2) + 5} textAnchor="middle" fontSize={13} fill={C.ink}>ice</text>}
            <Thermometer x={s.sx(5.5)} y={s.sy(1.5)} h={46} T={now.T} lo={0} hi={30} step={10} label="inside" />
            {/* heat leaking in through three walls */}
            {f > 0.005 && <>
              <Arrow s={s} from={[-10 - L - 3.5, 8]} to={[-9.2, 8]} color={HEAT} width={1.5 + 6 * f} />
              <Arrow s={s} from={[10 + L + 3.5, 13.5]} to={[9.2, 13.5]} color={HEAT} width={1.5 + 6 * f} />
              <Arrow s={s} from={[-2, 16 + L + 3.5]} to={[-2, 15.2]} color={HEAT} width={1.5 + 6 * f} />
            </>}
            <text x={s.sx(-29)} y={s.sy(23)} fontSize={14} fill={C.soft}>outside, {Tout} °C</text>
            <text x={s.sx(29)} y={s.sy(23)} textAnchor="end" fontSize={14} fill={C.ink} fontFamily="var(--font-mono)">
              hour {(t.current / 3600).toFixed(1)} of {hours}
            </text>
            {!running && t.current === 0 && <Handle s={s} at={[10 + L, 5]} color={C.ink} step={0.1} label="Wall thickness: drag the outer edge"
              onChange={(p) => { setL(Math.round(Math.min(MAX_L, Math.max(MIN_L, p[0] - 10)) * 10) / 10); task.touch(); }} />}
            <text x={s.sx(10 + L / 2)} y={s.sy(-L) + 16} textAnchor="middle" fontSize={12} fill={C.soft}>{L.toFixed(1)} cm</text>
          </>;
        }}
      </Stage>
      <Stage x={[0, hours]} y={[0, iceKg]} height={150} axes={{ x: 'hour', y: 'ice left (kg)', yTicks: [0, 1, 2, 3].filter((v) => v <= iceKg) }}
        label="Ice left against the hour">
        {(p) => {
          let d = '';
          const n = 60;
          for (let i = 0; i <= n; i++) {
            const tt = (t.current * i) / n;
            d += `${i ? 'L' : 'M'}${p.sx(tt / 3600).toFixed(1)},${p.sy(coolBoxAt(box, tt).ice).toFixed(1)}`;
          }
          return <>
            <line x1={p.sx(0)} x2={p.sx(hours)} y1={p.sy(keepKg)} y2={p.sy(keepKg)} stroke={C.ink} strokeDasharray="5 5" />
            <text x={p.sx(hours) - 4} y={p.sy(keepKg) - 6} textAnchor="end" fontSize={12} fill={C.ink}>need {keepKg} kg at the end</text>
            {t.current > 0 && <path d={d} fill="none" stroke={C.ink} strokeWidth={2.5} />}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {iceKg} kg of ice at 0 °C · polystyrene foam, k = {MATERIALS.polystyrene.k} W/(m·K) · {area} m² of wall · a {hours}-hour day in {RUN_SECONDS} s
      </p>
    </SceneCard>
  );
}
