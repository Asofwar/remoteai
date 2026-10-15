const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../..');
const native = path.join(root, 'apps/native'), android = path.join(native, 'android');
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA, 'Android/Sdk');
const adb = path.join(sdk, 'platform-tools/adb');
const serial = process.env.ANDROID_SERIAL || 'emulator-5580';
if (!serial.startsWith('emulator-')) throw new Error('This isolated permission test requires an emulator.');
const appId = 'com.codexswitch.previewpermissionchecks';
const output = path.join(root, '.codex-tmp/preview-permissions');
fs.mkdirSync(output, { recursive: true });
const buildFile = path.join(android, 'app/build.gradle');
const manifest = path.join(android, 'app/src/main/AndroidManifest.xml');
const originals = new Map([buildFile, manifest].map(file => [file, fs.readFileSync(file)]));
for (const [file, contents] of originals) fs.writeFileSync(path.join(output, path.basename(file) + '.original'), contents);
const apk = path.join(android, 'app/build/outputs/apk/release/app-release.apk');
const previousApk = fs.existsSync(apk) ? path.join(output, 'regular-app.apk') : undefined;
if (previousApk) fs.copyFileSync(apk, previousApk);
const resources = path.join(output, 'res');
const results = [];
const servers = [];

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, windowsHide: true, encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024, timeout: 600_000,
    env: { ...process.env, NODE_ENV: 'production', NODE_PATH: path.join(native, 'node_modules') } });
  if (result.error || result.status !== 0) {
    throw new Error(`${command}: ${result.error || result.stderr || result.stdout}`);
  }
  return result.stdout;
}
const device = (...args) => run(adb, ['-s', serial, ...args]);

function prepare() {
  require('./patch-webview-permissions.cjs').applyWebViewPermissionsPatch();
  const openssl = process.env.OPENSSL || (process.platform === 'win32'
    ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl');
  fs.mkdirSync(path.join(resources, 'raw'), { recursive: true });
  fs.mkdirSync(path.join(resources, 'xml'), { recursive: true });
  run(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', path.join(output, 'key.pem'), '-out', path.join(resources, 'raw/preview_test_ca.pem'),
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1']);
  // Trust the generated certificate only in this isolated test APK, never in the regular app.
  fs.writeFileSync(path.join(resources, 'xml/preview_test_security.xml'), '<network-security-config>'
    + '<base-config cleartextTrafficPermitted="true"><trust-anchors><certificates src="@raw/preview_test_ca"/>'
    + '</trust-anchors></base-config></network-security-config>');
  const entry = path.join(native, 'e2e/previewPermissionChecks.tsx').replaceAll('\\', '/');
  const changed = originals.get(buildFile).toString().replace(/^\s*entryFile = file\(.*\)$/m,
    `    entryFile = file('${entry}')`).replace("applicationId 'com.codexswitch.mobile'", `applicationId '${appId}'`)
    + `\nandroid.sourceSets.main.res.srcDirs += '${resources.replaceAll('\\', '/')}'\n`;
  assert.ok(changed.includes(`entryFile = file('${entry}')`) && changed.includes(`applicationId '${appId}'`));
  fs.writeFileSync(buildFile, changed);
  fs.writeFileSync(manifest, originals.get(manifest).toString()
    .replace('<application ', '<application android:networkSecurityConfig="@xml/preview_test_security" '));
}

function serve(request, response) {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('Content-Type', 'text/html');
  if (url.pathname === '/result') {
    results.push(Object.fromEntries(url.searchParams)); response.end('ok'); return;
  }
  if (url.pathname === '/redirect') {
    response.writeHead(302, { Location: 'https://localhost:1499/' }); response.end(); return;
  }
  response.end(`<!doctype html><h1>Preview camera permission check</h1><script>
    (async () => {
      let result;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); result = 'granted';
      } catch (error) { result = error.name; }
      document.body.append(result);
      await fetch('/result?' + new URLSearchParams({ origin: location.origin, secure: isSecureContext, result }));
      if (location.protocol === 'http:') location.href = '/redirect';
    })();</script>`);
}

async function main() {
  let installed = false;
  try {
    prepare();
    console.log('Building isolated preview permission APK');
    const args = ':app:assembleRelease --no-daemon -PreactNativeArchitectures=x86_64';
    const build = process.platform === 'win32'
      ? run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', `gradlew.bat ${args}`], android)
      : run('./gradlew', args.split(' '), android);
    fs.writeFileSync(path.join(output, 'build.log'), build);
    fs.copyFileSync(apk, path.join(output, 'fixture.apk'));
    for (const [server, port] of [[http.createServer(serve), 1497], [https.createServer({
      key: fs.readFileSync(path.join(output, 'key.pem')),
      cert: fs.readFileSync(path.join(resources, 'raw/preview_test_ca.pem')),
    }, serve), 1499]]) {
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
      });
      device('reverse', `tcp:${port}`, `tcp:${server.address().port}`);
    }
    device('install', '-r', apk); installed = true;
    device('shell', 'pm', 'grant', appId, 'android.permission.CAMERA');
    device('shell', 'am', 'start', '-W', '-n', `${appId}/com.codexswitch.mobile.MainActivity`);
    for (let count = 0; count < 60 && results.length < 2; count++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    assert.deepEqual(results, [
      { origin: 'http://127.0.0.1:1497', secure: 'true', result: 'NotAllowedError' },
      { origin: 'https://localhost:1499', secure: 'true', result: 'NotAllowedError' },
    ]);
    console.log('PREVIEW_PERMISSIONS_PASSED', JSON.stringify(results));
  } finally {
    for (const [file, contents] of originals) fs.writeFileSync(file, contents);
    if (previousApk) fs.copyFileSync(previousApk, apk);
    if (installed) device('uninstall', appId);
    for (const server of servers) { server.closeAllConnections(); server.close(); }
    for (const port of [1497, 1499]) {
      try { device('reverse', '--remove', `tcp:${port}`); }
      catch { console.warn(`No test reverse mapping to remove for ${port}`); }
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
