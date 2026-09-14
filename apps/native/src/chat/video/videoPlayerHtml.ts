/** This document contains only our own controls and a validated loopback video URL. */
export function videoPlayerHtml(url: string) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/[a-z\d-]{36}$/i.test(url)) throw new Error('Invalid video URL');
  return `<!doctype html><html><head><meta name="viewport"
    content="width=device-width,initial-scale=1,maximum-scale=1">
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; media-src http://127.0.0.1:*; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
    <style>html,body{margin:0;width:100%;height:100%;background:#000;color:#fff}
    video{width:100%;height:100%;object-fit:contain}</style></head>
    <body><video id="player" controls playsinline preload="metadata" src="${url}"
      controlslist="nodownload noremoteplayback" disablepictureinpicture aria-label="视频播放器"></video>
    <script>
      const player = document.getElementById('player');
      const send = (type) => window.ReactNativeWebView.postMessage(type);
      player.addEventListener('error', () => send('error'));
      player.addEventListener('loadedmetadata', () => send('ready'));
      document.addEventListener('visibilitychange', () => { if (document.hidden) player.pause(); });
    </script></body></html>`;
}
