import { useMemo, useState } from 'react';
import { Panel, Readout, ReadoutRow, Slider, type ParamSpec } from './controls.tsx';

/** Bit-level view of a float64, plus the gap to its neighbour. */
function dissect(x: number) {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const hi = buf.getUint32(0);
  const lo = buf.getUint32(4);

  const sign = hi >>> 31;
  const exponent = (hi >>> 20) & 0x7ff;
  const mantissaHi = hi & 0xfffff;

  const bits =
    String(sign) +
    exponent.toString(2).padStart(11, '0') +
    mantissaHi.toString(2).padStart(20, '0') +
    lo.toString(2).padStart(32, '0');

  // Gap to the next representable double above x.
  const next = nextAfter(x);
  return { sign, exponent, bits, ulp: next - x, next };
}

/** The next double after x, found by incrementing the raw bit pattern. */
function nextAfter(x: number): number {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  let hi = buf.getUint32(0);
  let lo = buf.getUint32(4);
  if (lo === 0xffffffff) { hi += 1; lo = 0; } else { lo += 1; }
  buf.setUint32(0, hi);
  buf.setUint32(4, lo);
  return buf.getFloat64(0);
}

const spec: ParamSpec = {
  key: 'exp', label: 'magnitude', symbol: '2^', min: -20, max: 40, step: 1, value: 0,
  hint: 'Floats are spaced logarithmically: the gap between neighbours doubles with every exponent.',
};

/**
 * Shows what a float64 actually is at a chosen magnitude — the bit layout, the
 * gap to the next representable number (one ULP), and how many integers have
 * already stopped being representable.
 *
 * The point that lands: spacing is not uniform. Near 1 the gap is 2.2e-16;
 * past 2^53 the gap exceeds 1 and consecutive integers cease to exist.
 */
export default function FloatLab() {
  const [exp, setExp] = useState(0);
  const x = useMemo(() => 2 ** exp, [exp]);
  const info = useMemo(() => dissect(x), [x]);

  const integersGone = info.ulp > 1;

  return (
    <div className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel title="what a float64 is">
        <div style={{ display: 'grid', gap: 14 }}>
          <Slider spec={spec} value={exp} onChange={(v) => setExp(Math.round(v))} />

          <div style={{ overflowX: 'auto' }}>
            <div className="readout" style={{ display: 'flex', gap: 2, fontSize: 11, minWidth: 'max-content' }}>
              {info.bits.split('').map((b, i) => {
                const zone = i === 0 ? 'sign' : i <= 11 ? 'exp' : 'mant';
                const tone =
                  zone === 'sign' ? 'var(--sig-warn)'
                  : zone === 'exp' ? 'var(--color-magenta)'
                  : 'var(--color-cyan)';
                return (
                  <span key={i} style={{
                    width: 9, textAlign: 'center',
                    color: b === '1' ? tone : 'var(--color-ink-ghost)',
                    background: b === '1' ? `color-mix(in oklab, ${tone} 16%, transparent)` : 'transparent',
                    borderBottom: `1px solid ${tone}`,
                  }}>{b}</span>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 2, marginTop: 5, minWidth: 'max-content' }}>
              <span className="hud-label" style={{ width: 9, color: 'var(--sig-warn)' }}>s</span>
              <span className="hud-label" style={{ width: 11 * 11, color: 'var(--color-magenta)', paddingLeft: 4 }}>exponent (11)</span>
              <span className="hud-label" style={{ color: 'var(--color-cyan)', paddingLeft: 4 }}>mantissa (52)</span>
            </div>
          </div>

          <ReadoutRow>
            <Readout label="value" value={x.toExponential(4)} accent="ink" />
            <Readout label="gap to next (1 ulp)" value={info.ulp.toExponential(3)} accent="cyan" />
            <Readout label="relative gap" value={(info.ulp / x).toExponential(2)} accent="iris" />
            <Readout
              label="consecutive integers?"
              value={integersGone ? 'lost' : 'intact'}
              accent={integersGone ? 'magenta' : 'ok'}
            />
          </ReadoutRow>

          <p style={{ margin: 0, fontSize: '0.87rem', lineHeight: 1.65, color: 'var(--color-ink-faint)' }}>
            {integersGone ? (
              <>
                At this magnitude the gap between neighbouring doubles is <strong style={{ color: 'var(--color-magenta)' }}>{info.ulp.toExponential(2)}</strong>,
                which is larger than 1 — whole integers here simply do not exist, and{' '}
                <code>x + 1 === x</code>.
              </>
            ) : (
              <>
                The <em>relative</em> gap stays near machine epsilon everywhere; it is the{' '}
                <em>absolute</em> gap that grows with magnitude. That is why error is naturally measured relatively.
              </>
            )}
          </p>
        </div>
      </Panel>
    </div>
  );
}
