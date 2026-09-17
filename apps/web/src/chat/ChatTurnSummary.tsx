import { ChevronRight, FileText } from 'lucide-react';
import type { Turn } from './types';
import { completedTurnFiles } from '../../../../shared/chat/turnPresentation';
import { generatedImageSource } from '../../../../shared/chat/imageSources';
import { ChatImage } from './ChatImage';

export type TurnPanel = 'plan' | 'changes' | 'error';
export function turnErrorNotice(turn: Turn) {
  if (turn.status === 'failed' || turn.error) return '本次回复遇到问题，可以继续发送消息重试。';
  if (turn.status === 'completed') return '本次回复曾出现连接中断，现已恢复。';
  if (turn.status === 'interrupted') return '本次回复曾出现连接中断。';
  return '连接暂时中断，Codex 正在重试…';
}

export function ChatTurnSummary({ turn, onOpen, hideStopped = false }: {
  turn: Turn; onOpen: (panel: TurnPanel) => void; hideStopped?: boolean;
}) {
  const files = completedTurnFiles(turn);
  const generated = [...new Set(turn.items.filter(item => item.type === 'imageGeneration'
    && item.status === 'completed' && !item.failure).map(generatedImageSource).filter(Boolean))];
  const paths = [...new Set(files.map(file => file.path))];
  return <section className="chat-turn-summary">
    {generated.map(source => <ChatImage key={source} source={source} description="生成的图片" />)}
    {!!turn.plan?.length && <button type="button" className="chat-plan-summary" aria-label="查看任务计划"
      onClick={() => onOpen('plan')}><strong>任务计划</strong>
      <span>{turn.plan.filter(step => step.status === 'completed').length}/{turn.plan.length}</span>
      <ChevronRight size={15} /></button>}
    {!!files.length && <div className="chat-files-summary">
      <button type="button" aria-label={`查看本轮修改：${paths.length} 个文件`} onClick={() => onOpen('changes')}>
        <FileText size={21} /><strong>已编辑 {paths.length} 个文件</strong>
        <b className="chat-added">+{files.reduce((sum, file) => sum + file.added, 0)}</b>
        <b className="chat-removed">−{files.reduce((sum, file) => sum + file.removed, 0)}</b><span>审核</span>
      </button>
      {paths.slice(0, 3).map(path => <button key={path} type="button" onClick={() => onOpen('changes')}>
        <span className="chat-ellipsis">{path}</span></button>)}
      {paths.length > 3 && <button type="button" onClick={() => onOpen('changes')}>再显示 {paths.length - 3} 个文件</button>}
    </div>}
    {turn.status === 'interrupted' && !hideStopped && <p className="chat-muted">已停止生成</p>}
    {(turn.error || turn.retryError || turn.status === 'failed') && <button type="button"
      className="chat-error-notice" aria-label="查看报错详情" onClick={() => onOpen('error')}>
      {turnErrorNotice(turn)} <u>查看报错详情</u></button>}
  </section>;
}
