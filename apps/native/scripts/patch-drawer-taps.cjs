const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_NAME = 'react-native-gesture-handler';
const PACKAGE_VERSION = '2.24.0';
const nativeDirectory = path.resolve(__dirname, '..');
const patchPath = path.join(nativeDirectory, 'patches', `${PACKAGE_NAME}+${PACKAGE_VERSION}.patch`);

/** Apply only exact context matches; an upstream change must be reviewed before rebuilding. */
function patchDrawerSource(source, patch) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  let output = source.replace(/\r\n/g, '\n');
  const hunks = patch.replace(/\r\n/g, '\n').split(/^@@.*@@.*$/m).slice(1);
  if (hunks.length !== 2) throw new Error('The drawer tap backport must contain exactly two hunks.');
  for (const hunk of hunks) {
    const lines = hunk.split('\n').filter((line) => /^[ +\-]/.test(line));
    const before = lines.filter((line) => !line.startsWith('+')).map((line) => line.slice(1)).join('\n');
    const after = lines.filter((line) => !line.startsWith('-')).map((line) => line.slice(1)).join('\n');
    const beforeMatches = output.split(before).length - 1;
    const afterMatches = output.split(after).length - 1;
    if (afterMatches === 1 && beforeMatches === 0) continue;
    if (beforeMatches !== 1 || afterMatches !== 0) throw new Error('Drawer source changed; review the tap backport.');
    output = output.replace(before, after);
  }
  return output.replace(/\n/g, newline);
}

/** Backport https://github.com/software-mansion/react-native-gesture-handler/pull/3832. */
function applyDrawerTapPatch() {
  const manifestPath = require.resolve(`${PACKAGE_NAME}/package.json`, { paths: [nativeDirectory] });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== PACKAGE_VERSION) {
    throw new Error(`Review the drawer tap backport before using ${PACKAGE_NAME} ${manifest.version}.`);
  }
  // Metro uses the subpath's react-native entry; CommonJS and ESM builds are not bundled by this app.
  const sourcePath = path.join(path.dirname(manifestPath), 'src', 'components', 'ReanimatedDrawerLayout.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const patched = patchDrawerSource(source, fs.readFileSync(patchPath, 'utf8'));
  if (source !== patched) fs.writeFileSync(sourcePath, patched);
}

if (require.main === module) applyDrawerTapPatch();
module.exports = { applyDrawerTapPatch, patchDrawerSource };
