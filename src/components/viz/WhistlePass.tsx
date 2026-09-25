import { useEffect, useRef, useState } from 'react';
import { WHISTLE, crests, heardFrequency, type Pass } from '../../lib/physics/sound.ts';
import { startTones, type Tones } from './sound-tones.ts';
import { C, Meter, SceneCard, Stage, type StageApi } from './scene.tsx';

/**
 * A train sounds a steady whistle and passes you at a level crossing, seen
 * from above. Its crests spread as circles, each centred where the train was
 * when it made that crest, so they bunch up ahead and spread out behind.
 *
 * The strip underneath is the pitch you hear against time, drawn as it
 * happens. It is flat and high the whole way in, however near the train
 * gets, falls only in the few seconds around the crossing, then sits flat
 * and low. Distance never enters: only the velocity component toward you.
 *
 * Ungraded. Physics: `heardFrequency` and `crests` in sound.ts, real time.
 */
export interface WhistlePassProps {
  prompt?: string;
}

const PASS: Pass = { f: WHISTLE.f, v: WHISTLE.v, u: WHISTLE.passSpeed, x0: -300, d: WHISTLE.passDistance };
const T_END = 15;           // s: from 300 m before the crossing to 300 m after
const EVERY = 100;          // one drawn crest per 100 whistle periods
const F_AX: [number, number] = [600, 820];

export default function WhistlePass({ prompt }: WhistlePassProps) {
  const world = useRef<StageApi | null>(null);
  const plot = useRef<StageApi | null>(null);
  const rings = useRef<SVGPathElement>(null);
  const train = useRef<SVGGElement>(null);
  const trace = useRef<SVGPathElement>(null);
  const run = useRef<{ t0: number } | null>(null);
  const tNow = useRef(0);
  const tones = useRef<Tones | null>(null);
  const [sound, setSound] = useState(false);
  const [shown, setShown] = useState({ f: heardFrequency(PASS, 0), dist: 300, running: false });

  const pose = (t: number) => {
    const w = world.current, p = plot.current;
    if (!w || !p) return;
    let d = '';
    for (const c of crests(PASS, t, EVERY, 420)) {
      const cx = w.sx(c.cx), cy = w.sy(0), r = w.len(c.r);
      d += `M${(cx - r).toFixed(1)},${cy.toFixed(1)}a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(2 * r).toFixed(1)},0a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(-2 * r).toFixed(1)},0`;
    }
    rings.current?.setAttribute('d', d);
    train.current?.setAttribute('transform', `translate(${w.len(PASS.x0 + PASS.u * t)},0)`);
    let q = '';
    const n = Math.max(1, Math.round(t * 40));
    for (let i = 0; i <= n; i++) {
      const ti = (t * i) / n;
      q += `${i ? 'L' : 'M'}${p.sx(ti).toFixed(1)},${p.sy(heardFrequency(PASS, ti)).toFixed(1)}`;
    }
    trace.current?.setAttribute('d', t > 0 ? q : '');
  };

  useEffect(() => {
    let raf = 0, shownAt = 0;
    const frame = (now: number) => {
      const r = run.current;
      if (r) {
        tNow.current = Math.min(T_END, (now - r.t0) / 1000);
        if (tNow.current >= T_END) { run.current = null; }
      }
      const t = tNow.current;
      pose(t);
      const fh = heardFrequency(PASS, t), x = PASS.x0 + PASS.u * t;
      const dist = Math.hypot(x, PASS.d);
      tones.current?.set([fh], run.current ? Math.min(1, 60 / dist) : 0);
      if (now - shownAt > 120) { shownAt = now; setShown({ f: fh, dist, running: !!run.current }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); tones.current?.stop(); };
  }, []);

  const toggleSound = () => {
    if (sound) { tones.current?.stop(); tones.current = null; setSound(false); return; }
    tones.current = startTones(1); setSound(true);
  };

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn" disabled={shown.running}
          onClick={() => { run.current = { t0: performance.now() }; }}>{shown.running ? 'Running…' : tNow.current > 0 ? 'Run it again' : 'Run the train'}</button>
        <button type="button" className="anth-btn" onClick={toggleSound}>{sound ? 'Sound off' : 'Sound on'}</button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
          <Meter label="Train from you" value={shown.dist.toFixed(0)} unit="m" />
          <Meter label="Pitch you hear" value={shown.f.toFixed(0)} unit="Hz" color={C.velocity} />
        </span>
      </div>}>
      <Stage x={[-150, 150]} y={[-40, 60]} height={250} equal
        label="Top view: a train on a straight track passes you, standing 30 metres from it. Its whistle's crests spread as circles.">
        {(s) => { world.current = s; return <>
          <line x1={0} x2={s.W} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />
          {Array.from({ length: 31 }, (_, i) => -300 + i * 20).map((x) => <line key={x} x1={s.sx(x)} x2={s.sx(x)} y1={s.sy(-2.5)} y2={s.sy(2.5)} stroke={C.grid} />)}
          <path ref={rings} fill="none" stroke={C.energy} strokeWidth={1.4} opacity={0.7} />
          <g ref={train}>
            <rect x={s.sx(-12)} y={s.sy(3.5)} width={s.len(24)} height={s.len(7)} rx={3} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            <line x1={s.sx(13)} x2={s.sx(30)} y1={s.sy(-9)} y2={s.sy(-9)} stroke={C.velocity} strokeWidth={3} />
            <path d={`M${s.sx(34)},${s.sy(-9)}l-10,-5v10Z`} fill={C.velocity} />
            <text x={s.sx(0)} y={s.sy(-13) + 4} textAnchor="middle" fontSize={12} fill={C.velocity}>{PASS.u} m/s</text>
          </g>
          <circle cx={s.sx(0)} cy={s.sy(PASS.d)} r={7} fill={C.position} />
          <text x={s.sx(0) + 12} y={s.sy(PASS.d) + 5} fontSize={13} fill={C.position}>you, {PASS.d} m from the track</text>
        </>; }}
      </Stage>
      <Stage x={[0, T_END]} y={F_AX} height={190} axes={{ x: 'time (s)', y: 'pitch you hear (Hz)', yTicks: [620, 660, 700, 740, 780, 820] }}
        label="The pitch you hear against time">
        {(p) => { plot.current = p; return <>
          <line x1={p.sx(0)} x2={p.sx(T_END)} y1={p.sy(PASS.f)} y2={p.sy(PASS.f)} stroke={C.soft} strokeDasharray="5 5" />
          <text x={p.sx(0.3)} y={p.sy(PASS.f) - 6} fontSize={12} fill={C.soft}>the whistle’s own {PASS.f} Hz</text>
          <line x1={p.sx(-PASS.x0 / PASS.u)} x2={p.sx(-PASS.x0 / PASS.u)} y1={p.sy(F_AX[0])} y2={p.sy(F_AX[1])} stroke={C.faint} strokeDasharray="3 4" />
          <text x={p.sx(-PASS.x0 / PASS.u + 0.1)} y={p.sy(F_AX[0]) - 8} fontSize={12} fill={C.faint}>train level with you</text>
          <path ref={trace} fill="none" stroke={C.velocity} strokeWidth={2.5} />
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>Real time · every 100th crest drawn, 49 m apart in still air</p>
    </SceneCard>
  );
}
