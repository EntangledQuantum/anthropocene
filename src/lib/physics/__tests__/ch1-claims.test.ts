import { describe, expect, it } from 'vitest';
import { SKETCH_SCENARIOS } from '../../../components/learn/sketch-scenarios.ts';
import { TUNE_SCENARIOS } from '../../../components/learn/tune-scenarios.ts';
import { ESTIMATE_SCENARIOS } from '../../../components/learn/estimate-scenarios.ts';

/* The claims Chapter 1's lessons make out loud, pinned against the scenario
   pack that grades them. Each of these is a sentence in a lesson: the component
   curve reaches the full length of the arrow; the dot product is a single
   component in the frame aligned with B; the Mars factor is 4.45. */

describe('chapter 1 lesson claims', () => {
  it('sketch: the component curve peaks at |A| = 5, above where it starts', () => {
    const s = SKETCH_SCENARIOS['up-ch1-component-vs-angle'];
    expect(s).toBeDefined();
    const pts = s.truth();
    expect(pts[0].y).toBeCloseTo(4, 9);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(5, 2);
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(-5, 2);
  });

  it('tune: the target frame is the one aligned with B', () => {
    const t = TUNE_SCENARIOS['up-ch1-align-with-b'];
    expect(t).toBeDefined();
    expect(t.target).toBeCloseTo(75.9637565, 6);
    const out = t.compute(t.target);
    const first = Number(out.readouts!.find((r) => r.label === 'first component of A')!.value);
    const alongLine = t.rules![0].y!;
    expect(first).toBeCloseTo(alongLine, 3);
    // and in that frame, component x |B| is the dot product
    // In that frame the dot product is one component times |B|. The readout is
    // rounded to three decimals, so the product recovers 16 to that precision.
    expect(first * Math.hypot(1, 4)).toBeCloseTo(16, 2);
  });

  it('estimate: the Mars factor is computed, not typed', () => {
    const e = ESTIMATE_SCENARIOS['up-ch1-lbf-vs-newton'];
    expect(e).toBeDefined();
    expect(e.truth()).toBeCloseTo(4.4482216152605, 10);
  });
});
