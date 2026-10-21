import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_PROXY_TRANSPORT, loadProxyTransport, MAX_PROXY_TRANSPORT_COUNT, saveProxyTransport,
  type ProxyTransportSettings,
} from "../api/proxyTransport";

export function useProxyTransport(notify: (message: string) => void) {
  const [settings, setSettings] = useState(DEFAULT_PROXY_TRANSPORT);
  const [loading, setLoading] = useState(true);
  const busy = useRef(true);
  const mounted = useRef(false);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    busy.current = true;
    setLoading(true);
    void loadProxyTransport()
      .then((saved) => { if (active) setSettings(saved); })
      .catch((error: unknown) => { if (active) notify(String(error)); })
      .finally(() => {
        if (active) { busy.current = false; setLoading(false); }
      });
    return () => { active = false; mounted.current = false; };
  }, [notify]);

  const updateCount = useCallback(async (field: keyof ProxyTransportSettings, value: number | string | null) => {
    if (busy.current || value === null || value === "") return;
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0 || count > MAX_PROXY_TRANSPORT_COUNT) return;
    busy.current = true;
    setLoading(true);
    try {
      const saved = await saveProxyTransport({ ...settings, [field]: count });
      if (mounted.current) setSettings(saved);
    } catch (error) {
      if (mounted.current) notify(String(error));
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [notify, settings]);

  return { settings, loading, updateCount };
}
