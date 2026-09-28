import { useMemo, useRef, useState } from 'react';
import {
  A0_PM, density, mostLikelyRadius, radius99, shellProbability, stateName,
} from '../../lib/physics/hydrogen.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { CloudKey, CloudStage, Nucleus, PmScaleBar } from './atom-kit-ch41.tsx';

/**
 * A hydrogen cloud and one thin spherical shell, 5 pm thick, centred on the
 * nucleus. Drag the shell in and out. Two numbers move: how dense the cloud is
 * where the shell sits, and how much of the electron the whole shell catches.
 * Near the nucleus the cloud is densest but the shell is tiny; far out the
 * shell is huge but the cloud is thin. The strip underneath keeps every shell
 * you tried, so the learner's own measurements draw r²|R|².
 *
 * Graded (`id`): leave the shell where it catches the most, within 5% of the
 * best (`mostLikelyRadius`, pinned in hydrogen.test.ts). Physics: hydrogen.ts.
 */
export interface CatchTheShellProps {
  id?: string;
  prompt?: string;
  n?: number;
  l?: number;
  /** Where the shell starts, pm. */
  start?: number;
  explanation?: string;
}

const DR_PM = 5;
const ANGLE = (35 * Math.PI) / 180;
const DIR: Vec = [Math.cos(ANGLE), Math.sin(ANGLE)];

export default function CatchTheShell({ id, prompt, n = 1, l = 0, start, explanation }: CatchTheShellProps) {
  const task = useTask(id, 'catch-the-shell');
  const half = useMemo(() => Math.min(radius99(n, l) * 0.82, 16), [n, l]);
  const dr = DR_PM / A0_PM;
  const [r, setR] = useState<number>(start !== undefined ? start / A0_PM : half * 0.55);
  const tried = useRef<Map<number, number>>(new Map());

  const catchAt = (rr: number) => shellProbability(n, l, rr - dr / 2, dr);
  const p = catchAt(r);
  const best = useMemo(() => { const rb = mostLikelyRadius(n, l); return { r: rb, p: shellProbability(n, l, rb - dr / 2, dr) }; }, [n, l, dr]);
  const rel = density(n, l, 0, r, 0, 0) / density(n, l, 0, 0, 0, 0);
  const good = p >= 0.95 * best.p;

  const key = Math.round(r * A0_PM);
  if (!tried.current.has(key)) tried.current.set(key, catchAt(key / A0_PM));

  const move = (q: Vec) => {
    const along = q[0] * DIR[0] + q[1] * DIR[1];
    setR(Math.max(dr, Math.min(half * 0.97, along)));
    task.touch();
  };

  const pMax = best.p * 1.25;
  const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}`;
  const pm = r * A0_PM;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Shell radius" value={pm.toFixed(0)} unit="pm" color={C.position} />
          <Meter label="Cloud density there, vs at the nucleus" value={`${pct(rel)}%`} color={C.faint} />
          <Meter label="Chance the shell catches the electron" value={`${pct(p)}%`} color={C.ink} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(good, { rPm: pm })}
          miss={r < best.r
            ? `This shell at ${pm.toFixed(0)} pm catches ${pct(p)}%. The cloud is dense here, but the shell is small.`
            : `This shell at ${pm.toFixed(0)} pm catches ${pct(p)}%. It is big, but the cloud out here is thin.`}
          hit={explanation} />}
      </div>}>
      <CloudStage state={{ n, l }} half={half} stage={(capture) =>
        <Stage x={[-half, half]} y={[-half, half]} height={340} equal
          label={`Hydrogen ${stateName(n, l)} cloud with a shell at ${pm.toFixed(0)} picometres catching ${pct(p)} percent.`}>
          {(s) => { capture(s); return <>
            <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(r)} fill="none" stroke={C.ink} strokeOpacity={0.85}
              strokeWidth={Math.max(2, s.len(dr))} />
            <Nucleus s={s} />
            <PmScaleBar s={s} />
            <text x={s.W - 14} y={24} textAnchor="end" fontSize={14} fill={C.soft}>hydrogen, {stateName(n, l)}</text>
            <text x={s.W - 14} y={46} textAnchor="end" fontSize={13} fill={C.faint}>white ring: your shell, {DR_PM} pm thick</text>
            <Handle s={s} at={[r * DIR[0], r * DIR[1]]} onChange={move} step={half / 60} label="The shell: drag it in or out" />
          </>; }}
        </Stage>} />
      <Stage x={[0, half * A0_PM]} y={[0, pMax * 100]} height={150}
        axes={{ x: 'shell radius (pm)', y: 'chance caught (%)' }}
        label="Your measurements: chance caught against shell radius">
        {(s) => <>
          {[...tried.current.entries()].map(([k, v]) => (
            <circle key={k} cx={s.sx(k)} cy={s.sy(v * 100)} r={2.2} fill={C.soft} />
          ))}
          <circle cx={s.sx(pm)} cy={s.sy(p * 100)} r={5.5} fill={C.ink} />
          {task.done && <line x1={s.sx(best.r * A0_PM)} x2={s.sx(best.r * A0_PM)} y1={s.sy(0)} y2={s.sy(pMax * 100)}
            stroke={C.ok} strokeDasharray="5 4" />}
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <CloudKey />
        <span>Dots: every shell you have tried</span>
      </p>
    </SceneCard>
  );
}
