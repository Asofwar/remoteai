const fs = require('node:fs');
const path = require('node:path');

function replace(source, before, after, count) {
  if (source.split(after).length === count + 1) return source;
  if (source.split(before).length !== count + 1) throw new Error('Review CocoaAsyncSocket UDP source changes.');
  return source.split(before).join(after);
}

function patchImplementation(source) {
  // Empty UDP datagrams are valid. Only nil data should be ignored by the three send entry points.
  source = replace(source, 'if ([data length] == 0)', 'if (data == nil)', 3);
  source = replace(source, 'Ignoring attempt to send nil/empty data.', 'Ignoring attempt to send nil data.', 3);
  // sendto returns zero on a successful empty send; it must complete and advance the native send queue.
  const before = 'if (result == 0)\n\t{\n\t\twaitingForSocket = YES;\n\t}\n\telse if (result < 0)';
  const start = source.indexOf('- (void)doSend\n');
  const end = source.indexOf('- (void)endCurrentSend\n', start);
  if (start < 0 || end < 0) throw new Error('Review CocoaAsyncSocket UDP send implementation.');
  const send = replace(source.slice(start, end), before,
    before.replace('result == 0', 'result == 0 && [currentSend->buffer length] > 0'), 1);
  return source.slice(0, start) + send + source.slice(end);
}

function patchPods(pods, version) {
  if (version !== '7.6.5') throw new Error('Review iOS UDP empty datagrams before upgrading CocoaAsyncSocket.');
  const file = path.join(pods, 'CocoaAsyncSocket/Source/GCD/GCDAsyncUdpSocket.m');
  const original = fs.readFileSync(file, 'utf8');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const source = patchImplementation(original.replace(/\r\n/g, '\n')).replace(/\n/g, newline);
  fs.chmodSync(file, fs.statSync(file).mode | 0o200);
  fs.writeFileSync(file, source);
}

if (require.main === module) patchPods(path.resolve(process.argv[2] || 'ios/Pods'), process.argv[3]);
module.exports = { patchImplementation, patchPods };
