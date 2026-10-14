import type { Language } from './language';

const descriptions: Readonly<Record<string, Readonly<Record<Language, string>>>> = {
  'codex-switch-chrome': {
    zh: '浏览、操作和测试 Chrome 网页。',
    en: 'Browse, interact with, and test Chrome pages.',
    ru: 'Просмотр, управление и тестирование страниц Chrome.',
  },
  'codex-switch-computer-use': {
    zh: '查看屏幕，操作 Windows 和 macOS 应用。',
    en: 'View the screen and control Windows and macOS apps.',
    ru: 'Просмотр экрана и управление приложениями Windows и macOS.',
  },
  'codex-switch-remote-command': {
    zh: '在同一账号的其他在线电脑上运行命令、排查问题。',
    en: 'Run commands and diagnose other online computers on your account.',
    ru: 'Команды и диагностика других компьютеров вашего аккаунта в сети.',
  },
};

/** Localize built-in menu copy without changing skill instructions or third-party descriptions. */
export function builtInSkillDescription(name: string, language: Language): string | undefined {
  return Object.prototype.hasOwnProperty.call(descriptions, name) ? descriptions[name][language] : undefined;
}
