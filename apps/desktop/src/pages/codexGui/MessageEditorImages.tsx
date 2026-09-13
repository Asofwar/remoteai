import { X } from "lucide-react";
import type { Content } from "./types";
import { MessageImage } from "./MessageImage";
import styles from "./UserMessage.module.less";

export function MessageEditorImages({ images, removed, disabled, onRemove }: {
  images: Content[]; removed: number[]; disabled: boolean; onRemove: (index: number) => void;
}) {
  if (images.every((_, index) => removed.includes(index))) return null;
  return <div className={styles.editorImages}>
    {images.map((image, index) => removed.includes(index) ? null : <div className={styles.editorImage} key={index}>
      <MessageImage src={image.url || image.path} alt={`图片附件 ${index + 1}`} />
      <button type="button" className={styles.removeImage} aria-label={`移除图片 ${index + 1}`}
        disabled={disabled} onClick={() => onRemove(index)}><X size={14} /></button>
    </div>)}
  </div>;
}
