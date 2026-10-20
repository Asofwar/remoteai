  const hasActiveLocalModelQuery = (authMethod = null) => queryClient.getQueryCache().getAll().some(query => {
    const key = query.queryKey;
    const active = typeof query.isActive === "function"
      ? query.isActive()
      : (query.observers?.length ?? 0) > 0;
    return active && matchesModelsQuery(query) && key[2] === "local" &&
      (authMethod === null || key[3] === authMethod);
  });
  const syncComposerStatus = () => {
    // Daily usage is independent of login mode; authenticated Codex owns its native Fast control.
    const allowed = hasActiveLocalModelQuery();
    const fastModeAllowed = fastModeModels.size > 0 && hasActiveLocalModelQuery("no-auth");
    const changed = window.__CODEX_SWITCH_COMPOSER_STATUS_ALLOWED__ !== allowed ||
      window.__CODEX_SWITCH_FAST_MODE_ALLOWED__ !== fastModeAllowed;
    window.__CODEX_SWITCH_COMPOSER_STATUS_ALLOWED__ = allowed;
    window.__CODEX_SWITCH_FAST_MODE_ALLOWED__ = fastModeAllowed;
    if (changed) window.__CODEX_SWITCH_REFRESH_SPEED_SELECTOR__?.();
  };
  syncComposerStatus();
  window.__CODEX_SWITCH_COMPOSER_STATUS_OBSERVER__?.unsubscribe?.();
  window.__CODEX_SWITCH_COMPOSER_STATUS_OBSERVER__ = {
    unsubscribe: queryClient.getQueryCache().subscribe(event => {
      if (matchesModelsQuery(event?.query)) syncComposerStatus();
    }),
  };
  syncComposerStatus();
