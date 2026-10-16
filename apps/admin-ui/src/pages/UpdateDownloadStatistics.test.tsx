import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n-context';
import { UpdateDownloadStatistics } from './UpdateDownloadStatistics';
import type { UpdateSharingSettingsProps } from '../hooks/useUpdateSharingSettings';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener() {}, removeListener() {} }));
  const getStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => getStyle(element));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('opens only the selected day of failure logs and distinguishes recovered downloads', async () => {
  const paths: string[] = [];
  const api: UpdateSharingSettingsProps['api'] = async <T,>(path: string) => {
    paths.push(path);
    if (path.includes('/failures')) return { total: 1, items: [{ id: 'report', userId: 'user',
      createdAt: '2026-10-16T17:00:00Z', platform: 'android', outcome: 'success',
      failures: [{ source: 'peer', stage: 'connect', code: 'timeout', count: 1 }] }] } as T;
    return { items: [{ date: '2026-10-17', peerDownloads: 5, serverDownloads: 8, serverUsers: 3,
      peerBytes: 1024, serverBytes: 2048, failedDownloads: 0, reportsWithFailures: 1 }] } as T;
  };
  await act(async () => root.render(<ConfigProvider theme={{ token: { motion: false } }}>
    <I18nProvider language="zh" onLanguageChange={() => {}}><UpdateDownloadStatistics api={api} /></I18nProvider>
  </ConfigProvider>));
  expect(container.textContent).toContain('服务器下载用户数');
  expect(container.textContent).toContain('2.0 KiB');
  const button = container.querySelector<HTMLButtonElement>('tbody button')!;
  await act(async () => button.click());
  expect(paths).toEqual(['/admin/api/update-sharing/daily?days=30',
    '/admin/api/update-sharing/failures?date=2026-10-17&page=1&pageSize=20']);
  expect(document.body.textContent).toContain('连接超时');
  expect(document.body.textContent).toContain('已完成');
});
