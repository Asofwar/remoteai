import { t, useLanguage } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from 'antd';
import { editedImageMessage, imageEditorHtml } from '../../../../shared/chat/imageEditorHtml';
import type { DraftImage } from '../../../../shared/remote-chat/attachments';
import './imageEditor.css';

export function ChatImageEditor({ image, save, close }: {
  image: DraftImage; save: (dataUrl: string) => void; close: () => void;
}) {
  const language = useLanguage();
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => imageEditorHtml(image.url, t, language), [image.url, language]);
  const [error, setError] = useState('');
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      try {
        if (event.data === '{"type":"cancel"}') { close(); return; }
        const dataUrl = editedImageMessage(event.data);
        if (!dataUrl) return;
        save(dataUrl);
        close();
      } catch { setError(t("图片未保存，请减少标注或图片后重试。")); }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [save, close]);
  return <Modal open centered footer={null} title={null} closable={false} maskClosable={false}
    onCancel={close} width={1120} className="chat-image-editor" wrapClassName="chat-image-editor-wrap" destroyOnClose
    transitionName="" maskTransitionName="">
    {/* Only our own editor and validated image data are embedded. Keeping the local origin lets
        Chromium deliver pointer gestures reliably; the document CSP blocks all external content. */}
    <iframe ref={frame} title={t("图片标注")} srcDoc={html} sandbox="allow-scripts allow-same-origin" />
    {!!error && <p role="alert">{t(error)}</p>}
  </Modal>;
}
