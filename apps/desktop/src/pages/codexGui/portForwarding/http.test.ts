import { expect, it } from 'vitest';
import { HttpResponseReader, httpRequest, mappingUrl } from '../../../../../../shared/port-mapping/http';
import { encodeFrame, WebSocketFrames } from '../../../../../../shared/port-mapping/websocket';

const bytes = (text: string) => new TextEncoder().encode(text);
it('reads split chunked binary responses and completes length-framed responses without waiting for close', () => {
  const reader = new HttpResponseReader();
  expect(reader.push(bytes('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n'), false)).toBeUndefined();
  expect(reader.push(bytes('\r\n3\r\nabc\r\n2\r\nd'), false)).toBeUndefined();
  expect(reader.push(bytes('e\r\n0\r\n\r\n'), false)?.body).toEqual(bytes('abcde'));
  const length = new HttpResponseReader();
  expect(length.push(bytes('HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\nabc'), false)?.body).toEqual(bytes('abc'));
});
it('rejects truncated replies, invalid chunk boundaries, oversized replies and invalid status lines', () => {
  expect(() => new HttpResponseReader().push(bytes('HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nx'), true))
    .toThrow('Truncated');
  expect(() => new HttpResponseReader().push(bytes('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1\r\nxzz'), true))
    .toThrow('boundary');
  expect(() => new HttpResponseReader().push(bytes('HTTP/1.1 200 OK\r\nContent-Length: 999999999\r\n\r\n'), false))
    .toThrow('length');
  expect(() => new HttpResponseReader().push(bytes('bogus\r\n\r\n'), true)).toThrow('response');
});
it('restricts requests to the mapped origin and removes browser-owned headers', () => {
  const origin = 'http://127.0.0.1:3000';
  expect(mappingUrl('http://localhost:3000/a', origin).href).toBe(origin + '/a');
  for (const url of ['http://127.0.0.1:4000', 'https://example.com', 'file:///test', 'http://user@127.0.0.1:3000']) {
    expect(() => httpRequest({ url }, origin)).toThrow();
  }
  const request = new TextDecoder().decode(httpRequest({ url: '/api', method: 'POST', body: bytes('hello'),
    headers: [['Cookie', 'host-secret'], ['Host', 'other'], ['Content-Type', 'text/plain']] }, origin));
  expect(request).toContain('Host: 127.0.0.1:3000'); expect(request).toContain('Content-Length: 5');
  expect(request).not.toContain('host-secret'); expect(request).not.toContain('other');
  expect(() => httpRequest({ url: '/', headers: [['X-Test', 'value\r\nInjected: x']] }, origin)).toThrow('header');
});
it('reassembles fragmented WebSocket frames around ping control messages and masks outgoing data', () => {
  const parser = new WebSocketFrames();
  expect(parser.push(Uint8Array.from([0x01, 2, 104]))).toEqual([]);
  expect(parser.push(Uint8Array.from([105, 0x89, 1, 33, 0x80, 1, 33])))
    .toEqual([{ opcode: 9, data: bytes('!') }, { opcode: 1, data: bytes('hi!') }]);
  const encoded = encodeFrame(1, bytes('hello'));
  expect(encoded[0]).toBe(0x81); expect(encoded[1]).toBe(0x85);
  expect(Uint8Array.from(encoded.slice(6), (value, index) => value ^ encoded[2 + index % 4])).toEqual(bytes('hello'));
});
