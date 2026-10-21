/** Messages produced on the desktop host and shown by remote clients. */
export const remoteHostMessagesEnglish: Readonly<Record<string, string>> = {
  // Remote assistance
  '请输入有效的邮箱地址。': 'Enter a valid email address.',
  // Remote chat: composer, files and previews
  '部分插件暂未加载，可继续选择已有内容。': 'Some plugins haven’t loaded yet. You can still choose from what’s available.',
  '请先选择一个对话。': 'Select a chat first.',
  '请选择有效的文件操作。': 'Choose a valid file action.',
  '预览较多，请先关闭一个再试。': 'Too many previews are open. Close one and try again.',
  '请选择可用账户。': 'Choose an available account.',
  // Remote chat: Codex CLI updates
  '远程 Codex 正在更新，请稍候。': 'Codex is updating. Please wait.',
  '版本信息无效，请重新检查版本。': 'Invalid version info. Check for updates again.',
  '请更新远程电脑上的 Remote AI 后重试。': 'Update Remote AI on the remote computer and try again.',
  // Remote chat: images
  '图片请求无效，请重试。': 'Invalid image request. Try again.',
  '图片请求已失效，请重试。': 'The image request expired. Try again.',
  // Remote chat: mapped web pages
  '网页连接无效，请重新打开。': 'Invalid page connection. Reopen the page.',
  '网页连接已关闭。': 'The page connection was closed.',
  '网页连接已变更，请重新连接电脑。': 'The page connection changed. Reconnect to the computer.',
  '网页连接暂不可用，请重试。': 'The page connection is unavailable right now. Try again.',
  // Remote chat: requests, projects and queued messages
  '电脑暂时无法处理请求，请稍后重试。': 'The computer can’t process the request right now. Try again later.',
  '审批请求已失效，请刷新对话。': 'This approval request has expired. Refresh the chat.',
  '电脑暂未就绪，请稍后重试。': 'The computer isn’t ready yet. Try again later.',
  '技能内容无效，请重新选择。': 'The selected skills are invalid. Select them again.',
  '消息已不可用，请刷新聊天。': 'This message is no longer available. Refresh the chat.',
  '消息内容无效，请检查后重试。': 'Invalid message content. Check it and try again.',
  '这条消息已开始发送或已被移除。': 'This message is already being sent or was removed.',
  '待发送消息已满，请稍后再添加。': 'The message queue is full. Add the message later.',
  '保存结果尚未确认，请先检查电脑上的待发送消息。':
    'Saving hasn’t been confirmed. Check the queued messages on the computer first.',
  // Remote chat: terminals
  '请选择有效的项目目录。': 'Choose a valid project folder.',
  '终端已关闭，请新建终端。': 'This terminal was closed. Open a new terminal.',
  '终端已结束，请新建终端。': 'This terminal has ended. Open a new terminal.',
  '当前版本暂不支持此终端操作。': 'This version doesn’t support this terminal action yet.',
  '无法读取终端，请重新打开。': 'Unable to read the terminal. Reopen it.',
  // Remote chat: token summary
  '请选择 1 至 52 周。': 'Choose between 1 and 52 weeks.',
  // Remote desktop
  '暂时无法读取屏幕画面。': 'Unable to capture the screen right now.',
  '桌面连接信息无效。': 'Invalid desktop connection details.',
  '远程操作无效，请重试。': 'Invalid remote action. Try again.',
  '不支持的远程桌面操作。': 'Unsupported remote desktop action.',
  '这台电脑未允许此远程操作，请在电脑的设置中调整。':
    'This computer doesn’t allow this remote action. Change this in the computer’s settings.',
  // Remote app updates
  '请先检查更新，再确认要安装的版本。': 'Check for updates first, then confirm the version to install.',
};

export const remoteHostMessagesRussian: Readonly<Record<string, string>> = {
  // Remote assistance
  '请输入有效的邮箱地址。': 'Введите корректный адрес электронной почты.',
  // Remote chat: composer, files and previews
  '部分插件暂未加载，可继续选择已有内容。': 'Некоторые плагины ещё не загружены. Можно выбрать из уже доступных.',
  '请先选择一个对话。': 'Сначала выберите чат.',
  '请选择有效的文件操作。': 'Выберите допустимое действие с файлом.',
  '预览较多，请先关闭一个再试。': 'Открыто слишком много окон просмотра. Закройте одно и повторите попытку.',
  '请选择可用账户。': 'Выберите доступный аккаунт.',
  // Remote chat: Codex CLI updates
  '远程 Codex 正在更新，请稍候。': 'Идёт обновление Codex. Подождите.',
  '版本信息无效，请重新检查版本。': 'Неверные сведения о версии. Проверьте версию ещё раз.',
  '请更新远程电脑上的 Remote AI 后重试。': 'Обновите Remote AI на удалённом компьютере и повторите попытку.',
  // Remote chat: images
  '图片请求无效，请重试。': 'Неверный запрос изображения. Повторите попытку.',
  '图片请求已失效，请重试。': 'Запрос изображения устарел. Повторите попытку.',
  // Remote chat: mapped web pages
  '网页连接无效，请重新打开。': 'Неверное подключение к веб-странице. Откройте страницу заново.',
  '网页连接已关闭。': 'Подключение к веб-странице закрыто.',
  '网页连接已变更，请重新连接电脑。': 'Подключение к веб-странице изменилось. Подключитесь к компьютеру заново.',
  '网页连接暂不可用，请重试。': 'Подключение к веб-странице сейчас недоступно. Повторите попытку.',
  // Remote chat: requests, projects and queued messages
  '电脑暂时无法处理请求，请稍后重试。': 'Компьютер сейчас не может обработать запрос. Повторите попытку позже.',
  '审批请求已失效，请刷新对话。': 'Запрос на подтверждение устарел. Обновите чат.',
  '电脑暂未就绪，请稍后重试。': 'Компьютер ещё не готов. Повторите попытку позже.',
  '技能内容无效，请重新选择。': 'Выбранные навыки недопустимы. Выберите их заново.',
  '消息已不可用，请刷新聊天。': 'Сообщение больше недоступно. Обновите чат.',
  '消息内容无效，请检查后重试。': 'Недопустимое содержимое сообщения. Проверьте его и повторите попытку.',
  '这条消息已开始发送或已被移除。': 'Это сообщение уже отправляется или удалено.',
  '待发送消息已满，请稍后再添加。': 'Очередь сообщений заполнена. Добавьте сообщение позже.',
  '保存结果尚未确认，请先检查电脑上的待发送消息。':
    'Сохранение ещё не подтверждено. Сначала проверьте сообщения в очереди на компьютере.',
  // Remote chat: terminals
  '请选择有效的项目目录。': 'Выберите допустимую папку проекта.',
  '终端已关闭，请新建终端。': 'Терминал закрыт. Откройте новый терминал.',
  '终端已结束，请新建终端。': 'Терминал завершил работу. Откройте новый терминал.',
  '当前版本暂不支持此终端操作。': 'Текущая версия пока не поддерживает это действие с терминалом.',
  '无法读取终端，请重新打开。': 'Не удалось получить вывод терминала. Откройте терминал заново.',
  // Remote chat: token summary
  '请选择 1 至 52 周。': 'Выберите период от 1 до 52 недель.',
  // Remote desktop
  '暂时无法读取屏幕画面。': 'Сейчас не удаётся получить изображение экрана.',
  '桌面连接信息无效。': 'Неверные данные подключения к рабочему столу.',
  '远程操作无效，请重试。': 'Недопустимое удалённое действие. Повторите попытку.',
  '不支持的远程桌面操作。': 'Это действие на удалённом рабочем столе не поддерживается.',
  '这台电脑未允许此远程操作，请在电脑的设置中调整。':
    'На этом компьютере не разрешено это удалённое действие. Измените настройки на компьютере.',
  // Remote app updates
  '请先检查更新，再确认要安装的版本。': 'Сначала проверьте наличие обновлений, затем подтвердите версию для установки.',
};
