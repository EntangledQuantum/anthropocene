import { useEffect, useMemo, useRef, useState } from 'react';
import { SLITS, darkStripesMm, fire, firedShare, makePattern, rng, type Open } from '../../lib/physics/photons.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { spectrumColour } from './photon-colour.ts';

/**
 * Laser light dimmed until photons cross the apparatus one at a time, through
 * two slits onto a screen seen face-on. Each photon lands whole, as one dot.
 * The stripes appear only as the dots pile up.
 *
 * Three uses:
 *  - `run`: a Fire button and a count; the rate starts at a few a second.
 *  - `id` + `counter`: graded. A few hundred dots are on the screen; drag a
 *    narrow counter to where the next 1000 photons will not land. Check fires
 *    them and counts.
 *  - `cover` + `counterAt="dark"`: the counter is fixed on the first dark
 *    stripe; cover one slit and fire again.
 *
 * Arrivals are sampled from the two-slit intensity in photons.ts (seeded).
 */
export interface PhotonsDotByDotProps {
  id?: string;
  prompt?: string;
  run?: boolean;
  /** Dots already on the screen. */
  preload?: number;
  /** Show a draggable counter starting at this position, mm. */
  counter?: number;
  /** Fix the counter on the first dark stripe right of centre. */
  counterAt?: 'dark';
  /** Show the cover for slit B. */
  cover?: boolean;
  /** Expected photons (of 1000) that still count as none. */
  allow?: number;
  seed?: number;
  explanation?: string;
}

const Y = SLITS.screenMm, HALF_W = 0.15, MAX_DOTS = 6000, BURST = 1000;

export default function PhotonsDotByDot({
  id, prompt, run, preload = 0, counter, counterAt, cover, allow = 3, seed = 38, explanation,
}: PhotonsDotByDotProps) {
  const graded = Boolean(id && counter !== undefined);
  const task = useTask(graded ? id : undefined, 'photons-dot-by-dot');
  const [open, setOpen] = useState<Open>('both');
  const patterns = useMemo(() => ({ both: makePattern('both', 12000), A: makePattern('A', 12000) }), []);
  const dark = useMemo(() => darkStripesMm().filter((y) => y > 0).sort((a, b) => a - b)[0], []);
  const [cx, setCx] = useState(counterAt === 'dark' ? dark : counter ?? 0);
  const rand = useRef(rng(seed));
  // dots on the screen: [y-on-screen mm (x axis), height 0..10]
  const dots = useRef<[number, number][]>([]);
  const queue = useRef<[number, number][]>([]);
  const pathEl = useRef<SVGPathElement | null>(null);
  const flyEl = useRef<SVGCircleElement | null>(null);
  const running = useRef(false);
  const tally = useRef({ fired: 0, inside: 0 });
  const [shown, setShown] = useState({ landed: 0, fired: 0, inside: 0, running: false });
  const [last, setLast] = useState<{ caught: number } | null>(null);
  const stageRef = useRef<{ sx: (v: number) => number; sy: (v: number) => number } | null>(null);
  const cfg = useRef({ open, cx });
  cfg.current = { open, cx };

  const land = (y: number | null) => {
    tally.current.fired++;
    if (y === null) return;
    if (Math.abs(y - cfg.current.cx) <= HALF_W) tally.current.inside++;
    queue.current.push([y, 0.4 + rand.current() * 9.2]);
  };

  const clear = () => {
    dots.current = []; queue.current = []; tally.current = { fired: 0, inside: 0 };
    setShown({ landed: 0, fired: 0, inside: 0, running: running.current });
  };

  useEffect(() => {
    // preload lands immediately
    for (const y of fire(patterns.both, preload, rand.current)) if (y !== null) dots.current.push([y, 0.4 + rand.current() * 9.2]);
    let raf = 0, lastT = performance.now(), due = 0, lastShown = 0, fly = -1;
    const frame = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      if (running.current) {
        // slow at first, so single photons are visible, then faster
        const n = tally.current.fired;
        const rate = cover ? 300 : n < 12 ? 2.5 : n < 60 ? 12 : n < 400 ? 80 : 400;
        due += rate * dt;
        while (due >= 1) {
          due -= 1;
          const [y] = fire(patterns[cfg.current.open === 'both' ? 'both' : 'A'], 1, rand.current);
          land(y);
          if (rate < 20) fly = 0;
        }
      }
      // bursts (graded check) drain over about a second
      const take = Math.min(queue.current.length, Math.max(1, Math.ceil(queue.current.length * 6 * dt)));
      if (queue.current.length) dots.current.push(...queue.current.splice(0, take));
      if (dots.current.length > MAX_DOTS) dots.current.splice(0, dots.current.length - MAX_DOTS);
      const p = pathEl.current, s = stageRef.current;
      if (p && s) {
        let d = '';
        for (const [x, h] of dots.current) d += `M${s.sx(x).toFixed(1)} ${s.sy(h).toFixed(1)}h0`;
        p.setAttribute('d', d);
      }
      const f = flyEl.current;
      if (f) {
        if (fly >= 0) {
          fly += dt / 0.3;
          const u = Math.min(fly, 1);
          // laser (x=20) → slits (x=380) → screen (x=620), in the schematic
          // Seen only up to the slits: which way it went after is not a thing you can draw.
          const x = 50 + 322 * u;
          f.setAttribute('cx', x.toFixed(1)); f.setAttribute('cy', '44');
          f.setAttribute('opacity', u < 1 ? '1' : '0');
          if (fly >= 1) fly = -1;
        } else f.setAttribute('opacity', '0');
      }
      if (now - lastShown > 120) {
        lastShown = now;
        setShown({ landed: dots.current.length + queue.current.length, fired: tally.current.fired, inside: tally.current.inside, running: running.current });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [patterns, preload, cover]);

  const expected = 1000 * firedShare(patterns.both, cx - HALF_W, cx + HALF_W);
  const laser = spectrumColour(633);

  const check = () => {
    tally.current = { fired: 0, inside: 0 };
    const shots = fire(patterns.both, BURST, rand.current);
    shots.forEach(land);
    const caught = tally.current.inside;
    setLast({ caught });
    task.check(expected <= allow, { cx, caught });
  };

  const showCounter = counter !== undefined || counterAt === 'dark';

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {run && <button type="button" className="anth-btn"
            onClick={() => { running.current = !running.current; setShown((v) => ({ ...v, running: running.current })); }}>
            {shown.running ? 'Pause' : 'Fire photons'}</button>}
          {cover && <button type="button" className="anth-btn" data-active={open !== 'both'}
            onClick={() => { setOpen(open === 'both' ? 'A' : 'both'); clear(); }}>
            {open === 'both' ? 'Cover slit B' : 'Uncover slit B'}</button>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            {!graded && <Meter label="Photons fired" value={String(shown.fired)} />}
            {!graded && showCounter && <Meter label="In the counter" value={String(shown.inside)} color={C.accel} />}
            {graded && <Meter label="Dots on screen" value={String(shown.landed)} />}
            {graded && last && <Meter label="Caught, last 1000" value={String(last.caught)} color={C.accel} />}
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done} label="Fire 1000 and check" onCheck={check}
          miss={last ? `Your counter caught ${last.caught} of the next 1000 photons. A dark stripe catches none.` : undefined}
          hit={explanation?.replace('{n}', String(last?.caught ?? 0))} />}
      </div>}>
      {/* the apparatus from above: laser, two slits, screen edge-on */}
      <svg viewBox="0 0 640 92" role="img" aria-label={`Laser, two slits${open !== 'both' ? ' with slit B covered' : ''}, and the screen`}
        style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}>
        <rect x={14} y={34} width={36} height={20} rx={3} fill={C.surface} stroke={laser} strokeWidth={2} />
        <text x={14} y={72} fontSize={12} fill={C.soft}>dim laser</text>
        <line x1={50} y1={44} x2={380} y2={44} stroke={laser} strokeWidth={1} opacity={0.35} />
        {/* barrier with two gaps at 40 and 48 */}
        <line x1={380} y1={8} x2={380} y2={38} stroke={C.soft} strokeWidth={4} />
        <line x1={380} y1={41} x2={380} y2={47} stroke={C.soft} strokeWidth={4} />
        <line x1={380} y1={50} x2={380} y2={80} stroke={C.soft} strokeWidth={4} />
        {open !== 'both' && <rect x={376} y={46} width={8} height={5} fill={C.warn} />}
        <text x={372} y={34} textAnchor="end" fontSize={12} fill={C.soft}>A</text>
        <text x={372} y={60} textAnchor="end" fontSize={12} fill={C.soft}>B</text>
        <line x1={622} y1={8} x2={622} y2={80} stroke={C.rule} strokeWidth={3} />
        <text x={612} y={88} textAnchor="end" fontSize={12} fill={C.soft}>screen, 1 m away</text>
        <circle ref={flyEl} r={4} fill={laser} opacity={0} />
      </svg>
      <Stage x={[-Y, Y]} y={[0, 10]} height={250} axes={{ x: 'position on the screen (mm)', xTicks: [-15, -10, -5, 0, 5, 10, 15], yTicks: [] }}
        label={`Screen face-on with ${shown.landed} photon dots`}>
        {(s) => { stageRef.current = s; return <>
          <rect x={s.sx(-Y)} y={s.sy(10)} width={s.sx(Y) - s.sx(-Y)} height={s.sy(0) - s.sy(10)} fill="rgba(0,0,0,0.25)" />
          <path ref={pathEl} d="" stroke={laser} strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.9} />
          {showCounter && <>
            <rect x={s.sx(cx - HALF_W)} y={s.sy(10)} width={s.sx(cx + HALF_W) - s.sx(cx - HALF_W)} height={s.sy(0) - s.sy(10)}
              fill={C.accel} opacity={0.18} stroke={C.accel} strokeWidth={1.5} />
            <text x={s.sx(cx)} y={s.sy(10) - 2} textAnchor="middle" fontSize={12} fill={C.accel}>counter</text>
          </>}
          {graded && <Handle s={s} at={[cx, 0.9]} color={C.accel} step={0.05} label="Counter position on the screen"
            clamp={(p) => [Math.max(-Y + HALF_W, Math.min(Y - HALF_W, p[0])), 0.9]}
            onChange={(p) => { setCx(p[0]); task.touch(); }} />}
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        each dot: one photon, landed whole · slits 0.25 mm apart, 633 nm light
      </p>
    </SceneCard>
  );
}
