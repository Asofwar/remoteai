import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { patchImplementation, patchPods } = require('./patch-cocoa-udp.cjs') as {
  patchImplementation: (source: string) => string; patchPods: (directory: string, version: string) => void;
};
const { addUdpHook } = require('../plugins/withIosUdp.cjs') as { addUdpHook: (source: string) => string };
const receive = 'if (result == 0)\n\t{\n\t\twaitingForSocket = YES;\n\t}\n\telse if (result < 0)';
const entry = 'if ([data length] == 0) { LogWarn(@"Ignoring attempt to send nil/empty data."); return; }';
const source = `${entry}\n${entry}\n${entry}\n- (void)doSend\n{\n${receive}\n}\n`
  + `- (void)endCurrentSend\n{}\n- (void)doReceive\n{\n${receive}\n}`;

it('keeps empty sends in the native queue and completes zero-byte success without changing receive logic', () => {
  const patched = patchImplementation(source);
  expect(patchImplementation(patched)).toBe(patched);
  expect(patched.match(/if \(data == nil\)/g)).toHaveLength(3);
  expect(patched).toContain('if (result == 0 && [currentSend->buffer length] > 0)');
  expect(patched.split('- (void)doReceive\n')[1]).toBe(source.split('- (void)doReceive\n')[1]);
  expect(() => patchImplementation(source.replace(entry, 'changed upstream'))).toThrow('Review');
  expect(() => patchPods('unopened-pods', '7.6.6')).toThrow('Review');
});

it('applies the UDP fix once on every pod install and propagates an unreviewed dependency failure', () => {
  const original = 'target "App" do\n  post_install do |installer|\n  end\nend';
  const patched = addUdpHook(original);
  expect(addUdpHook(patched)).toBe(patched);
  expect(patched).toContain('patch-cocoa-udp.cjs');
  expect(patched).toContain('udp_pod.root_spec.version.to_s, exception: true');
  expect(() => addUdpHook('changed Podfile')).toThrow('Review');
});

it('bounds native sends and registers callbacks before submission', () => {
  require('./patch-udp.cjs');
  const directory = dirname(require.resolve('react-native-udp/package.json'));
  const native = readFileSync(join(directory, 'ios/UdpSocketClient.m'), 'utf8');
  const send = native.slice(native.indexOf('- (void) send:'));
  expect(native).toContain('static const NSTimeInterval RCTUDPSendTimeout = 5.0;');
  expect(send).toContain('withTimeout:RCTUDPSendTimeout tag:tag');
  expect(send.indexOf('[self setPendingSend:callback')).toBeLessThan(send.indexOf('[_udpSocket sendData:'));
});
