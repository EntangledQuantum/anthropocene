import { it } from 'vitest';
import { settle, clusterAt, dropOutline, offsetOutline, chargesAsRods, rodField, NANO } from '/home/user/anthropocene/src/lib/physics/gauss.ts';
it('x', () => {
  for (const sh of [0.95, 0.7]) {
  const metal = dropOutline(0, 0, 1).map(p => [p[0], p[1] * sh / 0.95] as [number, number]);
  const s = settle(clusterAt(-0.2, 0.05, 40, 0.08), metal);
  const rods = chargesAsRods(s, 6 * NANO);
  for (const d of [0.04, 0.08, 0.12]) {
    const skin = offsetOutline(metal, d);
    const f = skin.map(p => Math.hypot(...rodField(rods, p[0], p[1])));
    const out = [0, 20, 40, 60, 80, 100, 120].map(i => `${i}:${f[i].toFixed(0)}`).join(' ');
    console.log(sh, d, out, 'max', Math.max(...f).toFixed(0), f.indexOf(Math.max(...f)));
  }
  console.log(s.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' '));
  }
});
