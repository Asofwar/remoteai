import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { PREVIEW_NETWORK_BUSY, PREVIEW_NETWORK_IDLE, PREVIEW_NETWORK_SCRIPT } from './previewNetworkActivity';

function setup(fetch = vi.fn(() => Promise.resolve({ status: 200 }))) {
  const originalSend = vi.fn();
  const window = { fetch, XMLHttpRequest: class extends EventTarget {
    send(...args: unknown[]) { return originalSend(...args); }
  }, ReactNativeWebView: { postMessage: vi.fn() } };
  runInNewContext(PREVIEW_NETWORK_SCRIPT, { window });
  const messages = () => window.ReactNativeWebView.postMessage.mock.calls.map(([message]) => message);
  return { window, messages, originalSend };
}

it('stays busy until all concurrent fetch and XHR requests complete', async () => {
  const response = { status: 200 };
  let resolve!: (value: typeof response) => void;
  const fetch = vi.fn(() => new Promise<typeof response>(done => { resolve = done; }));
  const { window, messages, originalSend } = setup(fetch);
  const pending = window.fetch();
  const xhr = new window.XMLHttpRequest();
  xhr.send('body');
  expect(messages()).toEqual([PREVIEW_NETWORK_BUSY]);
  expect(originalSend).toHaveBeenCalledWith('body');
  resolve(response);
  expect(await pending).toBe(response);
  expect(messages()).toEqual([PREVIEW_NETWORK_BUSY]);
  xhr.dispatchEvent(new Event('loadend'));
  expect(messages()).toEqual([PREVIEW_NETWORK_BUSY, PREVIEW_NETWORK_IDLE]);
  xhr.dispatchEvent(new Event('loadend'));
  expect(messages()).toHaveLength(2);
});

it('preserves fetch rejections and synchronous errors while clearing activity', async () => {
  const failure = new Error('Request failed');
  const fetch = vi.fn<() => Promise<{ status: number }>>().mockRejectedValueOnce(failure)
    .mockImplementationOnce(() => { throw failure; });
  const { window, messages } = setup(fetch);
  await expect(window.fetch()).rejects.toBe(failure);
  expect(() => window.fetch()).toThrow(failure);
  expect(messages()).toEqual([PREVIEW_NETWORK_BUSY, PREVIEW_NETWORK_IDLE,
    PREVIEW_NETWORK_BUSY, PREVIEW_NETWORK_IDLE]);
});

it('clears failed or aborted XHR activity and permits reuse without leaked listeners', () => {
  const { window, messages, originalSend } = setup();
  const xhr = new window.XMLHttpRequest();
  for (const outcome of ['abort', 'error', 'timeout']) {
    xhr.send();
    xhr.dispatchEvent(new Event(outcome));
    xhr.dispatchEvent(new Event('loadend'));
    expect(messages().at(-1)).toBe(PREVIEW_NETWORK_IDLE);
  }
  originalSend.mockImplementationOnce(() => { throw new Error('Invalid state'); });
  expect(() => xhr.send()).toThrow('Invalid state');
  expect(messages()).toHaveLength(8);
  expect(messages().at(-1)).toBe(PREVIEW_NETWORK_IDLE);
});

it('does not wrap requests twice when injected at both document start and end', async () => {
  const { window, messages } = setup();
  const wrappedFetch = window.fetch;
  const wrappedSend = window.XMLHttpRequest.prototype.send;
  runInNewContext(PREVIEW_NETWORK_SCRIPT, { window });
  expect(window.fetch).toBe(wrappedFetch);
  expect(window.XMLHttpRequest.prototype.send).toBe(wrappedSend);
  await window.fetch();
  expect(messages()).toEqual([PREVIEW_NETWORK_BUSY, PREVIEW_NETWORK_IDLE]);
});

it('does not break the website if the activity bridge is unavailable', async () => {
  const { window } = setup();
  window.ReactNativeWebView.postMessage.mockImplementation(() => { throw new Error('Bridge closed'); });
  await expect(window.fetch()).resolves.toEqual({ status: 200 });
});
