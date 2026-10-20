// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { downloadManager } from '../../../web/src/downloads/manager';
import type { DownloadTask } from '../../../web/src/downloads/types';
import { DownloadNavigationIcon } from './DownloadNavigationIcon';
import { LOCAL_DOWNLOAD_OWNER } from './localGitDownloads';

it('counts active downloads for this account and local tasks, excluding previews', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const listeners = new Set<() => void>();
  const task = (status: DownloadTask['status'], owner = 'current', preview?: 'text'): DownloadTask => ({
    id: crypto.randomUUID(), name: 'file', status, received: 0, size: 100, createdAt: 0, message: '',
    source: { owner, deviceId: 'pc', deviceName: 'PC', scope: 'project', path: 'file', preview },
  });
  let tasks = [task('queued'), task('preparing'), task('downloading'), task('verifying', LOCAL_DOWNLOAD_OWNER),
    task('paused'), task('failed'), task('ready'), task('saving'), task('completed'),
    task('downloading', 'other'), task('downloading', 'current', 'text')];
  vi.spyOn(downloadManager, 'initialize').mockResolvedValue();
  vi.spyOn(downloadManager, 'snapshot').mockImplementation(() => tasks);
  vi.spyOn(downloadManager, 'subscribe').mockImplementation(listener => {
    listeners.add(listener); return () => { listeners.delete(listener); };
  });
  try {
    await act(async () => root.render(<DownloadNavigationIcon owner="current" />));
    expect(host.querySelector('sup')?.textContent).toBe('4');
    await act(async () => {
      tasks = tasks.map(value => value.status === 'downloading' ? { ...value, status: 'ready' } : value);
      listeners.forEach(listener => listener());
    });
    expect(host.querySelector('sup')?.textContent).toBe('3');
    await act(async () => root.render(<DownloadNavigationIcon owner="other" />));
    expect(host.querySelector('sup')?.textContent).toBe('1');
    await act(async () => { tasks = []; listeners.forEach(listener => listener()); });
    expect(host.querySelector('sup')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    expect(listeners.size).toBe(0);
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});
