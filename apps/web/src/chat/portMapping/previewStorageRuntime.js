window.__installPreviewStorage = (snapshot, notify) => {
  function createStorage(area) {
    const entries = new Map(snapshot[area]);
    let bytes = [...entries].reduce((total, [key, value]) => total + (key.length + value.length) * 2, 0);
    const changed = (operation, key, value) => notify({ type: 'storage', area, operation, key, value });
    const methods = {
      key(index) { return [...entries.keys()][Number(index) >>> 0] ?? null; },
      getItem(key) { return entries.get(String(key)) ?? null; },
      setItem(key, value) {
        key = String(key); value = String(value);
        const previous = entries.get(key);
        const next = bytes + (key.length + value.length) * 2
          - (previous === undefined ? 0 : (key.length + previous.length) * 2);
        if (next > snapshot.limit) throw new DOMException('Preview storage is full', 'QuotaExceededError');
        entries.set(key, value); bytes = next; changed('set', key, value);
      },
      removeItem(key) {
        key = String(key);
        const previous = entries.get(key);
        if (previous === undefined) return;
        bytes -= (key.length + previous.length) * 2;
        entries.delete(key); changed('remove', key);
      },
      clear() { entries.clear(); bytes = 0; changed('clear'); },
    };
    const target = Object.create(Storage.prototype);
    return new Proxy(target, {
      get(_, key) {
        if (key === 'length') return entries.size;
        if (Object.hasOwn(methods, key)) return methods[key];
        return entries.get(key) ?? Reflect.get(target, key);
      },
      set(_, key, value) { methods.setItem(key, value); return true; },
      deleteProperty(_, key) { methods.removeItem(key); return true; },
      ownKeys() { return [...entries.keys()]; },
      has(_, key) { return entries.has(key) || key in target; },
      getOwnPropertyDescriptor(_, key) {
        if (entries.has(key)) return { configurable: true, enumerable: true, writable: true, value: entries.get(key) };
      },
    });
  }
  for (const area of ['localStorage', 'sessionStorage']) {
    const storage = createStorage(area);
    Object.defineProperty(window, area, { configurable: true, get: () => storage });
  }
};
