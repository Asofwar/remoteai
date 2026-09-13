import { contextUsage } from '../../apps/desktop/src/pages/codexGui/contextUsage';
import { formatCompactTokenCount } from '../../apps/desktop/src/utils/tokenContext';
import type { ThreadTokenUsage } from './client/types';

export function contextUsageLabel(usage?: ThreadTokenUsage) {
  const context = contextUsage(usage);
  if (!context) return '暂无上下文用量';
  const used = formatCompactTokenCount(context.used, 'zh');
  if (context.capacity === null) return `上下文已用 ${used} Token（容量未知）`;
  const capacity = formatCompactTokenCount(context.capacity, 'zh');
  return `上下文 ${used} / ${capacity} Token（${context.percent}% 已用）`;
}
