import { ChevronRight, FileText, Lightbulb, Search, Terminal, Users, Wrench } from 'lucide-react';
import type { Item } from './types';
import { messageContent, messageLabel } from '../../../../shared/chat/messageDetails';
import { commandPreview } from '../../../../shared/chat/commandPreview';
import { collaborationSummary, isCollaborationActivity }
  from '../../../desktop/src/pages/codexGui/collaborationActivity';

const STATUS: Record<string, string> = { inProgress: '进行中', completed: '已完成', failed: '失败',
  declined: '已拒绝', interrupted: '已停止' };

function activityLabel(item: Item) {
  if (isCollaborationActivity(item)) return collaborationSummary(item);
  if (item.type === 'commandExecution') {
    const action = item.commandActions?.find(entry => entry.type !== 'unknown');
    const labels: Record<string, string> = { read: '读取文件', listFiles: '浏览文件', search: '搜索代码' };
    return action ? `${labels[action.type] || '执行命令'} · ${action.name || action.query || action.path || ''}`
      : `执行命令 · ${commandPreview(item.command ?? '')}`;
  }
  if (item.type === 'reasoning') return [...item.summary ?? [], messageContent(item)]
    .join('\n').trim().split('\n')[0].replace(/[*_`#]/g, '');
  const detail = item.type === 'fileChange'
    ? item.changes?.map(change => change.path.split(/[\\/]/).at(-1)).join('、')
    : item.query || item.tool || item.review || item.text || item.path;
  return [messageLabel(item), detail, STATUS[item.status ?? '']].filter(Boolean).join(' · ');
}

export function ChatActivity({ item, onOpen, running }: {
  item: Item; onOpen: (id: string) => void; running?: boolean;
}) {
  const label = activityLabel(item).slice(0, 160).replace(/\s+/g, ' ').trim();
  if (!label) return null;
  const icons = { commandExecution: Terminal, fileChange: FileText, reasoning: Lightbulb, webSearch: Search };
  const Icon = isCollaborationActivity(item) ? Users : icons[item.type as keyof typeof icons] || Wrench;
  return <button type="button" className={`chat-activity${running ? ' is-running' : ''}`}
    onClick={() => onOpen(item.id)}><Icon size={16} /><span className="chat-activity-text">{label}</span>
    <ChevronRight size={15} /></button>;
}
