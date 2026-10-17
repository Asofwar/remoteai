const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, before, after) {
  const normalized = source.replace(/\r\n/g, '\n');
  if (normalized.split(after).length === 2) return source;
  if (normalized.split(before).length !== 2) throw new Error('TCP socket source changed; review native sink patch.');
  return normalized.replace(before, after).replace(/\n/g, source.includes('\r\n') ? '\r\n' : '\n');
}

/** A narrow in-process API; only accepted plaintext loopback sockets can receive mapping bytes. */
function patchModule(source) {
  const anchor = '    private TcpSocketClient getTcpClient(final int id) {';
  return replaceOnce(source, anchor, `    public java.net.Socket portMappingSocket(final int id) {
        TcpSocketClient client = getTcpClient(id);
        java.net.Socket socket = client.getSocket();
        if (!client.isAcceptedForPortMapping() || socket == null || socket.isClosed() || !socket.isConnected()
                || socket instanceof javax.net.ssl.SSLSocket || !socket.getLocalAddress().isLoopbackAddress()
                || !socket.getInetAddress().isLoopbackAddress()) {
            throw new IllegalArgumentException("Port mapping socket unavailable");
        }
        return socket;
    }

${anchor}`);
}

function patchClient(source) {
  // Accepted clients already have their socket when constructed. Outbound clients start without one.
  source = replaceOnce(source, '\n    private final TcpEventListener receiverListener;',
    '\n    private final TcpEventListener receiverListener;\n    private final boolean acceptedForPortMapping;');
  source = replaceOnce(source, '        this.socket = socket;\n        this.receiverListener = receiverListener;',
    '        this.socket = socket;\n        this.acceptedForPortMapping = socket != null;\n'
      + '        this.receiverListener = receiverListener;');
  return replaceOnce(source, '    public Socket getSocket() {', `    public boolean isAcceptedForPortMapping() {
        return acceptedForPortMapping;
    }

    public Socket getSocket() {`);
}

function applyNativeSinkPatch(directory) {
  const java = 'android/src/main/java/com/asterinet/react/tcpsocket';
  const changes = [
    [`${java}/TcpSocketModule.java`, patchModule],
    [`${java}/TcpSocketClient.java`, patchClient],
    ['src/Socket.js', source => replaceOnce(source, '    get readyState() {',
      '    get nativePortMappingSocketId() { return this._id; }\n\n    get readyState() {')],
    ['lib/types/Socket.d.ts', source => replaceOnce(source, '    get readyState()',
      '    readonly nativePortMappingSocketId: number;\n    get readyState()')],
  ];
  for (const [name, patch] of changes) {
    const file = path.join(directory, name), source = fs.readFileSync(file, 'utf8');
    const changed = patch(source);
    if (changed !== source) fs.writeFileSync(file, changed);
  }
}

module.exports = { applyNativeSinkPatch, patchModule, patchClient };
