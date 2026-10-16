import { expect, it } from 'vitest';
import { PreviewStorage } from '../../../../../web/src/chat/portMapping/previewStorage';
import { previewDiagnostic } from '../../../../../web/src/chat/portMapping/previewErrors';

it('bounds preview storage and keeps areas and separate previews isolated', () => {
  const storage = new PreviewStorage();
  storage.apply({ area: 'localStorage', operation: 'set', key: '__proto__', value: 'private' });
  storage.apply({ area: 'hostStorage', operation: 'set', key: 'secret', value: 'ignored' });
  storage.apply({ area: 'localStorage', operation: 'set', key: 'huge', value: 'x'.repeat(3 * 1024 * 1024) });
  expect(storage.snapshot().localStorage).toEqual([['__proto__', 'private']]);
  expect(storage.snapshot().sessionStorage).toEqual([]);
  expect(new PreviewStorage().snapshot().localStorage).toEqual([]);
  storage.apply({ area: 'localStorage', operation: 'remove', key: '__proto__' });
  storage.apply({ area: 'sessionStorage', operation: 'set', key: 'session', value: 'temporary' });
  storage.apply({ area: 'sessionStorage', operation: 'clear' });
  expect(storage.snapshot().localStorage).toEqual([]);
  expect(storage.snapshot().sessionStorage).toEqual([]);
});

it('logs only fixed diagnostic categories supplied by the remote preview', () => {
  expect(previewDiagnostic('cookie-access')).toBe('cookie-access');
  expect(previewDiagnostic('private-token-or-url')).toBe('script-exception');
  expect(previewDiagnostic({ message: 'sensitive' })).toBe('script-exception');
});
