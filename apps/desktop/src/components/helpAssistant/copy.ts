import type { Language } from '../../i18n';
import type { HelpError } from './types';
import type { HelpSetupError, HelpSetupPhase } from './useHelpSetup';

interface HelpCopy {
  title: string; subtitle: string; close: string; clear: string; placeholder: string;
  send: string; thinking: string; checking: string; retry: string;
  install: string; initialize: string; selectAccount: string;
  setupPhases: Record<HelpSetupPhase, string>; setupErrors: Record<HelpSetupError, string>;
  welcome: string; description: string; privacy: string; sources: string; questions: string[];
  errors: Record<HelpError, string>;
}

const copies: Record<Language, HelpCopy> = {
  zh: {
    title: '问题解答助手', subtitle: 'Remote AI 使用帮助', close: '收起助手', clear: '新对话',
    placeholder: '想了解 Remote AI 的什么功能？', send: '发送', thinking: '正在查找答案…',
    checking: '正在检查是否可以使用…', retry: '重新检查',
    install: '立即安装', initialize: '启用助手', selectAccount: '选择账户',
    setupPhases: { checking: '正在准备安装…', downloading: '正在下载 Codex…',
      installing: '正在安装，即将完成…', initializing: '正在启用助手…' },
    setupErrors: { installFailed: '安装未完成，请检查网络后重试。',
      initializeFailed: '暂时无法启用助手，请重试。',
      previewOnly: '当前仅为界面预览，无法安装。请在 Remote AI 应用中操作。' },
    welcome: '你好，有什么可以帮你？', description: '结合使用说明和你当前的设置，解答 Remote AI 相关问题。',
    privacy: '使用 Codex 中所选账户的额度。仅提供必要的设置摘要，不包含密钥或其他对话。',
    sources: '参考资料', questions: ['如何选择 Codex 使用的账户？', '手机为什么连接不上电脑？', '自动切换账户怎么设置？'],
    errors: {
      installRequired: '使用助手需要先安装 Codex。',
      initializeRequired: 'Codex 已安装，点击下方按钮即可启用助手。',
      accountRequired: '请先在 Codex 中选择一个可用账户。',
      accountChanged: 'Codex 账户已切换，请重新发送问题。',
      invalidRequest: '问题太长了，请缩短后重试。', busy: '还有一个问题正在回答，请稍后再试。',
      unavailable: '暂时无法读取设置，请稍后重试。',
      answerFailed: '暂时没有获取到答案，请检查 Codex 账户和网络后重试。',
    },
  },
  en: {
    title: 'Help assistant', subtitle: 'Remote AI help', close: 'Minimize help', clear: 'New chat',
    placeholder: 'What would you like to know about Remote AI?', send: 'Send', thinking: 'Finding an answer…',
    checking: 'Checking availability…', retry: 'Check again',
    install: 'Install now', initialize: 'Enable assistant', selectAccount: 'Choose account',
    setupPhases: { checking: 'Preparing installation…', downloading: 'Downloading Codex…',
      installing: 'Installing, almost done…', initializing: 'Enabling the assistant…' },
    setupErrors: { installFailed: 'Installation did not finish. Check your connection and try again.',
      initializeFailed: 'The assistant could not start. Please try again.',
      previewOnly: 'Installation is unavailable in this preview. Please use the Remote AI app.' },
    welcome: 'Hi! How can I help?', description: 'Get Remote AI answers based on the guides and your current settings.',
    privacy: 'Uses your Codex account and its usage allowance. Only a settings summary is included, not keys or other chats.',
    sources: 'References', questions: ['How do I select a Codex account?', 'Why can’t my phone connect?',
      'How do I set up automatic account switching?'],
    errors: {
      installRequired: 'The assistant needs Codex. Use the button below to install it here.',
      initializeRequired: 'Codex is installed. Use the button below to enable the assistant.',
      accountRequired: 'Choose an available account in Codex first.',
      accountChanged: 'Your Codex account changed. Please send your question again.',
      invalidRequest: 'Your question is too long. Please shorten it.', busy: 'Another answer is in progress. Try again shortly.',
      unavailable: 'Settings are temporarily unavailable. Please try again.',
      answerFailed: 'No answer received. Check your Codex account and connection, then try again.',
    },
  },
  ru: {
    title: 'Помощник', subtitle: 'Помощь по Remote AI', close: 'Свернуть', clear: 'Новый чат',
    placeholder: 'Что вы хотите узнать о Remote AI?', send: 'Отправить', thinking: 'Ищу ответ…',
    checking: 'Проверяю доступность…', retry: 'Проверить снова',
    install: 'Установить', initialize: 'Включить помощника', selectAccount: 'Выбрать аккаунт',
    setupPhases: { checking: 'Подготовка к установке…', downloading: 'Загрузка Codex…',
      installing: 'Установка почти завершена…', initializing: 'Запуск помощника…' },
    setupErrors: { installFailed: 'Установка не завершена. Проверьте подключение и повторите попытку.',
      initializeFailed: 'Не удалось запустить помощника. Попробуйте снова.',
      previewOnly: 'В режиме предпросмотра установка недоступна. Откройте приложение Remote AI.' },
    welcome: 'Здравствуйте! Чем помочь?', description: 'Ответы о Remote AI на основе руководств и ваших настроек.',
    privacy: 'Используется квота аккаунта Codex. Передаётся только сводка настроек, без ключей и других чатов.',
    sources: 'Источники', questions: ['Как выбрать аккаунт Codex?', 'Почему телефон не подключается?',
      'Как настроить автоматическую смену аккаунта?'],
    errors: {
      installRequired: 'Для помощника нужен Codex. Нажмите кнопку ниже, чтобы установить его здесь.',
      initializeRequired: 'Codex установлен. Нажмите кнопку ниже, чтобы включить помощника.',
      accountRequired: 'Сначала выберите доступный аккаунт в Codex.',
      accountChanged: 'Аккаунт Codex изменился. Отправьте вопрос ещё раз.',
      invalidRequest: 'Вопрос слишком длинный. Сократите его.', busy: 'Другой ответ ещё готовится. Попробуйте позже.',
      unavailable: 'Настройки временно недоступны. Попробуйте снова.',
      answerFailed: 'Ответ не получен. Проверьте аккаунт Codex и подключение, затем повторите попытку.',
    },
  },
};

export function helpCopy(language: Language) { return copies[language]; }
export type { HelpCopy };
