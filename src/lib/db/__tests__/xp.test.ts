import { describe, expect, it } from 'vitest';
import { XP, xpForAttempt, levelFor, streakFrom } from '../progress.ts';

/* Thesis §10 rule 1 / principle 12: if XP can be farmed by guessing fast, the
   economy is wrong. These lock the taper in place — it is the kind of thing a
   later "small tweak" quietly reverts. */

describe('XP cannot be farmed by exhausting the options', () => {
  it('pays full marks only for working it out first time', () => {
    expect(xpForAttempt(1)).toBe(XP.widgetFirstTry);
  });

  it('pays half on a second attempt — a corrected mistake is still learning', () => {
    expect(xpForAttempt(2)).toBe(XP.widgetSecondTry);
    expect(XP.widgetSecondTry).toBeLessThan(XP.widgetFirstTry);
  });

  it('pays nothing from the third attempt onward', () => {
    for (const n of [3, 4, 5, 12]) expect(xpForAttempt(n)).toBe(0);
  });

  it('brute-forcing a four-option question earns zero', () => {
    // Worst case for a guesser: wrong, wrong, wrong, then right on the fourth.
    expect(xpForAttempt(4)).toBe(0);
  });

  it('is monotonically non-increasing, so a later try never pays more', () => {
    for (let n = 1; n < 10; n++) {
      expect(xpForAttempt(n + 1)).toBeLessThanOrEqual(xpForAttempt(n));
    }
  });
});

describe('levels', () => {
  it('starts at level 1 with nothing earned', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, into: 0 });
  });

  it('never goes backwards as XP grows', () => {
    let last = 0;
    for (let xp = 0; xp < 5000; xp += 137) {
      const { level } = levelFor(xp);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });
});

describe('streaks', () => {
  it('counts consecutive days back from today', () => {
    expect(streakFrom(['2026-09-08', '2026-09-09', '2026-09-10'], '2026-09-10').current).toBe(3);
  });

  it('does not break just because today has not been earned yet', () => {
    // An unfinished day should not read as a lost streak at 9am.
    expect(streakFrom(['2026-09-08', '2026-09-09'], '2026-09-10').current).toBe(2);
  });

  it('breaks after a fully missed day', () => {
    expect(streakFrom(['2026-09-06', '2026-09-07'], '2026-09-10').current).toBe(0);
  });

  it('reports the longest run even when the current one is shorter', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-10'];
    const { current, longest } = streakFrom(days, '2026-09-10');
    expect(current).toBe(1);
    expect(longest).toBe(4);
  });

  it('is empty with no history', () => {
    expect(streakFrom([], '2026-09-10')).toEqual({ current: 0, longest: 0 });
  });
});
