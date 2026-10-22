import { expect, test, type Locator, type Page } from '@playwright/test';

const filenames = ['notes.txt', 'settings.json', 'README.md', 'archive.zip', 'huge.txt', 'main.ts', '测试.py'];

async function openFiles(page: Page) {
  await page.getByRole('treeitem', { name: 'src', exact: true }).click();
  await page.getByRole('treeitem', { name: 'nested', exact: true }).click();
  await page.getByRole('treeitem', { name: '子目录', exact: true }).click();
  for (const name of filenames) await page.getByRole('treeitem', { name, exact: true }).click();
}

test('long filenames stay clipped inside narrow panes and wrap inside the overflow menu', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto('/e2e/project-browser-harness.html?mode=local');
  await page.getByRole('button', { name: '文件浏览', exact: true }).click();
  const names = ['notes.txt', 'settings.json'];
  const longNames = names.map(name => `codex-switch-文件浏览-${'long-filename-'.repeat(6)}${name}`);
  for (const [index, name] of names.entries()) {
    await page.getByRole('treeitem', { name, exact: true }).click();
    await page.getByRole('tab', { name, exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
    await page.getByRole('textbox', { name: '名称', exact: true }).fill(longNames[index]);
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await expect(page.getByRole('tab', { name: longNames[index], exact: true })).toBeVisible();
  }
  const strip = page.getByRole('tablist', { name: '打开的文件' });
  const more = page.getByRole('button', { name: '更多标签页', exact: true });
  await expect(more).toBeVisible();
  await expectActiveVisible(strip);
  await page.setViewportSize({ width: 620, height: 700 });
  await expectActiveVisible(strip);
  await more.click();
  const menu = page.getByRole('menu', { name: '隐藏的标签页' });
  await expect(menu.getByRole('menuitem')).toHaveCount(1);
  expect(await menu.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await menu.getByRole('menuitem', { name: longNames[0], exact: true }).click();
  await expectActiveVisible(strip);
  await page.screenshot({ path: '../../.codex-tmp/project-browser-overflow-long-names.png' });
  await page.getByRole('button', { name: `关闭文件 ${longNames[0]}`, exact: true }).click();
  await expect(more).toHaveCount(0);
  await expectActiveVisible(strip);
});

async function clippedNames(strip: Locator) {
  return strip.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll('.pf-tab')].filter(tab => {
      const rect = tab.getBoundingClientRect();
      return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
    }).map(tab => tab.querySelector('[role=tab]')?.getAttribute('aria-label'));
  });
}

async function expectActiveVisible(strip: Locator) {
  await expect.poll(() => strip.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const active = element.querySelector('.pf-tab[data-active=true]')!.getBoundingClientRect();
    return active.left >= bounds.left - 1 && active.right <= bounds.right + 1;
  })).toBe(true);
}

for (const mode of ['local', 'remote', 'web']) {
  test(`${mode}: overflowing tabs slide left and the dropdown lists only clipped tabs`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/e2e/project-browser-harness.html?mode=${mode}${mode === 'remote' ? '&dark' : ''}`);
    await page.getByRole('button', { name: '文件浏览', exact: true }).click();
    const strip = page.getByRole('tablist', { name: '打开的文件' });
    const more = page.getByRole('button', { name: '更多标签页', exact: true });
    await page.getByRole('treeitem', { name: 'notes.txt', exact: true }).click();
    await expect(more).toHaveCount(0);
    await openFiles(page);
    await expect(more).toBeVisible();
    await expectActiveVisible(strip);
    await expect(page.locator('.pf-tabs-bar')).toHaveAttribute('data-clipped-left', 'true');
    expect(await strip.evaluate(element => element.offsetHeight - element.clientHeight)).toBe(0);
    const hidden = await clippedNames(strip);
    expect(hidden).toContain('notes.txt');
    expect(hidden).not.toContain('测试.py');
    await more.click();
    const menu = page.getByRole('menu', { name: '隐藏的标签页', exact: true });
    await expect(menu.getByRole('menuitem')).toHaveCount(hidden.length);
    expect(await menu.getByRole('menuitem').evaluateAll(items => items.map(item => item.getAttribute('aria-label'))))
      .toEqual(hidden);
    expect((await menu.boundingBox())!.width).toBeLessThanOrEqual(400);
    await page.screenshot({ path: `../../.codex-tmp/project-browser-overflow-${mode}.png` });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
    await more.click();
    await menu.getByRole('menuitem', { name: 'notes.txt', exact: true }).click();
    await expect(strip.getByRole('tab', { name: 'notes.txt', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expectActiveVisible(strip);
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.pf-tabs-bar')).toHaveAttribute('data-clipped-left', 'false');
    await more.click();
    await expect(menu.getByRole('menuitem', { name: 'notes.txt', exact: true })).toHaveCount(0);
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem').last()).toBeFocused();
    await page.keyboard.press('Enter');
    await expectActiveVisible(strip);
    await page.keyboard.press('Home');
    await expect(strip.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
    await expectActiveVisible(strip);
    await page.keyboard.press('End');
    await expect(strip.getByRole('tab').last()).toHaveAttribute('aria-selected', 'true');
    await expectActiveVisible(strip);
    await page.getByRole('button', { name: '展开详情抽屉', exact: true }).click();
    await expect(more).toHaveCount(0);
    await expect(page.locator('.pf-tabs-bar')).toHaveAttribute('data-clipped-left', 'false');
    await page.getByRole('button', { name: '还原抽屉宽度', exact: true }).click();
    await expect(more).toBeVisible();
    await expectActiveVisible(strip);
    for (const name of filenames.slice(1).reverse()) {
      await strip.getByRole('tab', { name, exact: true }).click();
      await page.getByRole('button', { name: `关闭文件 ${name}`, exact: true }).click();
    }
    await expect(more).toHaveCount(0);
    await expect(strip.getByRole('tab')).toHaveCount(1);
  });
}
