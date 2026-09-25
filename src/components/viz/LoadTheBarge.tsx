import { useEffect, useRef, useState } from 'react';
import { displacedMass, heaveStep, hydrostaticPressure, type Barge, type Heave } from '../../lib/physics/fluids.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { PushArrow, WATER_FILL, WATER_LINE } from './fluid-kit.tsx';

/**
 * A steel barge moored at a dock, held at its empty draft by the lines. Load
 * crates onto the deck, then cast off: it bobs and settles where the pressure
 * on its bottom, over its whole floor, carries its weight. The water it
 * pushes aside is printed beside the load it carries.
 *
 * Graded with `id`: cast off with the load that settles the waterline on the
 * painted mark. Physics: `heaveStep` / `displacedMass` in fluids.ts.
 */
export interface LoadTheBargeProps {
  id?: string;
  prompt?: string;
  /** Draft of the painted mark, m. */
  mark?: number;
  explanation?: string;
}

const BARGE: Barge = { length: 10, beam: 4, height: 1.6, mass: 20_000 };
const CRATE = 2000;       // kg
const MAX_CRATES = 16;
const EMPTY = BARGE.mass / (1000 * BARGE.length * BARGE.beam);
const PER_PA = 0.06 / 1000;
const DT = 1 / 240;

export default function LoadTheBarge({ id, prompt, mark = 1.1, explanation }: LoadTheBargeProps) {
  const task = useTask(id, 'load-the-barge');
  const [crates, setCrates] = useState(4);
  const [shown, setShown] = useState({ draft: EMPTY, released: false, settled: false });
  const sim = useRef<{ s: Heave; running: boolean; t: number }>({ s: { draft: EMPTY, v: 0 }, running: false, t: 0 });
  const hull = useRef<SVGGElement>(null);
  const stage = useRef<StageApi | null>(null);
  const total = BARGE.mass + crates * CRATE;
  const totalRef = useRef(total);
  totalRef.current = total;

  const place = (draft: number) => {
    const s = stage.current;
    if (s && hull.current) hull.current.setAttribute('transform', `translate(0,${(s.sy(-draft) - s.sy(-EMPTY)).toFixed(2)})`);
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const r = sim.current;
      if (r.running) {
        for (let k = 0; k < Math.round(dt / DT); k++) r.s = heaveStep(BARGE, totalRef.current, r.s, DT);
        r.t += dt;
        place(r.s.draft);
        const settled = r.t > 6;
        if (settled) r.running = false;
        if (settled || now - lastShown > 120) {
          lastShown = now;
          setShown({ draft: r.s.draft, released: true, settled });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hold = (n: number) => {
    setCrates(n);
    sim.current = { s: { draft: EMPTY, v: 0 }, running: false, t: 0 };
    place(EMPTY);
    setShown({ draft: EMPTY, released: false, settled: false });
    task.touch();
  };
  const release = () => {
    sim.current = { s: { draft: EMPTY, v: 0 }, running: true, t: 0 };
    setShown({ draft: EMPTY, released: true, settled: false });
    task.touch();
  };

  const d = shown.draft;
  const off = d - mark;
  const t = (kg: number) => `${(kg / 1000).toFixed(1)} t`;
  const miss = !shown.settled
    ? `The dock lines still hold it at ${EMPTY.toFixed(2)} m. Cast off and let it settle first.`
    : `It floats at ${d.toFixed(2)} m, with the waterline ${Math.abs(off).toFixed(2)} m ${off > 0 ? 'above' : 'below'} the mark, pushing aside ${t(displacedMass(BARGE, d))} of water.`;

  const L = BARGE.length, H = BARGE.height;
  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15, color: C.soft }}>
            Crates on deck
            <input type="range" min={0} max={MAX_CRATES} step={1} value={crates} aria-label="Crates on deck, 2 tonnes each"
              onChange={(e) => hold(+e.target.value)} style={{ width: 160 }} />
            <span className="readout" style={{ minWidth: 24 }}>{crates}</span>
          </label>
          <button type="button" className="anth-btn" onClick={release} disabled={shown.released && !shown.settled}>
            {shown.released ? 'Moor and cast off again' : 'Cast off'}
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Barge and cargo" value={t(total)} />
            <Meter label="Water pushed aside" value={t(displacedMass(BARGE, d))} color={C.force} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(shown.settled && Math.abs(off) <= 0.02, { crates, draft: d })}
          miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-6.3, 6.3]} y={[-2.2, 3.4]} height={330} equal
        label={`A barge of ${t(BARGE.mass)} with ${crates} crates of 2 tonnes, ${shown.released ? `floating at ${d.toFixed(2)} metres` : 'held by dock lines'}.`}>
        {(s) => { stage.current = s; return <>
          <rect x={s.sx(-9)} y={s.sy(0)} width={s.len(14.5)} height={s.sy(-2.2) - s.sy(0)} fill={WATER_FILL} />
          {/* the dock */}
          <rect x={s.sx(5.5)} y={s.sy(0.9)} width={s.len(2)} height={s.sy(-2.2) - s.sy(0.9)} fill={C.surface} stroke={C.soft} strokeWidth={2} />
          <g ref={hull}>
            <rect x={s.sx(-L / 2)} y={s.sy(H - EMPTY)} width={s.len(L)} height={s.len(H)} rx={3} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            {/* painted draft marks, measured up from the keel */}
            {[0.4, 0.8, 1.2].map((m) => <g key={m}>
              <line x1={s.sx(L / 2 - 0.5)} x2={s.sx(L / 2 - 0.1)} y1={s.sy(m - EMPTY)} y2={s.sy(m - EMPTY)} stroke={C.faint} strokeWidth={1.5} />
              <text x={s.sx(L / 2 - 0.6)} y={s.sy(m - EMPTY) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{m}</text>
            </g>)}
            <line x1={s.sx(-L / 2 + 0.2)} x2={s.sx(-L / 2 + 3.2)} y1={s.sy(mark - EMPTY)} y2={s.sy(mark - EMPTY)} stroke={C.ink} strokeWidth={3} />
            <text x={s.sx(-L / 2 + 3.4)} y={s.sy(mark - EMPTY) + 5} fontSize={13} fill={C.ink}>mark, {mark} m</text>
            {Array.from({ length: crates }, (_, i) => {
              const col = i % 4, row = Math.floor(i / 4);
              const cx = -3.6 + col * 2.4, y0 = H - EMPTY + row * 0.42;
              return <rect key={i} x={s.sx(cx - 1.1)} y={s.sy(y0 + 0.4)} width={s.len(2.2)} height={s.len(0.4)} rx={2} fill={C.surface} stroke={C.soft} strokeWidth={1.5} />;
            })}
            {[-4, -2, 0, 2, 4].map((x) => (
              <PushArrow key={x} s={s} at={[x, -EMPTY - 0.03]} dir={[0, 1]} len={hydrostaticPressure(d) * PER_PA} width={2.5} />
            ))}
          </g>
          {!shown.released && [[H - EMPTY, 0.9], [0.3, 0.3]].map(([a, b]) => (
            <line key={a} x1={s.sx(L / 2)} y1={s.sy(a)} x2={s.sx(5.5)} y2={s.sy(b)} stroke={C.soft} strokeWidth={2} />
          ))}
          <line x1={s.sx(-9)} x2={s.sx(5.5)} y1={s.sy(0)} y2={s.sy(0)} stroke={WATER_LINE} strokeWidth={2} />
          <text x={s.sx(-6)} y={s.sy(-1.9)} fontSize={12} fill={C.faint}>deck 10 m × 4 m · hull {t(BARGE.mass)} · each crate 2 t</text>
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Fresh water · marks on the hull: metres above the keel · amber: the water pushing up on the floor of the hull
      </p>
    </SceneCard>
  );
}
