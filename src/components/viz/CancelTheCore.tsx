import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { biotSavart, coilRings, siUnit, turnPositions } from '../../lib/physics/biot.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { CoilSection, FieldArrows, ScaleBar, coilArrows } from './magnet-kit-ch28.tsx';

/**
 * Two coaxial coils cut lengthwise. The inner one is fixed. The outer one is
 * wider, wound the other way, carries a different current, and you wind or
 * unwind its turns by holding a button. Make the field in the core vanish.
 *
 * The answer is n₂I₂ = n₁I₁: the outer coil's width does not enter, and
 * neither does its turn count alone. Between the coils the field survives,
 * because an Ampère rectangle there wraps only the outer winding. Every
 * arrow and meter is the numerical Biot–Savart sum over the actual rings,
 * pinned in biot.test.ts ("coils in coils").
 */
export interface CancelTheCoreProps {
  id?: string;
  prompt?: string;
  inner?: { turns: number; current: number; radius: number };
  outer?: { current: number; radius: number; start?: number };
  /** cm, both coils */
  length?: number;
  /** Largest core field that counts as zero, as a fraction of the inner coil's alone. */
  tolerance?: number;
  explanation?: string;
}

const XS = Array.from({ length: 17 }, (_, i) => -16 + i * 2);
const YS = [-5.2, -3.8, -1.75, 0, 1.75, 3.8, 5.2];
const MAX_TURNS = 60;

export default function CancelTheCore({
  id, prompt, inner = { turns: 30, current: 2, radius: 1 }, outer = { current: 3, radius: 2.5, start: 6 },
  length = 30, tolerance = 0.02, explanation,
}: CancelTheCoreProps) {
  const task = useTask(id, 'cancel-the-core');
  const [N2, setN2] = useState(outer.start ?? 6);
  const hold = useRef<number>(0);
  const nRef = useRef(N2);
  nRef.current = N2;

  const innerRings = useMemo(() => coilRings(inner.turns, length / 100, inner.radius / 100, inner.current, 0, 40), [inner.turns, inner.current, inner.radius, length]);
  const outerRings = useMemo(() => coilRings(N2, length / 100, outer.radius / 100, -outer.current, 0, 40), [N2, outer.current, outer.radius, length]);
  const all = useMemo(() => [...innerRings, ...outerRings], [innerRings, outerRings]);
  const alone = biotSavart(innerRings, [0, 0, 0])[0];
  const core = biotSavart(all, [0, 0, 0])[0];
  const gap = biotSavart(all, [0, ((inner.radius + outer.radius) / 2) / 100, 0])[0];
  const xs1 = turnPositions(inner.turns, length), xs2 = turnPositions(N2, length);
  const arrows = useMemo(() => coilArrows(all, XS, YS), [all]);
  const cancelled = Math.abs(core) <= tolerance * Math.abs(alone);
  const dir = (b: number) => (b > 0 ? 'right' : 'left');

  const stop = () => { window.clearInterval(hold.current); hold.current = 0; };
  const start = (d: number) => {
    stop();
    task.touch();
    const tick = () => setN2(Math.max(0, Math.min(MAX_TURNS, nRef.current + d)));
    tick();
    hold.current = window.setInterval(tick, 160);
  };
  useEffect(() => stop, []);
  const holdProps = (d: number) => ({
    onPointerDown: (e: PointerEvent) => { (e.target as Element).setPointerCapture(e.pointerId); start(d); },
    onPointerUp: stop, onPointerCancel: stop, onPointerLeave: stop,
    onKeyDown: (e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(d); } },
    onKeyUp: (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') stop(); },
  });

  const glyph2 = Math.max(2.5, Math.min(5, (length / Math.max(N2, 1)) * 7));

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 18px' }} {...holdProps(1)}>Hold to wind</button>
          <button type="button" className="anth-btn" style={{ padding: '10px 18px' }} {...holdProps(-1)}>Hold to unwind</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Outer turns" value={`${N2}`} color={C.position} />
            <Meter label="Field in the core" value={Math.abs(core) < 1e-9 ? '0 T' : siUnit(Math.abs(core), 'T', 2)} unit={Math.abs(core) < 1e-9 ? '' : dir(core)} color={C.field} />
            <Meter label="Between the coils" value={siUnit(Math.abs(gap), 'T', 2)} unit={dir(gap)} color={C.field} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(cancelled, { N2 })}
          miss={`The core still holds ${siUnit(Math.abs(core), 'T', 2)} pointing ${dir(core)}: the ${core > 0 ? 'inner' : 'outer'} coil wins.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-17, 17]} y={[-6, 6]} height={250} equal
        label={`Two coaxial coils, ${length} centimetres long. Inner: ${inner.turns} turns, ${inner.current} amperes, radius ${inner.radius} centimetres. Outer, wound the other way: ${N2} turns, ${outer.current} amperes, radius ${outer.radius} centimetres. Core field ${siUnit(core, 'tesla', 2)}.`}>
        {(s) => <>
          <line x1={s.sx(-17)} x2={s.sx(17)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.grid} strokeDasharray="3 6" />
          <FieldArrows s={s} arrows={arrows} full={Math.abs(alone)} maxLen={1.6} />
          <CoilSection s={s} xs={xs1} R={inner.radius} I={1} r={4.5} />
          <CoilSection s={s} xs={xs2} R={outer.radius} I={-1} r={glyph2} color={C.position} />
          <ScaleBar s={s} at={[-16.5, -5.6]} length={5} label="5 cm" />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Coils cut lengthwise · white: inner coil, {inner.turns} turns, {inner.current} A · iris: outer coil, wound the other way, {outer.current} A · dot: current out of the page, cross: into it · arrows: the field
      </p>
    </SceneCard>
  );
}
