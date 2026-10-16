export const browserStateFiles = {
  '/browser-state': ['text/html', '<h1>Browser state</h1><p id="state"></p>'
    + '<script type="module" src="/browser-state.js"></script>'],
  '/browser-state.js': ['text/javascript', `
const previous = localStorage.getItem('preview-count') ?? '0';
localStorage.example = 'property access';
if (localStorage.example !== 'property access' || !Object.keys(localStorage).includes('example')) {
  throw new Error('Storage property access failed');
}
delete localStorage.example;
localStorage.setItem('__proto__', 'safe');
if (localStorage.getItem('__proto__') !== 'safe') throw new Error('Storage key handling failed');
localStorage.removeItem('__proto__');
localStorage.setItem('preview-count', String(Number(previous) + 1));
sessionStorage.setItem('preview-session', 'available');
document.querySelector('#state').textContent = [previous, sessionStorage.getItem('preview-session'),
  localStorage.getItem('mapping-secret') ?? 'isolated'].join(' / ');
`],
  '/broken-cookie': ['text/html', '<script type="module">document.cookie</script>'],
  '/broken-classic': ['text/html', '<script>throw new Error("Fixture script failed")</script>'],
  '/broken-async': ['text/html', '<script>setTimeout(() => Promise.reject(null), 20)</script>'],
};
