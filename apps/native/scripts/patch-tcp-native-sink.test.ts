import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { patchClient, patchModule } = require('./patch-tcp-native-sink.cjs') as {
  patchClient: (source: string) => string; patchModule: (source: string) => string;
};
const directory = join(dirname(require.resolve('react-native-tcp-socket/package.json')),
  'android/src/main/java/com/asterinet/react/tcpsocket');

it.each([['TcpSocketClient.java', patchClient], ['TcpSocketModule.java', patchModule]] as const)(
  'keeps the native sink patch idempotent and rejects changed %s sources', (name, patch) => {
    const source = readFileSync(join(directory, name), 'utf8');
    expect(patch(patch(source))).toBe(patch(source));
    const crlf = source.replace(/\r?\n/g, '\r\n');
    expect(patch(crlf)).toBe(crlf);
    expect(() => patch('upstream changed')).toThrow('source changed');
    expect(() => patch(source + source)).toThrow('source changed');
  });
