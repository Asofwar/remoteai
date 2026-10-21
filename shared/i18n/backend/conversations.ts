/** Conversation hub messages: trash, migration, import and export. */
type Copy = readonly [english: string, russian: string];

/**
 * Exact messages and `{valueN}` templates for conversation_hub Tauri results and errors.
 * Placeholders follow the order of the Rust format arguments in the Chinese source.
 * Not listed on purpose: the classification markers in home_migration_reason.rs, the
 * persisted 「（迁移）」 title suffix, the persisted 「默认实例」 name and its import-preview
 * reason (the UI shows its own status label), and errors that never reach the UI.
 * Defined elsewhere: 「部分子对话的记录不完整，请先在会话管理中恢复后再删除。」 (shared dictionary)
 * and 「无法定位应用数据目录：{value1}」 (backend/accounts.ts).
 */
const messages: Readonly<Record<string, Copy>> = {
  // Trash: restore, permanent deletion and backup files (bin*.rs).
  '请至少选择一条待恢复会话': ['Select at least one session to restore', 'Выберите хотя бы один чат для восстановления'],
  '已恢复 {value1} 条会话，跳过 {value2} 条': [
    'Restored {value1} sessions, skipped {value2}',
    'Восстановлено чатов: {value1}, пропущено: {value2}',
  ],
  '无法永久删除会话 {value1}：{value2}': [
    'Could not permanently delete session {value1}: {value2}',
    'Не удалось навсегда удалить чат {value1}: {value2}',
  ],
  '已永久删除 {value1} 条会话': ['Permanently deleted {value1} sessions', 'Удалено навсегда чатов: {value1}'],
  '请至少选择一条要永久删除的会话': [
    'Select at least one session to delete permanently',
    'Выберите хотя бы один чат, который нужно удалить навсегда',
  ],
  '会话文件不在有效的会话目录中': [
    'The session file is not in a valid sessions folder',
    'Файл чата находится вне допустимой папки чатов',
  ],
  '目标位置已有同名会话，请先处理后重试': [
    'A session with the same name already exists at the destination. Resolve it first, then try again.',
    'В папке назначения уже есть чат с таким именем. Сначала устраните конфликт, затем повторите попытку.',
  ],
  '会话目录无效': ['Invalid sessions folder', 'Недопустимая папка чатов'],
  '无法移动会话文件：{value1}': ['Could not move the session file: {value1}', 'Не удалось переместить файл чата: {value1}'],
  '会话文件在移动时发生变化，请等待会话结束后重试': [
    'The session file changed while it was being moved. Wait for the session to finish, then try again.',
    'Файл чата изменился во время перемещения. Дождитесь завершения чата и повторите попытку.',
  ],
  '{value1}；无法清理未完成的副本：{value2}': [
    '{value1}; could not clean up the incomplete copy: {value2}',
    '{value1}; не удалось удалить незавершённую копию: {value2}',
  ],
  '{value1}；部分内容未能还原，回收站备份已保留：{value2}': [
    '{value1}; some content could not be restored, and the Trash backup was kept: {value2}',
    '{value1}; часть данных не удалось восстановить, резервная копия в корзине сохранена: {value2}',
  ],
  '会话已恢复，但未能清理回收站条目：{value1}': [
    'The session was restored, but its Trash entry could not be cleaned up: {value1}',
    'Чат восстановлен, но не удалось удалить его запись из корзины: {value1}',
  ],
  '回收站中的会话路径无效': ['Invalid session path in Trash', 'Недопустимый путь чата в корзине'],
  '会话回收站暂时不可用，请重启后重试': [
    'The session Trash is temporarily unavailable. Restart the app and try again.',
    'Корзина чатов временно недоступна. Перезапустите приложение и повторите попытку.',
  ],
  '无法识别会话目录': ['Could not identify the sessions folder', 'Не удалось определить папку чатов'],
  '回收站中的会话目录备份无效': [
    'The sessions folder backup in Trash is invalid',
    'Резервная копия папки чатов в корзине некорректна',
  ],
  '回收站中的会话状态备份无效': [
    'The session state backup in Trash is invalid',
    'Резервная копия состояния чатов в корзине некорректна',
  ],
  '请先使用目标 Codex Home 启动一次 Codex，再恢复会话': [
    'Start Codex once with the destination Codex Home, then restore the sessions.',
    'Сначала один раз запустите Codex с папкой назначения Codex Home, затем восстановите чаты.',
  ],
  '目标 Codex Home 暂不支持完整恢复，请更新并启动 Codex 后重试。备份仍在回收站中': [
    'The destination Codex Home does not support a full restore yet. Update and start Codex, then try again. '
      + 'The backup is still in Trash.',
    'Папка назначения Codex Home пока не поддерживает полное восстановление. Обновите и запустите Codex, '
      + 'затем повторите попытку. Резервная копия по-прежнему в корзине.',
  ],
  'Codex 会话数据格式已变化，备份仍保留在回收站中': [
    'The Codex session data format has changed. The backup is still in Trash.',
    'Формат данных чатов Codex изменился. Резервная копия по-прежнему в корзине.',
  ],

  // Moving sessions to the trash (deletion_plan.rs, discard.rs).
  '对话暂时无法删除，请刷新后重试。': [
    'The conversation cannot be deleted right now. Refresh and try again.',
    'Сейчас не удаётся удалить чат. Обновите список и повторите попытку.',
  ],
  '已将 {value1} 条对话移入回收站': ['Moved {value1} conversations to Trash', 'Чатов перемещено в корзину: {value1}'],
  '请至少选择一条会话': ['Select at least one session', 'Выберите хотя бы один чат'],
  '所选会话已不存在': ['The selected sessions no longer exist', 'Выбранные чаты больше не существуют'],
  '无法创建会话回收站：{value1}': ['Could not create the session Trash: {value1}', 'Не удалось создать корзину чатов: {value1}'],
  '已将 {value1} 条会话移到回收站，其余会话未完成：{value2}': [
    'Moved {value1} sessions to Trash. The remaining sessions were not moved: {value2}',
    'Чатов перемещено в корзину: {value1}. Остальные чаты не перемещены: {value2}',
  ],
  '已将 {value1} 条会话移到回收站': ['Moved {value1} sessions to Trash', 'Чатов перемещено в корзину: {value1}'],
  '无法读取会话回收站：{value1}': ['Could not read the session Trash: {value1}', 'Не удалось прочитать корзину чатов: {value1}'],
  '回收站清单损坏 {value1}：{value2}': [
    'Corrupted Trash manifest {value1}: {value2}',
    'Повреждён манифест корзины {value1}: {value2}',
  ],

  // Reading and searching session files (discovery.rs).
  '无法打开会话文件 {value1}：{value2}': [
    'Could not open session file {value1}: {value2}',
    'Не удалось открыть файл чата {value1}: {value2}',
  ],
  '无法解压会话文件 {value1}：{value2}': [
    'Could not decompress session file {value1}: {value2}',
    'Не удалось распаковать файл чата {value1}: {value2}',
  ],
  '无法读取会话目录 {value1}：{value2}': [
    'Could not read sessions folder {value1}: {value2}',
    'Не удалось прочитать папку чатов {value1}: {value2}',
  ],
  '无法读取会话目录项：{value1}': [
    'Could not read a sessions folder entry: {value1}',
    'Не удалось прочитать элемент папки чатов: {value1}',
  ],
  '无法读取会话文件 {value1}：{value2}': [
    'Could not read session file {value1}: {value2}',
    'Не удалось прочитать файл чата {value1}: {value2}',
  ],
  '无法搜索会话文件 {value1}：{value2}': [
    'Could not search session file {value1}: {value2}',
    'Не удалось выполнить поиск в файле чата {value1}: {value2}',
  ],

  // Migration between Codex Home folders: result and selection errors (home_migration.rs).
  '请选择不同的 Codex Home': ['Choose a different Codex Home', 'Выберите другую папку Codex Home'],
  '已迁移 {value1} 条会话（含 {value2} 条关联会话），跳过 {value3} 条所选会话': [
    'Migrated {value1} sessions (including {value2} related sessions), skipped {value3} selected sessions',
    'Перенесено чатов: {value1} (из них связанных: {value2}). Пропущено выбранных чатов: {value3}',
  ],

  // Copying sessions to the current account (migration.rs).
  '无法读取会话文件：{value1}': ['Could not read the session file: {value1}', 'Не удалось прочитать файл чата: {value1}'],
  '会话文件包含无效 JSON：{value1}': [
    'The session file contains invalid JSON: {value1}',
    'Файл чата содержит некорректный JSON: {value1}',
  ],
  '序列化会话失败：{value1}': ['Could not serialize the session: {value1}', 'Не удалось сериализовать чат: {value1}'],
  '无法创建会话目录：{value1}': ['Could not create the sessions folder: {value1}', 'Не удалось создать папку чатов: {value1}'],
  '请至少选择一条要迁移的会话': ['Select at least one session to migrate', 'Выберите хотя бы один чат для переноса'],
  '账户切换锁不可用': ['The account switch lock is unavailable', 'Блокировка переключения аккаунтов недоступна'],
  '请先启用一个当前账户': ['Enable a current account first','Сначала активируйте текущий аккаунт'],
  '会话迁移完成，但无法重新启动 ChatGPT/Codex：{value1}': [
    'Sessions were migrated, but ChatGPT/Codex could not be restarted: {value1}',
    'Чаты перенесены, но не удалось перезапустить ChatGPT/Codex: {value1}',
  ],
  '会话迁移失败：{value1}；重新启动 ChatGPT/Codex 也失败：{value2}': [
    'Session migration failed: {value1}; restarting ChatGPT/Codex also failed: {value2}',
    'Не удалось перенести чаты: {value1}; перезапустить ChatGPT/Codex тоже не удалось: {value2}',
  ],
  '已将 {value1} 条会话复制到当前账户，跳过 {value2} 条': [
    'Copied {value1} sessions to the current account, skipped {value2}',
    'Чатов скопировано в текущий аккаунт: {value1}, пропущено: {value2}',
  ],

  // Codex state database and session index (state_restore.rs, state_storage.rs, thread_titles.rs).
  '无法打开 Codex state DB：{value1}': [
    'Could not open the Codex state DB: {value1}',
    'Не удалось открыть базу состояния Codex: {value1}',
  ],
  '无法恢复 Codex 会话索引：{value1}': [
    'Could not restore the Codex session index: {value1}',
    'Не удалось восстановить индекс чатов Codex: {value1}',
  ],
  '会话包包含不支持的 Codex 状态表': [
    'The session package contains an unsupported Codex state table',
    'Архив чатов содержит неподдерживаемую таблицу состояния Codex',
  ],
  '无法打开 Codex 数据库 {value1}：{value2}': [
    'Could not open Codex database {value1}: {value2}',
    'Не удалось открыть базу данных Codex {value1}: {value2}',
  ],
  '会话包包含无关的分叉关系': [
    'The session package contains unrelated fork links',
    'Архив чатов содержит посторонние связи ответвлений',
  ],
  '无法恢复 Codex 状态表 {value1}：{value2}': [
    'Could not restore Codex state table {value1}: {value2}',
    'Не удалось восстановить таблицу состояния Codex {value1}: {value2}',
  ],
  '无法恢复 Codex 会话状态：{value1}': [
    'Could not restore the Codex session state: {value1}',
    'Не удалось восстановить состояние чатов Codex: {value1}',
  ],
  '会话 {value1} 仍被会话 {value2} 引用，请同时选择相关会话后再移入回收站': [
    'Session {value1} is still referenced by session {value2}. Select the related sessions too, then move them to Trash.',
    'На чат {value1} по-прежнему ссылается чат {value2}. Выберите и связанные чаты, затем переместите их в корзину.',
  ],
  '会话 {value1} 仍有未选择的子会话 {value2}，请同时选择后再移入回收站': [
    'Session {value1} still has an unselected child session {value2}. Select it too, then move them to Trash.',
    'У чата {value1} есть невыбранный дочерний чат {value2}. Выберите и его, затем переместите чаты в корзину.',
  ],
  '无法读取会话索引 {value1}：{value2}': [
    'Could not read session index {value1}: {value2}',
    'Не удалось прочитать индекс чатов {value1}: {value2}',
  ],
  '无法读取 Codex 会话表结构：{value1}': [
    'Could not read the Codex session table schema: {value1}',
    'Не удалось прочитать структуру таблицы чатов Codex: {value1}',
  ],
  '无法读取 Codex 会话表字段：{value1}': [
    'Could not read the Codex session table columns: {value1}',
    'Не удалось прочитать столбцы таблицы чатов Codex: {value1}',
  ],
  '无法解析 Codex 会话表字段：{value1}': [
    'Could not parse the Codex session table columns: {value1}',
    'Не удалось разобрать столбцы таблицы чатов Codex: {value1}',
  ],
  '无法打开 Codex 会话数据库 {value1}：{value2}': [
    'Could not open Codex session database {value1}: {value2}',
    'Не удалось открыть базу данных чатов Codex {value1}: {value2}',
  ],
  '无法读取 Codex 会话数据库 {value1}：{value2}': [
    'Could not read Codex session database {value1}: {value2}',
    'Не удалось прочитать базу данных чатов Codex {value1}: {value2}',
  ],
  '无法查询 Codex 会话标题：{value1}': [
    'Could not query Codex session titles: {value1}',
    'Не удалось запросить названия чатов Codex: {value1}',
  ],
  '无法读取 Codex 会话标题：{value1}': [
    'Could not read Codex session titles: {value1}',
    'Не удалось прочитать названия чатов Codex: {value1}',
  ],
  '无法解析 Codex 会话标题：{value1}': [
    'Could not parse Codex session titles: {value1}',
    'Не удалось разобрать названия чатов Codex: {value1}',
  ],

  // Session packages: export and import (transfer.rs).
  '会话 {value1} 依赖会话 {value2}，请一起选择后再导出': [
    'Session {value1} depends on session {value2}. Select both, then export.',
    'Чат {value1} зависит от чата {value2}. Выберите оба чата, затем экспортируйте.',
  ],
  '请选择导出位置': ['Choose an export location', 'Выберите место для экспорта'],
  '无法创建导出目录：{value1}': ['Could not create the export folder: {value1}', 'Не удалось создать папку для экспорта: {value1}'],
  '无法创建会话包：{value1}': ['Could not create the session package: {value1}', 'Не удалось создать архив чатов: {value1}'],
  '无法保存会话包：{value1}': ['Could not save the session package: {value1}', 'Не удалось сохранить архив чатов: {value1}'],
  '已导出 {value1} 条会话': ['Exported {value1} sessions', 'Экспортировано чатов: {value1}'],
  '无法打开会话包：{value1}': ['Could not open the session package: {value1}', 'Не удалось открыть архив чатов: {value1}'],
  '会话包格式无效：{value1}': ['Invalid session package format: {value1}', 'Некорректный формат архива чатов: {value1}'],
  '会话包缺少 manifest.json': ['The session package is missing manifest.json', 'В архиве чатов нет manifest.json'],
  '会话包清单无效：{value1}': ['Invalid session package manifest: {value1}', 'Некорректный манифест архива чатов: {value1}'],
  '不支持此会话包版本': ['This session package version is not supported', 'Эта версия архива чатов не поддерживается'],
  '请至少选择一条要导入的会话': ['Select at least one session to import', 'Выберите хотя бы один чат для импорта'],
  '会话包文件缺失：{value1}': ['A session package file is missing: {value1}', 'В архиве чатов не хватает файла: {value1}'],
  '会话 {value1} 校验失败': ['Session {value1} failed verification', 'Чат {value1} не прошёл проверку'],
  '已导入 {value1} 条会话': ['Imported {value1} sessions', 'Импортировано чатов: {value1}'],

  // Sidebar visibility repair and index sync (visibility.rs).
  '预计校正 {value1} 处会话可见性记录': [
    'Session visibility records to fix: {value1}',
    'Будет исправлено записей видимости чатов: {value1}',
  ],
  '已校正 {value1} 处会话可见性记录': [
    'Fixed {value1} session visibility records',
    'Исправлено записей видимости чатов: {value1}',
  ],
  '已同步 {value1} 条会话索引': ['Synced {value1} session index entries', 'Синхронизировано записей индекса чатов: {value1}'],
  '未找到所选会话文件': ['The selected session file was not found', 'Файл выбранного чата не найден'],
  // Keep this generic form last so the more specific 「无法打开 …」 templates above match first.
  '无法打开 {value1}：{value2}': ['Could not open {value1}: {value2}', 'Не удалось открыть {value1}: {value2}'],
};

/**
 * MigrationStage::label() values, interpolated into 「迁移未完成：{stage}时，…」.
 * The translations are lowercase fragments that only fit that sentence.
 */
const migrationStages: Readonly<Record<string, Copy>> = {
  '打开来源目录': ['opening the source folder', 'открытия исходной папки'],
  '打开目标目录': ['opening the destination folder', 'открытия папки назначения'],
  '读取原对话': ['reading the source conversations', 'чтения исходных чатов'],
  '读取目标对话': ['reading the destination conversations', 'чтения чатов в папке назначения'],
  '备份原对话': ['backing up the source conversations', 'резервного копирования исходных чатов'],
  '复制对话记录': ['copying the conversation history', 'копирования истории чатов'],
  '保存目标对话': ['saving the destination conversations', 'сохранения чатов в папке назначения'],
  '检查原对话是否有变化': ['checking the source conversations for changes', 'проверки исходных чатов на изменения'],
  '移除已迁移的原对话': ['removing the migrated source conversations', 'удаления перенесённых исходных чатов'],
  '执行迁移': ['running the migration', 'выполнения переноса'],
};

type SentencePair = readonly [description: string, suggestion: string];

/** MigrationReason::message(): the part before the first 「。」 is the description, the rest the suggestion. */
const migrationReasons: Readonly<Record<string, readonly [english: SentencePair, russian: SentencePair]>> = {
  '对话数据正被占用。请结束相关任务并关闭使用这些对话的 Codex 窗口后重试。': [
    ['the conversation data is in use',
      'End related tasks and close any Codex windows that use these conversations, then try again.'],
    ['данные чатов используются другим процессом',
      'Завершите связанные задачи и закройте окна Codex, в которых используются эти чаты, затем повторите попытку.'],
  ],
  '没有读写权限。请检查来源、目标和应用数据目录的权限后重试。': [
    ['there is no read/write permission',
      'Check the permissions of the source, destination and app data folders, then try again.'],
    ['нет прав на чтение и запись',
      'Проверьте права доступа к исходной папке, папке назначения и папке данных приложения, затем повторите попытку.'],
  ],
  '磁盘空间不足。请释放来源、目标及应用所在磁盘的空间后重试。': [
    ['there is not enough disk space',
      'Free up space on the disks that hold the source, the destination and the app, then try again.'],
    ['недостаточно места на диске',
      'Освободите место на дисках с исходной папкой, папкой назначения и приложением, затем повторите попытку.'],
  ],
  '所需文件或目录不存在。请刷新对话列表，并确认目录仍可访问。': [
    ['a required file or folder does not exist',
      'Refresh the conversation list and make sure the folders are still accessible.'],
    ['нужный файл или папка не существует', 'Обновите список чатов и убедитесь, что папки по-прежнему доступны.'],
  ],
  '目标尚未准备好。请先用目标目录启动一次 Codex，再重试迁移。': [
    ['the destination is not ready yet', 'Start Codex once with the destination folder, then retry the migration.'],
    ['папка назначения ещё не готова', 'Сначала один раз запустите Codex с папкой назначения, затем повторите перенос.'],
  ],
  '两边的对话数据格式不兼容。请更新并启动两边的 Codex 后重试。': [
    ['the conversation data formats of the two folders are incompatible',
      'Update and start Codex for both folders, then try again.'],
    ['форматы данных чатов в двух папках несовместимы', 'Обновите и запустите Codex для обеих папок, затем повторите попытку.'],
  ],
  '对话数据无法读取或已损坏。请从备份恢复后重试。': [
    ['the conversation data cannot be read or is corrupted', 'Restore it from a backup, then try again.'],
    ['данные чатов не читаются или повреждены', 'Восстановите их из резервной копии и повторите попытку.'],
  ],
  '原对话仍在更新。请结束相关任务后重试。': [
    ['the source conversations are still being updated', 'End related tasks, then try again.'],
    ['исходные чаты ещё обновляются', 'Завершите связанные задачи и повторите попытку.'],
  ],
  '目标中出现了已有对话或同名文件。请刷新列表并检查目标对话后重试。': [
    ['the destination already has these conversations or files with the same names',
      'Refresh the list and check the destination conversations, then try again.'],
    ['в папке назначения уже есть такие чаты или файлы с теми же именами',
      'Обновите список, проверьте чаты в папке назначения и повторите попытку.'],
  ],
  '关联对话的历史记录不完整。请先恢复缺失的对话后重试。': [
    ['the history of related conversations is incomplete', 'Restore the missing conversations first, then try again.'],
    ['история связанных чатов неполная', 'Сначала восстановите недостающие чаты, затем повторите попытку.'],
  ],
  '遇到未识别的问题。请复制错误信息，并导出诊断日志反馈。': [
    ['an unrecognized problem occurred', 'Copy the error details and export the diagnostic logs to report it.'],
    ['возникла неизвестная проблема',
      'Скопируйте текст ошибки и экспортируйте журналы диагностики, чтобы сообщить о проблеме.'],
  ],
};

/** MigrationRecovery sentences; `suggestion` mirrors the Unchanged | Restored branch of Display. */
const migrationRecoveries: readonly { zh: string; suggestion: boolean; copy: Copy }[] = [
  {
    zh: '原对话未改动。',
    suggestion: true,
    copy: ['The source conversations were not changed.', 'Исходные чаты не изменены.'],
  },
  {
    zh: '本次更改已撤销，原对话已保留。',
    suggestion: true,
    copy: ['The changes were undone and the source conversations were kept.', 'Изменения отменены, исходные чаты сохранены.'],
  },
  {
    zh: '部分内容未能还原，迁移备份已保留。请先导出诊断日志并联系支持，暂勿重复迁移。',
    suggestion: false,
    copy: [
      'Some content could not be restored, and the migration backup was kept. '
        + 'Export the diagnostic logs and contact support first. Do not retry the migration yet.',
      'Часть данных не удалось восстановить, резервная копия переноса сохранена. '
        + 'Сначала экспортируйте журналы диагностики и обратитесь в поддержку. Пока не повторяйте перенос.',
    ],
  },
  {
    zh: '请先检查两边的对话，再导出诊断日志并联系支持。',
    suggestion: false,
    copy: [
      'Check the conversations in both folders first, then export the diagnostic logs and contact support.',
      'Сначала проверьте чаты в обеих папках, затем экспортируйте журналы диагностики и обратитесь в поддержку.',
    ],
  },
];

/** Appended to the recovery sentence when the temporary backup could not be removed. */
const cleanupFailure: { zh: string; copy: Copy } = {
  zh: '临时备份未能清理。',
  copy: ['The temporary backup could not be removed.', 'Не удалось удалить временную резервную копию.'],
};

/** report_migration_error() ends every migration error with 「\n错误编号：{reference}」. */
const errorReference = { zh: '\n错误编号：', copy: ['\nError ID: ', '\nНомер ошибки: '] } as const;

/** Sentence openings that replace 「迁移未完成：{stage}时，」. */
const failureLead: Copy = ['Could not finish the migration while {value1}: ', 'Не удалось завершить перенос во время {value1}: '];

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * One template per MigrationFailure Display form (reason × recovery × cleanup). The stage label is
 * {value1} and is translated through `migrationStages`; the error reference is {value2}.
 */
function migrationFailureTemplates(): Record<string, Copy> {
  const templates: Record<string, Copy> = {};
  for (const [reasonZh, reasonCopy] of Object.entries(migrationReasons)) {
    const separator = reasonZh.indexOf('。');
    const descriptionZh = reasonZh.slice(0, separator);
    const suggestionZh = reasonZh.slice(separator + 1);
    for (const recovery of migrationRecoveries) {
      for (const cleanup of [false, true]) {
        const zh = `迁移未完成：{value1}时，${descriptionZh}。${recovery.suggestion ? suggestionZh : ''}`
          + `\n${recovery.zh}${cleanup ? cleanupFailure.zh : ''}${errorReference.zh}{value2}`;
        const render = (language: 0 | 1) => {
          const [description, suggestion] = reasonCopy[language];
          return `${failureLead[language]}${description}.${recovery.suggestion ? ` ${suggestion}` : ''}`
            + `\n${recovery.copy[language]}${cleanup ? ` ${cleanupFailure.copy[language]}` : ''}`
            + `${errorReference.copy[language]}{value2}`;
        };
        templates[zh] = [render(0), render(1)];
      }
    }
  }
  return templates;
}

/** Home migration pieces as exact keys, the referenced selection errors and the composite templates. */
const homeMigration: Readonly<Record<string, Copy>> = {
  ...migrationStages,
  ...Object.fromEntries(Object.entries(migrationReasons).map(([zh, reasonCopy]) => {
    const sentence = ([description, suggestion]: SentencePair) => `${capitalize(description)}. ${suggestion}`;
    return [zh, [sentence(reasonCopy[0]), sentence(reasonCopy[1])]];
  })),
  ...Object.fromEntries(migrationRecoveries.map(({ zh, copy }) => [zh, copy])),
  [cleanupFailure.zh]: cleanupFailure.copy,
  [`请选择不同的 Codex Home${errorReference.zh}{value1}`]: [
    `Choose a different Codex Home${errorReference.copy[0]}{value1}`,
    `Выберите другую папку Codex Home${errorReference.copy[1]}{value1}`,
  ],
  [`请至少选择一条会话${errorReference.zh}{value1}`]: [
    `Select at least one session${errorReference.copy[0]}{value1}`,
    `Выберите хотя бы один чат${errorReference.copy[1]}{value1}`,
  ],
  ...migrationFailureTemplates(),
};

const entries = Object.entries({ ...messages, ...homeMigration });

export const conversationsEnglish: Readonly<Record<string, string>> = Object.fromEntries(
  entries.map(([source, [english]]) => [source, english]),
);

export const conversationsRussian: Readonly<Record<string, string>> = Object.fromEntries(
  entries.map(([source, [, russian]]) => [source, russian]),
);
