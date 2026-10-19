import { t, useLanguage } from '../i18n';
import { Drawer, Grid, Modal } from "antd";
import { Popup, SafeArea } from "antd-mobile";
import type { ReactNode } from "react";

interface AdaptiveSheetProps {
  open: boolean;
  title: string;
  titleIcon?: ReactNode;
  titleAction?: ReactNode;
  truncateTitle?: boolean;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
  presentation?: "adaptive" | "drawer";
  afterOpenChange?: (open: boolean) => void;
}

export function AdaptiveSheet({
  open,
  title,
  titleIcon,
  titleAction,
  truncateTitle = false,
  subtitle,
  onClose,
  onBack,
  children,
  width = 520,
  className,
  presentation = "adaptive",
  afterOpenChange,
}: AdaptiveSheetProps) {
  useLanguage();
  const screens = Grid.useBreakpoint();
  const back = onBack && <button type="button" className="sheet-close" onClick={onBack}
    aria-label={t("返回上一层")}>‹</button>;
  const titleClassName = truncateTitle ? 'sheet-title-truncated' : undefined;
  const desktopTitle = <strong className={titleClassName}>{title}</strong>;
  const mobileTitle = <h2 className={titleClassName}>{title}</h2>;
  const heading = <div className="modal-heading" style={{ minWidth: 0, flex: 1 }}>
    {titleAction ? <div className="sheet-title-row">{desktopTitle}{titleAction}</div> : desktopTitle}
    {subtitle ? <span>{subtitle}</span> : null}</div>;
  const titleContent = onBack || titleIcon
    ? <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{back}{titleIcon}{heading}</div> : heading;
  if (presentation === "drawer") {
    return <Drawer open={open} title={titleContent} placement="right" width={`min(${width}px, 100vw)`}
      afterOpenChange={afterOpenChange}
      className={className}
      onClose={onClose} destroyOnHidden closable={{ 'aria-label': t("关闭"), placement: 'end' }}>
      {children}
    </Drawer>;
  }
  if (screens.md) {
    return <Modal open={open} onCancel={onClose} footer={null} width={width} centered destroyOnClose className={className}
      closable={{ 'aria-label': t("关闭") }}
      styles={{ header: truncateTitle || titleAction ? { paddingRight: 32 } : undefined }}
      title={titleContent}>
      {children}
    </Modal>;
  }
  return <Popup visible={open} onMaskClick={onClose} destroyOnClose
    bodyClassName={['mobile-popup', className].filter(Boolean).join(' ')}>
    <div className="sheet-handle" />
    <div className="sheet-header">{back}{titleIcon}<div style={{ flex: 1, minWidth: 0 }}>
      {titleAction ? <div className="sheet-title-row">{mobileTitle}{titleAction}</div> : mobileTitle}
      {subtitle ? <p>{subtitle}</p> : null}</div>
      <button type="button" className="sheet-close" onClick={onClose} aria-label={t("关闭")}>×</button></div>
    <div className="adaptive-sheet-content">{children}</div>
    <SafeArea position="bottom" />
  </Popup>;
}
