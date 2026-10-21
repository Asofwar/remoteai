/** Messages returned by the cloud service and shown in the apps. */
export const cloudEnglish: Readonly<Record<string, string>> = {
  // Help assistant settings and default suggested questions
  '助手设置暂时不可用，请稍后重试。': 'Assistant settings are temporarily unavailable. Try again later.',
  '助手尚未配置，请联系管理员。': 'The assistant is not set up yet. Contact your administrator.',
  '如何选择 Codex 使用的账户？': 'How do I choose the account Codex uses?',
  '手机为什么连接不上电脑？': 'Why can’t my phone connect to my computer?',
  '自动切换账户怎么设置？': 'How do I set up automatic account switching?',
  // Cloud account usage and reset credits
  '该账号的登录凭据已失效，请在桌面端重新登录': 'The sign-in credentials for this account are no longer valid. Sign in again in the desktop app',
  '当前账号没有可用的 Codex 登录凭据': 'This account has no valid Codex credentials',
  '无法连接 Codex 服务': 'Could not connect to the Codex service',
  '无法连接 Codex 登录服务刷新账号凭据': 'Could not connect to the Codex sign-in service to refresh the account credentials',
  '解析账号凭据刷新响应失败': 'Could not read the credential refresh response',
  '账号凭据刷新响应缺少 access_token': 'The credential refresh response is missing access_token',
  'Codex 用量接口返回 HTTP {value1}': 'The Codex usage API returned HTTP {value1}',
  '解析 Codex 用量响应失败': 'Could not read the Codex usage response',
  'Codex 重置卡接口返回 HTTP {value1}': 'The Codex reset credits API returned HTTP {value1}',
  '解析重置卡响应失败': 'Could not read the reset credits response',
  '重置卡接口响应缺少 credits 列表': 'The reset credits API response is missing the credits list',
  'Codex 重置卡使用接口返回 HTTP {value1}': 'The Codex reset credit API returned HTTP {value1} when using a credit',
  '解析重置卡使用响应失败': 'Could not read the reset credit result',
  'Codex 重置卡使用接口响应缺少 code': 'Codex did not return a reset status',
  'Codex 重置卡使用接口返回未知状态：{value1}': 'Unknown reset status from Codex: {value1}',
  // Full parse errors: the service appends a fixed suffix to each context above.
  '解析账号凭据刷新响应失败：响应不是有效 JSON': 'Could not read the credential refresh response: the response is not valid JSON',
  '解析账号凭据刷新响应失败：响应格式无效': 'Could not read the credential refresh response: invalid response format',
  '解析 Codex 用量响应失败：响应不是有效 JSON': 'Could not read the Codex usage response: the response is not valid JSON',
  '解析 Codex 用量响应失败：响应格式无效': 'Could not read the Codex usage response: invalid response format',
  '解析重置卡响应失败：响应不是有效 JSON': 'Could not read the reset credits response: the response is not valid JSON',
  '解析重置卡响应失败：响应格式无效': 'Could not read the reset credits response: invalid response format',
  '解析重置卡使用响应失败：响应不是有效 JSON': 'Could not read the reset credit result: the response is not valid JSON',
  '解析重置卡使用响应失败：响应格式无效': 'Could not read the reset credit result: invalid response format',
  // Remote assistance invitations
  '暂时无法发送邀请，请稍后再试。': 'Invitations cannot be sent right now. Try again later.',
  '请选择有效的协助操作。': 'Choose a valid assistance action.',
  // Remote commands
  '命令请求无效，请检查后重试。': 'Invalid command request. Check it and try again.',
  '请在目标电脑安装并启用远程命令插件。': 'Install and enable the remote command plugin on the selected computer.',
  '电脑正在执行另一条远程命令，请稍后重试。': 'The computer is running another remote command. Try again later.',
  '远程命令未完成，请检查目标电脑。': 'The remote command did not finish. Check the selected computer.',
  '命令结果无法读取，请缩小查询范围后重试。': 'Could not read the command output. Narrow the query and try again.',
  '等待结果超时，命令可能已执行。请先检查状态，再决定是否重试。':
    'Timed out waiting for the result. The command may have already run. Check the status before you decide whether to retry.',
  '连接已断开，命令可能已执行。请重新连接并检查状态。':
    'Disconnected. The command may have already run. Reconnect and check the status.',
  // Commands sent to another computer
  '请先更新目标 PC 上的 Remote AI': 'Update Remote AI on the selected computer first',
  '请先在目标 PC 上启动本地代理': 'Start the local proxy on the selected computer first',
};

export const cloudRussian: Readonly<Record<string, string>> = {
  // Help assistant settings and default suggested questions
  '助手设置暂时不可用，请稍后重试。': 'Настройки помощника временно недоступны. Повторите попытку позже.',
  '助手尚未配置，请联系管理员。': 'Помощник ещё не настроен. Обратитесь к администратору.',
  '如何选择 Codex 使用的账户？': 'Как выбрать аккаунт Codex?',
  '手机为什么连接不上电脑？': 'Почему телефон не подключается?',
  '自动切换账户怎么设置？': 'Как настроить автоматическую смену аккаунта?',
  // Cloud account usage and reset credits
  '该账号的登录凭据已失效，请在桌面端重新登录': 'Учётные данные этого аккаунта недействительны. Снова войдите в аккаунт в приложении для компьютера',
  '当前账号没有可用的 Codex 登录凭据': 'У этого аккаунта нет действительных учётных данных Codex',
  '无法连接 Codex 服务': 'Не удалось подключиться к сервису Codex',
  '无法连接 Codex 登录服务刷新账号凭据': 'Не удалось подключиться к сервису входа Codex, чтобы обновить учётные данные аккаунта',
  '解析账号凭据刷新响应失败': 'Не удалось прочитать ответ на обновление учётных данных',
  '账号凭据刷新响应缺少 access_token': 'В ответе на обновление учётных данных нет access_token',
  'Codex 用量接口返回 HTTP {value1}': 'API расхода Codex вернул HTTP {value1}',
  '解析 Codex 用量响应失败': 'Не удалось прочитать ответ о расходе Codex',
  'Codex 重置卡接口返回 HTTP {value1}': 'API карт сброса лимита Codex вернул HTTP {value1}',
  '解析重置卡响应失败': 'Не удалось прочитать ответ со списком карт сброса лимита',
  '重置卡接口响应缺少 credits 列表': 'В ответе API карт сброса лимита нет списка credits',
  'Codex 重置卡使用接口返回 HTTP {value1}': 'API карт сброса лимита Codex вернул HTTP {value1} при использовании карты',
  '解析重置卡使用响应失败': 'Не удалось прочитать результат использования карты сброса лимита',
  'Codex 重置卡使用接口响应缺少 code': 'Codex не вернул статус сброса лимита',
  'Codex 重置卡使用接口返回未知状态：{value1}': 'Неизвестный статус сброса лимита от Codex: {value1}',
  // Full parse errors: the service appends a fixed suffix to each context above.
  '解析账号凭据刷新响应失败：响应不是有效 JSON': 'Не удалось прочитать ответ на обновление учётных данных: ответ содержит неверный JSON',
  '解析账号凭据刷新响应失败：响应格式无效': 'Не удалось прочитать ответ на обновление учётных данных: неверный формат ответа',
  '解析 Codex 用量响应失败：响应不是有效 JSON': 'Не удалось прочитать ответ о расходе Codex: ответ содержит неверный JSON',
  '解析 Codex 用量响应失败：响应格式无效': 'Не удалось прочитать ответ о расходе Codex: неверный формат ответа',
  '解析重置卡响应失败：响应不是有效 JSON': 'Не удалось прочитать ответ со списком карт сброса лимита: ответ содержит неверный JSON',
  '解析重置卡响应失败：响应格式无效': 'Не удалось прочитать ответ со списком карт сброса лимита: неверный формат ответа',
  '解析重置卡使用响应失败：响应不是有效 JSON': 'Не удалось прочитать результат использования карты сброса лимита: ответ содержит неверный JSON',
  '解析重置卡使用响应失败：响应格式无效': 'Не удалось прочитать результат использования карты сброса лимита: неверный формат ответа',
  // Remote assistance invitations
  '暂时无法发送邀请，请稍后再试。': 'Сейчас не удаётся отправить приглашение. Повторите попытку позже.',
  '请选择有效的协助操作。': 'Выберите допустимое действие удалённой помощи.',
  // Remote commands
  '命令请求无效，请检查后重试。': 'Неверный запрос команды. Проверьте его и повторите попытку.',
  '请在目标电脑安装并启用远程命令插件。': 'Установите и включите плагин удалённых команд на выбранном компьютере.',
  '电脑正在执行另一条远程命令，请稍后重试。': 'Компьютер выполняет другую удалённую команду. Повторите попытку позже.',
  '远程命令未完成，请检查目标电脑。': 'Не удалось выполнить удалённую команду. Проверьте выбранный компьютер.',
  '命令结果无法读取，请缩小查询范围后重试。': 'Не удалось прочитать результат команды. Сузьте запрос и повторите попытку.',
  '等待结果超时，命令可能已执行。请先检查状态，再决定是否重试。':
    'Время ожидания результата истекло. Команда могла уже выполниться. Сначала проверьте состояние, затем решите, нужно ли повторять её.',
  '连接已断开，命令可能已执行。请重新连接并检查状态。':
    'Соединение разорвано. Команда могла уже выполниться. Подключитесь снова и проверьте состояние.',
  // Commands sent to another computer
  '请先更新目标 PC 上的 Remote AI': 'Сначала обновите Remote AI на выбранном компьютере',
  '请先在目标 PC 上启动本地代理': 'Сначала запустите локальный прокси на выбранном компьютере',
};
