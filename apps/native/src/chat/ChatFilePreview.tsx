import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Text } from 'react-native';
import type { FileReference } from '../../../../shared/chat/fileReference';
import type { TextPreview } from '../../../../shared/remote-chat/textPreview';
import { BottomSheet } from '../components/BottomSheet';
import { SheetScrollView } from '../components/SheetScrollView';
import { ChatCodeBlock } from './ChatCodeBlock';
import { fileLanguage } from './ChatCodeHighlight';
import { styles } from './styles';

import { isVideoPath, type VideoClient } from '../../../../shared/remote-chat/video';
import { VideoViewer } from './video/VideoViewer';
import type { FileClient } from '../../../../shared/remote-chat/fileDownload';
import { useFileDownload } from '../../../../shared/remote-chat/useFileDownload';
import { nativeDownloadTarget } from './fileDownloadTarget';

const BINARY_FILE = /\.(?:exe|apk|aab|msi|zip|7z|rar|gz|tar|dmg|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|mp3|wav)$/i;

export const ChatFileContext = createContext<((file: FileReference) => void) | null>(null);
interface Props {
  threadId: string | null;
  ready: boolean;
  load: (threadId: string, path: string) => Promise<TextPreview>;
  children: ReactNode;
  videos: VideoClient;
  files: FileClient;
}

function FilePreview({ file, threadId, ready, load, files, close }: Omit<Props, 'children'> & {
  file: FileReference; close: () => void;
}) {
  const [result, setResult] = useState<TextPreview>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const binary = BINARY_FILE.test(file.path);
  const download = useFileDownload({ client: files, threadId, ready, path: file.path,
    target: nativeDownloadTarget, success: '文件已保存到下载文件夹' });
  useEffect(() => {
    if (!threadId || !ready || binary) return;
    let cancelled = false;
    setError(''); setResult(undefined);
    void load(threadId, file.path).then((value) => { if (!cancelled) setResult(value); }, () => {
      if (!cancelled) setError('暂时无法预览，可以下载后打开。');
    });
    return () => { cancelled = true; };
  }, [threadId, ready, load, file.path, attempt, binary]);
  return <BottomSheet fullWidthContent visible tall title="文件" subtitle={file.path} onClose={close} dragFromHeaderOnly
    actions={[{ label: download.label, onPress: download.busy ? download.cancel : download.start,
      tone: 'primary', disabled: !download.busy && (!ready || !threadId) },
    ...(error ? [{ label: '重新预览', onPress: () => setAttempt(attempt + 1), disabled: !ready }] : [])]}>
    <SheetScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      {!ready && !result && <Text style={styles.subtitle}>请连接电脑后查看文件。</Text>}
      {binary && <Text style={styles.subtitle}>下载后即可用相应的应用打开。</Text>}
      {ready && !binary && !result && !error && <ActivityIndicator accessibilityLabel="正在读取文件" />}
      {download.busy && !!download.detail && <Text style={[styles.subtitle, { maxWidth: 400 }]}>
        {download.detail}</Text>}
      {!!download.message && <Text accessibilityLiveRegion="polite" style={[styles.subtitle,
        { maxWidth: 400 }]}>{download.message}</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {result && <>
        <Text style={styles.subtitle}>当前文件内容{file.line ? ` · 引用第 ${file.line} 行` : ''}</Text>
        <ChatCodeBlock text={result.text} label="完整文本" language={fileLanguage(file.path)}
          lineNumbers copyLabel="复制文件内容" />
      </>}
    </SheetScrollView>
  </BottomSheet>;
}

export function ChatFileProvider({ children, ...options }: Props) {
  const [file, setFile] = useState<FileReference | null>(null);
  const open = useCallback((value: FileReference) => { Keyboard.dismiss(); setFile(value); }, []);
  return <ChatFileContext.Provider value={open}>
    {children}
    {file && (isVideoPath(file.path)
      ? <VideoViewer key={file.path} path={file.path} threadId={options.threadId}
        ready={options.ready} client={options.videos} files={options.files} close={() => setFile(null)} />
      : <FilePreview key={file.path} {...options} file={file} close={() => setFile(null)} />)}
  </ChatFileContext.Provider>;
}
