import { useId, useState } from 'react';
import { CMB, CMB_STRETCH, peakWavelength, stretchedTemperature, stretchedWavelength } from '../../lib/physics/cosmos.ts';
import { HC_EV_NM } from '../../lib/physics/photons.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { spectrumColour } from './photon-colour.ts';

/**
 * Light from 3000 K gas, crossing a sheet that stretches. One control: how
 * many times the sheet has stretched since the light left. The wave is pinned
 * to the sheet's grid, one grid cell per wavelength, so both stretch together;
 * the view zooms out by ten whenever the wave outgrows it, and the scale bar
 * says so. Under the sheet, the glow as an eye would see it, and a spectrum
 * ruler whose marker sits at the glow's peak wavelength.
 *
 * Graded with `id`: stretch until the light is today's 2.7 K microwave sky.
 * Physics: `stretchedWavelength`, `stretchedTemperature`, `peakWavelength`.
 */
export interface StretchTheLightProps {
  id?: string;
  prompt?: string;
  /** Fractional error in the stretch that still counts. */
  tolerance?: number;
  explanation?: string;
}

const LOG_MAX = 3.4, X0 = 20, X1 = 620, WY = 70, AMP = 30;
// spectrum ruler: log wavelength from 100 nm to 10 mm
const RL = 40, RR = 600, RY = 244, LMIN = -7, LMAX = -2;
const rx = (m: number) => RL + ((Math.log10(m) - LMIN) / (LMAX - LMIN)) * (RR - RL);

/** Display colour of a glowing body at temperature T: dim red near 800 K, orange at 3000 K, black when too cold to see. */
function glowColour(T: number): string {
  if (T < 700) return 'rgb(18, 14, 20)';
  const t = T / 100;
  const r = 255;
  const g = Math.max(0, Math.min(255, 99.47 * Math.log(t) - 161.12));
  const b = t <= 19 ? 0 : Math.max(0, Math.min(255, 138.52 * Math.log(t - 10) - 305.04));
  const k = Math.min(1, (T - 700) / 1600);
  const c = (v: number) => Math.round(18 + (v - 18) * k);
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

const fmtLen = (m: number) => (m < 1e-6 ? `${(m * 1e9).toFixed(0)} nm` : m < 1e-3 ? `${(m * 1e6).toFixed(m < 1e-5 ? 2 : 1)} µm` : `${(m * 1e3).toFixed(2)} mm`);

export default function StretchTheLight({ id, prompt, tolerance = 0.05, explanation }: StretchTheLightProps) {
  const task = useTask(id, 'stretch-the-light');
  const [logS, setLogS] = useState(0);
  const uid = useId().replace(/:/g, '');
  const S = 10 ** logS;
  const T = stretchedTemperature(CMB.tEmit, S);
  const lam = stretchedWavelength(peakWavelength(CMB.tEmit), S); // metres; equals peakWavelength(T)
  const eV = HC_EV_NM / (lam * 1e9);

  // the sheet view: 10 µm wide, ×10 per decade of stretch
  const decade = Math.min(3, Math.floor(logS + 1e-9));
  const viewM = 10e-6 * 10 ** decade;
  const lamPx = (lam / viewM) * (X1 - X0);
  const n = Math.ceil((X1 - X0) / lamPx) + 1;
  let d = `M${X0},${WY}`;
  for (let x = 0; x <= X1 - X0; x += 2) d += `L${X0 + x},${(WY - AMP * Math.sin((2 * Math.PI * x) / lamPx)).toFixed(1)}`;
  const waveCol = lam < 750e-9 ? spectrumColour(lam * 1e9) : C.soft;

  const err = S / CMB_STRETCH - 1;
  const hitNow = Math.abs(err) <= tolerance;
  const skyPeak = peakWavelength(CMB.tNow);
  const bands: [number, number, string][] = [[1e-7, 3.8e-7, ''], [3.8e-7, 7.5e-7, 'visible'], [7.5e-7, 1e-3, 'infrared'], [1e-3, 1e-2, 'microwave']];

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <label>
          <span className="hud-label">Stretch since the light left: ×{S < 10 ? S.toFixed(2) : S.toFixed(0)}</span>
          <input type="range" className="anth-slider" min={0} max={LOG_MAX} step={0.001} value={logS}
            aria-label="How many times the universe has stretched since the light left (logarithmic)"
            onChange={(e) => { setLogS(+e.target.value); task.touch(); }} />
        </label>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Peak wavelength" value={fmtLen(lam)} />
          <Meter label="Glow temperature" value={T < 10 ? T.toFixed(2) : T.toFixed(0)} unit="K" color={C.energy} />
          <Meter label="Energy per photon" value={eV >= 0.1 ? eV.toFixed(2) : (eV * 1000).toFixed(2)} unit={eV >= 0.1 ? 'eV' : 'meV'} color={C.energy} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { S })}
          miss={`This light now glows at ${T < 10 ? T.toFixed(2) : T.toFixed(0)} K and peaks at ${fmtLen(lam)}. The sky glows at ${CMB.tNow} K, peaking at ${fmtLen(skyPeak)}.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 300" role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
        aria-label={`Stretched ${S.toFixed(0)} times: the light peaks at ${fmtLen(lam)}, a ${T.toFixed(1)} kelvin glow.`}>
        <defs><clipPath id={`strip-${uid}`}><rect x={X0} y={WY - 50} width={X1 - X0} height={100} /></clipPath></defs>
        <rect x={X0} y={WY - 50} width={X1 - X0} height={100} rx={6} fill="none" stroke={C.rule} />
        <g clipPath={`url(#strip-${uid})`}>
          {Array.from({ length: n }, (_, i) => (
            <line key={i} x1={X0 + i * lamPx} x2={X0 + i * lamPx} y1={WY - 50} y2={WY + 50} stroke={C.grid} />
          ))}
          <path d={d} fill="none" stroke={waveCol} strokeWidth={2.5} />
        </g>
        <line x1={X0} x2={X0 + (X1 - X0) / 5} y1={WY + 66} y2={WY + 66} stroke={C.ink} strokeWidth={2} />
        <text x={X0} y={WY + 84} fontSize={13} fill={C.soft}>{['2 µm', '20 µm', '200 µm', '2 mm'][decade]}</text>
        <text x={X1} y={WY + 84} textAnchor="end" fontSize={13} fill={C.faint}>grid: the sheet, one cell per wavelength</text>
        {/* the glow, as the eye sees it */}
        <circle cx={64} cy={182} r={20} fill={glowColour(T)} stroke={C.rule} />
        <text x={96} y={178} fontSize={14} fill={C.soft}>the glow, as your eye would see it</text>
        <text x={96} y={196} fontSize={13} fill={C.faint}>{T >= 700 ? 'visible: hot gas' : 'nothing visible: too cold to glow'}</text>
        {/* the spectrum ruler */}
        {bands.map(([lo, hi, name]) => (
          <g key={lo}>
            {name === 'visible'
              ? Array.from({ length: 16 }, (_, k) => {
                const a = lo + ((hi - lo) * k) / 16, b = lo + ((hi - lo) * (k + 1)) / 16;
                return <rect key={k} x={rx(a)} y={RY - 6} width={rx(b) - rx(a) + 0.5} height={12} fill={spectrumColour(a * 1e9)} />;
              })
              : <rect x={rx(lo)} y={RY - 6} width={rx(hi) - rx(lo)} height={12} fill="none" stroke={C.rule} />}
            <text x={(rx(lo) + rx(hi)) / 2} y={RY + 38} textAnchor="middle" fontSize={12} fill={C.faint}>{name}</text>
          </g>
        ))}
        {([[1e-7, '100 nm'], [1e-6, '1 µm'], [1e-5, '10 µm'], [1e-4, '100 µm'], [1e-3, '1 mm'], [1e-2, '1 cm']] as const).map(([m, t]) => (
          <text key={m} x={rx(m)} y={RY - 12} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{t}</text>
        ))}
        {id && <g>
          <line x1={rx(skyPeak)} x2={rx(skyPeak)} y1={RY - 9} y2={RY + 9} stroke={C.ink} strokeDasharray="3 2" />
          <text x={rx(skyPeak)} y={RY - 28} textAnchor="middle" fontSize={12} fill={C.soft}>today's sky</text>
        </g>}
        <path d={`M${rx(lam)},${RY + 8}l-7,14h14z`} fill={C.energy} />
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        aqua marker: where the glow is brightest · the wave keeps its place on the grid as the sheet stretches
      </p>
    </SceneCard>
  );
}
