import { expect, it } from 'vitest';
import { ServiceOperations } from './operations';
import { parseGuiAccountsSnapshot } from '../../../shared/remote-chat/guiAccounts';

it('provides a valid unavailable account snapshot when the service takes over from the desktop', async () => {
  const operations = new ServiceOperations();
  const handshake = await operations.execute({ kind: 'request', id: 'connect', method: 'connect' }, 'phone');
  expect(handshake.data).toMatchObject({ desktopOnly: true });
  const response = await operations.execute({ kind: 'request', id: 'accounts', method: 'request',
    body: { operation: 'guiAccountsRead' } }, 'phone');
  expect(response.error).toBeUndefined();
  expect(response.data).toEqual({ selection: { kind: 'none' }, choices: [], running: false });
  expect(parseGuiAccountsSnapshot(response.data)).toEqual(response.data);
  const selection = await operations.execute({ kind: 'request', id: 'select', method: 'request',
    body: { operation: 'guiAccountSelect', selection: { kind: 'account', id: 'unavailable' } } }, 'phone');
  expect(selection.error).toBeDefined();
  operations.release();
});
