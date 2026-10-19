import * as React from 'react';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { beforeEach, expect, it, vi } from 'vitest';
import { MappingPreview } from './MappingPreview';
import { PREVIEW_NETWORK_BUSY, PREVIEW_NETWORK_IDLE } from './previewNetworkActivity';

const runtime = vi.hoisted(() => ({ cursor: 0, states: [] as unknown[],
  webview: { reload: vi.fn(), goBack: vi.fn() } }));
vi.mock('react', async original => ({ ...await original<typeof React>(),
  useRef: () => ({ current: runtime.webview }),
  useState: (initial: unknown) => {
    const index = runtime.cursor++;
    if (!(index in runtime.states)) runtime.states[index] = initial;
    return [runtime.states[index], (value: unknown) => { runtime.states[index] = value; }];
  },
}));
vi.mock('react-native', () => ({ Linking: {}, Modal: 'Modal', Platform: { OS: 'android' },
  Pressable: 'Pressable', Text: 'Text', View: 'View' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: 'Provider', SafeAreaView: 'SafeAreaView' }));
vi.mock('react-native-webview', () => ({ WebView: 'WebView' }));
vi.mock('./MappingPreviewActivity', () => ({ MappingPreviewActivity: 'Activity' }));
vi.mock('../styles', () => ({ useStyles: () => ({}) }));
vi.mock('../../i18n', () => ({ t: (value: string) => value }));

type Props = WebViewProps & { children?: React.ReactNode; active?: boolean; onPress?: () => void };
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Props>(child)
    ? [child, ...elements(child.props.children)] : []);
}
function render() {
  runtime.cursor = 0;
  return elements(MappingPreview({ port: 3002, close: vi.fn() }));
}
const webview = () => render().find(node => node.type === 'WebView')!.props;
const active = () => render().find(node => node.type === 'Activity')!.props.active;
const message = (data: string) => webview().onMessage!({ nativeEvent: { data } } as WebViewMessageEvent);
const button = (label: string) => render().find(node => node.type === 'Pressable'
  && elements(node.props.children).some(child => child.props.children === label))!;

beforeEach(() => { vi.stubGlobal('React', React); vi.clearAllMocks(); runtime.states = []; });

it('shows activity from initial navigation through outstanding page requests', () => {
  expect(active()).toBe(true);
  message(PREVIEW_NETWORK_BUSY);
  webview().onLoadEnd!({} as never);
  expect(active()).toBe(true);
  message(PREVIEW_NETWORK_IDLE);
  expect(active()).toBe(false);
  message('unrelated page message');
  expect(active()).toBe(false);
  message(PREVIEW_NETWORK_BUSY);
  expect(active()).toBe(true);
  message(PREVIEW_NETWORK_IDLE);
  expect(active()).toBe(false);
});

it('does not stop page loading when an individual request finishes', () => {
  message(PREVIEW_NETWORK_BUSY);
  message(PREVIEW_NETWORK_IDLE);
  expect(active()).toBe(true);
  webview().onLoadEnd!({} as never);
  expect(active()).toBe(false);
});

it('clears activity on failure and starts it immediately for refresh and back navigation', () => {
  message(PREVIEW_NETWORK_BUSY);
  webview().onError!({} as never);
  expect(active()).toBe(false);
  button('刷新').props.onPress!();
  expect(runtime.webview.reload).toHaveBeenCalledOnce();
  expect(active()).toBe(true);
  webview().onLoadEnd!({} as never);
  expect(active()).toBe(false);
  webview().onNavigationStateChange!({ canGoBack: true } as never);
  button('返回').props.onPress!();
  expect(runtime.webview.goBack).toHaveBeenCalledOnce();
  expect(active()).toBe(true);
});

it('resets requests from the previous document when navigating to another page', () => {
  message(PREVIEW_NETWORK_BUSY);
  webview().onLoadStart!({} as never);
  webview().onLoadEnd!({} as never);
  expect(active()).toBe(false);
  expect(webview().injectedJavaScriptBeforeContentLoaded).toBe(webview().injectedJavaScript);
});
