import { getLanguage, t } from '../i18n';
import { formatTurnDuration as chineseDuration } from '../../../desktop/src/pages/codexGui/turnTiming';
import { contextUsage } from '../../../desktop/src/pages/codexGui/contextUsage';
import { formatTokens } from '../../../../shared/remote-chat/usage';
import type { ThreadTokenUsage } from './types';
import { contextUsageLabel as chineseContextUsage } from '../../../../shared/remote-chat/contextUsage';

export function formatTurnDuration(milliseconds: number) {
  if (getLanguage() === 'zh') return chineseDuration(milliseconds);
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  if (!minutes) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${seconds % 60}s`;
}

export function contextUsageLabel(usage?: ThreadTokenUsage) {
  if (getLanguage() === 'zh') return chineseContextUsage(usage);
  const context = contextUsage(usage);
  if (!context) return t('暂无上下文用量');
  const used = formatTokens(context.used);
  if (context.capacity === null) return t('上下文已用 {used} Token（容量未知）', { used });
  return t('上下文 {used} / {capacity} Token（{percent}% 已用）', {
    used, capacity: formatTokens(context.capacity), percent: context.percent ?? 0,
  });
}
