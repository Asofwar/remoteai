import { describe, expect, it } from 'vitest';
import { extractReleaseNotes } from './releaseNotesContent';

const downloads = [
  '<!-- codex-switch-downloads:start -->', '## 下载地址', '### Windows',
  '- x64：[EXE 安装包](https://example.com/windows.exe)',
  '### 移动端', '- Android：[APK 安装包](https://example.com/android.apk)',
  '<!-- codex-switch-downloads:end -->',
].join('\n\n');

describe('release notes for the mobile about page', () => {
  it('extracts the changes after a download catalogue longer than the old 900-character preview', () => {
    const longDownloads = downloads.replace('### Windows', '### Windows\n' + '- 下载地址\n'.repeat(200));
    const changes = '- 修复下载失败后无法重试的问题。\n- 改善手机端更新说明。\n\n'
      + '**完整更新记录**：[v1.5.30...v1.5.31](https://example.com/compare)';
    expect(longDownloads.length).toBeGreaterThan(900);
    expect(extractReleaseNotes(`${longDownloads}\n\n## 更新内容\n\n${changes}`)).toBe(changes);
  });

  it('keeps all long notes and their Markdown intact', () => {
    const changes = '- **功能改进**：支持更清晰的内容展示。\n'.repeat(100)
      + '\n### 最后一项\n\n保留结尾的内容。';
    expect(extractReleaseNotes(`${downloads}\n\n## 更新内容\n\n${changes}`)).toBe(changes);
  });

  it('normalizes Windows line endings and removes the old build-artifact introduction', () => {
    const body = `${downloads}\n\n## 更新内容\n\n`
      + 'Windows, macOS, Linux, Android, and iOS build artifacts are attached below.\n\n- 修复问题。';
    expect(extractReleaseNotes(body.replace(/\n/g, '\r\n'))).toBe('- 修复问题。');
  });

  it('preserves releases that have no generated download section', () => {
    const notes = '### 新功能\n\n1. 第一项\n2. 第二项\n\n使用 `设置` 打开。';
    expect(extractReleaseNotes(notes)).toBe(notes);
  });

  it('preserves notes surrounding an embedded download block', () => {
    expect(extractReleaseNotes(`更新简介\n\n${downloads}\n\n- 修复问题。`))
      .toBe('更新简介\n\n\n\n- 修复问题。');
  });

  it('recovers notes when the generated download block is missing its end marker', () => {
    const incomplete = downloads.replace('<!-- codex-switch-downloads:end -->', '');
    expect(extractReleaseNotes(`${incomplete}\n\n## 更新内容\n\n- 修复问题。`)).toBe('- 修复问题。');
    expect(extractReleaseNotes(incomplete)).toBe('');
  });

  it.each(['', '  ', '## 更新内容', downloads, `${downloads}\n\n## 更新内容`])
    ('leaves empty release notes empty: %s', (body) => expect(extractReleaseNotes(body)).toBe(''));
});
