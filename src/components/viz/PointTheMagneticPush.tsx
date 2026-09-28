import { useEffect, useRef, useState } from 'react';
import {
  E_CHARGE, M_ELECTRON, M_PROTON, cyclotronPeriod, cyclotronRadius, intoPage, lorentzForce, outOfPage,
  traceCharge, type V3,
} from '../../lib/physics/magnetism.ts';
import { Arrow, C, CheckBar, Handle, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';
import { FieldMarks } from './magnet-kit-ch27.tsx';
import { ChargeDot } from './charge-kit-ch21.tsx';

/**
 * The right-hand rule as geometry. A charge crosses a field (dots: out of the
 * page; crosses: into it) with its cyan velocity drawn. The learner drags the
 * tip of a white arrow to where they think the magnetic push points, then
 * checks. Checking lets the charge go: it curves along its real circle
 * (Boris push, magnetism.ts), so a wrong arrow is contradicted by the path.
 * On a hit the true amber force appears on top of the guess.
 *
 * Graded with `id`: within 20° of q v × B.
 */
export interface PointTheMagneticPushProps {
  id?: string;
  prompt?: string;
  charge?: 'electron' | 'proton';
  field?: 'in' | 'out';
  /** Direction of the velocity, degrees from +x. */
  angle?: number;
  /** Where the guess arrow starts, degrees. */
  guess?: number;
  tolerance?: number;
  explanation?: string;
}

const R_ARROW = 4.2;
const R_PATH = 3.2; // the circle is drawn this big, whatever the real one is
const LAP_MS = 2600;
const NAMES = ['right', 'upper right', 'top', 'upper left', 'left', 'lower left', 'bottom', 'lower right'];
const dirName = (deg: number) => NAMES[((Math.round(deg / 45) % 8) + 8) % 8];
const angDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

export default function PointTheMagneticPush({
  id, prompt, charge = 'electron', field = 'out', angle = 30, guess = 200, tolerance = 20, explanation,
}: PointTheMagneticPushProps) {
  const task = useTask(id, 'point-the-magnetic-push');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const [g, setG] = useState(guess);
  const [released, setReleased] = useState(false);
  const api = useRef<StageApi | null>(null);
  const trail = useRef<SVGPolylineElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const t0 = useRef(0);

  const q = charge === 'electron' ? -E_CHARGE : E_CHARGE;
  const m = charge === 'electron' ? M_ELECTRON : M_PROTON;
  const B = field === 'out' ? outOfPage(1e-3) : intoPage(1e-3);
  const v0 = 1e6;
  const a = (angle * Math.PI) / 180;
  const vDir: V3 = [Math.cos(a), Math.sin(a), 0];
  const F = lorentzForce(q, vDir, B);
  const fDeg = (Math.atan2(F[1], F[0]) * 180) / Math.PI;
  const off = angDiff(g, fDeg);
  const alongV = angDiff(g, angle) < 25 || angDiff(g, angle + 180) < 25;

  // the real path, scaled so its circle is R_PATH across the stage
  const path = useRef<Vec[]>([]);
  useEffect(() => {
    const T = cyclotronPeriod(m, q, 1e-3);
    const k = R_PATH / cyclotronRadius(m, v0, q, 1e-3);
    path.current = traceCharge({
      q, m, x0: [0, 0, 0], v0: [vDir[0] * v0, vDir[1] * v0, 0], dt: T / 240, maxSteps: 240,
      fields: () => ({ E: [0, 0, 0], B }),
    }).map((s) => [s.x[0] * k, s.x[1] * k] as Vec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge, field, angle]);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const s = api.current, p = path.current;
      if (s && trail.current && ball.current && p.length) {
        if (!released) {
          trail.current.setAttribute('points', '');
          ball.current.setAttribute('cx', `${s.sx(0)}`); ball.current.setAttribute('cy', `${s.sy(0)}`);
        } else {
          const n = Math.min(p.length - 1, Math.max(0, Math.floor(((now - t0.current) / LAP_MS) * (p.length - 1))));
          let pts = '';
          for (let i = 0; i <= n; i++) pts += `${s.sx(p[i][0]).toFixed(1)},${s.sy(p[i][1]).toFixed(1)} `;
          trail.current.setAttribute('points', pts);
          ball.current.setAttribute('cx', `${s.sx(p[n][0])}`); ball.current.setAttribute('cy', `${s.sy(p[n][1])}`);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [released]);

  const check = () => {
    t0.current = performance.now();
    setReleased(true);
    task.check(off <= tolerance, { guess: g, truth: fDeg });
  };

  const who = charge === 'electron' ? 'electron' : 'proton';
  const miss = alongV
    ? `Your arrow lies along the velocity. The ${who} curved off toward the ${dirName(fDeg)}, at right angles to it.`
    : `Your arrow is ${off.toFixed(0)}° from the push. The ${who} curved toward the ${dirName(fDeg)}.`;

  const tip: Vec = [R_ARROW * Math.cos((g * Math.PI) / 180), R_ARROW * Math.sin((g * Math.PI) / 180)];
  return (
    <SceneCard id={id} prompt={prompt}
      footer={id ? <CheckBar verdict={task.verdict} done={live && task.done} onCheck={check} label="Check and let go" miss={miss} hit={explanation} /> : undefined}>
      <Stage x={[-9, 9]} y={[-5.6, 5.6]} height={340} equal
        label={`An ${who} moving toward ${angle} degrees in a field ${field === 'out' ? 'out of' : 'into'} the page. Your force arrow points toward ${g.toFixed(0)} degrees.`}>
        {(s) => {
          api.current = s;
          return <>
            <FieldMarks s={s} x={[-9.6, 9.6]} y={[-5.6, 5.6]} into={field === 'in'} strength={0.35} gap={1.6}
              label={field === 'out' ? 'B out of the page' : 'B into the page'} />
            <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(R_ARROW)} fill="none" stroke={C.ghost} strokeDasharray="3 5" />
            <polyline ref={trail} fill="none" stroke={C.position} strokeWidth={2.4} />
            <Arrow s={s} from={[0, 0]} to={[vDir[0] * 3.4, vDir[1] * 3.4]} color={C.velocity} width={3.5} label="v" />
            <Arrow s={s} from={[0, 0]} to={tip} color={C.ink} label="your push" labelSide={-1} />
            {live && task.done && <Arrow s={s} from={[0, 0]} to={[(F[0] / Math.hypot(F[0], F[1])) * R_ARROW, (F[1] / Math.hypot(F[0], F[1])) * R_ARROW]}
              color={C.force} width={4} label="F" />}
            <ChargeDot s={s} at={[0, 0]} q={q} r={11} />
            <circle ref={ball} r={6} fill="none" stroke={C.ink} strokeWidth={2} />
            <Handle s={s} at={tip} color={C.ink} step={0.3} label="Your force arrow: drag its tip round the circle"
              onChange={(p) => {
                setG(((Math.atan2(p[1], p[0]) * 180) / Math.PI + 360) % 360);
                setReleased(false);
                task.touch();
              }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        An {who} ({charge === 'electron' ? 'negative' : 'positive'}) · cyan: its velocity · white: your guess at the magnetic push{live && task.done ? ' · amber: the push' : ''}
      </p>
    </SceneCard>
  );
}
