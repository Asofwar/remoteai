import React, { type ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DesktopIme } from './DesktopIme';

const runtime = vi.hoisted(() => ({
  injectJavaScript: vi.fn(), requestFocus: vi.fn(), focus: vi.fn(), effects: [] as (() => void)[],
}));
vi.mock('react', async () => ({ ...await vi.importActual<typeof import('react')>('react'),
  useRef: () => ({ current: runtime }), useEffect: (effect: () => void) => { runtime.effects.push(effect); },
}));
vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('react-native-webview', () => ({ WebView: 'WebView' }));
vi.mock('../../i18n', () => ({ t: (text: string) => text, useLanguage: vi.fn() }));
vi.mock('./focusDesktopIme', () => ({ focusDesktopIme: runtime.focus }));

beforeEach(() => { vi.clearAllMocks(); runtime.effects = []; vi.stubGlobal('React', React); });
afterEach(() => vi.unstubAllGlobals());

it('opens the native IME without reserving a visible input row and forwards committed input', () => {
  const input = vi.fn();
  const tree = DesktopIme({ input, focusRequest: 0 });
  expect(tree.props.style).toMatchObject({ position: 'absolute', width: 1, height: 1, opacity: 0 });
  const webview = tree.props.children as ReactElement<{
    onLoadEnd: () => void; onMessage: (event: { nativeEvent: { data: string } }) => void;
  }>;
  webview.props.onLoadEnd();
  expect(runtime.requestFocus).toHaveBeenCalledOnce();
  expect(runtime.injectJavaScript).toHaveBeenLastCalledWith(expect.stringContaining(".focus()"));
  webview.props.onMessage({ nativeEvent: { data: 'focus' } });
  expect(runtime.focus).toHaveBeenCalledWith(runtime);
  webview.props.onMessage({ nativeEvent: { data: '{"kind":"text","text":"你好"}' } });
  expect(input).toHaveBeenCalledWith({ kind: 'text', text: '你好' });
});

it('can request focus again after the system keyboard is dismissed', () => {
  DesktopIme({ input: vi.fn(), focusRequest: 1 });
  runtime.effects.forEach(effect => effect());
  expect(runtime.requestFocus).toHaveBeenCalledOnce();
  expect(runtime.injectJavaScript).toHaveBeenLastCalledWith(expect.stringContaining(".focus()"));
});
