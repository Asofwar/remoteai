const messages: Record<string, [string, string]> = {
  '暂时无法同步 Git 设置，请稍后重试。': [
    'Could not sync Git settings. Please try again shortly.',
    'Сейчас не удаётся синхронизировать настройки Git. Повторите попытку позже.',
  ],
  '自动生成提交说明': ['Generate commit message automatically', 'Создавать сообщение коммита автоматически'],
  '填写提交说明，或按 Tab 用 AI 生成': [
    'Write a commit message, or press Tab to generate with AI',
    'Введите сообщение коммита или нажмите Tab, чтобы создать его с ИИ',
  ],
  '填写提交说明，或点 AI 生成': [
    'Write a commit message, or tap Generate with AI',
    'Введите сообщение коммита или нажмите «Создать с ИИ»',
  ],
  '提交时根据所选文件自动生成说明': [
    'Generate a message from selected files when committing',
    'Сообщение будет создано по выбранным файлам при коммите',
  ],
  'AI 生成': ['Generate with AI', 'Создать с ИИ'],
  '正在生成提交说明…': ['Generating commit message…', 'Создание сообщения коммита…'],
  '未能生成提交说明，请重试或手动填写。': [
    'Could not generate a commit message. Try again or write one yourself.',
    'Не удалось создать сообщение коммита. Повторите попытку или введите его вручную.',
  ],
  '请先在 Codex GUI 中选择可用的 AI 账户。': [
    'Choose an available AI account in Codex GUI first.',
    'Сначала выберите доступный аккаунт ИИ в Codex GUI.',
  ],
  '所选文件过多，请减少选择后再生成提交说明。': [
    'Too many files selected. Select fewer files and generate again.',
    'Выбрано слишком много файлов. Выберите меньше файлов и создайте сообщение снова.',
  ],
  'Git 提交说明': ['Git commit message', 'Сообщение коммита Git'],
};

export const gitMessageEnglish = Object.fromEntries(Object.entries(messages).map(([key, values]) => [key, values[0]]));
export const gitMessageRussian = Object.fromEntries(Object.entries(messages).map(([key, values]) => [key, values[1]]));
