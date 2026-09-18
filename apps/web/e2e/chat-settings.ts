import { expect, type Page } from '@playwright/test';
import { click } from './chat-helpers';

export const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) > 860;

export async function closeChatSettings(page: Page) {
  if (isDesktop(page)) await page.keyboard.press('Escape');
  else await click(page.getByRole('button', { name: '关闭', exact: true }).last());
}

export async function chooseSetting(page: Page, field: string, value: string) {
  if (!isDesktop(page)) {
    await click(page.getByRole('button', { name: `设置${field}`, exact: true }));
    await click(page.getByRole('radio', { name: value, exact: true }));
    await expect(page.getByRole('button', { name: `设置${field}`, exact: true })).toBeVisible();
    return;
  }
  if (field === '访问权限') {
    await page.getByRole('button', { name: /^访问权限：/ }).click();
    await page.getByRole('menuitemradio', { name: new RegExp(value) }).click();
    return;
  }
  const trigger = page.getByRole('button', { name: /^模型与推理强度：/ });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  if (field === '模型') {
    await page.getByRole('button', { name: '选择模型', exact: true }).click();
    await page.getByRole('menuitemradio', { name: value, exact: true }).click();
  } else {
    const slider = page.getByRole('slider', { name: '推理强度', exact: true });
    await slider.fill(String(['中', '高', '极高'].indexOf(value)));
    await expect(slider).toHaveAttribute('aria-valuetext', value);
  }
  await page.keyboard.press('Escape');
}

export async function expectComposerSelection(page: Page) {
  const trigger = page.getByRole('button', { name: /^模型与推理强度：/ });
  await expect(trigger).toHaveAccessibleName('模型与推理强度：第二模型 极高');
  await trigger.click();
  await expect(page.getByRole('slider', { name: '推理强度' })).toHaveAttribute('aria-valuetext', '极高');
  await page.getByRole('button', { name: '选择模型', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: '第二模型', exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
}
