window.__createPreviewNavigation = (initialUrl, events) => {
  const MAX_HISTORY_ENTRIES = 128;
  const origin = new URL(initialUrl).origin;
  const nativeDocument = new URL(window.location.href);
  let entries = [{ url: initialUrl, state: null }];
  let index = 0;
  let current = new URL(initialUrl);
  function resolve(value) {
    const url = new URL(value == null ? current.href : String(value), current);
    // Classic scripts may pass the sandbox's own URL when updating only history state.
    if (url.href.split('#')[0] === nativeDocument.href.split('#')[0]) {
      const mapped = new URL(current); mapped.hash = url.hash; return mapped;
    }
    if (url.origin !== origin || url.username || url.password) {
      throw new DOMException('History state must stay within the preview', 'SecurityError');
    }
    return url;
  }
  function update(state, value, replace) {
    const url = resolve(value);
    const entry = { url: url.href, state: structuredClone(state) };
    if (replace) entries[index] = entry;
    else {
      entries.splice(index + 1, entries.length, entry);
      if (entries.length > MAX_HISTORY_ENTRIES) entries.shift();
      index = entries.length - 1;
    }
    current = url;
    events.route(current.href);
  }
  function changed(previous) {
    window.dispatchEvent(new PopStateEvent('popstate', { state: structuredClone(entries[index].state) }));
    if (previous.hash !== current.hash) {
      window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: previous.href, newURL: current.href }));
    }
  }
  function navigate(value, replace = false) {
    const next = resolve(value);
    if (next.pathname !== current.pathname || next.search !== current.search) {
      events.navigate(next.href); return;
    }
    const previous = current;
    update(null, next.href, replace);
    setTimeout(() => changed(previous), 0);
  }
  const history = {
    get state() { return structuredClone(entries[index].state); },
    get length() { return entries.length; },
    scrollRestoration: 'auto',
    pushState(state, unused, url) { update(state, url, false); },
    replaceState(state, unused, url) { update(state, url, true); },
    back() { history.go(-1); }, forward() { history.go(1); },
    go(delta = 0) {
      delta = Math.trunc(Number(delta)) || 0;
      if (!delta) { events.navigate(current.href); return; }
      setTimeout(() => {
        const next = index + delta;
        if (next < 0 || next >= entries.length) return;
        const previous = current;
        index = next; current = new URL(entries[index].url);
        events.route(current.href); changed(previous);
      }, 0);
    },
  };
  const location = { assign: value => navigate(value), replace: value => navigate(value, true),
    reload: () => events.navigate(current.href), toString: () => current.href };
  for (const key of ['href', 'protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash']) {
    Object.defineProperty(location, key, { enumerable: true, get: () => current[key], set(value) {
      const next = new URL(current); next[key] = value; navigate(next.href);
    } });
  }
  Object.defineProperty(location, 'origin', { enumerable: true, get: () => current.origin });
  return { history, location };
};
