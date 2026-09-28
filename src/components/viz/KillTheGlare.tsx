import { useState } from 'react';
import { DEG, N_WATER, brewsterAngle, fresnel } from '../../lib/physics/light.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';
import { Eye, LIGHT, Medium, Normal, Ray, WATER_FILL, useGlow } from './optics-kit-ch33.tsx';

/**
 * Sunlight glinting off a lake, seen side-on, and one control: the sun, which
 * you drag across the sky. You always look at its reflection, through
 * sunglasses whose slots are vertical.
 *
 * Along each ray the field is drawn in its two parts: dots for the part along
 * the lake surface (s, out of the page) and orchid ticks for the part in the
 * page (p). Sunlight carries both equally. The reflection keeps them in the
 * Fresnel ratio (`fresnel` in light.ts), and at Brewster's angle the p part,
 * the only part the sunglasses pass, is gone. Graded: find that sun height.
 */
export interface KillTheGlareProps {
  id?: string;
  prompt?: string;
  /** Degrees either side of Brewster's angle that count. */
  tolerance?: number;
  explanation?: string;
}

const RS = 8;

/** Polarisation marks along a ray: dots (s) and ticks across the ray in the page (p). */
function Marks({ s, from, to, sAmp, pAmp }: { s: StageApi; from: Vec; to: Vec; sAmp: number; pAmp: number }) {
  const dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L;
  return <g>{[0.3, 0.5, 0.7].map((f) => {
    const x = from[0] + dx * f, y = from[1] + dy * f;
    const h = 0.75 * pAmp;
    return <g key={f}>
      {pAmp > 0.03 && <line x1={s.sx(x - nx * h)} y1={s.sy(y - ny * h)} x2={s.sx(x + nx * h)} y2={s.sy(y + ny * h)} stroke={C.field} strokeWidth={3} strokeLinecap="round" />}
      {sAmp > 0.03 && <circle cx={s.sx(x + dx / L * 0.45)} cy={s.sy(y + dy / L * 0.45)} r={1.5 + 3 * sAmp} fill={C.field} />}
    </g>;
  })}</g>;
}

export default function KillTheGlare({ id, prompt, tolerance = 1.5, explanation }: KillTheGlareProps) {
  const task = useTask(id, 'kill-the-glare');
  const [deg, setDeg] = useState(30);
  const { id: glow, defs } = useGlow();
  const th = deg * DEG;
  const f = fresnel(1, N_WATER, th);
  const brew = brewsterAngle(1, N_WATER) / DEG;
  const ok = Math.abs(deg - brew) <= tolerance;
  const sun: Vec = [-RS * Math.sin(th), RS * Math.cos(th)];
  const eye: Vec = [RS * Math.sin(th), RS * Math.cos(th)];
  const t2 = f.theta2!;
  const down: Vec = [4.6 * Math.sin(t2), -4.6 * Math.cos(t2)];
  const passed = f.Rp / (f.Rs + f.Rp);
  const glass = f.Rp / 2; // of the sunlight, through vertical slots
  const pA = Math.sqrt(f.Rp / f.Rs);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Sun above the horizon" value={(90 - deg).toFixed(1)} unit="°" />
          <Meter label="Glare, bare eye" value={(f.R * 100).toFixed(2)} unit="% of sunlight" color={C.energy} />
          <Meter label="Glare through the sunglasses" value={(glass * 100).toFixed(2)} unit="% of sunlight" color={C.energy} />
        </span>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(ok, { deg })}
          miss={`With the sun ${(90 - deg).toFixed(1)}° up, the sunglasses still pass ${(passed * 100).toFixed(0)}% of the glare: the reflection still carries field in the page.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-10, 10]} y={[-5.2, 9.2]} height={340} equal
        label={`Sun ${(90 - deg).toFixed(0)} degrees above a lake. Through the sunglasses, ${(glass * 100).toFixed(2)} percent of the sunlight reaches you as glare.`}>
        {(s) => <>
          {defs}
          <Medium s={s} x={[s.x[0], s.x[1]]} y={[-5.2, 0]} fill={WATER_FILL} label={`lake, n = ${N_WATER}`} labelAt={[s.x[0], -4.2]} />
          <Normal s={s} at={[0, 0]} len={3.5} />
          <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(RS)} fill="none" stroke={C.ghost} strokeDasharray="2 6" />
          <Ray s={s} from={sun} to={[0, 0]} glow={glow} />
          <Ray s={s} from={[0, 0]} to={eye} glow={glow} b={Math.min(1, f.R * 6)} />
          <Ray s={s} from={[0, 0]} to={down} glow={glow} b={0.8} />
          <Marks s={s} from={sun} to={[0, 0]} sAmp={1} pAmp={1} />
          <Marks s={s} from={[0, 0]} to={eye} sAmp={1} pAmp={pA} />
          {task.done && (() => {
            const u = [eye[0] / RS, eye[1] / RS], v = [down[0] / 4.6, down[1] / 4.6], k = 0.7;
            return <path d={`M${s.sx(u[0] * k)},${s.sy(u[1] * k)}L${s.sx((u[0] + v[0]) * k)},${s.sy((u[1] + v[1]) * k)}L${s.sx(v[0] * k)},${s.sy(v[1] * k)}`}
              fill="none" stroke={C.ok} strokeWidth={1.6} />;
          })()}
          {/* the sun */}
          <circle cx={s.sx(sun[0])} cy={s.sy(sun[1])} r={22} fill={LIGHT} opacity={0.4} filter={`url(#${glow})`} />
          {/* the eye and its sunglasses, with the glare that gets through */}
          <circle cx={s.sx(eye[0])} cy={s.sy(eye[1])} r={26} fill={LIGHT} opacity={Math.min(0.8, glass * 40)} filter={`url(#${glow})`} />
          <Eye s={s} at={[eye[0] + 0.9 * Math.sin(th), eye[1] + 0.9 * Math.cos(th)]} toward={[0, 0]} />
          <line x1={s.sx(eye[0] - 0.55 * Math.cos(th))} y1={s.sy(eye[1] + 0.55 * Math.sin(th))}
            x2={s.sx(eye[0] + 0.55 * Math.cos(th))} y2={s.sy(eye[1] - 0.55 * Math.sin(th))} stroke={C.ink} strokeWidth={5} />
          <text x={s.sx(eye[0]) + 16} y={s.sy(eye[1]) + 34} fontSize={12} fill={C.faint}>sunglasses, slots vertical</text>
          <Handle s={s} at={sun} step={0.12} color={C.ink} label="The sun: drag it across the sky"
            onChange={(p) => { const a = Math.atan2(-p[0], p[1]) / DEG; setDeg(Math.round(Math.max(5, Math.min(85, a)) * 10) / 10); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Orchid dots: field along the lake surface · orchid ticks: field in the page, the part vertical sunglasses pass · the reflection is drawn 6× brighter than it is
      </p>
    </SceneCard>
  );
}
