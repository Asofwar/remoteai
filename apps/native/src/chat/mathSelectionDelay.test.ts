import { expect, it } from 'vitest';
import { mathDocument, mathSelectionDelay } from './mathDocument';

it('lets Android recognize a hold before the WebView blocks native selection', () => {
  expect(mathSelectionDelay(400)).toBe(350);
  expect(mathSelectionDelay(1000)).toBe(950);
  expect(mathDocument('<span>formula</span>', { longPressTimeoutMs: 400 }))
    .toContain('const longPressMs=350;');
});

it.each([undefined, NaN, Infinity, -1, 0])('preserves the browser default for invalid timeout %s', timeout => {
  expect(mathSelectionDelay(timeout)).toBe(500);
});
