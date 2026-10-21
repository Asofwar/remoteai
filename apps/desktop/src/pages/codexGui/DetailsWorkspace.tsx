import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { WorkspaceDrawerContext } from "../../../../../shared/chat/workspaceDrawer";
import { useWorkspaceDrawer } from "../../../../../shared/chat/useWorkspaceDrawer";
import { FileDiff, FileSearch, Maximize2, Minimize2, Minus, PanelRightOpen, X } from "lucide-react";
import { DetailsContext } from "./detailsContext";
import { DiffDocument } from "./DiffDocument";
import { useDiffText } from "../../../../../shared/chat/diffText";
import { useDrawerResize } from "./useDrawerResize";
import { guiFontStyle, useGuiFontSize } from "./guiAppearance";
import { useDetailsPanel } from "./useDetailsPanel";
import { FilePreviewPanel } from "./filePreview/FilePreviewPanel";
import { WebsitePreview } from "./filePreview/WebsitePreview";
import type { FilePreviewTarget } from "./filePreview/usePreviewHistory";
import type { PreviewNavigationState } from "./filePreview/PreviewNavigation";
import styles from "./DetailsWorkspace.module.less";

const MIN_CHAT_WIDTH = 520;

export interface RemoteFilePreviewProps {
  target: FilePreviewTarget; active: boolean; navigation: PreviewNavigationState;
}

export function DetailsWorkspace({ selected, active, children, enabled = true, className = '', contentClassName = '',
  renderRemoteFile }: {
  selected: string | null; active: boolean; children: ReactNode;
  enabled?: boolean; className?: string; contentClassName?: string;
  renderRemoteFile?: (props: RemoteFilePreviewProps) => ReactNode;
}) {
  const t = useDiffText();
  const fontSize = useGuiFontSize();
  const host = useRef<HTMLDivElement>(null);
  const drawer = useWorkspaceDrawer(active);
  const workspace = useMemo(() => ({ active, tabs: drawer.tabs }), [active, drawer.tabs]);
  const closeButton = useRef<HTMLButtonElement>(null);
  const tabBar = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const panel = useDetailsPanel({ selected, enabled, remoteFiles: Boolean(renderRemoteFile), drawer: drawer.tabs });
  const { entry, preview, viewId, expanded, showingChanges } = panel;
  const showingPreview = drawer.tabs.selected === "preview";
  const tool = drawer.tabs.entries.find(tab => tab.id === drawer.tabs.selected);
  const visible = drawer.tabs.visible
    && Boolean(tool || (enabled && ((showingChanges && entry) || (showingPreview && preview))));
  const hasTabs = Boolean(entry || preview || drawer.tabs.entries.length);
  const label = tool?.title ?? t(showingChanges ? "文件更改详情" : "预览详情");
  const resize = useDrawerResize(host);
  const docked = visible && !expanded && resize.available - resize.width >= MIN_CHAT_WIDTH;
  const width = expanded ? resize.available : resize.width;
  useEffect(() => { if (visible) closeButton.current?.focus(); }, [visible]);
  useEffect(() => {
    if (visible) tabBar.current?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [visible, drawer.tabs.selected]);
  useEffect(() => { if (!visible || expanded) resize.cancel(); }, [visible, expanded, resize.cancel]);
  return <DetailsContext.Provider value={enabled ? panel.context : null}>
    <WorkspaceDrawerContext.Provider value={workspace}>
    <div ref={host} className={`${styles.host} ${className}`} data-dragging={resize.dragging || undefined}
      style={guiFontStyle(fontSize)}>
        <div className={`${styles.conversation} ${contentClassName}`}
          style={{ marginRight: docked ? width : 0 }}>{children}</div>
      <div className={styles.drawerHost} data-workspace-drawers>
      {hasTabs && <aside hidden={!visible} id={panelId} data-details-panel role="dialog"
        data-website={(showingPreview && preview?.kind === "website") || undefined}
        aria-label={label} className={styles.drawer}
        style={{ width }} onKeyDown={(event) => {
          if (tool?.save && (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
            event.preventDefault(); event.stopPropagation(); tool.save();
          }
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.stopPropagation(); panel.context.close();
          }
        }}>
        {!expanded && <div className={styles.resizeHandle} role="separator" tabIndex={0}
          aria-label={t("调整详情抽屉宽度")} aria-orientation="vertical" aria-controls={panelId}
          aria-valuemin={resize.minimum} aria-valuemax={resize.maximum} aria-valuenow={width} {...resize.handle} />}
        <header className={styles.header}>
          <div ref={tabBar} className={styles.tabs} role="tablist" aria-label={t("侧栏内容")}>
            {enabled && <button className={styles.tab} role="tab" aria-selected={showingChanges}
              onClick={panel.showChanges}><FileDiff size={16} />{t("文件更改")}</button>}
            {preview && <button className={styles.tab} role="tab" aria-selected={showingPreview}
              onClick={panel.showPreview}><FileSearch size={16} />{t("预览")}</button>}
            {drawer.tabs.entries.map(tab => <button key={tab.id} className={styles.tab} role="tab"
              aria-selected={drawer.tabs.selected === tab.id} onClick={() => drawer.tabs.open(tab.id)}>
              {tab.icon}<span>{tab.title}</span></button>)}
          </div>
          <div className={styles.controls}>
            <button aria-label={t(expanded ? "还原抽屉宽度" : "展开详情抽屉")}
              onClick={() => panel.setExpanded(!expanded)}>
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
            <button aria-label={t("最小化详情抽屉")} onClick={() => { panel.context.close(); drawer.minimize(); }}>
              <Minus size={16} /></button>
            <button ref={closeButton} aria-label={t("关闭详情抽屉")} onClick={panel.context.close}><X size={17} /></button>
          </div>
        </header>
        {entry && <div hidden={!showingChanges} key={`${entry.id}:${entry.filePath ?? ""}:${viewId}`}
          className={styles.content}>
          {!entry.files.length && <p className={styles.empty}>{t("暂无文件更改")}</p>}
          <DiffDocument files={entry.files} filePath={entry.filePath}
            title={entry.title} status={entry.status}
            initialOpen continuous />
        </div>}
        {preview && <div hidden={!showingPreview} className={styles.preview}>
          {preview.kind === "file" && <FilePreviewPanel key={preview.data.sessionId} data={preview.data}
            active={visible && showingPreview} navigation={panel.navigation} />}
          {preview.kind === "remoteFile" && renderRemoteFile?.({ target: preview.file,
            active: visible && showingPreview, navigation: panel.navigation })}
          {preview.kind === "website" && <WebsitePreview key={preview.url} url={preview.url}
            active={visible && showingPreview} resizing={resize.dragging} navigation={panel.navigation} />}
        </div>}
        <div ref={drawer.setContent} hidden={!tool} className={styles.toolContent} />
      </aside>}
      </div>
      {hasTabs && drawer.minimized && active &&
        <button className={styles.restore} onClick={drawer.restore}>
          <PanelRightOpen size={16} />{tool ? tool.title
            : t(showingChanges ? "恢复文件更改" : "恢复预览")}</button>}
    </div>
    </WorkspaceDrawerContext.Provider>
  </DetailsContext.Provider>;
}
