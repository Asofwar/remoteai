import { expect, it } from 'vitest';
import { downloadDetail, downloadPercent, downloadStatusLabel } from './presentation';
import type { DownloadTask } from './types';

const task: DownloadTask = { id: 'archive', name: 'dist', source: { owner: 'owner', deviceId: 'pc',
  deviceName: 'PC', scope: 'computer', path: 'F:/dist' }, status: 'preparing', size: 0, received: 0,
  createdAt: 0, message: '', preparation: {
    phase: 'compressing', processedBytes: 25, totalBytes: 100, completedFiles: 2, totalFiles: 8,
  } };

it('shows real compression progress before the archive size is known', () => {
  expect(downloadPercent(task)).toBe(25);
  expect(downloadStatusLabel(task)).toBe('正在压缩');
  expect(downloadDetail(task)).toBe('已压缩 2 / 8 个文件');
});

it('distinguishes counting and finalizing from transferring the archive', () => {
  expect(downloadDetail({ ...task, preparation: { ...task.preparation!, phase: 'scanning' } }))
    .toBe('正在统计文件…');
  expect(downloadStatusLabel({ ...task, preparation: { ...task.preparation!, phase: 'finalizing' } }))
    .toBe('正在准备下载…');
  expect(downloadPercent({ ...task, status: 'downloading', size: 100, received: 10 })).toBe(10);
});
