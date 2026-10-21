import { useEffect, useRef, useState } from "react";
import { backendText } from "../../../../../shared/i18n/backend/translateBackendMessage";

import { fetchPresetModels } from "../../api/backend";
import type { ProviderRequestOptions } from "../../types";
import type { Translate } from "../../i18n";

const API_KEY_AUTOFETCH_DELAY_MS = 800;
const MIN_API_KEY_LENGTH_FOR_AUTOFETCH = 8;

interface PresetModelLoaderOptions {
  presetId: string;
  baseUrl: string;
  apiKey: string;
  providerId?: string;
  requestOptions?: ProviderRequestOptions;
  savedCredentialAvailable: boolean;
  apiKeyRequired: boolean;
  modelsAvailable: boolean;
  fallbackModels: string[];
  onModels: (models: string[]) => void;
  t: Translate;
}

export function usePresetModelLoader(options: PresetModelLoaderOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedCount, setLoadedCount] = useState<number | null>(null);
  const requestId = useRef(0);
  const pending = useRef(false);
  const queued = useRef(false);
  const mounted = useRef(true);
  const latestLoad = useRef<() => Promise<void>>();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestId.current += 1; queued.current = false; };
  }, []);
  const optionsKey = JSON.stringify(options.requestOptions);

  const credentialAvailable = Boolean(
    !options.apiKeyRequired
    || options.apiKey.trim()
    || options.savedCredentialAvailable,
  );

  const loadModels = async () => {
    if (!options.modelsAvailable) return;
    if (pending.current) { queued.current = true; return; }
    if (!credentialAvailable) {
      setError(options.t("providers.catalog.modelsNeedKey"));
      return;
    }
    pending.current = true;
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError("");
    setLoadedCount(null);
    try {
      const latest = await fetchPresetModels({
        presetId: options.presetId,
        requestOptions: options.requestOptions,
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        providerId: options.savedCredentialAvailable ? options.providerId : undefined,
      }, options.fallbackModels);
      if (currentRequestId !== requestId.current) return;
      options.onModels(latest);
      setLoadedCount(latest.length);
    } catch (loadError) {
      if (currentRequestId !== requestId.current) return;
      setError(options.t("providers.catalog.modelsFetchFailed", {
        error: backendText(String(loadError).replace(/^Error:\s*/, "")),
      }));
    } finally {
      pending.current = false;
      if (currentRequestId === requestId.current && mounted.current) setLoading(false);
      if (queued.current && mounted.current) {
        queued.current = false;
        void latestLoad.current?.();
      }
    }
  };

  latestLoad.current = loadModels;

  useEffect(() => {
    requestId.current += 1;
    queued.current = false;
    setLoading(false);
    setError("");
    setLoadedCount(null);
  }, [options.baseUrl, options.presetId, options.apiKey, options.providerId,
    options.modelsAvailable, options.savedCredentialAvailable, optionsKey]);

  useEffect(() => {
    // Opening or editing a saved provider must keep manually chosen models until an explicit refresh.
    if (options.providerId || !options.modelsAvailable || !credentialAvailable) return;
    const keyReady = options.apiKey.trim().length >= MIN_API_KEY_LENGTH_FOR_AUTOFETCH;
    if (options.apiKeyRequired && !keyReady && !options.savedCredentialAvailable) return;
    const delay = options.savedCredentialAvailable || !options.apiKeyRequired
      ? 0
      : API_KEY_AUTOFETCH_DELAY_MS;
    const timer = window.setTimeout(() => void loadModels(), delay);
    return () => { window.clearTimeout(timer); requestId.current += 1; };
    // The callback fields are intentionally read at execution time; these dependencies identify
    // the credential or endpoint changes that should start a fresh single-flight model query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    optionsKey,
    options.apiKey,
    options.apiKeyRequired,
    options.baseUrl,
    options.modelsAvailable,
    options.presetId,
    options.providerId,
    options.savedCredentialAvailable,
  ]);

  return { credentialAvailable, error, loadedCount, loading, loadModels };
}
