/** Codex GUI error and status messages translated at display time. */
export const desktopGuiErrorsEnglish: Readonly<Record<string, string>> = {
  // apps/desktop/src/pages/codexGui/queueJournal.ts: restored queue item whose dispatch was interrupted.
  '上次发送结果尚未确认，请查看聊天后决定是否重发。':
    'Could not confirm whether the last message was sent. Check the conversation before deciding whether to resend it.',
  // apps/desktop/src/pages/codexGui/scheduledTasks/useScheduledTasks.ts: LOAD_ERROR.
  '暂时无法加载定时任务，请稍后重试。': 'Could not load scheduled tasks. Try again later.',
  // apps/desktop/src/pages/codexGui/FileMenu.tsx: file link aria-label ("Preview file: <path>").
  '{value1}：{value2}': '{value1}: {value2}',
};

export const desktopGuiErrorsRussian: Readonly<Record<string, string>> = {
};
