import { useEffect, useState } from 'react';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import type { TextPreview } from '../../../../shared/remote-chat/textPreview';
import type { FileClient } from '../../../../shared/remote-chat/fileDownload';
import { isVideoPath } from '../../../../shared/remote-chat/video';
import { ChatCodeBlock } from './ChatCodeBlock';
import { ChatImage } from './ChatImage';
import { loadVideoPreview } from './videoPreview';

export interface FilePreviewContext {
  client: FileClient; threadId: string | null; ready: boolean;
  load?: (threadId: string, path: string) => Promise<TextPreview>;
}
function TextFile({ path, context, line }: { path: string; context: FilePreviewContext; line?: number }) {
  const [result, setResult] = useState<TextPreview>();
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (!context.threadId || !context.load || !context.ready) { setError('连接电脑后即可预览。'); return; }
    void context.load(context.threadId, path).then(value => { if (!cancelled) setResult(value); })
      .catch(() => { if (!cancelled) setError('暂时无法预览此文件，可以下载后查看。'); });
    return () => { cancelled = true; };
  }, [context.load, context.threadId, context.ready, path]);
  if (error) return <p className="chat-error" role="status">{error}</p>;
  if (!result) return <p role="status" className="chat-muted">正在读取文件…</p>;
  // Keep arbitrary HTML and scripts inert, just like source files on the phone.
  return <>{line && <p className="chat-muted">引用位置：第 {line} 行</p>}
    <ChatCodeBlock text={result.text} language={path.split('.').at(-1)} label={path.split(/[\\/]/).at(-1)}
      copyLabel="复制文件内容" /></>;
}
function VideoFile({ path, context }: { path: string; context: FilePreviewContext }) {
  const [url, setUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let loaded: Awaited<ReturnType<typeof loadVideoPreview>> | undefined;
    if (!context.threadId || !context.ready) { setError('连接电脑后即可预览。'); return; }
    void loadVideoPreview({ client: context.client, threadId: context.threadId, path, signal: controller.signal,
      progress: (received, total) => { if (!controller.signal.aborted) setProgress(Math.round(received / total * 100)); },
    }).then(async result => {
      loaded = result;
      if (controller.signal.aborted) await result.dispose();
      else setUrl(result.url);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error && cause.message === '视频较大，请下载后播放。'
        ? cause.message : '暂时无法播放此视频，可以下载后查看。');
    });
    return () => { controller.abort(); void loaded?.dispose(); };
  }, [context.client, context.threadId, context.ready, path]);
  if (error) return <p role="status" className="chat-error">{error}</p>;
  if (!url) return <p role="status" className="chat-muted">正在准备视频… {progress}%</p>;
  return <video controls playsInline src={url} style={{ width: '100%', maxHeight: '60dvh' }}
    onError={() => setError('浏览器暂不支持此视频格式，可以下载后播放。')} />;
}
export function ChatFilePreview({ path, line, context, onClose }: {
  path: string; line?: number; context: FilePreviewContext; onClose: () => void;
}) {
  const image = /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(path);
  return <AdaptiveSheet open title={path.split(/[\\/]/).at(-1) || '文件预览'} width={800} onClose={onClose}>
    <div className="chat-detail-stack">{image ? <ChatImage source={path} description="文件预览" />
      : isVideoPath(path) ? <VideoFile path={path} context={context} />
        : <TextFile path={path} context={context} line={line} />}</div>
  </AdaptiveSheet>;
}
