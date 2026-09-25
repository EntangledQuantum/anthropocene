/**
 * Chapter 12's two shared drawing bits: how water looks, and a pressure
 * arrow that pushes *into* a surface. Kept here so the chapter's scenes speak
 * one dialect; the physics lives in src/lib/physics/fluids.ts.
 */
import type { Vec2 } from '../../lib/physics/fluids.ts';
import { Arrow, C, type StageApi } from './scene.tsx';

export const WATER_FILL = 'color-mix(in srgb, var(--color-iris) 22%, var(--color-surface))';
export const WATER_LINE = 'color-mix(in srgb, var(--color-iris) 70%, var(--color-ink))';

export function polyPath(s: StageApi, poly: readonly Vec2[]): string {
  return poly.map((p, i) => `${i ? 'L' : 'M'}${s.sx(p[0]).toFixed(1)},${s.sy(p[1]).toFixed(1)}`).join('') + 'Z';
}

/** An amber arrow of length `len` (world units) ending at `at`, pushing along `dir`. */
export function PushArrow({ s, at, dir, len, width = 2 }: { s: StageApi; at: Vec2; dir: Vec2; len: number; width?: number }) {
  if (len < 0.004) return null;
  return <Arrow s={s} from={[at[0] - dir[0] * len, at[1] - dir[1] * len]} to={at} color={C.force} width={width} />;
}

export const kPa = (p: number) => `${(p / 1000).toFixed(2)} kPa`;
