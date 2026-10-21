export const guiSettingsEnglish: Readonly<Record<string, string>> = {
  '上下文': 'Context',
  '模型默认上下文': 'Default context by model',
  '刷新默认值': 'Refresh defaults',
  '官方模型默认使用管理后台的容量，其他模型跟随供应商设置。当前对话的单独设置优先。':
    'Official models use admin defaults; other models use provider settings. Conversation settings take priority.',
  '修改会自动保存，在下次发送消息或打开对话时应用，不影响正在回复的任务。':
    'Changes save automatically and apply when you next send or open a conversation. Active tasks continue.',
  '暂时无法更新默认值，已保留上次的设置。可稍后重试。':
    'Defaults could not be refreshed. Previous settings are retained. Try again later.',
  '暂时无法读取模型上下文设置，请重试。': 'Unable to load model context settings. Please retry.',
  '模型上下文设置未保存，请重试。': 'Model context settings were not saved. Please retry.',
  '默认：{value1}K': 'Default: {value1}K',
  '默认：跟随模型': 'Default: use model capacity',
  '{value1} 上下文容量': '{value1} context capacity',
  '添加模型名称': 'Model name to add',
  '输入模型名称': 'Enter a model name',
  '新模型上下文容量': 'New model context capacity',
  '容量': 'Capacity',
  '1 K = 1000 Token；可用容量会扣除预留空间。': '1 K = 1000 tokens. Available capacity excludes reserved space.',
  '账号设置有未保存的更改': 'Account settings have unsaved changes',
  '账号设置修改后，点击保存生效': 'Click Save to apply account changes',
  '此页修改会自动保存': 'Changes on this page save automatically',
  '当前账号额度用完时，自动换到可用账号。': 'Switch to an available account when the current quota runs out.',
  '主额度低于此比例时切换；账号单独设置更高时，以较高值为准。':
    'Switch below this remaining quota. A higher account threshold takes priority.',
  '在需要时自动切换，让对话少些中断。': 'Switch accounts when needed for fewer interruptions.',
};

export const guiSettingsRussian: Readonly<Record<string, string>> = {
  '上下文': 'Контекст',
  '模型默认上下文': 'Контекст моделей по умолчанию',
  '刷新默认值': 'Обновить значения по умолчанию',
  '官方模型默认使用管理后台的容量，其他模型跟随供应商设置。当前对话的单独设置优先。':
    'Официальные модели по умолчанию используют ёмкость из панели администратора, остальные — настройки '
      + 'провайдера. Отдельная настройка текущего чата имеет приоритет.',
  '修改会自动保存，在下次发送消息或打开对话时应用，不影响正在回复的任务。':
    'Изменения сохраняются автоматически и применяются при следующей отправке сообщения '
      + 'или открытии чата. Ответы, которые уже формируются, не затрагиваются.',
  '暂时无法更新默认值，已保留上次的设置。可稍后重试。':
    'Не удалось обновить значения по умолчанию. Предыдущие настройки сохранены. Повторите попытку позже.',
  '暂时无法读取模型上下文设置，请重试。': 'Не удалось загрузить настройки контекста. Повторите попытку.',
  '模型上下文设置未保存，请重试。': 'Настройки контекста не сохранены. Повторите попытку.',
  '默认：{value1}K': 'По умолчанию: {value1}K',
  '默认：跟随模型': 'По умолчанию: ёмкость модели',
  '{value1} 上下文容量': 'Ёмкость контекста для {value1}',
  '添加模型名称': 'Название новой модели',
  '输入模型名称': 'Введите название модели',
  '新模型上下文容量': 'Ёмкость контекста новой модели',
  '容量': 'Ёмкость',
  '1 K = 1000 Token；可用容量会扣除预留空间。': '1 K = 1000 токенов. Доступная ёмкость не включает резерв.',
  '账号设置有未保存的更改': 'В настройках аккаунтов есть несохранённые изменения',
  '账号设置修改后，点击保存生效': 'Нажмите «Сохранить», чтобы применить настройки аккаунтов',
  '此页修改会自动保存': 'Изменения на этой странице сохраняются автоматически',
  '当前账号额度用完时，自动换到可用账号。':
    'Автоматически переключаться на доступный аккаунт, когда лимит текущего аккаунта исчерпан.',
  '主额度低于此比例时切换；账号单独设置更高时，以较高值为准。':
    'Переключаться, когда остаток основного лимита ниже этого значения. Если у аккаунта порог выше, действует он.',
  '在需要时自动切换，让对话少些中断。': 'Переключать аккаунты автоматически, чтобы чаты реже прерывались.',
};
