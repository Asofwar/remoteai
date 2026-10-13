import type { ReactNode } from 'react';
import { GripVertical, Pencil, MessageSquarePlus, Scan, Eraser, RectangleHorizontal } from 'lucide-react';
import { IMAGE_AI_TOOLS } from './imageAiEdit';
import { useImageAiEdit } from './useImageAiEdit';
import './imageAiToolbar.css';

const icons = [Pencil, MessageSquarePlus, Scan, Eraser, RectangleHorizontal];
export function ImageAiToolbar({ load, close, translate: t, originalAction }: {
  load: () => Promise<string>; close: () => void; translate: (text: string) => string;
  originalAction?: ReactNode;
}) {
  const editor = useImageAiEdit({ load, close });
  if (!editor.available) return originalAction ?? null;
  const selected = IMAGE_AI_TOOLS.find(item => item.id === editor.tool);
  return <div className="cs-image-ai">
    {selected && <form className="cs-image-ai-form" onSubmit={event => {
      event.preventDefault(); void editor.submit();
    }}>
      <strong>{t(selected.label)}</strong>
      <label>{t(selected.hint)}<textarea value={editor.detail} maxLength={2000} disabled={editor.busy}
        onChange={event => editor.setDetail(event.target.value)} /></label>
      {editor.tool === 'resize' && <div className="cs-image-ai-dimensions">
        <label>{t('宽度（像素）')}<input inputMode="numeric" value={editor.width} disabled={editor.busy}
          onChange={event => editor.setWidth(event.target.value)} /></label>
        <label>{t('高度（像素）')}<input inputMode="numeric" value={editor.height} disabled={editor.busy}
          onChange={event => editor.setHeight(event.target.value)} /></label>
      </div>}
      <p>{t('编辑结果将在当前对话中返回。')}</p>
      {editor.error && <p role="alert">{t(editor.error)}</p>}
      <div className="cs-image-ai-actions">
        <button type="button" disabled={editor.busy} onClick={() => editor.select(null)}>{t('取消')}</button>
        <button type="submit" disabled={editor.busy || !editor.enabled}>
          {t(editor.busy ? '正在提交…' : '交给 AI 编辑')}</button>
      </div>
    </form>}
    <div className="cs-image-ai-tools" role="toolbar" aria-label={t('图片编辑')}>
      <GripVertical size={18} aria-hidden="true" />
      {originalAction}
      {IMAGE_AI_TOOLS.map((item, index) => {
        const Icon = icons[index];
        return <button type="button" key={item.id} disabled={editor.busy || !editor.enabled}
          aria-pressed={editor.tool === item.id} onClick={() => editor.select(item.id)}>
          <Icon size={20} aria-hidden="true" /><span>{t(item.label)}</span></button>;
      })}
    </div>
  </div>;
}
