// Keep the native UDP adapter compatible with current Android builds and fixed-port mappings.
const fs = require('node:fs');
const path = require('node:path');
const root = path.dirname(require.resolve('react-native-udp/package.json'));
function replace(file, before, after) {
  const target = path.join(root, file);
  const source = fs.readFileSync(target, 'utf8');
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`UDP adapter patch no longer matches ${file}`);
  fs.writeFileSync(target, source.replace(before, after));
}
replace('android/build.gradle', 'android {', 'android {\n    namespace "com.tradle.react"');
const java = 'android/src/main/java/com/tradle/react/';
// Reused DatagramPacket instances retain the last packet length unless explicitly reset.
replace(java + 'UdpReceiverTask.java', 'socket.receive(packet);',
  'packet.setLength(buffer.length);\n                socket.receive(packet);');
// Mapping listeners must reject port conflicts instead of silently sharing a UDP socket.
replace(java + 'UdpSocketClient.java',
  'mSocket = new MulticastSocket(socketAddress);\n        mSocket.setReuseAddress(true);',
  'mSocket = new MulticastSocket(null);\n        mSocket.setReuseAddress(false);\n        mSocket.bind(socketAddress);');
// NSNumber(false) is a non-null pointer; read its value to keep iOS port ownership exclusive too.
replace('ios/UdpSocketClient.m', 'BOOL reusePort = options[@"reusePort"] ?: NO;',
  'BOOL reusePort = [options[@"reusePort"] boolValue];');
replace('ios/UdpSocketClient.m', 'struct sockaddr_in ip;',
  'struct sockaddr_in ip = {0};\n    ip.sin_len = sizeof(ip);');
