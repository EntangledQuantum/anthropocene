import { useId, useState } from 'react';
import {
  FILM, filmColour, filmReflections, relativeBrightness, whiteReflectance,
} from '../../lib/physics/interference.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';

/**
 * A soap film standing in a wire ring, lit by white light. It drains, so it is
 * thinnest at the top and thickens downward, quadratically, to 1400 nm more at
 * the bottom (so the thin bands near the top are wide enough to see).
 * Every band's colour is computed from the full reflectance of that thickness
 * across the visible spectrum (`filmColour`), so the colours are the physics.
 *
 * Beside it, the top of the film magnified: drag its front surface to thin it.
 * Under that, the two reflected waves of green light, one from each surface.
 * The front one is flipped by the denser soap; the back one is not. When the
 * film is far thinner than a wavelength they are mirror images, and the top
 * goes black.
 *
 * Graded (`id`): make the top reflect less than 3% of what the film's brightest
 * band reflects.
 */
export interface DrainTheFilmProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const RC = [175, 190] as const, R = 150;   // the ring
const BACK = 590, PX_NM = 0.2;              // cross-section: back surface x, px per nm
const T_MAX = 1000;
const GREEN = 550;

const rgb = (c: number[]) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;

export default function DrainTheFilm({ id, prompt, explanation }: DrainTheFilmProps) {
  const task = useTask(id, 'drain-the-film');
  const clip = useId().replace(/:/g, '');
  const [t, setT] = useState<number>(FILM.tStart);
  const rel = relativeBrightness(t, FILM.n);
  const pct = 100 * whiteReflectance(t, FILM.n);
  const dark = rel <= FILM.dark;

  const top = RC[1] + R, bottom = RC[1] - R;
  const N = 150;
  const bands = Array.from({ length: N }, (_, i) => {
    const y = top - ((i + 0.5) / N) * (top - bottom);
    const u = (top - y) / (top - bottom);
    const th = t + FILM.wedge * u * u;
    return { y, fill: rgb(filmColour(th, FILM.n)) };
  });
  const { front, back } = filmReflections(t, GREEN, FILM.n);
  const xf = BACK - t * PX_NM;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Film thickness at the top" value={t.toFixed(0)} unit="nm" />
          <Meter label="The top reflects" value={pct.toFixed(2)} unit="% of the light" color={C.energy} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(dark, { t })}
          miss={`The top is ${t.toFixed(0)} nm thick and still reflects ${pct.toFixed(2)}% of the light, ${(100 * rel).toFixed(0)}% as much as the brightest band.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[0, 640]} y={[0, 380]} height={380}
        label={`Soap film in a ring, ${t.toFixed(0)} nm thick at the top, reflecting ${pct.toFixed(2)} percent of white light there.`}>
        {(s) => {
          const X = s.sx, Y = s.sy;
          const bandH = Math.abs(Y(0) - Y((top - bottom) / N)) + 0.8;
          const yRow = [150, 100, 45];
          const wave = (row: number, amp: number, phase: number) => {
            const pts: string[] = [];
            for (let i = 0; i <= 120; i++) {
              const u = (i / 120) * 2;
              pts.push(`${X(420 + u * 98)},${Y(row + (amp / 0.14) * 16 * Math.cos(2 * Math.PI * u + phase))}`);
            }
            return pts.join(' ');
          };
          const sumRe = front.amp * Math.cos(front.phase) + back.amp * Math.cos(back.phase);
          const sumIm = front.amp * Math.sin(front.phase) + back.amp * Math.sin(back.phase);
          return <>
            <defs><clipPath id={clip}><circle cx={X(RC[0])} cy={Y(RC[1])} r={s.len(R)} /></clipPath></defs>
            <g clipPath={`url(#${clip})`}>
              <rect x={X(RC[0] - R)} y={Y(top)} width={s.len(2 * R)} height={Y(bottom) - Y(top)} fill="var(--color-void)" />
              {bands.map((b, i) => <rect key={i} x={X(RC[0] - R)} width={s.len(2 * R)} y={Y(b.y) - bandH / 2} height={bandH} fill={b.fill} />)}
            </g>
            <circle cx={X(RC[0])} cy={Y(RC[1])} r={s.len(R)} fill="none" stroke={C.soft} strokeWidth={4} />

            {/* cross-section at the top */}
            <line x1={X(RC[0] - 60)} y1={Y(top - 4)} x2={X(xf - 4)} y2={Y(370)} stroke={C.faint} strokeDasharray="3 4" />
            <text x={X(RC[0] - 60)} y={Y(top + 10)} fontSize={12} fill={C.soft}>the top, magnified</text>
            <rect x={X(xf)} y={Y(370)} width={Math.max(1.2, X(BACK) - X(xf))} height={Y(240) - Y(370)} fill={C.soft} opacity={0.28} />
            <line x1={X(BACK)} x2={X(BACK)} y1={Y(370)} y2={Y(240)} stroke={C.soft} strokeWidth={1.5} />
            <line x1={X(xf)} x2={X(xf)} y1={Y(370)} y2={Y(240)} stroke={C.ink} strokeWidth={1.5} />
            <line x1={X(400)} y1={Y(362)} x2={X(xf)} y2={Y(322)} stroke={C.ink} strokeWidth={2} />
            <line x1={X(xf)} y1={Y(322)} x2={X(400)} y2={Y(296)} stroke={C.field} strokeWidth={2} />
            <polyline fill="none" stroke={C.field} strokeWidth={2} strokeDasharray="5 3"
              points={`${X(xf)},${Y(322)} ${X(BACK)},${Y(314)} ${X(xf)},${Y(306)} ${X(400)},${Y(270)}`} />
            <text x={X(394)} y={Y(362) + 4} textAnchor="end" fontSize={12} fill={C.ink}>light in</text>
            <text x={X(394)} y={Y(296) + 4} textAnchor="end" fontSize={12} fill={C.field}>front, flipped</text>
            <text x={X(394)} y={Y(270) + 4} textAnchor="end" fontSize={12} fill={C.field}>back</text>
            <line x1={X(BACK - 20)} x2={X(BACK)} y1={Y(228)} y2={Y(228)} stroke={C.soft} strokeWidth={2} />
            <text x={X(BACK - 26)} y={Y(228) + 4} textAnchor="end" fontSize={11} fill={C.soft} fontFamily="var(--font-mono)">100 nm</text>
            <Handle s={s} at={[xf, 262]} color={C.ink} step={1} r={9} label="The front of the film: drag it to thin the film"
              clamp={(q) => [Math.max(BACK - T_MAX * PX_NM, Math.min(BACK - FILM.tMin * PX_NM, q[0])), 262]}
              onChange={(q) => { setT(Math.round((BACK - q[0]) / PX_NM)); task.touch(); }} />

            {/* the two reflected waves of green light */}
            <text x={X(338)} y={Y(196)} fontSize={12} fill={C.soft}>Reflected green light (550 nm), two wavelengths</text>
            {[
              ['from the front', front.amp, front.phase, 1.6],
              ['from the back', back.amp, back.phase, 1.6],
              ['together', Math.hypot(sumRe, sumIm), Math.atan2(sumIm, sumRe), 3],
            ].map(([label, a, ph, w], i) => <g key={i}>
              <line x1={X(420)} x2={X(616)} y1={Y(yRow[i])} y2={Y(yRow[i])} stroke={C.grid} />
              <text x={X(414)} y={Y(yRow[i]) + 4} textAnchor="end" fontSize={11} fill={C.faint}>{label as string}</text>
              <polyline fill="none" stroke={C.field} strokeWidth={w as number} points={wave(yRow[i], a as number, ph as number)} />
            </g>)}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '8px 0 0' }}>
        Film colours: white light reflected, computed for each thickness; exposure set so the brightest band is near white.
      </p>
    </SceneCard>
  );
}
