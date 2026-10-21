// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { COZE_DESKTOP_READY, COZE_DESKTOP_STATE, COZE_DESKTOP_STOP_READY }
  from '../../../../shared/coze/desktopBridge';
import { StopCozeButton } from './StopCozeButton';
import { setLanguage } from './i18n';

it('confirms the stop control only after receiving host state and rendering it', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const parent = { postMessage: vi.fn() };
  vi.stubGlobal('parent', parent);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<StopCozeButton />));
    expect(parent.postMessage).toHaveBeenLastCalledWith(COZE_DESKTOP_READY, '*');
    expect(host.querySelector('button')).toBeNull();
    await act(async () => { window.dispatchEvent(new MessageEvent('message', {
      source: parent as unknown as Window, origin: 'http://desktop.local',
      data: { type: COZE_DESKTOP_STATE, busy: false },
    })); });
    expect(host.querySelector('button')?.textContent).toContain('停止 Coze');
    expect(parent.postMessage).toHaveBeenLastCalledWith(COZE_DESKTOP_STOP_READY, 'http://desktop.local');
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});

it('follows the desktop language from host state without remounting', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const parent = { postMessage: vi.fn() };
  vi.stubGlobal('parent', parent);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const post = (data: unknown, source: unknown = parent) => act(async () => {
    window.dispatchEvent(new MessageEvent('message', {
      source: source as Window, origin: 'http://desktop.local', data,
    }));
  });
  try {
    await act(async () => root.render(<StopCozeButton />));
    await post({ type: COZE_DESKTOP_STATE, busy: false, language: 'ru' });
    const button = host.querySelector('button');
    expect(button?.textContent).toContain('Остановить Coze');
    expect(document.documentElement.lang).toBe('ru-RU');
    await post({ type: COZE_DESKTOP_STATE, busy: false, language: 'en' });
    expect(host.querySelector('button')).toBe(button);
    expect(button?.getAttribute('aria-label')).toBe('Stop Coze');
    await post({ type: COZE_DESKTOP_STATE, busy: false, language: 'zh' }, window);
    await post({ type: COZE_DESKTOP_STATE, busy: false, language: 'xx' });
    expect(button?.textContent).toContain('Stop Coze');
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); setLanguage('zh');
  }
});
