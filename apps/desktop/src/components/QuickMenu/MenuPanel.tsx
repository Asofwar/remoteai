import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ArrowLeft, Layers3, X } from "lucide-react";
import { guiText } from "../../i18n/guiText";
import { quickMenuLanguage } from "./language";
import { MenuRow } from "./MenuRow";
import type { MenuEntry, MenuSnapshot } from "./types";

interface Props {
  snapshot: MenuSnapshot | null;
  panel: RefObject<HTMLDivElement>;
  error: string;
  activate: (entry: MenuEntry) => void;
  dismiss: () => void;
}

function moveFocus(event: KeyboardEvent, menu: HTMLDivElement | null) {
  const selector = 'button[role^="menuitem"]:not(:disabled)';
  const buttons = Array.from(menu?.querySelectorAll<HTMLButtonElement>(selector) ?? []);
  if (!buttons.length) return;
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  let next = index;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = buttons.length - 1;
  if (event.key === "ArrowDown" || event.key === "Tab") {
    next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
  }
  if (event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
  event.preventDefault();
  buttons[next]?.focus();
}

export function MenuPanel({ snapshot, panel, error, activate, dismiss }: Props) {
  const [parent, setParent] = useState<MenuEntry | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const opener = useRef<string | null>(null);
  const language = quickMenuLanguage(snapshot);
  const entries = parent?.children ?? snapshot?.entries ?? [];
  const actionIndex = entries.findIndex((entry) => entry.id === "tray:toggle-floating-bubble");
  const scrollEntries = actionIndex < 0 ? entries : entries.slice(0, actionIndex);
  const actions = actionIndex < 0 ? [] : entries.slice(actionIndex);
  useEffect(() => {
    if (parent) menu.current?.querySelector<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)')?.focus();
    else Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("[data-menu-id]") ?? [])
      .find((button) => button.dataset.menuId === opener.current)?.focus();
  }, [parent]);
  const choose = (entry: MenuEntry) => {
    if (entry.children.length) {
      opener.current = entry.id;
      setParent(entry);
    } else activate(entry);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" || (parent && event.key === "ArrowLeft")) {
      event.preventDefault();
      if (parent) setParent(null); else dismiss();
    } else if (["ArrowUp", "ArrowDown", "Home", "End", "Tab"].includes(event.key)) {
      moveFocus(event, menu.current);
    } else if (event.key === "ArrowRight") {
      const target = document.activeElement;
      if (target instanceof HTMLButtonElement && target.getAttribute("aria-haspopup") === "menu") {
        target.click();
      }
    }
  };
  return (
    <div className="quick-menu-panel" ref={panel} onKeyDown={onKeyDown} onContextMenu={(event) => event.preventDefault()}>
      <header className="quick-menu-header">
        {parent ? <button className="quick-menu-back" onClick={() => setParent(null)}
          aria-label={guiText("返回", {}, language)}><ArrowLeft size={16} /></button> : <Layers3 size={17} />}
        <span>{parent ? parent.text.replace(/^✓ /, "") : "Remote AI"}</span>
        <button className="quick-menu-close" onClick={dismiss} aria-label={guiText("关闭菜单", {}, language)}>
          <X size={14} />
        </button>
      </header>
      <div className="quick-menu-content" ref={menu} role="menu" aria-label={guiText("快捷菜单", {}, language)}>
        <div className="quick-menu-scroll">
          {!snapshot && <div className="quick-menu-notice">{guiText("正在加载…", {}, language)}</div>}
          {parent && <div className="quick-menu-section">{guiText("选择模型", {}, language)}</div>}
          {scrollEntries.map((entry) => <MenuRow key={entry.id} entry={entry} onActivate={choose} />)}
        </div>
        {actions.length > 0 && <div className="quick-menu-actions">
          {actions.map((entry) => <MenuRow key={entry.id} entry={entry} onActivate={choose} />)}
        </div>}
      </div>
      {error && <div className="quick-menu-notice" role="alert">{guiText(error, {}, language)}</div>}
    </div>
  );
}
