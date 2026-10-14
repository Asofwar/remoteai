// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { readPortMappings, savePortMappings } from './settings';

beforeEach(() => localStorage.clear());
it('keeps configuration separate by account and device without restoring active connections', () => {
  savePortMappings('account/computer-one', [{ id: 'one', remotePort: 5432, localPort: 15432 }]);
  expect(readPortMappings('account/computer-two')).toEqual([]);
  expect(readPortMappings('another-account/computer-one')).toEqual([]);
  expect(readPortMappings('account/computer-one')).toEqual([
    { id: expect.any(String), remotePort: 5432, localPort: 15432 },
  ]);
});
it('discards malformed, out-of-range and duplicate stored ports', () => {
  localStorage.setItem('codex-port-forwarding:scope', JSON.stringify([
    null, { remotePort: '3000', localPort: 3000 }, { remotePort: 3000, localPort: 0 },
    { remotePort: 65536, localPort: 3000 }, { remotePort: 3000, localPort: 13000 },
    { remotePort: 4000, localPort: 13000 },
  ]));
  expect(readPortMappings('scope')).toEqual([{ id: expect.any(String), remotePort: 3000, localPort: 13000 }]);
});
