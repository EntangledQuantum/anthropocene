/**
 * Chapter 43's shared drawing: the valley every nucleus sits on, and a
 * nucleus drawn as what it is, a cluster of protons and neutrons.
 *
 * The valley is binding per nucleon drawn as DEPTH: the more tightly a
 * nucleus holds each nucleon, the lower it sits. Iron and nickel are the
 * floor, so anything that can rearrange rolls toward them from either side.
 * The ground is `valleyDepth` from src/lib/physics/nuclear.ts: measured
 * nuclides below A = 20, the liquid drop above.
 *
 * The A axis is square-root scaled so hydrogen, helium and uranium all fit
 * legibly on one line. Its ticks are labelled in plain A.
 */
import { useMemo } from 'react';
import { mulberry32, valleyDepth } from '../../lib/physics/nuclear.ts';
import { C } from './scene.tsx';

export const PROTON = 'var(--color-rose)';
export const NEUTRON = 'var(--color-ink-faint)';

const SYMBOLS = ('n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs').split(' ');

/** 'Fe-56' style label for a nucleus. */
export function nuclideLabel(Z: number, A: number): string {
  const z = Math.round(Z);
  return `${SYMBOLS[z] ?? `Z${z}`}-${Math.round(A)}`;
}

/* ── the valley frame ──────────────────────────────────────────────────── */

export interface ValleyFrame {
  /** A → view x */
  ax: (A: number) => number;
  /** binding per nucleon (MeV, positive = deeper) → view y */
  dy: (depth: number) => number;
  /** view x → A */
  xa: (x: number) => number;
  W: number; H: number; left: number; right: number; top: number; bottom: number;
}

export const A_MAX = 260;

export function valleyFrame(W: number, H: number, pad = { l: 56, r: 14, t: 24, b: 40 }): ValleyFrame {
  const left = pad.l, right = W - pad.r, top = pad.t, bottom = H - pad.b;
  const s0 = 1, s1 = Math.sqrt(A_MAX);
  const ax = (A: number) => left + ((Math.sqrt(Math.max(A, 1)) - s0) / (s1 - s0)) * (right - left);
  const xa = (x: number) => (s0 + ((x - left) / (right - left)) * (s1 - s0)) ** 2;
  const dy = (d: number) => top + (d / 9.6) * (bottom - top);
  return { ax, dy, xa, W, H, left, right, top, bottom };
}

/** The ground: the valley curve, its earth, the depth axis and the A axis. */
export function ValleyGround({ f, landmarks = true }: { f: ValleyFrame; landmarks?: boolean }) {
  const path = useMemo(() => {
    const pts: string[] = [];
    for (let A = 1; A <= A_MAX; A += A < 24 ? 0.25 : 1) pts.push(`${f.ax(A).toFixed(1)},${f.dy(valleyDepth(A)).toFixed(1)}`);
    return pts;
  }, [f]);
  const marks: [number, string][] = [[1, 'H'], [4, 'He-4'], [12, 'C-12'], [56, 'Fe-56'], [120, 'Sn-120'], [238, 'U-238']];
  return <g>
    {[0, 2, 4, 6, 8].map((d) => <g key={d}>
      <line x1={f.left} x2={f.right} y1={f.dy(d)} y2={f.dy(d)} stroke={C.grid} />
      <text x={f.left - 8} y={f.dy(d) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{d}</text>
    </g>)}
    {[1, 4, 12, 30, 56, 100, 150, 200, 250].map((A) => <text key={A} x={f.ax(A)} y={f.bottom + 18} textAnchor="middle"
      fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{A}</text>)}
    <text x={f.right} y={f.H - 4} textAnchor="end" fontSize={13} fill={C.soft}>nucleons in the nucleus, A</text>
    <text x={f.left - 46} y={f.top - 10} fontSize={13} fill={C.soft}>each nucleon held by (MeV) ↓ deeper</text>
    <polygon points={`${f.ax(1)},${f.bottom} ${path.join(' ')} ${f.ax(A_MAX)},${f.bottom}`} fill="var(--color-raised)" opacity={0.7} />
    <polyline points={path.join(' ')} fill="none" stroke={C.rule} strokeWidth={2.5} />
    {landmarks && marks.map(([A, l]) => <text key={l} x={f.ax(A)} y={f.dy(valleyDepth(A)) + 18} textAnchor="middle" fontSize={11} fill={C.ghost}>{l}</text>)}
  </g>;
}

/* ── a nucleus: Z protons and A − Z neutrons, packed ───────────────────── */

/** Cluster radius in px: real nuclei grow as A^{1/3}. */
export const nucleusRadius = (A: number, k = 4.2) => k * Math.cbrt(Math.max(A, 1));

/** Positions (unit disc) and which are protons, for A nucleons. Deterministic. */
export function packNucleons(A: number, Z: number, seed = 43): { x: number; y: number; proton: boolean }[] {
  const n = Math.max(1, Math.round(A));
  const z = Math.min(n, Math.max(0, Math.round(Z)));
  const rnd = mulberry32(seed + n * 131 + z);
  const order = Array.from({ length: n }, (_, i) => i).sort(() => rnd() - 0.5);
  const isP = new Array<boolean>(n).fill(false);
  for (let i = 0; i < z; i++) isP[order[i]] = true;
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const r = n === 1 ? 0 : Math.sqrt((i + 0.5) / n);
    return { x: r * Math.cos(i * golden), y: r * Math.sin(i * golden), proton: isP[i] };
  });
}

export function NucleusGlyph({ cx, cy, A, Z, r, ghost, seed, dot: dotIn }: {
  cx: number; cy: number; A: number; Z: number; r?: number; ghost?: boolean; seed?: number;
  /** Nucleon dot radius, px. Default: packed to fill the cluster. */
  dot?: number;
}) {
  const R = r ?? nucleusRadius(A);
  const pts = useMemo(() => packNucleons(A, Z, seed), [A, Z, seed]);
  const dot = dotIn ?? Math.max(1.1, (R / Math.sqrt(pts.length)) * 0.95);
  return <g opacity={ghost ? 0.55 : 1}>
    {pts.map((p, i) => <circle key={i} cx={cx + p.x * (R - dot * 0.6)} cy={cy + p.y * (R - dot * 0.6)} r={dot}
      fill={p.proton ? PROTON : NEUTRON} stroke="var(--color-surface)" strokeWidth={pts.length > 60 ? 0 : 0.8} />)}
  </g>;
}
