import { useId, useRef, type ReactNode } from "react";
import { guiText } from "../../i18n/guiText";
import { useThreadSidebarResize } from "./useThreadSidebarResize";
import styles from "./styles.module.less";
import resizeStyles from "./ResizableThreadSidebar.module.less";

export function ResizableThreadSidebar({ children, className = "", layoutSelector = `.${styles.page}` }: {
  children: ReactNode; className?: string; layoutSelector?: string;
}) {
  const sidebar = useRef<HTMLElement>(null);
  const id = useId();
  const resize = useThreadSidebarResize(sidebar, layoutSelector);
  return <aside ref={sidebar} id={id} className={`${styles.sidebar} ${resizeStyles.sidebar} ${className}`}
    style={{ width: resize.enabled ? resize.width : undefined }} data-resizing={resize.dragging || undefined}>
    {children}
    {resize.enabled && <div className={resizeStyles.handle} role="separator" tabIndex={0}
      aria-label={guiText("调整聊天列表宽度")} aria-orientation="vertical" aria-controls={id}
      aria-valuemin={resize.minimum} aria-valuemax={resize.maximum} aria-valuenow={resize.width} {...resize.handle} />}
  </aside>;
}
