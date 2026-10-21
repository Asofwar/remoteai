import { describe, expect, it } from 'vitest';
import { accountsEnglish, accountsRussian } from '../../../../shared/i18n/backend/accounts';
import { translateBackendMessage } from '../../../../shared/i18n/backend/translateBackendMessage';

const en = (message: string) => translateBackendMessage('en', message);
const ru = (message: string) => translateBackendMessage('ru', message);

describe('account backend messages', () => {
  it('defines every source in both English and Russian', () => {
    expect(Object.keys(accountsRussian).sort()).toEqual(Object.keys(accountsEnglish).sort());
  });

  it('translates sign-in toasts and keeps Chinese unchanged', () => {
    expect(ru('登录成功，账户已保存，可手动切换'))
      .toBe('Вход выполнен, аккаунт сохранён. Переключиться на него можно вручную');
    expect(en('网页登录成功，账户已添加')).toBe('Signed in on the web. Account added');
    expect(ru('登录失败：access_denied')).toBe('Не удалось войти: access_denied');
    expect(en('登录失败：授权响应缺少 code')).toBe('Sign-in failed: the authorization response has no code');
    expect(translateBackendMessage('zh', '登录失败：access_denied')).toBe('登录失败：access_denied');
  });

  it('fills templates from Rust messages and keeps OS details verbatim', () => {
    expect(ru('无法启动 Claude Code：系统找不到指定的文件。 (os error 2)'))
      .toBe('Не удалось запустить Claude Code: 系统找不到指定的文件。 (os error 2)');
    expect(en('刷新登录凭据失败（HTTP 401 Unauthorized），请重新登录'))
      .toBe('Could not refresh sign-in credentials (HTTP 401 Unauthorized). Sign in again.');
    expect(ru('读取 Codex 用量失败：error sending request'))
      .toBe('Не удалось загрузить расход Codex: error sending request');
    expect(ru('第 3 行，第 7 列：格式不正确，请检查此处的引号、括号或重复配置。'))
      .toBe('Строка 3, столбец 7: Некорректный формат. Проверьте кавычки, скобки или повторяющиеся параметры в этом месте.');
    expect(ru('对话记录切换失败：busy；自动恢复时仍有 2 个文件失败，请重试或导出诊断日志'))
      .toBe('Не удалось переключить историю чатов: busy; при автоматическом восстановлении остались ошибки (файлов: 2). '
        + 'Повторите попытку или экспортируйте журнал диагностики.');
  });

  it('translates a nested known message and prefers the most specific template', () => {
    expect(ru('切换已完成，但无法写入三方 App 配置：无法定位用户主目录'))
      .toBe('Переключение выполнено, но не удалось записать настройки сторонних приложений: '
        + 'Не удалось найти домашнюю папку пользователя');
    expect(en('更新 Codex 对话目录 C:\\Users\\a\\.codex\\sessions 失败：Access is denied. (os error 5)'))
      .toBe('Could not update the Codex conversation catalog C:\\Users\\a\\.codex\\sessions: Access is denied. (os error 5)');
    expect(en('更新 C:\\Users\\a\\.codex\\state.sqlite 失败：database is locked'))
      .toBe('Could not update C:\\Users\\a\\.codex\\state.sqlite: database is locked');
  });
});
