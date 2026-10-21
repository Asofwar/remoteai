// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ImageViewer } from '../../../../shared/chat/ImageViewer';
import { translateText } from '../../../../shared/i18n/translate';

const original = 'data:image/png;base64,b3JpZ2luYWw=';
const russian = (text: string) => translateText('ru', text);
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function downloadFailure(failure: unknown) {
  await act(async () => root.render(<ImageViewer thumbnail="thumbnail" description="截图" translate={russian}
    load={async () => original} close={() => {}} download={async () => { throw failure; }} />));
  await act(async () => container.querySelector<HTMLButtonElement>('.cs-image-download')!.click());
  return container.querySelector('.cs-image-status[role="status"]')?.textContent;
}

it('shows a save failure in the interface language', async () => {
  expect(await downloadFailure(new Error('请重新加载原图后保存。'))).toBe(russian('请重新加载原图后保存。'));
  expect(russian('请重新加载原图后保存。')).not.toMatch(/[一-鿿]/);
});

it('translates the fallback when a download fails without an error message', async () => {
  expect(await downloadFailure('offline')).toBe(russian('下载失败，请重试。'));
  expect(russian('下载失败，请重试。')).not.toMatch(/[一-鿿]/);
});

it('leaves an unknown error message unchanged', async () => {
  expect(await downloadFailure(new Error('disk full'))).toBe('disk full');
});
