import type { Item } from './types';
import { messageSections } from '../../../../shared/chat/messageDetails';
import { toolText } from '../../../../shared/chat/toolText';
import { changedFiles } from '../../../../shared/chat/diff';
import { generatedImageSource } from '../../../../shared/chat/imageSources';
import { collaborationStates, collaborationStatus, collaborationSummary, isCollaborationActivity }
  from '../../../desktop/src/pages/codexGui/collaborationActivity';
import { formatTurnDuration } from '../../../desktop/src/pages/codexGui/turnTiming';
import { ChatCodeBlock } from './ChatCodeBlock';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatDiff } from './ChatDiff';
import { ChatToolResult } from './ChatToolResult';
import { ChatImage } from './ChatImage';

function SearchContent({ item }: { item: Item }) {
  return <div className="chat-detail-stack">
    {(item.action?.queries ?? [item.action?.query || item.query]).filter(Boolean).map((query, index) =>
      <p key={index}>{query}</p>)}
    {item.action?.url && /^https?:\/\//i.test(item.action.url) &&
      <a href={item.action.url} target="_blank" rel="noreferrer">{item.action.url}</a>}
    {item.action?.pattern && <p>查找：{item.action.pattern}</p>}
    {item.results?.map((result, index) => <article key={index}>
      <a href={/^https?:\/\//i.test(result.url ?? '') ? result.url : undefined}
        target="_blank" rel="noreferrer">{result.title || result.url}</a><p>{result.snippet}</p></article>)}
  </div>;
}

export function ChatToolContent({ item }: { item: Item }) {
  const text = toolText(item);
  if (['agentMessage', 'reasoning', 'plan', 'enteredReviewMode', 'exitedReviewMode'].includes(item.type)) {
    return <ChatMarkdown text={text} />;
  }
  if (item.type === 'commandExecution') return <>
    <p className="chat-muted">{item.cwd}{item.durationMs != null && ` · ${formatTurnDuration(item.durationMs)}`}</p>
    <ChatCodeBlock text={item.command ?? ''} label="命令" language="bash" copyLabel="复制命令" />
    <ChatCodeBlock text={item.aggregatedOutput || (item.status === 'inProgress' ? '等待输出…' : '没有文本输出')}
      label="输出" copyLabel="复制输出" />
    {item.exitCode != null && <p className={item.exitCode ? 'chat-error' : 'chat-muted'}>退出码：{item.exitCode}</p>}
  </>;
  if (item.type === 'fileChange') return <ChatDiff files={changedFiles(item.changes ?? [])} />;
  if (['mcpToolCall', 'dynamicToolCall', 'functionCallOutput'].includes(item.type)) return <ChatToolResult item={item} />;
  if (item.type === 'webSearch') return <SearchContent item={item} />;
  if (isCollaborationActivity(item)) return <>
    <p>{collaborationSummary(item)}</p>{item.prompt && <ChatMarkdown text={item.prompt} />}
    {item.text && item.text !== item.prompt && <ChatMarkdown text={item.text} />}
    {collaborationStates(item).map((state, index) => <div key={index}>
      <p className="chat-muted">协作任务 {index + 1} · {collaborationStatus(state.status)}</p>
      {state.message && <ChatMarkdown text={state.message} />}</div>)}
  </>;
  if (['imageView', 'imageGeneration'].includes(item.type)) return <>
    <ChatImage source={generatedImageSource(item)} description={item.type === 'imageView' ? '查看的图片' : '生成的图片'} />
    <p className="chat-muted">{item.path || item.savedPath}</p>
    {item.failure?.message && <p className="chat-error">{item.failure.message}</p>}
    {item.revisedPrompt && <ChatMarkdown text={item.revisedPrompt} />}
  </>;
  if (item.type === 'contextCompaction') return <p>较早的对话已整理为摘要，可以继续处理当前任务。</p>;
  if (item.type === 'sleep') return <p>等待时长：{formatTurnDuration(item.durationMs ?? 0)}</p>;
  return <>{messageSections(item).map((section, index) => <ChatCodeBlock key={index}
    text={section.text} label={section.title} copyLabel={`复制${section.title}`} />)}</>;
}
