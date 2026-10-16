window.__installPreviewBrowser = (url, events) => {
  const navigation = window.__createPreviewNavigation(url, events);
  delete window.__createPreviewNavigation;
  // Server-rendered pages also use History from classic scripts, which retain their global scope.
  Object.defineProperty(window, 'history', { configurable: true, value: navigation.history });
  let previewWindow;
  function facade(target, overrides) {
    const bound = new Map();
    return new Proxy(Object.create(null), {
      get(_, key) {
        if (Object.hasOwn(overrides, key)) return overrides[key];
        const value = Reflect.get(target, key, target);
        // Native DOM methods require their original receiver; constructors retain their static properties.
        if (typeof value !== 'function' || value.prototype || !String(value).includes('[native code]')) return value;
        if (!bound.has(value)) bound.set(value, value.bind(target));
        return bound.get(value);
      },
      set(_, key, value) {
        if (key === 'location') { navigation.location.assign(value); return true; }
        return Reflect.set(target, key, value, target);
      },
      has(_, key) { return Object.hasOwn(overrides, key) || key in target; },
      ownKeys() { return [...new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(overrides)])]; },
      getOwnPropertyDescriptor(_, key) {
        if (Object.hasOwn(overrides, key) || key in target) return { configurable: true, enumerable: true };
      },
    });
  }
  const previewDocument = facade(document, {
    get location() { return navigation.location; }, get defaultView() { return previewWindow; },
    get URL() { return navigation.location.href; }, get documentURI() { return navigation.location.href; },
    get baseURI() { return navigation.location.href; },
  });
  previewWindow = facade(window, {
    get window() { return previewWindow; }, get self() { return previewWindow; },
    get globalThis() { return previewWindow; }, get document() { return previewDocument; },
    get location() { return navigation.location; }, get history() { return navigation.history; },
    get origin() { return navigation.location.origin; },
  });
  window.__previewBrowser = { window: previewWindow, self: previewWindow, globalThis: previewWindow,
    document: previewDocument, location: navigation.location, history: navigation.history };
};
