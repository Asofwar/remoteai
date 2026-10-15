import { expect, it } from 'vitest';
import { mappingAddress, mappingOrigin, normalizeMappingHost } from '../../../../../../shared/port-mapping/target';
import { httpRequest, mappingUrl } from '../../../../../../shared/port-mapping/http';

it.each([
  ['', '127.0.0.1'], [' 192.168.1.20 ', '192.168.1.20'], ['10.0.0.10', '10.0.0.10'],
  ['::1', '::1'], ['[2001:0db8::1]', '2001:db8::1'], ['::ffff:192.168.1.20', '::ffff:c0a8:114'],
])('normalizes the selected IP %s', (input, expected) => {
  expect(normalizeMappingHost(input)).toBe(expected);
});

it.each(['localhost', 'example.com', '127.1', '0x7f000001', '192.168.001.2', '256.1.1.1',
  '192.168.1.2:80', 'http://192.168.1.2', '1.2.3.4/path', '1.2.3.4?x', 'user@1.2.3.4',
  '1.2.3.4#x', '1.2.3.4\\path', '1.2.3.4\n.evil', '[::1]:80', ':::1', 'fe80::1%eth0', '0.0.0.0', '::'])
('rejects invalid or ambiguous target %s', input => {
  expect(() => normalizeMappingHost(input)).toThrow('IPv4 或 IPv6');
});

it('preserves IPv6 brackets and HTTP Host while limiting preview requests to the selected target', () => {
  const target = { remoteHost: '2001:db8::1', remotePort: 8080 };
  expect(mappingAddress(target)).toBe('[2001:db8::1]:8080');
  const origin = mappingOrigin(target);
  expect(mappingUrl('/api', origin).href).toBe('http://[2001:db8::1]:8080/api');
  expect(new TextDecoder().decode(httpRequest({ url: '/api' }, origin))).toContain('Host: [2001:db8::1]:8080');
  for (const url of ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://[2001:db8::2]:8080',
    'http://[2001:db8::1]:8081']) expect(() => mappingUrl(url, origin)).toThrow('origin');
});
