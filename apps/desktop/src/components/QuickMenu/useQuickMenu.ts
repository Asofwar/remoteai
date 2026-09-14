import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyThemeMode, loadThemeMode } from "../../utils/themeMode";
import type { MenuEntry, MenuSnapshot } from "./types";

export function useQuickMenu() {
  const [snapshot, setSnapshot] = useState<MenuSnapshot | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let pending = false;
    let loading = false;
    const load = async () => {
      pending = true;
      if (loading) return;
      loading = true;
      try {
        while (pending && !disposed) {
          pending = false;
          const next = await invoke<MenuSnapshot>("quick_menu_snapshot");
          if (disposed) return;
          applyThemeMode(loadThemeMode());
          setError("");
          setSnapshot(next);
        }
      } catch {
        if (!disposed) setError("菜单暂时无法加载，请重新打开。");
      } finally { loading = false; }
    };
    // Subscribe before reading so a second right click cannot be lost during startup.
    const subscription = listen("quick-menu-refresh", () => { void load(); });
    void subscription.then(load).catch(() => {
      if (!disposed) setError("菜单暂时无法加载，请重新打开。");
    });
    return () => { disposed = true; void subscription.then((unlisten) => unlisten()).catch(console.error); };
  }, []);

  useEffect(() => {
    if (!snapshot || !panel.current) return;
    let disposed = false;
    const element = panel.current;
    const header = element.querySelector<HTMLElement>(".quick-menu-header");
    const content = element.querySelector<HTMLElement>(".quick-menu-scroll");
    const actions = element.querySelector<HTMLElement>(".quick-menu-actions");
    const panelSpacing = 32;
    const height = content
      ? content.scrollHeight + (header?.offsetHeight ?? 0) + (actions?.offsetHeight ?? 0) + panelSpacing : 620;
    // Hidden WebViews can suspend animation frames; showing the window must not wait for one.
    void invoke("quick_menu_present", { request: { revision: snapshot.revision, height } }).then(() => {
      if (disposed) return;
      panel.current?.querySelector<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)')?.focus();
    }).catch(() => { if (!disposed) setError("菜单暂时无法显示，请重新打开。"); });
    return () => { disposed = true; };
  }, [snapshot]);

  const dismiss = useCallback(() => {
    void invoke("quick_menu_dismiss").catch(console.error);
  }, []);
  const activate = useCallback(async (entry: MenuEntry) => {
    if (!snapshot || !entry.enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      await invoke("quick_menu_activate", { request: { revision: snapshot.revision, id: entry.id } });
    } catch { setError("操作未完成，请重新打开菜单再试。"); }
    finally { inFlight.current = false; }
  }, [snapshot]);

  return { snapshot, panel, error, activate, dismiss };
}
