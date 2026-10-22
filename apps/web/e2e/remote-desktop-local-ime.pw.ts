import { expect, test, type Page } from '@playwright/test';

async function openDesktop(page: Page, native = false) {
  await page.goto(`e2e/remote-desktop-harness.html${native ? '?native-clipboard' : ''}`);
  if (native) await page.getByRole('button', { name: '打开远程桌面', exact: true }).click();
  else {
    await page.getByRole('button', { name: '打开工具' }).click();
    await page.getByRole('button', { name: '远程桌面', exact: true }).click();
  }
  await expect.poll(() => page.locator('video').evaluate(video => video.videoWidth)).toBeGreaterThan(0);
  await page.evaluate(() => { window.desktopTest.inputs.length = 0; });
}

async function compose(page: Page, text: string) {
  const session = await page.context().newCDPSession(page);
  try {
    // Exercise Chromium's editing/IME path, rather than dispatching synthetic DOM composition events.
    await session.send('Input.imeSetComposition', { text: 'zhongwen', selectionStart: 8, selectionEnd: 8 });
    await session.send('Input.insertText', { text });
  } finally { await session.detach(); }
}

for (const native of [false, true]) {
  test(`PC ${native ? 'app' : 'browser'} capture suppresses local composition and retains physical keys`,
    async ({ page, isMobile }) => {
      test.skip(!!isMobile, 'PC capture behavior only.');
      await openDesktop(page, native);
      const capture = page.locator('.rd-key-capture');
      await expect(capture).toBeFocused();
      await compose(page, '中文');
      await expect(capture).toHaveValue('');
      expect(await page.evaluate(() => window.desktopTest.inputs)).toEqual([]);
      await page.keyboard.press('a');
      await page.keyboard.down('Shift');
      await page.getByRole('button', { name: '键盘', exact: true }).click();
      await page.keyboard.up('Shift');
      expect(await page.evaluate(() => window.desktopTest.inputs)).toEqual([
        { kind: 'keyboard', code: 'KeyA', down: true }, { kind: 'keyboard', code: 'KeyA', down: false },
        { kind: 'keyboard', code: 'ShiftLeft', down: true }, { kind: 'keyboard', code: 'ShiftLeft', down: false },
      ]);
      const field = page.getByRole('textbox', { name: '发送到电脑的文字' });
      await expect(field).toBeFocused();
      await compose(page, '中文');
      await expect.poll(() => page.evaluate(() => window.desktopTest.inputs.filter(input => input.kind === 'text')))
        .toEqual([{ kind: 'text', text: '中文' }]);
      await page.getByRole('button', { name: '收起键盘' }).click();
      await page.locator('.rd-touch').click();
      await expect(capture).toBeFocused();
      await page.evaluate(() => { window.desktopTest.inputs.length = 0; });
      await compose(page, '不应发送');
      expect(await page.evaluate(() => window.desktopTest.inputs)).toEqual([]);
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      const local = page.getByRole('textbox', { name: '本机聊天消息' });
      await local.focus();
      await compose(page, '本机中文');
      await expect(local).toHaveValue('本机中文');
    });
}

test('PC capture forwards residual Process keys without committing local composition text', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'PC capture behavior only.');
  await openDesktop(page);
  await page.locator('.rd-key-capture').evaluate(element => {
    // A pending OS composition can deliver events after focus changes to the read-only capture.
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Process', code: 'KeyA', isComposing: true, bubbles: true, cancelable: true,
    }));
    element.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', bubbles: true, cancelable: true }));
    element.dispatchEvent(new CompositionEvent('compositionend', { data: '啊', bubbles: true }));
  });
  expect(await page.evaluate(() => window.desktopTest.inputs)).toEqual([
    { kind: 'keyboard', code: 'KeyA', down: true }, { kind: 'keyboard', code: 'KeyA', down: false },
  ]);
});

test('mobile retains editable capture and Chinese IME input', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile IME behavior only.');
  await openDesktop(page);
  await expect(page.locator('.rd-key-capture')).toBeEditable();
  await page.getByRole('button', { name: '键盘', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '发送到电脑的文字' })).toBeFocused();
  await compose(page, '手机中文');
  await expect.poll(() => page.evaluate(() => window.desktopTest.inputs)).toEqual([{ kind: 'text', text: '手机中文' }]);
});
