const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '../../..');
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA, 'Android/Sdk');
const serial = process.env.ANDROID_SERIAL;
const duplex = process.argv.includes('--duplex');
if (!serial || !/^[\w.:-]+$/.test(serial)) throw new Error('Set ANDROID_SERIAL to the test device.');
const work = path.join(root, '.codex-tmp/port-stream-device');
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') : 'java';
const cache = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1');
fs.mkdirSync(work, { recursive: true });
function jar(artifact) {
  const directory = path.join(cache, artifact);
  for (const hash of fs.readdirSync(directory)) {
    const file = fs.readdirSync(path.join(directory, hash)).find(name => name.endsWith('.jar'));
    if (file) return path.join(directory, hash, file);
  }
  throw new Error(`Build Android first: missing ${artifact}`);
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  if (result.error || result.status !== 0) throw new Error(String(result.error || result.stderr || result.stdout));
  return result.stdout;
}
const compiler = ['org.jetbrains.kotlin/kotlin-compiler-embeddable/2.0.21', 'org.jetbrains.kotlin/kotlin-stdlib/2.0.21',
  'org.jetbrains.kotlin/kotlin-script-runtime/2.0.21', 'org.jetbrains.kotlin/kotlin-reflect/1.6.10',
  'org.jetbrains.intellij.deps/trove4j/1.0.20200330', 'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.6.4',
  'org.jetbrains/annotations/13.0'].map(jar);
const android = path.join(sdk, 'platforms/android-35/android.jar');
const classes = path.join(work, 'checks.jar'), dex = path.join(work, 'checks-dex.jar');
const sources = ['apps/native/plugins/downloads/PortStreamRecords.kt',
  'apps/native/plugins/connectivity/NativeConnectivity.kt', 'apps/native/e2e/port-mapping/PortStreamChecks.kt']
  .map(file => path.join(root, file));
sources.push(path.join(root, 'apps/native/e2e/port-mapping/PortStreamDuplex.kt'));
run(java, ['-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib',
  '-no-reflect', '-classpath', [android, compiler[1]].join(path.delimiter), '-d', classes, ...sources]);
run(java, ['-cp', path.join(sdk, 'build-tools/35.0.0/lib/d8.jar'), 'com.android.tools.r8.D8',
  '--lib', android, '--output', dex, classes, compiler[1]]);
const adb = path.join(sdk, 'platform-tools/adb');
const remote = '/data/local/tmp/csw-port-stream-checks';
let reverseOwned = false;
let remotePrepared = false;
try {
  if (duplex) {
    const mappings = run(adb, ['-s', serial, 'reverse', '--list']).trim().split('\n')
      .map(line => line.trim().split(/\s+/));
    const existing = mappings.find(columns => columns[1] === 'tcp:18779');
    if (existing && existing[2] !== 'tcp:18779') throw new Error('ADB reverse tcp:18779 is already in use.');
    if (!existing) {
      run(adb, ['-s', serial, 'reverse', '--no-rebind', 'tcp:18779', 'tcp:18779']);
      reverseOwned = true;
    }
  }
  run(adb, ['-s', serial, 'shell', 'mkdir', '-p', remote]);
  remotePrepared = true;
  run(adb, ['-s', serial, 'push', dex, `${remote}/checks.jar`]);
  run(adb, ['-s', serial, 'push', path.join(root,
    'apps/native/android/app/src/main/jniLibs/arm64-v8a/libcsw_chat_connectivity.so'), remote]);
  const check = duplex ? 'PortStreamDuplex' : 'PortStreamChecks';
  const output = run(adb, ['-s', serial, 'shell',
    `CLASSPATH=${remote}/checks.jar LD_LIBRARY_PATH=${remote} app_process / com.codexswitch.downloads.${check}`]);
  if (!output.includes(duplex ? 'PORT_STREAM_DUPLEX_PASS' : 'PORT_STREAM_PASS')) throw new Error(output);
  console.log(output.trim());
} finally {
  if (reverseOwned) run(adb, ['-s', serial, 'reverse', '--remove', 'tcp:18779']);
  if (remotePrepared) {
    run(adb, ['-s', serial, 'shell', 'rm', '-f', `${remote}/checks.jar`, `${remote}/libcsw_chat_connectivity.so`]);
    run(adb, ['-s', serial, 'shell', 'rmdir', remote]);
  }
}
