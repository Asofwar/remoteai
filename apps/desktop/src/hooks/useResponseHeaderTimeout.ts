import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_RESPONSE_HEADER_TIMEOUT,
  loadResponseHeaderTimeout,
  MAX_RESPONSE_HEADER_TIMEOUT_SECONDS,
  saveResponseHeaderTimeout,
} from "../api/responseHeaderTimeout";

export function useResponseHeaderTimeout(notify: (message: string) => void) {
  const [settings, setSettings] = useState(DEFAULT_RESPONSE_HEADER_TIMEOUT);
  const [loading, setLoading] = useState(true);
  const busy = useRef(true);
  const mounted = useRef(false);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    busy.current = true;
    setLoading(true);
    void loadResponseHeaderTimeout()
      .then((saved) => { if (active) setSettings(saved); })
      .catch((error: unknown) => { if (active) notify(String(error)); })
      .finally(() => {
        if (active) { busy.current = false; setLoading(false); }
      });
    return () => { active = false; mounted.current = false; };
  }, [notify]);

  const updateSeconds = useCallback(async (value: number | string | null) => {
    if (busy.current || value === null || value === "") return;
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_RESPONSE_HEADER_TIMEOUT_SECONDS) return;
    busy.current = true;
    setLoading(true);
    try {
      const saved = await saveResponseHeaderTimeout({ timeoutSeconds: seconds });
      if (mounted.current) setSettings(saved);
    } catch (error) {
      if (mounted.current) notify(String(error));
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [notify]);

  return { settings, loading, updateSeconds };
}
