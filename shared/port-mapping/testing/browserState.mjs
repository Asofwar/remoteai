export const browserStateFiles = {
  '/classic-history': ['text/html', '<h1>Classic history</h1><p id="result"></p><button id="back">Go back</button>'
    + '<script>var classicSharedState = "shared";</script><script>"use strict";'
    + 'history.replaceState({index:0},"",window.location.href);'
    + 'window.history.pushState({index:1},"","/classic-next");'
    + 'document.querySelector("#result").textContent=classicSharedState+":"+history.state.index;'
    + 'window.addEventListener("popstate",()=>document.querySelector("#result").textContent="back:"+history.state.index);'
    + 'document.querySelector("#back").onclick=()=>history.back();</script>'],
  '/missing-media': ['text/html', '<h1>Missing media app</h1><img alt="Missing logo" src="/missing.png">'
    + '<style>@font-face{font-family:missing;src:url(/missing.woff2)}h1{color:rgb(18,56,42)}</style>'
    + '<button id="action">Continue using page</button><p id="result"></p>'
    + '<script type="module">document.querySelector("#action").onclick=()=>{'
    + 'const image=new Image();image.src="/missing-late.png";document.body.append(image);'
    + 'document.querySelector("#result").textContent="Still working";};</script>'],
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
