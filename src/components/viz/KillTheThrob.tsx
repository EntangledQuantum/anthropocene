import { useEffect, useRef, useState } from 'react';
import { RIDER_FORK, beatEnvelopeAtPhase, beatFrequency, riderForkFrequency } from '../../lib/physics/sound.ts';
import { startTones, type Tones } from './sound-tones.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * Two tuning forks sounding together: a reference at 440 Hz, and yours, with
 * a small clamp (a rider) on one tine. One control: slide the rider. The
 * farther out it sits, the lower your fork sounds.
 *
 * Their sum at your ear swells and fades: the circle breathes, and the strip
 * records the swell over the last few seconds. The throb slows as the forks
 * close in, stops when they match, and comes back past the match. The fork's
 * own pitch is never printed; the throb is the only instrument.
 *
 * With `id`, graded: stop the throb. Physics: `riderForkFrequency` and
 * `beatEnvelopeAtPhase` in sound.ts.
 */
export interface KillTheThrobProps {
  id?: string;
  prompt?: string;
  /** Starting rider position, 0 at the root of the tine to 1 at the tip. */
  start?: number;
  /** Largest leftover beat rate that counts as silent, Hz. */
  tolerance?: number;
  explanation?: string;
}

const { f0: F0, mu: MU, reference: F_REF } = RIDER_FORK;
const WINDOW = 5;            // s of history on the strip
const TINE: [number, number] = [0.15, 1.35]; // world y of root and tip

export default function KillTheThrob({ id, prompt, start = 0.25, tolerance = 0.4, explanation }: KillTheThrobProps) {
  const task = useTask(id, 'kill-the-throb');
  const [xi, setXi] = useState(start);
  const f2 = riderForkFrequency(F0, xi, MU);
  const f2Ref = useRef(f2);
  f2Ref.current = f2;
  const plot = useRef<StageApi | null>(null);
  const world = useRef<StageApi | null>(null);
  const band = useRef<SVGPathElement>(null);
  const bubble = useRef<SVGCircleElement>(null);
  const tones = useRef<Tones | null>(null);
  const [sound, setSound] = useState(false);

  useEffect(() => { tones.current?.set([F_REF, f2], 1); }, [f2]);

  useEffect(() => {
    let raf = 0, last = performance.now(), phi = 0, sweep = 0;
    const hist: { t: number; e: number }[] = [];
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      phi += 2 * Math.PI * (F_REF - f2Ref.current) * dt;
      sweep += dt;
      if (sweep > WINDOW) { sweep = 0; hist.length = 0; }
      const e = beatEnvelopeAtPhase(phi);
      hist.push({ t: sweep, e });
      const p = plot.current, w = world.current;
      if (p) {
        let top = '', bot = '';
        hist.forEach((h, i) => {
          top += `${i ? 'L' : 'M'}${p.sx(h.t).toFixed(1)},${p.sy(h.e).toFixed(1)}`;
        });
        for (let i = hist.length - 1; i >= 0; i--) bot += `L${p.sx(hist[i].t).toFixed(1)},${p.sy(-hist[i].e).toFixed(1)}`;
        band.current?.setAttribute('d', hist.length > 1 ? `${top}${bot}Z` : '');
      }
      if (w) bubble.current?.setAttribute('r', String(w.len(0.06 + 0.22 * e)));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); tones.current?.stop(); };
  }, []);

  const toggleSound = () => {
    if (sound) { tones.current?.stop(); tones.current = null; setSound(false); return; }
    tones.current = startTones(2);
    tones.current?.set([F_REF, f2Ref.current], 1);
    setSound(true);
  };

  const beat = beatFrequency(F_REF, f2);
  const yRider = TINE[0] + xi * (TINE[1] - TINE[0]);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={toggleSound}>{sound ? 'Sound off' : 'Sound on'}</button>
          <span style={{ marginLeft: 'auto' }}>
            <Meter label="Rider, up the tine" value={`${Math.round(xi * 100)}`} unit="%" />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(beat <= tolerance, { xi, f2 })}
          miss={`The sound still swells and fades ${beat.toFixed(1)} times a second: the forks are ${beat.toFixed(1)} Hz apart.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-2.4, 2.4]} y={[-0.15, 1.6]} height={240} equal
        label={`Two tuning forks. The rider on yours is ${Math.round(xi * 100)} percent of the way up the tine.`}>
        {(s) => { world.current = s; return <>
          <Fork s={s} x={-1.5} label={`${F_REF} Hz`} />
          <Fork s={s} x={1.2} label="your fork" />
          <text x={s.sx(1.55)} y={s.sy(TINE[1]) + 4} fontSize={12} fill={C.faint}>tip</text>
          <text x={s.sx(1.55)} y={s.sy(TINE[0]) + 4} fontSize={12} fill={C.faint}>root</text>
          <rect x={s.sx(1.35 - 0.07)} y={s.sy(yRider + 0.05)} width={s.len(0.14)} height={s.len(0.1)} rx={2} fill={C.force} />
          <Handle s={s} at={[1.35, yRider]} color={C.force} step={0.006}
            label="Rider position along the tine"
            onChange={(p) => { setXi(Math.round(Math.min(0.97, Math.max(0.03, (p[1] - TINE[0]) / (TINE[1] - TINE[0]))) * 200) / 200); task.touch(); }} />
          <circle ref={bubble} cx={s.sx(-0.15)} cy={s.sy(0.75)} r={10} fill={C.energy} opacity={0.35} stroke={C.energy} />
          <text x={s.sx(-0.15)} y={s.sy(0.15)} textAnchor="middle" fontSize={12} fill={C.soft}>loudness at your ear</text>
        </>; }}
      </Stage>
      <Stage x={[0, WINDOW]} y={[-2.3, 3]} height={190} axes={{ x: 'time (s)', y: 'sound at your ear', yTicks: [-2, 0, 2] }}
        label="The combined sound at your ear over the last few seconds">
        {(p) => { plot.current = p; return <path ref={band} fill={C.energy} fillOpacity={0.3} stroke={C.energy} strokeWidth={1.5} />; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>Shaded: the swell of the two tones added · the 440 wiggles a second inside it are too fast to draw · 2 = both forks in step</p>
    </SceneCard>
  );
}

function Fork({ s, x, label }: { s: StageApi; x: number; label: string }) {
  const l = x - 0.15, r = x + 0.15;
  return <g>
    <path d={`M${s.sx(l)},${s.sy(TINE[1])}V${s.sy(TINE[0])}Q${s.sx(l)},${s.sy(0.02)} ${s.sx(x)},${s.sy(0.02)}Q${s.sx(r)},${s.sy(0.02)} ${s.sx(r)},${s.sy(TINE[0])}V${s.sy(TINE[1])}`}
      fill="none" stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
    <line x1={s.sx(x)} x2={s.sx(x)} y1={s.sy(0.02)} y2={s.sy(-0.12)} stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
    <text x={s.sx(x)} y={s.sy(TINE[1]) - 12} textAnchor="middle" fontSize={13} fill={C.soft}>{label}</text>
  </g>;
}
