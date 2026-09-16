import { useCallback, useEffect, useRef, useState } from "react";
import {
  chromePluginAction, chromePluginStatus, type ChromePluginAction, type ChromePluginStatus,
} from "../../../api/chromePlugin";

const REFRESH_INTERVAL_MS = 5000;

export function useChromePlugin(homeId: string, active: boolean) {
  const [status, setStatus] = useState<ChromePluginStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loading = useRef(false);
  const pendingRefresh = useRef<(() => void) | null>(null);
  const changing = useRef(false);
  const attemptedInstall = useRef(false);
  const revision = useRef(0);
  const actionError = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const refresh = useCallback(async () => {
    if (loading.current || changing.current) return;
    loading.current = true;
    const started = revision.current;
    try {
      let result = await chromePluginStatus(homeId);
      if (mounted.current && started === revision.current && result.supported
        && !result.installed && !attemptedInstall.current) {
        attemptedInstall.current = true;
        changing.current = true;
        setStatus(result);
        setBusy(true);
        try {
          result = await chromePluginAction(homeId, "ensureInstalled");
        } catch (caught) {
          actionError.current = true;
          if (mounted.current && started === revision.current) setError(String(caught));
          throw caught;
        } finally {
          changing.current = false;
          if (mounted.current) setBusy(false);
        }
      }
      if (mounted.current && started === revision.current) {
        setStatus(result);
        if (!actionError.current) setError("");
      }
    } catch (caught) {
      if (mounted.current && started === revision.current && !actionError.current) setError(String(caught));
    } finally {
      loading.current = false;
      const pending = pendingRefresh.current;
      pendingRefresh.current = null;
      pending?.();
    }
  }, [homeId]);

  useEffect(() => {
    if (!active) return;
    if (loading.current) pendingRefresh.current = () => void refresh();
    else void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      pendingRefresh.current = null;
      revision.current += 1;
    };
  }, [active, refresh]);

  const run = async (action: ChromePluginAction) => {
    if (changing.current) return false;
    changing.current = true;
    revision.current += 1;
    actionError.current = false;
    setBusy(true);
    setError("");
    try {
      const result = await chromePluginAction(homeId, action);
      if (mounted.current) setStatus(result);
      return true;
    } catch (caught) {
      actionError.current = true;
      if (mounted.current) setError(String(caught));
      return false;
    } finally {
      changing.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return { status, error, busy, refresh, run };
}
