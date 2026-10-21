import React, { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setInterfaceLanguage } from '../../../../shared/i18n/interfaceLanguage';
import { DownloadCard } from './DownloadCard';
import type { DownloadTask } from './types';

vi.mock('react', async original => ({ ...await original<typeof React>(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));
vi.mock('react-native', () => ({ ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text',
  View: 'View', StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
vi.mock('../theme/store', () => ({ useThemeColor: () => (value: string) => value }));
vi.mock('./styles', () => ({ colors: { green: '#087f69', muted: '#7c8b86' },
  useStyles: () => new Proxy({}, { get: () => ({}) }) }));

type Element = ReactElement<{ children?: ReactNode }>;

function texts(node: ReactNode): string[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    const element = child as Element;
    const own = element.type === 'Text'
      ? [Children.toArray(element.props.children).filter(part => typeof part === 'string').join('')] : [];
    return [...own, ...texts(element.props.children)];
  });
}

const task: DownloadTask = { id: 'photo', name: 'photo.jpg', source: { owner: 'owner', deviceId: 'pc',
  deviceName: 'PC', scope: 'computer', path: 'C:/photo.jpg' }, status: 'completed', size: 2048, received: 2048,
  createdAt: 0, message: '已保存到相册' };
const render = (value: DownloadTask) => texts(DownloadCard({ task: value, connected: true, busy: false,
  action: () => {}, share: () => {}, remove: () => {} }));

beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => { setInterfaceLanguage('zh'); vi.unstubAllGlobals(); });

it('translates the native download message when it is rendered', () => {
  expect(render(task)).toContain('已保存到相册');
  setInterfaceLanguage('en');
  expect(render(task)).toContain('Saved to photos');
  setInterfaceLanguage('ru');
  expect(render(task)).toContain('Сохранено в галерее');
  expect(render({ ...task, status: 'failed', message: '文件校验失败，请重试。' }))
    .toContain('Проверка файла не пройдена. Повторите попытку.');
});

it('keeps messages without a dictionary entry verbatim', () => {
  setInterfaceLanguage('ru');
  expect(render({ ...task, status: 'failed', message: 'ENOSPC: no space left' })).toContain('ENOSPC: no space left');
});
