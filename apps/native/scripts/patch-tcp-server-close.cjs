const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, before, after) {
  if (source.split(after).length === 2) return source;
  if (source.split(before).length !== 2) throw new Error('TCP server source changed; review close acknowledgement patch.');
  return source.replace(before, after);
}

/** Fixed port mappings must wait for the native socket to close before advertising that the port is free. */
function patchServerClose(source) {
  const crlf = source.includes('\r\n');
  let value = source.replace(/\r\n/g, '\n');
  value = replaceOnce(value, '        this.listening = false;\n\n        // Handle optional options argument',
    '        this.listening = false;\n        this._nativeClosed = false;\n\n        // Handle optional options argument');
  value = replaceOnce(value, '        Sockets.listen(this._id, listenOptions);',
    '        this._nativeClosed = false;\n        if (!this._listeningListener) this._registerEvents();\n'
      + '        Sockets.listen(this._id, listenOptions);');
  value = replaceOnce(value, "        if (this._connections.size === 0) this.emit('close');",
    '        // The native close event confirms that the listener has released its port.');
  value = replaceOnce(value, '    _registerEvents() {', `    _registerEvents() {
        this._nativeCloseListener = this._eventEmitter.addListener('close', (evt) => {
            if (evt.id !== this._id) return;
            this._nativeClosed = true;
            this.listening = false;
            if (this._connections.size === 0) this.emit('close');
        });`);
  value = replaceOnce(value, "            if (!this.listening && this._connections.size === 0) this.emit('close');",
    "            if (this._nativeClosed && this._connections.size === 0) this.emit('close');");
  value = replaceOnce(value, '    _setDisconnected() {', `    _setDisconnected() {
        // A stopped mapping must not retain native emitter subscriptions through its closed server.
        for (const key of ['_listeningListener', '_errorListener', '_connectionsListener', '_nativeCloseListener']) {
            this[key]?.remove();
            this[key] = undefined;
        }`);
  value = replaceOnce(value, "            this.emit('error', evt.error);",
    "            this.emit('error', evt.error);\n            if (!this._localAddress) this._setDisconnected();");
  return crlf ? value.replace(/\n/g, '\r\n') : value;
}

function applyServerClosePatch(packageDirectory) {
  const file = path.join(packageDirectory, 'src/Server.js');
  const source = fs.readFileSync(file, 'utf8');
  const patched = patchServerClose(source);
  if (source !== patched) fs.writeFileSync(file, patched);
}
module.exports = { patchServerClose, applyServerClosePatch };
