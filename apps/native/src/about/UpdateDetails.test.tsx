import * as React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { UpdateDetails } from './UpdateDetails';
import type { useAppUpdate } from './useAppUpdate';

const observed = vi.hoisted(() => ({ openReleasePage: vi.fn() }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(), useMemo: <T,>(compute: () => T) => compute(),

  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock('react-native', () => ({ Text: 'Text', View: 'View', ActivityIndicator: 'Spinner', StyleSheet: {
  create: <T,>(styles: T) => styles, hairlineWidth: 1,
} }));
vi.mock('./styles', () => ({ useStyles: () => ({}) }));
vi.mock('./useAppUpdate', () => ({ openReleasePage: observed.openReleasePage }));

interface Props {
  children?: unknown; accessibilityRole?: string; accessibilityValue?: { now: number }; onPress?: () => void;
}
interface RenderedNode { props: Props; children: RenderedNode[]; text: string }

function render(value: unknown): RenderedNode[] {
  if (typeof value === 'string' || typeof value === 'number') {
    return [{ props: {}, children: [], text: String(value) }];
  }
  if (Array.isArray(value)) return value.flatMap(render);
  if (!React.isValidElement<Props>(value)) return [];
  if (typeof value.type === 'function') {
    return render((value.type as (props: Props) => unknown)(value.props));
  }
  return [{ props: value.props, children: render(value.props.children), text: '' }];
}

function descendants(nodes: RenderedNode[]): RenderedNode[] {
  return nodes.flatMap((node) => [node, ...descendants(node.children)]);
}

function details(notes: string, overrides: Partial<ReturnType<typeof useAppUpdate>> = {}) {
  vi.stubGlobal('React', React);
  const update: ReturnType<typeof useAppUpdate> = {
    checking: false, error: '', downloadState: { status: 'idle' },
    checkForUpdate: vi.fn(), beginDownload: vi.fn(), installDownloaded: vi.fn(),
    updateCheck: { currentVersion: '1.5.29', updateAvailable: true, release: {
      version: '1.5.31', tagName: 'v1.5.31', title: 'Remote AI', notes, publishedAt: null,
      releaseUrl: 'https://example.com/release', androidAsset: null,
    } }, ...overrides,
  };
  return descendants(render(UpdateDetails({ update })));
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('shows formatted changes instead of the release download catalogue and raw Markdown', () => {
  const nodes = details('<!-- codex-switch-downloads:start -->\n## 下载地址\n'
    + '- [Windows 安装包](https://example.com/download)\n'.repeat(30)
    + '<!-- codex-switch-downloads:end -->\n\n## 更新内容\n\n### 手机端\n\n'
    + '- **修复更新下载**：失败后可以重新下载。\n- 改善更新说明。\n\n'
    + '[完整更新记录](https://example.com/compare)');
  const text = nodes.map((node) => node.text).join('');
  expect(text).toContain('手机端•修复更新下载：失败后可以重新下载。•改善更新说明。完整更新记录');
  expect(text).not.toMatch(/下载地址|Windows|codex-switch-downloads|\*\*|###|https:\/\//);
  expect(nodes.some((node) => node.props.accessibilityRole === 'header')).toBe(true);
  const link = nodes.find((node) => node.props.accessibilityRole === 'link');
  expect(link).toBeDefined();
  link?.props.onPress?.();
  expect(observed.openReleasePage).toHaveBeenCalledWith('https://example.com/compare');
});

it('keeps the end of long release notes visible', () => {
  const text = details('- 更新内容。\n'.repeat(200) + '\n最后一项修复。').map((node) => node.text).join('');
  expect(text).toContain('最后一项修复。');
  expect(text).not.toContain('…');
});

it('shows a friendly fallback when the release only contains installer links or hidden comments', () => {
  const text = details('<!-- codex-switch-downloads:start -->\n## 下载地址\n'
    + '<!-- codex-switch-downloads:end -->\n\n## 更新内容\n\n<!-- no notes -->')
    .map((node) => node.text).join('');
  expect(text).toContain('本次版本未提供更新说明。');
});

it('keeps live progress and speed visible when checking the release fails', () => {
  const nodes = details('', { error: '暂时无法检查更新，请重试。', updateCheck: null,
    downloadState: { status: 'downloading', version: '2.0.0', progress: {
      receivedBytes: 40 * 1024 * 1024, totalBytes: 100 * 1024 * 1024,
      bytesPerSecond: 2.5 * 1024 * 1024, phase: 'downloading',
    } } });
  const text = nodes.map(node => node.text).join('');
  expect(text).toContain('40%');
  expect(text).toContain('40.0 MB / 100.0 MB');
  expect(text).toContain('2.5 MB/s');
  expect(nodes.find(node => node.props.accessibilityRole === 'progressbar')?.props.accessibilityValue?.now).toBe(40);
  expect(text).toContain('暂时无法检查更新');
});

it('shows verification separately from download speed and keeps unknown totals indeterminate', () => {
  const downloadState = { status: 'downloading', version: '2.0.0', progress: {
    receivedBytes: 100, totalBytes: 100, bytesPerSecond: 0, phase: 'verifying',
  } } as const;
  const text = details('', { downloadState }).map(node => node.text).join('');
  expect(text).toContain('正在校验');
  expect(text).toContain('100%');
  expect(text).not.toContain('/s');
  const unknown = details('', { downloadState: { ...downloadState, progress: undefined } });
  expect(unknown.map(node => node.text).join('')).not.toContain('%');
  expect(unknown.some(node => node.props.accessibilityRole === 'progressbar')).toBe(false);
});
