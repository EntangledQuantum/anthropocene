import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatValue } from './chart-core.ts';

/* ── parameter model ───────────────────────────────────────────────────────
   Every simulation in the platform is driven by a declared parameter set, so
   controls, readouts and URL-shareable state all come from one description.
   ──────────────────────────────────────────────────────────────────────── */

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Slider travels geometrically — right for step sizes spanning decades. */
  log?: boolean;
  unit?: string;
  /** LaTeX-free short symbol shown in the readout, e.g. "h". */
  symbol?: string;
  hint?: string;
}

export type ParamValues = Record<string, number>;

export const initialValues = (specs: ParamSpec[]): ParamValues =>
  Object.fromEntries(specs.map((s) => [s.key, s.value]));

export function useParams(specs: ParamSpec[]) {
  const [values, setValues] = useState<ParamValues>(() => initialValues(specs));
  const set = useCallback((key: string, v: number) => setValues((p) => ({ ...p, [key]: v })), []);
  const reset = useCallback(() => setValues(initialValues(specs)), [specs]);
  return { values, set, reset };
}

/* ── slider ────────────────────────────────────────────────────────────── */

export function Slider({
  spec, value, onChange,
}: { spec: ParamSpec; value: number; onChange: (v: number) => void }) {
  // A log slider maps its 0..1000 track exponentially, so a step size can span
  // 1e-4 to 1 without the useful range collapsing into the last few pixels.
  const toTrack = (v: number) =>
    spec.log
      ? (1000 * (Math.log(v) - Math.log(spec.min))) / (Math.log(spec.max) - Math.log(spec.min))
      : v;
  const fromTrack = (t: number) =>
    spec.log
      ? Math.exp(Math.log(spec.min) + (t / 1000) * (Math.log(spec.max) - Math.log(spec.min)))
      : t;

  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="hud-label" title={spec.hint}>{spec.label}</span>
        <span className="readout" style={{ fontSize: 11, color: 'var(--color-cyan)' }}>
          {spec.symbol && <span style={{ color: 'var(--color-ink-faint)' }}>{spec.symbol} = </span>}
          {formatValue(value, 4)}
          {spec.unit && <span style={{ color: 'var(--color-ink-faint)' }}> {spec.unit}</span>}
        </span>
      </span>
      <input
        type="range"
        min={spec.log ? 0 : spec.min}
        max={spec.log ? 1000 : spec.max}
        step={spec.log ? 1 : spec.step}
        value={toTrack(value)}
        onChange={(e) => onChange(fromTrack(+e.target.value))}
        className="anth-slider"
        aria-label={spec.label}
      />
    </label>
  );
}

/* ── buttons & toggles ─────────────────────────────────────────────────── */

export function Button({
  children, onClick, active, accent = 'cyan', disabled, title,
}: {
  children: ReactNode; onClick?: () => void; active?: boolean;
  accent?: 'cyan' | 'magenta' | 'acid' | 'violet' | 'amber'; disabled?: boolean; title?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      className="hud-label anth-btn"
      data-active={active ? 'true' : undefined}
      style={{ '--btn-accent': `var(--color-${accent})` } as React.CSSProperties}
    >
      {children}
    </button>
  );
}

export function Toggle({
  options, value, onChange, multiple = false,
}: {
  options: { key: string; label: string; accent?: 'cyan' | 'magenta' | 'acid' | 'violet' | 'amber' }[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = value.includes(o.key);
        return (
          <Button
            key={o.key}
            accent={o.accent ?? 'cyan'}
            active={on}
            onClick={() =>
              onChange(
                multiple
                  ? on ? value.filter((v) => v !== o.key) : [...value, o.key]
                  : [o.key],
              )
            }
          >
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}

/* ── layout ────────────────────────────────────────────────────────────── */

/** The dense instrument panel that frames every simulation. */
export function Panel({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="hud" style={{ padding: '10px 12px 12px' }}>
      {(title || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--color-rule)' }}>
          {title && <span className="hud-label" style={{ color: 'var(--color-magenta)' }}>{title}</span>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Readout({ label, value, accent = 'ink', mono = true }: {
  label: string; value: ReactNode; accent?: 'ink' | 'cyan' | 'magenta' | 'acid' | 'amber' | 'violet'; mono?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span className="hud-label" style={{ fontSize: 9 }}>{label}</span>
      <span className={mono ? 'readout' : ''} style={{ fontSize: 13, color: `var(--color-${accent})`, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </span>
    </div>
  );
}

export function ReadoutRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(88px,1fr))', gap: 12, padding: '8px 0 0', borderTop: '1px solid var(--color-rule)', marginTop: 10 }}>
      {children}
    </div>
  );
}

/* ── animation ─────────────────────────────────────────────────────────── */

/** requestAnimationFrame loop that respects reduced-motion and pauses when the
 *  tab is hidden. `onFrame` receives seconds since the previous frame, clamped
 *  so a backgrounded tab cannot resume with a huge jump. */
export function useAnimationFrame(active: boolean, onFrame: (dt: number) => void) {
  const cb = useRef(onFrame);
  cb.current = onFrame;

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      cb.current(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

/** True when the user has asked for reduced motion. Components use this to
 *  render a final, static frame instead of animating toward it. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}
