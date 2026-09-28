/**
 * Display colour for light of a given vacuum wavelength (nm), shared by the
 * chapter 38 scenes. A plain piecewise-linear approximation of the visible
 * spectrum (after Dan Bruton), dimmed toward the ends of vision. Below 380 nm
 * the light is invisible; it is drawn as a dim violet so the beam is still
 * there on the page, and the scene labels it ultraviolet.
 */
export function spectrumColour(nm: number): string {
  let r = 0, g = 0, b = 0;
  if (nm < 380) { r = 0.42; g = 0.3; b = 0.62; }
  else if (nm < 440) { r = (440 - nm) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
  else { r = 1; }
  // fade at the edges of vision, but never to black on a dark page
  const f = nm < 380 ? 1 : nm < 420 ? 0.55 + 0.45 * (nm - 380) / 40 : nm > 700 ? 0.55 : nm > 645 ? 0.55 + 0.45 * (700 - nm) / 55 : 1;
  const c = (v: number) => Math.round(255 * Math.min(1, 0.12 + 0.88 * v * f));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

/** A spectrum for a CSS gradient between two wavelengths. */
export function spectrumGradient(lo: number, hi: number): string {
  const stops: string[] = [];
  for (let k = 0; k <= 12; k++) {
    const nm = lo + ((hi - lo) * k) / 12;
    stops.push(`${spectrumColour(nm)} ${((k / 12) * 100).toFixed(1)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** 2.0 × 10¹⁰ style, for counts that span many decades. */
export function sci(v: number, digits = 1): string {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e < 4) return v.toFixed(Math.max(0, digits - e));
  const sup = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const exp = String(e).replace('-', '⁻').split('').map((ch) => (ch === '⁻' ? ch : sup[+ch])).join('');
  return `${(v / 10 ** e).toFixed(digits)} × 10${exp}`;
}
