import type { Language } from '../content/types';

/** Short interface strings that are not part of the page copy in content/. */
const uiText = {
  homeTitle: {
    zh: 'Remote AI — 开源 Codex 图形化 AI 编程工作台',
    en: 'Remote AI — Open-source graphical AI coding workspace for Codex',
    ru: 'Remote AI — графическая рабочая область с открытым кодом для программирования с ИИ в Codex',
  },
  featureGuide: { zh: '功能详解', en: 'Feature guide', ru: 'обзор функции' },
  notFoundDescription: { zh: '页面不存在。', en: 'Page not found.', ru: 'Страница не найдена.' },
  socialImageAlt: {
    zh: 'Remote AI 的 Codex GUI 工作区',
    en: 'The Remote AI Codex GUI workspace',
    ru: 'Рабочая область Codex GUI в Remote AI',
  },
  notFoundTitle: { zh: '这一页，暂时找不到。', en: 'This page could not be found.', ru: 'Страница не найдена.' },
  returnHome: { zh: '返回首页', en: 'Return home', ru: 'Вернуться на главную' },
  mainNavigation: { zh: '主导航', en: 'Main navigation', ru: 'Основная навигация' },
  mobileNavigation: { zh: '移动导航', en: 'Mobile navigation', ru: 'Мобильная навигация' },
  languageSwitch: { zh: '语言', en: 'Language', ru: 'Язык' },
  themeToWhite: { zh: '切换纯白主题', en: 'Switch to white theme', ru: 'Включить светлую тему' },
  themeToDark: { zh: '切换深色主题', en: 'Switch to dark theme', ru: 'Включить тёмную тему' },
  heroFacts: { zh: '平台与协议', en: 'Platforms and license', ru: 'Платформы и лицензия' },
  heroDesktop: { zh: '桌面端', en: 'Desktop', ru: 'Для компьютера' },
  heroOpenSource: {
    zh: '开源，自由探索',
    en: 'Open source. Yours to explore.',
    ru: 'Открытый код. Изучайте свободно.',
  },
  showcaseTabs: { zh: '产品演示', en: 'Product preview', ru: 'Обзор продукта' },
  stories: { zh: '完整工作流', en: 'Your connected workflow', ru: 'Единый рабочий процесс' },
  storyLink: { zh: '深入了解 {title}', en: 'Explore {title}', ru: 'Подробнее: {title}' },
  openCodeTitle: {
    zh: '开放的代码，一起创造更多。',
    en: 'Open code. Shared possibilities.',
    ru: 'Открытый код. Создаём больше вместе.',
  },
  openCodeBody: {
    zh: '查看源码，提交反馈，或一起完善下一个版本。',
    en: 'Read the source, share feedback, or help shape the next release.',
    ru: 'Изучайте исходный код, делитесь отзывами и помогайте готовить следующий выпуск.',
  },
  connectionArt: {
    zh: '电脑运行项目，浏览器与手机连接同一工作区的示意图',
    en: 'A host computer connected to browser and mobile workspaces',
    ru: 'Схема: проект работает на компьютере, браузер и телефон подключены к одной рабочей области',
  },
  connectionRunning: { zh: '项目在电脑上运行', en: 'Running on your computer', ru: 'Проект работает на компьютере' },
  connectionBrowser: { zh: '浏览器', en: 'Browser', ru: 'Браузер' },
  connectionMobile: { zh: '移动端', en: 'Mobile', ru: 'Телефон' },
  connectionCaption: {
    zh: '一个工作区，多种连接方式',
    en: 'One workspace. More ways in.',
    ru: 'Одна рабочая область — разные способы подключения',
  },
  computerGoal: { zh: '描述目标', en: 'Describe a goal', ru: 'Постановка цели' },
  computerOperate: { zh: '查看与操作应用', en: 'Inspect & operate', ru: 'Работа с приложением' },
  computerCheck: { zh: '检查实际结果', en: 'Check the result', ru: 'Проверка результата' },
  computerCaption: {
    zh: '清晰的目标 · 可见的过程 · 可核对的结果',
    en: 'A clear goal. Visible actions. Verifiable results.',
    ru: 'Понятная цель. Видимые действия. Проверяемый результат.',
  },
} satisfies Record<string, Record<Language, string>>;

export type UiTextKey = keyof typeof uiText;

/** Returns the interface string for the page language, filling `{name}` placeholders once. */
export function ui(language: Language, key: UiTextKey, values: Record<string, string> = {}) {
  return uiText[key][language].replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}

/** Switcher labels. `EN` is also what the end-to-end tests look for. */
export const languageLabels: Record<Language, string> = { zh: '中文', en: 'EN', ru: 'RU' };
/** Language names in their own language, used as switcher tooltips. */
export const languageNames: Record<Language, string> = { zh: '中文', en: 'English', ru: 'Русский' };
