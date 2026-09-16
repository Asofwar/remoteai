import { Plus, X } from 'lucide-react';
import { MAX_CHAT_IMAGES, type DraftImage } from '../../../../shared/remote-chat/attachments';

export function ChatAttachmentPreviews({ images, busy, remove, add, edit }: {
  images: DraftImage[]; busy: boolean; remove: (id: string) => void; add: () => void;
  edit: (id: string) => void;
}) {
  if (!images.length) return null;
  return <div className="chat-attachment-previews">
    {images.map((image, index) => <div key={image.id} className="chat-attachment-preview">
      <img src={image.url} alt={`待发送图片 ${index + 1}`} />
      <button type="button" className="chat-attachment-edit" aria-label={`标注图片 ${index + 1}`}
        disabled={busy} onClick={() => edit(image.id)}>标注</button>
      <button type="button" aria-label={`移除图片 ${index + 1}`} disabled={busy}
        onClick={() => remove(image.id)}><X size={16} /></button>
    </div>)}
    {images.length < MAX_CHAT_IMAGES && <button type="button" className="chat-attachment-more"
      aria-label="继续添加图片" disabled={busy} onClick={add}><Plus size={24} /></button>}
  </div>;
}
