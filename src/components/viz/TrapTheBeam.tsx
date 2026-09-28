import { useState } from 'react';
import { DEG, N_GLASS, criticalAngle, fresnel } from '../../lib/physics/light.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { AngleArc, GLASS_FILL, Normal, Ray, useGlow } from './optics-kit-ch33.tsx';

/**
 * A half-disc of glass, flat face up, and a laser you walk round its curved
 * side. The beam always aims at the centre of the flat face, so it enters the
 * curve square-on and only bends where it tries to leave into the air.
 *
 * Two rays leave that point: one escaping into the air, one reflected back
 * into the glass. Their brightness is the Fresnel split (`fresnel` in
 * light.ts), so the escaping ray does not switch off: it swings toward the
 * surface and fades, and at the critical angle it is gone. Graded: stop the
 * laser where the escaping ray just vanishes.
 */
export interface TrapTheBeamProps {
  id?: string;
  prompt?: string;
  n?: number;
  /** Degrees either side of the critical angle that count. */
  tolerance?: number;
  explanation?: string;
}

const R = 5, RL = 6.3;

export default function TrapTheBeam({ id, prompt, n = N_GLASS, tolerance = 0.75, explanation }: TrapTheBeamProps) {
  const task = useTask(id, 'trap-the-beam');
  const [deg, setDeg] = useState(20);
  const { id: glow, defs } = useGlow();
  const th = deg * DEG;
  const f = fresnel(n, 1, th);
  const crit = criticalAngle(n, 1) / DEG;
  const ok = Math.abs(deg - crit) <= tolerance;
  const laser: Vec = [-RL * Math.sin(th), -RL * Math.cos(th)];
  const inAt: Vec = [-R * Math.sin(th), -R * Math.cos(th)];
  const outAt: Vec = [R * Math.sin(th), -R * Math.cos(th)];
  const outFar: Vec = [RL * 1.1 * Math.sin(th), -RL * 1.1 * Math.cos(th)];
  const t2 = f.theta2;

  const miss = deg < crit
    ? `At ${deg.toFixed(1)}° light still gets out: ${(f.T * 100).toFixed(0)}% of it, bent to ${(t2! / DEG).toFixed(0)}° from the normal.`
    : `At ${deg.toFixed(1)}° nothing gets out, but the escaping ray vanished at a smaller angle than this. Find where it just disappears.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Angle in the glass" value={deg.toFixed(1)} unit="°" />
          <Meter label="Escaping ray" value={t2 === null ? 'none' : (t2 / DEG).toFixed(1)} unit={t2 === null ? '' : '°'} />
          <Meter label="Light that escapes" value={(f.T * 100).toFixed(0)} unit="%" />
          <Meter label="Light reflected" value={(f.R * 100).toFixed(0)} unit="%" />
        </span>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(ok, { deg })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-7.5, 7.5]} y={[-7.2, 5.6]} height={360} equal
        label={`Half-disc of glass. The laser hits the flat face at ${deg.toFixed(1)} degrees; ${(f.T * 100).toFixed(0)} percent escapes.`}>
        {(s) => <>
          {defs}
          <path d={`M${s.sx(-R)},${s.sy(0)}A${s.len(R)},${s.len(R)} 0 0 0 ${s.sx(R)},${s.sy(0)}Z`} fill={GLASS_FILL} stroke={C.soft} strokeWidth={2} />
          <text x={s.sx(6.9)} y={s.sy(-6.6)} textAnchor="end" fontSize={13} fill={C.soft}>glass, n = {n}</text>
          <text x={s.sx(-6.8)} y={s.sy(4.6)} fontSize={13} fill={C.soft}>air, n = 1</text>
          <Normal s={s} at={[0, 0]} len={4.6} />
          <AngleArc s={s} at={[0, 0]} a0={-Math.PI / 2 - th} a1={-Math.PI / 2} r={52} label={`${deg.toFixed(1)}°`} />
          {t2 !== null && <AngleArc s={s} at={[0, 0]} a0={Math.PI / 2 - t2} a1={Math.PI / 2} r={52} label={`${(t2 / DEG).toFixed(0)}°`} />}
          <Ray s={s} from={laser} to={[0, 0]} glow={glow} />
          <Ray s={s} from={[0, 0]} to={outFar} glow={glow} b={f.R} />
          {t2 !== null && <Ray s={s} from={[0, 0]} to={[5.2 * Math.sin(t2), 5.2 * Math.cos(t2)]} glow={glow} b={f.T} />}
          <circle cx={s.sx(inAt[0])} cy={s.sy(inAt[1])} r={2} fill={C.faint} />
          <circle cx={s.sx(outAt[0])} cy={s.sy(outAt[1])} r={2} fill={C.faint} />
          <g transform={`translate(${s.sx(laser[0])},${s.sy(laser[1])}) rotate(${deg - 90})`}>
            <rect x={-34} y={-6} width={34} height={12} rx={3} fill={C.surface} stroke={C.ink} strokeWidth={1.8} />
          </g>
          <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(RL)} fill="none" stroke={C.ghost} strokeDasharray="2 6" />
          <Handle s={s} at={laser} step={0.05} label="The laser: drag it round the glass" color={C.ink}
            onChange={(p) => {
              const a = Math.atan2(-p[0], -p[1]) / DEG;
              setDeg(Math.round(Math.max(0, Math.min(85, a)) * 10) / 10);
              task.touch();
            }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        White: the beam, glowing as bright as the light it carries · angles from the normal
      </p>
    </SceneCard>
  );
}
