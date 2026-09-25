import { it } from 'vitest';
import { settle, clusterAt, dropOutline, offsetOutline, chargesAsRods, rodField, NANO, chargesInside } from '../gauss.ts';
it('x', () => {
  for (const [N, apex] of [[40, 60], [48, 60], [48, 50]]) {
  const metal = dropOutline(-0.35, 0, 0.6, apex);
  let t = performance.now();
  const s = settle(clusterAt(-0.3, 0.05, N, 0.08), metal, 1500);
  const s2 = settle(clusterAt(-0.3, 0.05, N, 0.08), metal, 3000);
  const dt = performance.now() - t;
  const rods = chargesAsRods(s, 6 * NANO);
  const drift = Math.max(...s.map((p, i) => Math.hypot(p[0]-s2[i][0], p[1]-s2[i][1])));
  for (const d of [0.04, 0.06, 0.1]) {
    const skin = offsetOutline(metal, d);
    const f = skin.map(p => Math.hypot(...rodField(rods, p[0], p[1])));
    const step = Math.floor(skin.length / 12);
    const out = Array.from({length: 12}, (_, k) => `${(f[k*step]).toFixed(0)}`).join(' ');
    // ripple: max relative neighbour jump
    let rip = 0; for (let i = 1; i < f.length; i++) rip = Math.max(rip, Math.abs(f[i]-f[i-1]) / f[i]);
    const iMax = f.indexOf(Math.max(...f));
    console.log(N, apex, d, out, 'max', Math.max(...f).toFixed(0), 'at', skin[iMax].map(v=>v.toFixed(2)).join(','), 'min', Math.min(...f).toFixed(0), 'rip', rip.toFixed(3));
  }
  console.log('ms', dt.toFixed(0), 'drift', drift.toExponential(2), 'inside', chargesInside(s, metal), 'deep field', Math.hypot(...rodField(rods, -0.35, 0)).toFixed(3), Math.hypot(...rodField(rods, 0.3, 0)).toFixed(3));
  }
}, 60000);
