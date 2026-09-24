import { lesson } from './lesson-store.ts';

/**
 * One screen at a time.
 *
 * A lesson written as a sequence of `<Step>`s shows the first step only. Each
 * step ends in a Continue button that unlocks once every graded widget inside
 * the step has been *attempted* — answered, right or wrong. Being wrong is
 * allowed; skipping the decision is not. That is the Brilliant rhythm: a
 * small world, one decision, the world answers, next.
 *
 * Graded widgets mark their root with `data-widget-id`, which is server
 * rendered, so the step knows what it contains before any island hydrates.
 * Islands in hidden steps stay dormant (`client:visible`) until revealed.
 *
 * Progress through the steps is remembered per page in localStorage. `?all`
 * in the URL, or the "Show every step" link, opens the whole lesson.
 */

const STORE_PREFIX = 'anth-steps:';

function readReached(key: string): number {
  try { return Number(localStorage.getItem(key) ?? 0) || 0; } catch { return 0; }
}
function writeReached(key: string, n: number) {
  try { localStorage.setItem(key, String(n)); } catch { /* storage may be blocked; the flow still works */ }
}

let started = false;

export function initStepFlow(): void {
  if (started) return;
  started = true;

  const steps = [...document.querySelectorAll<HTMLElement>('[data-step]')];
  if (steps.length === 0) return;

  const key = STORE_PREFIX + location.pathname;
  const last = steps.length - 1;
  let reached = Math.min(readReached(key), last);
  if (new URLSearchParams(location.search).has('all')) reached = last;

  const pendingIn = (step: HTMLElement) =>
    [...step.querySelectorAll<HTMLElement>('[data-widget-id]')]
      .map((el) => el.dataset.widgetId!)
      .filter((id) => !lesson.hasAttempted(id));

  const render = () => {
    steps.forEach((step, i) => {
      step.hidden = i > reached;
      const foot = step.querySelector<HTMLElement>('[data-step-foot]');
      if (!foot) return;
      const frontier = i === reached && i < last;
      foot.hidden = !frontier;
      if (!frontier) return;
      const pending = pendingIn(step);
      const btn = foot.querySelector<HTMLButtonElement>('[data-step-continue]')!;
      const need = foot.querySelector<HTMLElement>('[data-step-need]')!;
      const count = foot.querySelector<HTMLElement>('[data-step-count]')!;
      btn.disabled = pending.length > 0;
      need.hidden = pending.length === 0;
      count.textContent = `${i + 1} of ${steps.length}`;
    });
  };

  steps.forEach((step, i) => {
    step.querySelector<HTMLButtonElement>('[data-step-continue]')?.addEventListener('click', () => {
      if (i !== reached || pendingIn(step).length > 0) return;
      reached = i + 1;
      writeReached(key, reached);
      render();
      const nextStep = steps[reached];
      nextStep.classList.add('step-enter');
      // Leave the header's height of air above the new step.
      const top = nextStep.getBoundingClientRect().top + window.scrollY - 84;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  // A quiet escape hatch for review: open everything.
  const meta = document.querySelector<HTMLElement>('article header .meta');
  if (meta && reached < last) {
    const all = document.createElement('a');
    all.href = '?all';
    all.textContent = 'Show every step';
    all.className = 'step-all';
    all.addEventListener('click', (e) => {
      e.preventDefault();
      reached = last;
      writeReached(key, reached);
      render();
      all.remove();
    });
    meta.appendChild(all);
  }

  lesson.subscribe(render);
  render();
}
