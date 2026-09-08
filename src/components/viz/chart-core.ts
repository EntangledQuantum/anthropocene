import { scaleLinear, scaleLog, type ScaleContinuousNumeric } from 'd3-scale';

/** Accent names map to the CSS custom properties in global.css, so charts and
 *  chrome can never drift apart. */
export const ACCENTS = {
  magenta: '#ff2f88',
  cyan: '#4fe8ff',
  acid: '#b8ff3d',
  violet: '#9d6bff',
  amber: '#ffb545',
  ink: '#f2eef7',
  faint: '#6f6683',
} as const;
export type AccentName = keyof typeof ACCENTS;

/** Accents usable for a data series or an interactive control. Excludes the
 *  ink tones, which are for text and reference rules rather than series. */
export type SeriesAccent = 'cyan' | 'magenta' | 'acid' | 'violet' | 'amber';

/** Series colour cycle. Ordered so adjacent series stay distinguishable for
 *  the most common forms of colour-vision deficiency. */
export const SERIES_COLORS: SeriesAccent[] = ['cyan', 'magenta', 'acid', 'violet', 'amber'];

export type Point = readonly [number, number];

export interface AxisSpec {
  label?: string;
  /** Omit to auto-fit from the data. */
  domain?: [number, number];
  scale?: 'linear' | 'log';
  /** Pad the auto-fitted domain by this fraction of its span. */
  pad?: number;
  ticks?: number;
  format?: (v: number) => string;
}

export interface Series {
  key: string;
  label?: string;
  points: Point[];
  color?: AccentName | string;
  style?: 'line' | 'dots' | 'line+dots' | 'area';
  /** Line width in CSS pixels. */
  width?: number;
  dash?: number[];
  /** Dim a series without removing it — used for "your previous attempt". */
  muted?: boolean;
}

export interface Margin { top: number; right: number; bottom: number; left: number }
export const DEFAULT_MARGIN: Margin = { top: 14, right: 18, bottom: 38, left: 56 };

export const colorOf = (c: Series['color'], i: number): string =>
  !c ? ACCENTS[SERIES_COLORS[i % SERIES_COLORS.length]]
    : c in ACCENTS ? ACCENTS[c as AccentName]
    : (c as string);

/** Finite points only. Diverged runs produce NaN/Infinity and must not poison
 *  a domain calculation. */
const finite = (pts: Point[]): Point[] =>
  pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

export function extentOf(series: Series[], axis: 0 | 1, logScale: boolean): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (const p of finite(s.points)) {
      const v = p[axis];
      if (logScale && v <= 0) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return logScale ? [1e-16, 1] : [0, 1];
  if (lo === hi) return logScale ? [lo / 10, hi * 10] : [lo - 0.5, hi + 0.5];
  return [lo, hi];
}

export function makeScale(
  spec: AxisSpec | undefined,
  series: Series[],
  axis: 0 | 1,
  range: [number, number],
): ScaleContinuousNumeric<number, number> {
  const isLog = spec?.scale === 'log';
  let [lo, hi] = spec?.domain ?? extentOf(series, axis, isLog);

  if (!spec?.domain) {
    const pad = spec?.pad ?? 0.05;
    if (isLog) {
      const f = Math.pow(hi / lo, pad);
      lo /= f; hi *= f;
    } else {
      const d = (hi - lo) * pad;
      lo -= d; hi += d;
    }
  }
  const scale = isLog ? scaleLog() : scaleLinear();
  return scale.domain([lo, hi]).range(range) as ScaleContinuousNumeric<number, number>;
}

/** Compact numeric formatting for axis ticks and HUD readouts. */
export function formatTick(v: number, logScale = false): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (logScale || abs >= 1e5 || abs < 1e-3) {
    const exp = Math.floor(Math.log10(abs));
    const mant = v / 10 ** exp;
    return Math.abs(mant - Math.round(mant)) < 1e-9
      ? `${Math.round(mant) === 1 ? '' : `${Math.round(mant)}·`}10${superscript(exp)}`
      : `${mant.toFixed(1)}·10${superscript(exp)}`;
  }
  if (Number.isInteger(v)) return String(v);
  return abs < 1 ? v.toFixed(3).replace(/0+$/, '') : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function superscript(n: number): string {
  const s = Math.abs(n).toString().split('').map((d) => SUPS[+d]).join('');
  return n < 0 ? `⁻${s}` : s;
}

/** Value formatting for readouts, where alignment matters more than brevity. */
export const formatValue = (v: number, digits = 4): string =>
  !Number.isFinite(v) ? '—'
  : v === 0 ? '0'
  : Math.abs(v) >= 1e5 || Math.abs(v) < 1e-4 ? v.toExponential(digits - 1)
  : v.toFixed(digits);


/**
 * Ticks for a log axis that will not collide.
 *
 * `d3.scaleLog().ticks(n)` returns every power of ten PLUS intermediate
 * mantissas, and it ignores the count hint once the domain spans several
 * decades — which produces an unreadable smear of overlapping labels on a
 * narrow axis. So: take decade boundaries only, then thin by a stride chosen
 * from how much room each label actually has.
 */
export function logTicks(lo: number, hi: number, pixels: number, labelPx = 52): number[] {
  if (!(lo > 0) || !(hi > 0)) return [];
  const first = Math.ceil(Math.log10(Math.min(lo, hi)));
  const last = Math.floor(Math.log10(Math.max(lo, hi)));
  if (last < first) return [];

  const decades: number[] = [];
  for (let e = first; e <= last; e++) decades.push(10 ** e);

  const maxLabels = Math.max(2, Math.floor(pixels / labelPx));
  const stride = Math.max(1, Math.ceil(decades.length / maxLabels));

  // Keep the last decade rather than whatever the stride lands on, so the
  // axis always shows its own upper bound.
  const kept = decades.filter((_, i) => i % stride === 0);
  const end = decades[decades.length - 1];
  if (kept[kept.length - 1] !== end && decades.length > 1) kept.push(end);
  return kept;
}
