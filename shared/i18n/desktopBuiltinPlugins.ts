/** Computer Use, remote command and Codex CLI plugin cards. */
export const desktopBuiltinPluginsEnglish: Readonly<Record<string, string>> = {
  // Card status labels (正在检查…, 已停用, 内置插件, 停用) live in desktopChromePlugin.ts and the
  // permission names (辅助功能, 屏幕录制, 开启…, 去开启) in desktopMacPermissions.ts.
  // Computer Use card.
  '支持 Windows 64 位和 macOS 13 及以上系统': 'Requires 64-bit Windows or macOS 13 or later',
  '安装后可在 Codex GUI 中使用': 'Available in Codex GUI once installed',
  '安装需要修复': 'Installation needs repair',
  '已安装 · 请开启桌面操作权限': 'Installed · Allow desktop control permissions',
  '已启用 · 可在对话中使用': 'Enabled · Ready to use in chats',
  'Computer Use 电脑助手': 'Computer Use assistant',
  '让 Codex 查看屏幕、点击、输入和操作 Windows 或 Mac 应用，完成你交代的桌面任务。':
    'Lets Codex see the screen, click, type, and work with Windows or Mac apps to complete the desktop tasks you give it.',
  '修复': 'Repair',
  '卸载这个目录中的电脑助手？': 'Uninstall Computer Use from this folder?',
  '其他目录中的安装不受影响。': 'Installations in other folders won’t be affected.',
  '正在安装，请稍候…': 'Installing, please wait…',
  '安装': 'Install',
  '重新检查': 'Check again',
  '桌面操作权限已开启': 'Desktop control permissions granted',
  '请在系统设置中为 Remote AI 开启以下权限：': 'Allow these permissions for Remote AI in System Settings:',
  '开启后请重新打开对话；若系统提示退出，请重启 Remote AI。':
    'After allowing them, reopen the chat. If the system asks you to quit, restart Remote AI.',
  // Remote command card.
  '两台电脑安装后，即可在对话中使用': 'Install on both computers to use it in chats',
  '已启用 · 可调用和接收远程命令': 'Enabled · Can send and receive remote commands',
  '已停用 · 无法调用或接收远程命令': 'Disabled · Can’t send or receive remote commands',
  '远程命令': 'Remote commands',
  '让 AI 在同账号的电脑间执行命令、排查问题，停用即可停止访问。':
    'Lets AI run commands and troubleshoot across computers signed in to the same account. Disable it to stop access.',
  '远程诊断': 'Remote diagnostics',
  '卸载远程命令插件？': 'Uninstall the remote commands plugin?',
  '卸载后，此安装将无法调用或接收远程命令。':
    'After uninstalling, this installation can’t send or receive remote commands.',
  '正在安装…': 'Installing…',
  // Codex CLI install prompts in the official plugins market.
  '安装 Codex 后，即可浏览和管理官方插件。': 'Install Codex to browse and manage official plugins.',
  '版本 {value1} · 约 {value2} MB': 'Version {value1} · about {value2} MB',
  '正在安装 Codex': 'Installing Codex',
  '安装 Codex': 'Install Codex',
  '安装 Codex 后，即可浏览官方插件。': 'Install Codex to browse official plugins.',
};

export const desktopBuiltinPluginsRussian: Readonly<Record<string, string>> = {
  // Shared labels: see desktopChromePlugin.ts and desktopMacPermissions.ts.
  // Computer Use card.
  '支持 Windows 64 位和 macOS 13 及以上系统': 'Требуется 64-разрядная Windows или macOS 13 и новее',
  '安装后可在 Codex GUI 中使用': 'После установки можно использовать в Codex GUI',
  '安装需要修复': 'Установка требует исправления',
  '已安装 · 请开启桌面操作权限': 'Установлено · Предоставьте разрешения на управление компьютером',
  '已启用 · 可在对话中使用': 'Включено · Можно использовать в чатах',
  'Computer Use 电脑助手': 'Компьютерный помощник Computer Use',
  '让 Codex 查看屏幕、点击、输入和操作 Windows 或 Mac 应用，完成你交代的桌面任务。':
    'Позволяет Codex видеть экран, нажимать, вводить текст и работать с приложениями Windows и Mac, '
    + 'чтобы выполнять ваши задачи на компьютере.',
  '修复': 'Исправить',
  '卸载这个目录中的电脑助手？': 'Удалить Computer Use из этой папки?',
  '其他目录中的安装不受影响。': 'Установки в других папках это не затронет.',
  '正在安装，请稍候…': 'Идёт установка…',
  '安装': 'Установить',
  '重新检查': 'Проверить снова',
  '桌面操作权限已开启': 'Разрешения на управление компьютером предоставлены',
  '请在系统设置中为 Remote AI 开启以下权限：': 'Предоставьте Remote AI эти разрешения в Системных настройках:',
  '开启后请重新打开对话；若系统提示退出，请重启 Remote AI。':
    'После этого откройте чат заново. Если система попросит закрыть приложение, перезапустите Remote AI.',
  // Remote command card.
  '两台电脑安装后，即可在对话中使用': 'Установите на оба компьютера, чтобы использовать в чатах',
  '已启用 · 可调用和接收远程命令': 'Включено · Можно отправлять и принимать удалённые команды',
  '已停用 · 无法调用或接收远程命令': 'Отключено · Отправка и приём удалённых команд недоступны',
  '远程命令': 'Удалённые команды',
  '让 AI 在同账号的电脑间执行命令、排查问题，停用即可停止访问。':
    'Позволяет ИИ выполнять команды и диагностировать проблемы на компьютерах с одним и тем же аккаунтом. '
    + 'Чтобы закрыть доступ, отключите плагин.',
  '远程诊断': 'Удалённая диагностика',
  '卸载远程命令插件？': 'Удалить плагин удалённых команд?',
  '卸载后，此安装将无法调用或接收远程命令。':
    'После удаления эта установка не сможет отправлять и принимать удалённые команды.',
  '正在安装…': 'Установка…',
  // Codex CLI install prompts in the official plugins market.
  '安装 Codex 后，即可浏览和管理官方插件。': 'Установите Codex, чтобы просматривать официальные плагины и управлять ими.',
  '版本 {value1} · 约 {value2} MB': 'Версия {value1} · около {value2} МБ',
  '正在安装 Codex': 'Установка Codex',
  '安装 Codex': 'Установить Codex',
  '安装 Codex 后，即可浏览官方插件。': 'Установите Codex, чтобы просматривать официальные плагины.',
};
