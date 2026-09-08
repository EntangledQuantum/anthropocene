import katex from 'katex';
import type { MdastPluginDefinition } from 'satteri';

/**
 * Renders `$…$` and `$$…$$` (parsed natively by Satteri's `math` feature) into
 * KaTeX markup at build time, so no math JS ships to the browser.
 *
 * `mdxExpressions: false` is required: KaTeX output is full of `{…}` that MDX
 * would otherwise try to evaluate as expressions.
 */
const macros: Record<string, string> = {
  '\\dd': '\\mathrm{d}',
  '\\R': '\\mathbb{R}',
  '\\C': '\\mathbb{C}',
  '\\Order': '\\mathcal{O}',
  '\\vb': '\\mathbf{#1}',
  '\\norm': '\\left\\lVert #1 \\right\\rVert',
  '\\abs': '\\left| #1 \\right|',
  '\\deriv': '\\frac{\\mathrm{d} #1}{\\mathrm{d} #2}',
  '\\pderiv': '\\frac{\\partial #1}{\\partial #2}',
};

function render(value: string, displayMode: boolean): string {
  return katex.renderToString(value, {
    displayMode,
    throwOnError: false,
    strict: false,
    output: 'html',
    macros,
  });
}

export const katexPlugin: MdastPluginDefinition = {
  name: 'anthropocene-katex',
  math(node) {
    return {
      raw: `<div class="math-display">${render(node.value, true)}</div>`,
      mdxExpressions: false,
    };
  },
  inlineMath(node) {
    return { raw: render(node.value, false), mdxExpressions: false };
  },
};
