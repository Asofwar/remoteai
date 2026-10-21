import { expect, test, type Locator, type Page } from '@playwright/test';
import { connect, fixtureUrl, login, navigate, openChatList, screenshot, state } from './chat-helpers';
import { checkInternalGitDrawer } from '../../desktop/e2e/git-drawer-checks';
import { readFile } from 'node:fs/promises';

async function holdRow(page: Page, row: Locator) {
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ x: box.x + Math.min(box.width / 2, 120), y: box.y + box.height / 2 }] });
    await expect(page.getByRole('menu')).toBeVisible();
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
  await expect(page.getByRole('menu')).toBeVisible();
}

test('mobile long presses open file, folder and commit actions without opening details', async ({
  page, request, isMobile,
}, info) => {
  test.skip(!isMobile, 'Touch interaction');
  await request.post(`${fixtureUrl}/test/reset`);
  await login(page); await connect(page); await openChatList(page);
  await page.getByRole('button', { name: '移动端聊天体验', exact: true }).click();
  await page.getByRole('button', { name: '打开工具', exact: true }).click();
  await page.getByRole('button', { name: 'Git', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Git', exact: true });
  const file = drawer.getByRole('button', { name: '查看 src/app.ts', exact: true });
  await holdRow(page, file);
  await expect(drawer.locator('.git-diff')).toHaveCount(0);
  await expect(drawer.getByRole('checkbox', { name: '选择 src/app.ts', exact: true })).not.toBeChecked();
  const menuBox = (await page.getByRole('menu').boundingBox())!;
  expect(menuBox.width).toBeLessThanOrEqual(400);
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await screenshot(page, info, 'git-file-long-press');
  await page.getByRole('menuitem', { name: '回退单个文件', exact: true }).click();
  const rollback = page.getByRole('dialog', { name: '回退文件', exact: true });
  await expect(rollback).toContainText('src/app.ts');
  await rollback.getByRole('button', { name: '取消', exact: true }).click();
  expect((await state(request)).operations.filter(op => op.operation === 'guiGitFileAction')).toHaveLength(0);
  await file.tap();
  await expect(drawer.locator('.git-diff')).toBeVisible();
  await drawer.getByRole('button', { name: 'src/app.ts', exact: true }).click();
  await holdRow(page, drawer.getByRole('button', { name: '展开或收起 src/chat', exact: true }));
  await page.getByRole('menuitem', { name: '提交文件夹内改动', exact: true }).click();
  const commitDialog = page.getByRole('dialog', { name: '提交 2 个文件', exact: true });
  await expect(commitDialog.locator('li')).toHaveText(['src/chat/tools.ts', 'src/chat/menu.ts']);
  await commitDialog.getByRole('button', { name: '取消', exact: true }).click();
  await drawer.getByRole('tab', { name: '提交记录', exact: true }).click();
  const commitRow = drawer.locator('.git-history-row').nth(1);
  await holdRow(page, commitRow);
  await expect(page.getByRole('menuitem')).toHaveCount(4);
  await expect(drawer.locator('.git-commit-file')).toHaveCount(0);
  await screenshot(page, info, 'git-history-long-press');
  await page.getByRole('menuitem', { name: '重置当前分支到此提交…', exact: true }).click();
  const reset = page.getByRole('dialog', { name: '重置当前分支到此提交', exact: true });
  await expect(reset.getByRole('radio', { name: /Mixed/ })).toBeChecked();
  await reset.getByRole('button', { name: '取消', exact: true }).click();
  expect((await state(request)).operations.filter(op => op.operation === 'guiGitRevision')).toHaveLength(0);

  const box = (await commitRow.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  try {
    const point = { x: box.x + 120, y: box.y + box.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ x: point.x - 60, y: point.y }] });
    await page.waitForTimeout(650);
    await expect(page.getByRole('menu')).toBeHidden();
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
  await expect(drawer.locator('.git-commit-file')).toHaveCount(0);
});

test('AI commit settings sync across remote viewers and generate only selected files', async ({ page, browser, request }) => {
  await request.post(`${fixtureUrl}/test/reset`);
  const otherContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const other = await otherContext.newPage();
  try {
    for (const viewer of [page, other]) {
      await login(viewer); await connect(viewer); await openChatList(viewer);
      await viewer.getByRole('button', { name: '移动端聊天体验', exact: true }).click();
      await viewer.getByRole('button', { name: '打开工具', exact: true }).click();
      await viewer.getByRole('button', { name: 'Git', exact: true }).click();
    }
    const auto = page.getByRole('checkbox', { name: '自动生成提交说明', exact: true });
    const remoteAuto = other.getByRole('checkbox', { name: '自动生成提交说明', exact: true });
    await auto.check();
    await expect(remoteAuto).toBeChecked();
    await expect(other.getByRole('textbox', { name: '提交说明', exact: true })).toBeDisabled();
    await remoteAuto.uncheck();
    await expect(auto).not.toBeChecked();
    await page.getByRole('checkbox', { name: '选择 src/app.ts', exact: true }).check();
    await page.getByRole('button', { name: 'AI 生成', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '提交说明', exact: true })).toHaveValue('feat: 更新 src/app.ts');
    await auto.check();
    await page.getByRole('button', { name: '提交并推送', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Git', exact: true }).getByRole('status'))
      .toHaveText('提交并推送完成');
    const operations = (await state(request)).operations;
    const generations = operations.filter(operation => operation.operation === 'guiGitGenerateMessage');
    expect(generations).toHaveLength(2);
    for (const generation of generations) expect(generation.files).toEqual([{ path: 'src/app.ts', version: 'app-v1' }]);
    expect(operations.find(operation => operation.operation === 'guiGitCommit')?.message).toBe('feat: 更新 src/app.ts');
    await expect(other.getByRole('button', { name: '查看 README.md', exact: true })).toBeVisible();
  } finally { await otherContext.close(); }
});

test('remote commit context actions and patches reach this browser download manager', async ({ page, request }, info) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  await request.post(`${fixtureUrl}/test/reset`);
  await login(page); await connect(page); await openChatList(page);
  await page.getByRole('button', { name: '移动端聊天体验', exact: true }).click();
  await page.getByRole('button', { name: '打开工具', exact: true }).click();
  await page.getByRole('button', { name: 'Git', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Git', exact: true });
  await drawer.getByRole('tab', { name: '提交记录', exact: true }).click();
  const row = drawer.locator('.git-history-row').nth(1);
  await row.click({ button: 'right' });
  await expect(page.getByRole('menuitem')).toHaveCount(4);
  await screenshot(page, info, 'git-commit-context');
  await page.getByRole('menuitem', { name: '重置当前分支到此提交…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '重置当前分支到此提交', exact: true });
  await expect(dialog.getByRole('radio', { name: /Mixed/ })).toBeChecked();
  await dialog.getByRole('radio', { name: /Soft/ }).check();
  await screenshot(page, info, 'git-reset-confirmation');
  await dialog.getByRole('button', { name: '确认重置', exact: true }).click();
  await expect(dialog).toBeHidden();
  const actions = (await state(request)).operations.filter(op => op.operation === 'guiGitRevision');
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ action: 'reset', mode: 'soft', commit: '72c48df0'.padEnd(40, '4'),
    branch: 'main' });
  expect(actions[0].files).toHaveLength(6);
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '创建补丁…', exact: true }).click();
  await expect(drawer).toContainText('已加入下载管理。');
  await drawer.getByRole('button', {
    name: info.project.name === 'desktop' ? '关闭详情抽屉' : '关闭 Git', exact: true,
  }).click();
  await navigate(page, '设置');
  await page.getByText('下载管理', { exact: true }).click();
  const card = page.getByRole('article', { name: '72c48df04444.patch', exact: true });
  await expect(card).toContainText('文件已就绪');
  await expect(card).toContainText('我的工作电脑');
  await screenshot(page, info, 'git-patch-download');
  const downloading = page.waitForEvent('download');
  await card.getByRole('button', { name: '保存到设备', exact: true }).click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toBe('72c48df04444.patch');
  expect(await readFile((await downloaded.path())!, 'utf8')).toContain('+new\n');
  expect((await state(request)).operations.find(op => op.operation === 'downloadOpen'))
    .toMatchObject({ gitCommit: '72c48df0'.padEnd(40, '4'), cwd: expect.any(String) });
});

test('tools open Git changes, commit only checked files and draw merge history', async ({ page, request }, info) => {
  await request.post(`${fixtureUrl}/test/reset`);
  await login(page); await connect(page); await openChatList(page);
  await page.getByRole('button', { name: '移动端聊天体验', exact: true }).click();
  await page.getByRole('button', { name: '打开工具', exact: true }).click();
  await expect(page.getByRole('button', { name: '终端', exact: true })).toBeVisible();
  await screenshot(page, info, 'tools-menu');
  await page.getByRole('button', { name: 'Git', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Git', exact: true });
  await expect(drawer).toBeVisible();
  const app = drawer.getByRole('checkbox', { name: '选择 src/app.ts', exact: true });
  await expect(app).toBeVisible();
  if (info.project.name === 'desktop') await checkInternalGitDrawer(page);
  const reads = () => state(request).then(value =>
    value.operations.filter(op => op.operation === 'guiGitChanges').length);
  const initialReads = await reads();
  await expect.poll(reads).toBeGreaterThan(initialReads);
  const folder = drawer.getByRole('checkbox', { name: '选择 src/chat', exact: true });
  await folder.check();
  await expect(drawer.getByRole('checkbox', { name: '选择 src/chat/tools.ts', exact: true })).toBeChecked();
  await expect(drawer.getByRole('checkbox', { name: '选择 src/chat/menu.ts', exact: true })).toBeChecked();
  await drawer.getByRole('button', { name: '平铺', exact: true }).click();
  await expect(folder).toHaveCount(0);
  await expect(drawer.getByRole('checkbox', { name: '选择 src/chat/tools.ts', exact: true })).toBeChecked();
  await screenshot(page, info, 'git-flat');
  await drawer.getByRole('button', { name: '文件夹', exact: true }).click();
  await folder.uncheck();
  await expect(drawer.locator('[data-area="unstaged"]')).not.toHaveCount(0);
  await expect(drawer.locator('[data-area="staged"]')).not.toHaveCount(0);
  await expect(drawer.locator('[data-area="mixed"]')).not.toHaveCount(0);
  await drawer.getByRole('button', { name: '展开或收起 src/chat', exact: true }).click();
  await expect(drawer.getByRole('checkbox', { name: '选择 src/chat/tools.ts', exact: true })).toHaveCount(0);
  await app.check();
  await drawer.getByRole('button', { name: '查看 src/app.ts', exact: true }).click();
  const desktop = info.project.name === 'desktop';
  const diff = desktop ? page.getByRole('dialog', { name: '文件更改详情', exact: true })
    : drawer.locator('.git-diff');
  await expect(diff).toContainText('new code');
  await screenshot(page, info, 'git-diff');
  if (desktop) await diff.getByRole('tab', { name: 'Git', exact: true }).click();
  else await drawer.getByRole('button', { name: 'src/app.ts', exact: true }).click();
  await expect(app).toBeChecked();
  const message = drawer.getByRole('textbox', { name: '提交说明' });
  await message.fill('更新应用');
  await screenshot(page, info, 'git-changes');
  await message.fill('fail');
  await drawer.getByRole('button', { name: '提交 1 个文件', exact: true }).click();
  await expect(drawer.getByRole('alert')).toContainText('暂时无法完成此操作');
  await expect(app).toBeChecked();
  await expect(message).toHaveValue('fail');
  await message.fill('更新应用');
  await drawer.getByRole('button', { name: '提交 1 个文件', exact: true }).click();
  await expect(drawer.getByRole('status')).toHaveText('已提交 8f17d63a');
  await expect(app).toHaveCount(0);
  await expect(drawer.getByRole('checkbox', { name: '选择 README.md', exact: true })).not.toBeChecked();
  const submitted = (await state(request)).operations.filter(op => op.operation === 'guiGitCommit').at(-1);
  expect(submitted?.files).toEqual([{ path: 'src/app.ts', version: 'app-v1' }]);
  await drawer.getByRole('tab', { name: '提交记录', exact: true }).click();
  await expect(drawer.locator('.git-history-row')).toHaveCount(6);
  await expect(drawer.getByRole('button', { name: '加载更多提交' })).toHaveCount(0);
  await expect(drawer.locator('.git-history svg circle')).toHaveCount(6);
  await expect(drawer.locator('.git-history svg line')).not.toHaveCount(0);
  await expect(drawer).toContainText('feature/git');
  await screenshot(page, info, 'git-history');
  const bounds = (await drawer.boundingBox())!;
  expect(bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const diffCount = (await state(request)).operations.filter(op => op.operation === 'guiGitDiff').length;
  await drawer.locator('.git-history-row').nth(1).click();
  await expect(drawer.locator('.git-commit-file')).toHaveCount(4);
  await expect(drawer).toContainText('重命名');
  await expect(drawer).toContainText('docs/旧说明.md');
  await expect(drawer.locator('.git-diff')).toHaveCount(0);
  expect((await state(request)).operations.filter(op => op.operation === 'guiGitDiff')).toHaveLength(diffCount);
  await screenshot(page, info, 'git-commit-files');
  await drawer.getByRole('button', { name: '查看 src/chat/tools.ts', exact: true }).click();
  await expect(diff).toContainText('committed change');
  if (desktop) await expect(diff.getByLabel('src/chat/tools.ts 的代码差异', { exact: true })).toBeVisible();
  else await expect(diff).toContainText('b/src/chat/tools.ts');
  const commitDiff = (await state(request)).operations.filter(op => op.operation === 'guiGitDiff').at(-1);
  expect(commitDiff).toMatchObject({ path: 'src/chat/tools.ts', commit: 'e950cd31'.padEnd(40, '5') });
  await screenshot(page, info, 'git-commit-file-diff');
  if (desktop) await diff.getByRole('tab', { name: 'Git', exact: true }).click();
  else await drawer.getByRole('button', { name: '返回文件列表', exact: true }).click();
  await expect(drawer.locator('.git-commit-file')).toHaveCount(4);
  await drawer.getByRole('button', { name: '返回提交记录', exact: true }).click();
  await expect(drawer.locator('.git-history-row')).toHaveCount(6);
  await drawer.getByRole('button', { name: '切换分支', exact: true }).click();
  const branches = drawer.getByRole('region', { name: '切换分支', exact: true });
  await expect(branches.getByRole('button', { name: /release/ })).toBeDisabled();
  await screenshot(page, info, 'git-branches');
  await branches.getByRole('button', { name: 'feature/git 本地', exact: true }).click();
  await expect(drawer.getByRole('button', { name: '切换分支', exact: true })).toContainText('feature/git');
  await drawer.getByRole('button', { name: '更新项目', exact: true }).click();
  await expect(drawer.getByLabel('整合方式', { exact: true })).toHaveCount(0);
  await expect(drawer).toContainText('获取远程更新，无冲突时自动合并并提交。');
  await expect(drawer.getByRole('button', { name: '执行 更新项目', exact: true })).toBeDisabled();
  await drawer.getByRole('button', { name: '获取 Fetch', exact: true }).click();
  await drawer.getByRole('button', { name: '执行 获取 Fetch', exact: true }).click();
  await expect(drawer.getByRole('status')).toHaveText('已获取远程记录');
  await drawer.getByRole('tab', { name: /^改动/ }).click();
  await drawer.getByRole('checkbox', { name: '全选', exact: true }).check();
  await message.fill('完成剩余改动');
  await drawer.getByRole('button', { name: '提交 5 个文件', exact: true }).click();
  await expect(drawer).toContainText('工作区没有未提交的改动。');
  await drawer.getByRole('button', { name: '拉取 Pull', exact: true }).click();
  await drawer.getByLabel('整合方式', { exact: true }).selectOption('rebase');
  await drawer.getByRole('button', { name: '更新项目', exact: true }).click();
  await expect(drawer.getByLabel('整合方式', { exact: true })).toHaveCount(0);
  expect((await drawer.locator('.git-menu').boundingBox())!.width).toBeLessThanOrEqual(400);
  await screenshot(page, info, 'git-update');
  await drawer.getByRole('button', { name: '执行 更新项目', exact: true }).click();
  await expect(drawer.getByRole('status')).toHaveText('项目已更新');
  await drawer.getByRole('button', { name: '拉取 Pull', exact: true }).click();
  await drawer.getByLabel('整合方式', { exact: true }).selectOption('rebase');
  await drawer.getByRole('button', { name: '执行 拉取 Pull', exact: true }).click();
  await expect(drawer.getByRole('status')).toHaveText('拉取完成');
  await drawer.getByRole('button', { name: '推送 Push', exact: true }).click();
  await drawer.getByRole('button', { name: '执行 推送 Push', exact: true }).click();
  await expect(drawer.getByRole('status')).toHaveText('推送完成');
  const actions = (await state(request)).operations.filter(op => op.operation === 'guiGitAction');
  expect(actions.map(op => op.action)).toEqual(['switch', 'fetch', 'update', 'pull', 'push']);
  expect(actions.find(op => op.action === 'update')?.strategy).toBe('merge');
  expect(actions.find(op => op.action === 'pull')?.strategy).toBe('rebase');
  await drawer.getByRole('button', { name: desktop ? '关闭详情抽屉' : '关闭 Git', exact: true }).click();
  await page.getByRole('button', { name: '打开工具', exact: true }).click();
  await page.getByRole('button', { name: '终端', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '远程终端', exact: true })).toBeVisible();
  await expect(page.locator('.xterm-rows')).toContainText('Remote shell ready');
});

test('remote Git file actions send only the confirmed files', async ({ page, request }) => {
  await request.post(`${fixtureUrl}/test/reset`);
  await login(page); await connect(page); await openChatList(page);
  await page.getByRole('button', { name: '移动端聊天体验', exact: true }).click();
  await page.getByRole('button', { name: '打开工具', exact: true }).click();
  await page.getByRole('button', { name: 'Git', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Git', exact: true });
  await drawer.getByRole('checkbox', { name: '选择 src/app.ts', exact: true }).check();
  await drawer.getByRole('button', { name: '回退所选文件', exact: true }).click();
  await page.getByRole('dialog', { name: '回退文件', exact: true })
    .getByRole('button', { name: '确认回退', exact: true }).click();
  await expect(drawer.getByRole('checkbox', { name: '选择 src/app.ts', exact: true })).toHaveCount(0);
  const newFile = drawer.getByRole('button', { name: '查看 新文件 [1].txt', exact: true });
  // Finish locating the row before opening a context menu, which dismisses itself on scroll.
  await newFile.scrollIntoViewIfNeeded();
  await newFile.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除文件', exact: true }).click();
  await page.getByRole('dialog', { name: '删除文件', exact: true })
    .getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(drawer.getByRole('button', { name: '查看 新文件 [1].txt', exact: true })).toHaveCount(0);
  const actions = (await state(request)).operations.filter(operation => operation.operation === 'guiGitFileAction');
  expect(actions.map(action => ({ action: action.action, files: action.files }))).toEqual([
    { action: 'rollback', files: [{ path: 'src/app.ts', version: 'app-v1' }] },
    { action: 'delete', files: [{ path: '新文件 [1].txt', version: 'new-v1' }] },
  ]);
  await expect(drawer.getByRole('button', { name: '查看 README.md', exact: true })).toBeVisible();
  const selected = drawer.getByRole('checkbox', { name: '选择 README.md', exact: true });
  await selected.check();
  const folder = drawer.getByRole('button', { name: '展开或收起 src/chat', exact: true });
  await folder.click();
  await folder.scrollIntoViewIfNeeded();
  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '提交文件夹内改动', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '提交 2 个文件', exact: true });
  await expect(dialog.locator('li')).toHaveText(['src/chat/tools.ts', 'src/chat/menu.ts']);
  await dialog.getByRole('textbox', { name: '提交说明', exact: true }).fill('提交文件夹改动');
  await dialog.getByRole('button', { name: '提交', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(folder).toHaveCount(0);
  await expect(selected).toBeChecked();
  const commit = (await state(request)).operations.find(operation => operation.operation === 'guiGitCommit');
  expect(commit?.files).toEqual([
    { path: 'src/chat/tools.ts', version: 'tools-v1' }, { path: 'src/chat/menu.ts', version: 'menu-v1' },
  ]);
});
