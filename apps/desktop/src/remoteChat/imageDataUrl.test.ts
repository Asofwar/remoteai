import { expect, it } from 'vitest';
import { normalizeImageDataUrl } from '../../../../shared/remote-chat/imageDataUrl';

it.each([
  ['\x89PNG\r\n\x1a\n', 'png'], ['\xff\xd8\xff', 'jpeg'],
  ['GIF87a', 'gif'], ['GIF89a', 'gif'], ['RIFF\0\0\0\0WEBP', 'webp'],
])('uses the actual %s signature and preserves the payload', (signature, format) => {
  const encoded = btoa(signature + 'original-pixels');
  const normalized = `data:image/${format};base64,${encoded}`;
  expect(normalizeImageDataUrl(`data:image/jpeg;base64,${encoded}`)).toBe(normalized);
  expect(normalizeImageDataUrl(normalized)).toBe(normalized);
});

it.each(['file:///image.png', 'data:image/png;base64,!invalid', 'data:image/png;base64,',
  `data:image/png;base64,${btoa('<svg></svg>')}`, `data:text/html;base64,${btoa('\x89PNG\r\n\x1a\n')}`,
])('leaves unrecognized input for host validation: %s', source => {
  expect(normalizeImageDataUrl(source)).toBe(source);
});
