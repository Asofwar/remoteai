  const hasActiveProxyModelQuery = () => queryClient.getQueryCache().getAll().some(query => {
    const key = query.queryKey;
    const active = typeof query.isActive === "function"
      ? query.isActive()
      : (query.observers?.length ?? 0) > 0;
    return active && matchesModelsQuery(query) && key[2] === "local" && key[3] === "no-auth";
  });
  const syncComposerStatus = () => {
    // Proxy accounting does not include requests made through ChatGPT's own login.
    const allowed = proxyRunning && hasActiveProxyModelQuery();
    const fastModeAllowed = allowed && fastModeModels.size > 0;
    const changed = window.__CODEX_SWITCH_COMPOSER_STATUS_ALLOWED__ !== allowed ||
      window.__CODEX_SWITCH_FAST_MODE_ALLOWED__ !== fastModeAllowed;
    window.__CODEX_SWITCH_COMPOSER_STATUS_ALLOWED__ = allowed;
    window.__CODEX_SWITCH_FAST_MODE_ALLOWED__ = fastModeAllowed;
    if (changed) window.__CODEX_SWITCH_REFRESH_SPEED_SELECTOR__?.();
  };
  syncComposerStatus();
  window.__CODEX_SWITCH_COMPOSER_STATUS_OBSERVER__?.unsubscribe?.();
  window.__CODEX_SWITCH_COMPOSER_STATUS_OBSERVER__ = {
    proxyRunning,
    unsubscribe: queryClient.getQueryCache().subscribe(event => {
      if (matchesModelsQuery(event?.query)) syncComposerStatus();
    }),
  };
  syncComposerStatus();
