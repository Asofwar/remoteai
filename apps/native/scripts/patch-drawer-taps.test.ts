import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { patchDrawerSource } = require('./patch-drawer-taps.cjs') as {
  patchDrawerSource: (source: string, patch: string) => string;
};
const patch = readFileSync(new URL('../patches/react-native-gesture-handler+2.24.0.patch', import.meta.url), 'utf8');
const source = `    const overlayDismissGesture = useMemo(
      () =>
        Gesture.Tap()
          .maxDistance(25)
          .onEnd(() => {
            if (
              isDrawerOpen.value &&
              drawerLockMode !== DrawerLockMode.LOCKED_OPEN
            ) {
              closeDrawer();
            }
          }),
      [closeDrawer, isDrawerOpen, drawerLockMode]
    );
        .activeCursor(activeCursor)
        .mouseButton(mouseButton)
        .hitSlop(drawerOpened ? fillHitSlop : edgeHitSlop)
        .minDistance(drawerOpened ? 100 : 0)
        .activeOffsetX(gestureOrientation * minSwipeDistance)
`;

it('patches the overlay guard and stationary edge pan, then remains idempotent', () => {
  const expected = source.replace('Gesture.Tap()', 'Gesture.Tap()\n          .enabled(drawerOpened)')
    .replace('[closeDrawer, isDrawerOpen, drawerLockMode]', '[closeDrawer, isDrawerOpen, drawerLockMode, drawerOpened]')
    .replace('.minDistance(drawerOpened ? 100 : 0)', '.minDistance(100)');
  const result = patchDrawerSource(source, patch);
  expect(result).toBe(expected);
  expect(patchDrawerSource(result, patch)).toBe(result);
});

it('preserves Windows line endings', () => {
  const result = patchDrawerSource(source.replace(/\n/g, '\r\n'), patch);
  expect(result).toContain('.enabled(drawerOpened)\r\n');
  expect(result.replace(/\r\n/g, '')).not.toContain('\n');
});

it('rejects changed or ambiguous dependency source instead of silently applying a partial backport', () => {
  expect(() => patchDrawerSource(source.replace('.maxDistance(25)', '.maxDistance(30)'), patch)).toThrow();
  expect(() => patchDrawerSource(source + source, patch)).toThrow();
  expect(() => patchDrawerSource(source + patchDrawerSource(source, patch), patch)).toThrow();
});

it('rejects an incomplete patch file', () => {
  expect(() => patchDrawerSource(source, patch.split('@@ -509')[0])).toThrow();
});
