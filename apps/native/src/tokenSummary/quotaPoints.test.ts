import { expect, it } from 'vitest';
import { quotaPoints } from './quotaPoints';

it('keeps independent primary and secondary gaps at their own timestamps', () => {
  const points = quotaPoints({ primary: [[1000, 80], [1500, null], [2000, 90]],
    secondary: [[1000, 70], [2000, 65]], hasData: true, observedRange: null });
  expect(points.map(({ key, values }) => [key, values])).toEqual([
    ['1000', [80, 70]], ['1500', [null, null]], ['2000', [90, 65]],
  ]);
});

it('preserves secondary-only observations and genuine zero values', () => {
  expect(quotaPoints({ primary: [[3000, 0]], secondary: [[2000, 0], [3000, null]],
    hasData: true, observedRange: null }).map(({ values }) => values)).toEqual([[null, 0], [0, null]]);
});
