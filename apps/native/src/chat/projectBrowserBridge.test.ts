import { expect, it, vi } from 'vitest';
import { handleBrowserRequest } from '../../../../shared/project-browser/nativeBridge';
import type { ProjectBrowserClient } from '../../../../shared/project-browser/protocol';

function fixture(connected = true) {
  const client: ProjectBrowserClient = {
    mutate: vi.fn().mockResolvedValue({ path: '/project/renamed', directory: true }),
    list: vi.fn().mockResolvedValue({ entries: [] }),
    read: vi.fn().mockResolvedValue({ path: '/project/readme.txt', kind: 'text', text: 'hello', revision: '1' }),
    save: vi.fn().mockResolvedValue({ path: '/project/readme.txt', kind: 'text', text: 'updated', revision: '2' }),
  };
  return { client, connected, cwd: '/project' };
}

it('routes reads and writes to the host-selected project regardless of the embedded request cwd', async () => {
  const options = fixture();
  const read = { type: 'request', id: 1, action: 'read', body: { cwd: '/other', path: '/project/readme.txt' } };
  expect(await handleBrowserRequest(JSON.stringify(read), options)).toMatchObject({ id: 1, data: { text: 'hello' } });
  expect(options.client.read).toHaveBeenCalledWith({ cwd: '/project', path: '/project/readme.txt' });
  const save = { ...read, id: 2, action: 'save', body: { ...read.body, text: 'updated', revision: '1' } };
  expect(await handleBrowserRequest(JSON.stringify(save), options)).toMatchObject({ id: 2, data: { revision: '2' } });
  expect(options.client.save).toHaveBeenCalledWith({ cwd: '/project', path: '/project/readme.txt',
    text: 'updated', revision: '1' });
});

it('rejects disconnected, malformed and unsupported requests without touching files', async () => {
  const options = fixture(false);
  const read = { type: 'request', id: 1, action: 'read', body: { path: '/project/readme.txt' } };
  expect(await handleBrowserRequest(JSON.stringify(read), options)).toMatchObject({ error: expect.any(String) });
  expect(options.client.read).not.toHaveBeenCalled();
  expect(await handleBrowserRequest('invalid JSON', options)).toBeNull();
  expect(await handleBrowserRequest('{"type":"ready"}', options)).toBeNull();
  options.connected = true;
  expect(await handleBrowserRequest(JSON.stringify({ ...read, action: 'execute' }), options))
    .toMatchObject({ error: expect.any(String) });
  expect(options.client.save).not.toHaveBeenCalled();
});

it('returns save conflicts with the request ID so the editor can keep the draft', async () => {
  const options = fixture();
  vi.mocked(options.client.save).mockRejectedValue('文件已在其他地方修改。');
  const result = await handleBrowserRequest(JSON.stringify({ type: 'request', id: 7, action: 'save',
    body: { path: '/project/readme.txt', text: 'mine', revision: 'old' } }), options);
  expect(result).toEqual({ type: 'reply', id: 7, error: '文件已在其他地方修改。' });
});

it('pins mutation and download roots and rejects malformed actions and external host paths', async () => {
  const options = { ...fixture(), host: { copyPath: vi.fn(), download: vi.fn().mockResolvedValue('queued') } };
  const send = (action: string, body: object) =>
    handleBrowserRequest(JSON.stringify({ type: 'request', id: 3, action, body }), options);
  await send('mutate', { cwd: '/other', path: '/project/folder', action: 'rename', name: 'renamed' });
  expect(options.client.mutate).toHaveBeenCalledWith({
    cwd: '/project', path: '/project/folder', action: 'rename', name: 'renamed',
  });
  await send('download', { cwd: '/other', path: '/project/folder' });
  expect(options.host.download).toHaveBeenCalledWith({ cwd: '/project', path: '/project/folder' });
  await send('copyPath', { path: '/project/folder' });
  expect(options.host.copyPath).toHaveBeenCalledWith('/project/folder');
  for (const path of ['/elsewhere', '/project/../secret']) {
    expect(await send('download', { path })).toMatchObject({ error: expect.any(String) });
  }
  expect(await send('mutate', { path: '/project/folder', action: 'execute', command: 'no' }))
    .toMatchObject({ error: expect.any(String) });
  expect(options.client.mutate).toHaveBeenCalledOnce();
});

it('references files and folders through the native chat host without reading their contents', async () => {
  const reference = vi.fn().mockResolvedValue(undefined);
  const options = { ...fixture(), host: { copyPath: vi.fn(), reference } };
  for (const directory of [false, true]) {
    const entry = { path: '/project/含 空格', name: '含 空格', directory };
    expect(await handleBrowserRequest(JSON.stringify({ type: 'request', id: 4, action: 'reference',
      body: { ...entry, cwd: '/ignored' } }), options)).toEqual({ type: 'reply', id: 4 });
    expect(reference).toHaveBeenLastCalledWith(entry);
  }
  expect(options.client.read).not.toHaveBeenCalled();
  expect(options.client.mutate).not.toHaveBeenCalled();
});

it('rejects invalid references and reports composer rejection without acknowledging success', async () => {
  const reference = vi.fn().mockRejectedValue(new Error('附件已满'));
  const options = { ...fixture(), host: { copyPath: vi.fn(), reference } };
  const send = (body: object) => handleBrowserRequest(JSON.stringify({
    type: 'request', id: 5, action: 'reference', body,
  }), options);
  for (const body of [
    { path: '/elsewhere/a', name: 'a', directory: false },
    { path: '/project/../a', name: 'a', directory: false },
    { path: '/project/a', name: '', directory: false },
    { path: '/project/a', name: 'a', directory: 'false' },
  ]) expect(await send(body)).toMatchObject({ error: expect.any(String) });
  expect(reference).not.toHaveBeenCalled();
  expect(await send({ path: '/project/a', name: 'a', directory: false }))
    .toEqual({ type: 'reply', id: 5, error: '附件已满' });
  options.connected = false;
  await send({ path: '/project/a', name: 'a', directory: false });
  expect(reference).toHaveBeenCalledOnce();
});

it('quotes the selected draft with its exact range and rejects invalid or out-of-project selections', async () => {
  const quoteSelection = vi.fn().mockResolvedValue(undefined);
  const options = { ...fixture(), host: { copyPath: vi.fn(), quoteSelection } };
  const body = { path: '/project/a.ts', start: { line: 2, column: 3 }, end: { line: 4, column: 5 },
    text: 'unsaved\n  content' };
  const send = (selection: object) => handleBrowserRequest(JSON.stringify({
    type: 'request', id: 6, action: 'quoteSelection', body: selection,
  }), options);
  expect(await send(body)).toEqual({ type: 'reply', id: 6 });
  expect(quoteSelection).toHaveBeenCalledWith(body);
  expect(options.client.read).not.toHaveBeenCalled();
  for (const invalid of [
    { path: '/project/../secret' }, { path: '/other/a' }, { text: '' }, { text: 'x'.repeat(16_001) },
    { start: { line: 0, column: 1 } }, { end: { line: 1, column: 1 } },
    { end: { line: 2, column: 3 } }, { end: { line: 4, column: 1.2 } },
  ]) expect(await send({ ...body, ...invalid })).toMatchObject({ error: expect.any(String) });
  expect(quoteSelection).toHaveBeenCalledOnce();
  quoteSelection.mockRejectedValueOnce(new Error('引用已满'));
  expect(await send(body)).toEqual({ type: 'reply', id: 6, error: '引用已满' });
});
