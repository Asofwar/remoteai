const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { patchPods } = require('./patch-cocoa-udp.cjs');

const root = path.resolve(__dirname, '../../..');
const output = path.join(root, '.codex-tmp/ios-udp-native-checks');
const pods = path.join(output, 'Pods');
const source = path.join(pods, 'CocoaAsyncSocket/Source/GCD');
const adapter = path.join(path.dirname(require.resolve('react-native-udp/package.json')), 'ios');
const version = '7.6.5';
function run(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8', timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

async function sources() {
  fs.mkdirSync(source, { recursive: true });
  for (const file of ['GCDAsyncUdpSocket.h', 'GCDAsyncUdpSocket.m']) {
    const response = await fetch(
      `https://raw.githubusercontent.com/robbiehanson/CocoaAsyncSocket/${version}/Source/GCD/${file}`,
      { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`CocoaAsyncSocket download failed (${response.status})`);
    fs.writeFileSync(path.join(source, file), await response.text());
  }
  patchPods(pods, version);
  require('./patch-udp.cjs');
  // Compile the actual adapter; React contributes only this callback typedef to the tested native client.
  fs.mkdirSync(path.join(output, 'React'), { recursive: true });
  fs.writeFileSync(path.join(output, 'React/RCTBridgeModule.h'),
    '#import <Foundation/Foundation.h>\ntypedef void (^RCTResponseSenderBlock)(NSArray *response);\n');
}

function compile(sdk, executable) {
  const platform = sdk === 'iphonesimulator' ? 'ios15.1-simulator' : 'macos12.0';
  const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  run('xcrun', ['--sdk', sdk, 'clang', '-fobjc-arc', '-fmodules', '-Werror=implicit-function-declaration',
    '-target', `${architecture}-apple-${platform}`, '-isysroot', run('xcrun', ['--sdk', sdk, '--show-sdk-path']).trim(),
    '-framework', 'Foundation', '-framework', 'CFNetwork',
    ...(sdk === 'iphonesimulator' ? ['-framework', 'UIKit'] : []),
    '-I', source, '-I', output, '-I', adapter, path.join(source, 'GCDAsyncUdpSocket.m'),
    path.join(adapter, 'UdpSocketClient.m'), 'apps/native/e2e/port-mapping/IosUdpSendChecks.m', '-o', executable]);
}

function simulator() {
  const { devices } = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '--json']));
  const available = Object.entries(devices).filter(([runtime]) => runtime.includes('iOS'))
    .flatMap(([, values]) => values).filter(device => device.name.startsWith('iPhone'));
  const device = available.find(item => item.state === 'Booted') ?? available[0];
  if (!device) throw new Error('An available iOS simulator is required for the UDP check.');
  const bootedHere = device.state !== 'Booted';
  if (bootedHere) run('xcrun', ['simctl', 'boot', device.udid]);
  try {
    run('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
    const executable = path.join(output, 'udp-ios');
    compile('iphonesimulator', executable);
    return run('xcrun', ['simctl', 'spawn', device.udid, executable]);
  } finally { if (bootedHere) run('xcrun', ['simctl', 'shutdown', device.udid]); }
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Run this native check on macOS with Xcode installed.');
  await sources();
  const executable = path.join(output, 'udp-macos');
  compile('macosx', executable);
  for (const result of [run(executable, []), simulator()]) {
    if (!result.includes('IOS_UDP_SEND_PASS')) throw new Error(result);
    console.log(result.trim());
  }
}
main().catch(error => { console.error(error.stderr?.toString() || error.message); process.exitCode = 1; });
