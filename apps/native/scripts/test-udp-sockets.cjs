const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '../../..');
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA, 'Android/Sdk');
const serial = process.env.ANDROID_SERIAL;
if (!serial || !/^[\w.:-]+$/.test(serial)) throw new Error('Set ANDROID_SERIAL to the test device.');
const javaBin = path.join(process.env.JAVA_HOME, 'bin');
const cache = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'),
  'caches/modules-2/files-2.1/com.facebook.react/react-android/0.79.5');
const work = fs.mkdtempSync(path.join(root, '.codex-tmp/udp-device-'));
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  if (result.error || result.status !== 0) throw new Error(String(result.error || result.stderr || result.stdout));
  return result.stdout;
}
const archive = fs.readdirSync(cache).flatMap(hash => fs.readdirSync(path.join(cache, hash))
  .filter(file => file.endsWith('-release.aar')).map(file => path.join(cache, hash, file)))[0];
if (!archive) throw new Error('Build the Android UDP module first.');
run(path.join(javaBin, 'jar'), ['xf', archive, 'classes.jar'], work);
const react = path.join(work, 'classes.jar');
const moduleRoot = path.dirname(require.resolve('react-native-udp/package.json'));
const moduleClasses = path.join(moduleRoot,
  'android/build/intermediates/javac/release/compileReleaseJavaWithJavac/classes');
const android = path.join(sdk, 'platforms/android-35/android.jar');
const fixtureClasses = path.join(work, 'fixture');
const classes = path.join(work, 'checks.jar');
const dex = path.join(work, 'checks-dex.jar');
run(path.join(javaBin, 'javac'), ['-classpath', [android, react, moduleClasses].join(path.delimiter),
  '-d', fixtureClasses, path.join(root, 'apps/native/e2e/port-mapping/UdpSocketChecks.java')]);
run(path.join(javaBin, 'jar'), ['cf', classes, '-C', moduleClasses, '.', '-C', fixtureClasses, '.']);
run(path.join(javaBin, 'java'), ['-cp', path.join(sdk, 'build-tools/35.0.0/lib/d8.jar'), 'com.android.tools.r8.D8',
  '--lib', android, '--classpath', react, '--output', dex, classes]);
const adb = path.join(sdk, 'platform-tools/adb');
const apk = run(adb, ['-s', serial, 'shell', 'pm', 'path', 'com.codexswitch.mobile']).trim().split('\n')[0]
  .replace(/^package:/, '').trim();
if (!/^\/data\/app\/[\w./=+~-]+\.apk$/.test(apk)) throw new Error('Install Remote AI before running the check.');
const remote = `/data/local/tmp/csw-udp-check-${path.basename(work)}.jar`;
try {
  run(adb, ['-s', serial, 'push', dex, remote]);
  const output = run(adb, ['-s', serial, 'shell', `CLASSPATH=${remote}:${apk}`, 'app_process', '/',
    'com.codexswitch.checks.UdpSocketChecks']);
  if (!output.includes('UDP_SOCKET_PASS')) throw new Error(output);
  console.log(output.trim());
} finally { run(adb, ['-s', serial, 'shell', 'rm', '-f', remote]); }
