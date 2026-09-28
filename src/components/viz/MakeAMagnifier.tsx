import { useState } from 'react';
import { fanCrossing, fanFrom, heightAt, isVirtual, magnification } from '../../lib/physics/optics.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { ArrowMark, AxisScale, Beam, Lens } from './optics-kit-ch34.tsx';

/**
 * A stamp (an arrow), a converging lens and your eye on the far side. Slide
 * the stamp along the axis. A fan from its tip is traced through the lens
 * (`fanFrom`) and `fanCrossing` finds where the outgoing rays meet. Outside
 * the focal length they really cross, beyond the lens: a real image, upside
 * down, that a screen could catch. Inside it they leave spreading, so no
 * screen anywhere gathers them; only their backward extensions (dashed) meet,
 * on the stamp's own side, and that upright dashed arrow is what your eye sees.
 *
 * Graded: make the image upright and `target` times as tall.
 */
export interface MakeAMagnifierProps {
  id?: string;
  prompt?: string;
  f?: number;
  R?: number;
  h?: number;
  /** Starting stamp distance, cm. */
  start?: number;
  /** Magnification to reach (positive: upright). */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const XL = -36, XR = 30, YR = 5.5, N = 9;

export default function MakeAMagnifier({
  id, prompt, f = 10, R = 3.5, h = 1, start = 16, target = 2, tolerance = 0.15, explanation,
}: MakeAMagnifierProps) {
  const task = useTask(id, 'make-a-magnifier');
  const [d, setD] = useState(start);
  const fan = fanFrom(d, h, f, R, N);
  const c = fanCrossing(fan);
  const far = !Number.isFinite(c.x) || Math.abs(c.x) > 400;
  const virtual = isVirtual(d, f);
  const m = far ? Infinity : magnification(d, c.x);
  const ok = !far && Math.abs(m - target) <= tolerance;

  const miss = far
    ? 'The rays leave the lens parallel: there is no image at any distance, on either side.'
    : m < 0
      ? `The image is ${Math.abs(m).toFixed(1)}× and upside down, ${c.x.toFixed(0)} cm beyond the lens, where a screen would catch it. That is a projector.`
      : `Upright, but ${m.toFixed(1)}× as tall. Its image stands ${Math.abs(c.x).toFixed(0)} cm from the lens, on the stamp's side.`;
  const size = far ? '—' : `${Math.abs(m).toFixed(1)}×`;
  const way = far ? 'no image' : m < 0 ? 'upside down' : 'upright';
  const where = far ? 'at infinity' : virtual ? `${Math.abs(c.x).toFixed(0)} cm, stamp side` : `${c.x.toFixed(0)} cm, far side`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Meter label="Stamp to lens" value={d.toFixed(1)} unit="cm" color={C.position} />
          <Meter label="Image size" value={size} unit={way} color={C.position} />
          <Meter label="Image at" value={where} unit={far ? '' : virtual ? 'virtual' : 'real'} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { d, m })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[XL, XR]} y={[-YR, YR]} height={300}
        label={`A stamp ${d.toFixed(1)} centimetres from a lens of focal length ${f} centimetres. Its image is ${size} ${way}, ${where}.`}>
        {(s) => {
          // Outgoing rays run to the right edge; back-extensions (virtual) run left to the crossing.
          const clipEnd = (y: number, k: number): Vec => {
            const xEnd = XR;
            const yEnd = y + k * xEnd;
            if (Math.abs(yEnd) <= YR) return [xEnd, yEnd];
            const xs = (Math.sign(yEnd) * YR - y) / k;
            return [xs, Math.sign(yEnd) * YR];
          };
          const imgOn = !far && c.x > XL && c.x < XR && Math.abs(c.y) < YR;
          return <>
            <AxisScale s={s} from={XL} to={XR} step={5} every={10} unit="cm" />
            {fan.map((r, i) => <g key={i}>
              <Beam s={s} from={[-d, h]} to={[0, r.y]} opacity={0.6} width={1} />
              <Beam s={s} from={[0, r.y]} to={clipEnd(r.y, r.k)} opacity={0.6} width={1} />
              {virtual && !far && <Beam s={s} from={[0, r.y]} to={[Math.max(XL, c.x), heightAt(r, Math.max(XL, c.x))]} dash opacity={0.5} />}
            </g>)}
            <Lens s={s} R={R} f={f} />
            <ArrowMark s={s} x={-d} h={h} label="stamp" />
            {imgOn && <ArrowMark s={s} x={c.x} h={c.y} virtual={virtual} label={virtual ? 'image (virtual)' : 'image (real)'} />}
            {virtual && !imgOn && !far && <text x={s.sx(XL) + 6} y={s.sy(YR) + 16} fontSize={12} fill={C.position}>image off the page to the left</text>}
            {!virtual && !imgOn && !far && <text x={s.sx(XR) - 6} y={s.sy(YR) + 16} textAnchor="end" fontSize={12} fill={C.position}>image off the page to the right</text>}
            <g transform={`translate(${s.sx(XR - 3)},${s.sy(0.9)})`} pointerEvents="none">
              <path d="M15,0 Q0,-12 -15,0 Q0,12 15,0 Z" fill={C.surface} stroke={C.ink} strokeWidth={1.8} />
              <circle cx={-6} cy={0} r={4.5} fill={C.ink} />
              <text x={0} y={-17} textAnchor="middle" fontSize={12} fill={C.soft}>your eye</text>
            </g>
            <Handle s={s} at={[-d, h / 2]} r={7} step={0.1} color={C.position} label="Stamp: drag along the axis"
              clamp={(p) => [Math.max(-30, Math.min(-2, p[0])), h / 2]}
              onChange={(p) => { setD(Math.round(-p[0] * 10) / 10); task.touch(); }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        White: light from the tip of the stamp · dashed: rays traced backward, which no light travels · F: the focal points
      </p>
    </SceneCard>
  );
}
