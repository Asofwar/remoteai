import type { Item } from './types';
import { toolOutputText, toolOutputPage } from '../../../../shared/chat/toolOutput';
import { useState } from 'react';
import { ChatCodeBlock } from './ChatCodeBlock';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatImage } from './ChatImage';
import { ChatFileLink } from './ChatFileLink';

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const serialized = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '';

function ToolText({ text, markdown }: { text: string; markdown: boolean }) {
  const [index, setIndex] = useState(0);
  const { visible, page, pages } = toolOutputPage(text, index);
  return <>{markdown ? <ChatMarkdown text={visible} />
    : <ChatCodeBlock text={visible} label="输出" copyLabel="复制输出" />}
    {pages > 1 && <div className="chat-output-paging"><span>内容较长，分段显示</span>
      <button type="button" disabled={!page} onClick={() => setIndex(page - 1)}>上一段</button>
      <span>{page + 1}/{pages}</span>
      <button type="button" disabled={page === pages - 1} onClick={() => setIndex(page + 1)}>下一段</button></div>}</>;
}

function OutputPart({ value }: { value: unknown }) {
  const part = record(value);
  const text = toolOutputText(value);
  if (text) return <ToolText {...text} />;
  if (part?.type === 'image' && typeof part.data === 'string' && typeof part.mimeType === 'string') {
    return <ChatImage source={`data:${part.mimeType};base64,${part.data}`} description="工具返回的图片" />;
  }
  if (part?.type === 'inputImage' && typeof part.imageUrl === 'string') {
    return <ChatImage source={part.imageUrl} description="工具返回的图片" />;
  }
  if (part?.type === 'inputAudio' && typeof part.audioUrl === 'string'
    && /^(data:audio\/|https?:\/\/)/i.test(part.audioUrl)) {
    return <audio controls preload="none" src={part.audioUrl} aria-label="工具返回的音频" />;
  }
  const resource = part?.type === 'resource' ? record(part.resource) ?? part : part;
  if (['resource_link', 'resource'].includes(String(part?.type)) && typeof resource?.uri === 'string') {
    return <ChatFileLink href={resource.uri}>{String(resource.name || resource.uri)}</ChatFileLink>;
  }
  return <ChatCodeBlock text={serialized(value)} label="结果" language="json" copyLabel="复制结果" />;
}

export function ChatToolResult({ item }: { item: Item }) {
  const result = record(item.result);
  const content = item.contentItems ?? (Array.isArray(result?.content) ? result.content : undefined);
  return <div className="chat-detail-stack">
    {item.arguments != null && <details><summary>查看输入</summary>
      <ChatCodeBlock text={serialized(item.arguments)} language="json" label="输入" copyLabel="复制输入" /></details>}
    {item.progress?.map((text, index) => <ChatMarkdown key={index} text={text} process />)}
    {content?.map((part, index) => <OutputPart key={index} value={part} />)}
    {result?.structuredContent != null && <details><summary>查看结构化结果</summary>
      <OutputPart value={result.structuredContent} /></details>}
    {!content && item.result != null && <OutputPart value={item.result} />}
    {item.output != null && <OutputPart value={item.output} />}
    {item.error != null && <p role="alert" className="chat-error">
      {typeof record(item.error)?.message === 'string' ? String(record(item.error)?.message) : '工具执行失败，请重试。'}</p>}
    {item.result == null && item.output == null && !content && !item.error && <p className="chat-muted">
      {item.status === 'inProgress' ? '正在等待工具返回…' : '工具没有返回文本内容。'}</p>}
  </div>;
}
