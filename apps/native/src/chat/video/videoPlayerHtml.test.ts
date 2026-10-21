import { expect, it } from 'vitest';
import { videoPlayerHtml } from './videoPlayerHtml';

const url = 'http://127.0.0.1:41234/0f8fad5b-d9cb-469f-a165-70867728950e';

it('labels the player in the interface language', () => {
  expect(videoPlayerHtml(url, '视频播放器')).toContain('aria-label="视频播放器"');
  expect(videoPlayerHtml(url, 'Видеоплеер')).toContain('aria-label="Видеоплеер"');
});

it('keeps the label inside its attribute', () => {
  const html = videoPlayerHtml(url, '"><script>alert(1)</script>&');
  expect(html).toContain('aria-label="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;"');
  expect(html).not.toContain('<script>alert(1)');
});

it('still rejects URLs outside the loopback player', () => {
  expect(() => videoPlayerHtml('https://example.com/video.mp4', 'Video player')).toThrow('Invalid video URL');
});
