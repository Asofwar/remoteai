const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, before, after) {
  if (source.includes(after)) return source;
  if (source.split(before).length !== 2) throw new Error('Review the Android WebView permission patch.');
  return source.replace(before, after);
}

// Keep the decision on the WebView, so redirects and replacement WebChromeClients cannot reset it.
function patchWebViewPermissions(directory) {
  const packagePath = 'com/reactnativecommunity/webview/';
  const setter = '@ReactProp(name = "mediaCapturePermissionGrantType")\n'
    + '    public void setMediaCapturePermissionGrantType(RNCWebViewWrapper view, @Nullable String value) {\n'
    + '        view.getWebView().remoteAiDenyMediaCapture = "deny".equals(value);\n    }';
  const changes = [
    ['main/java/' + packagePath + 'RNCWebView.java', 'protected boolean messagingEnabled = false;',
      'protected boolean messagingEnabled = false;\n    public boolean remoteAiDenyMediaCapture = false;'],
    ['main/java/' + packagePath + 'RNCWebChromeClient.java',
      'public void onPermissionRequest(final PermissionRequest request) {',
      'public void onPermissionRequest(final PermissionRequest request) {\n'
        + '        if (mWebView.remoteAiDenyMediaCapture) {\n'
        + '            request.deny();\n            return;\n        }'],
    ['newarch/' + packagePath + 'RNCWebViewManager.java',
      'public void setMediaCapturePermissionGrantType(RNCWebViewWrapper view, @Nullable String value) {}', setter],
    ['oldarch/' + packagePath + 'RNCWebViewManager.java', '@ReactProp(name = "incognito")',
      setter + '\n\n    @ReactProp(name = "incognito")'],
  ].map(([name, before, after]) => {
    const file = path.join(directory, name);
    const original = fs.readFileSync(file, 'utf8');
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    return { file, source: replaceOnce(original.replace(/\r\n/g, '\n'), before, after).replace(/\n/g, newline) };
  });
  changes.forEach(({ file, source }) => fs.writeFileSync(file, source));
}

function applyWebViewPermissionsPatch() {
  const manifest = require.resolve('react-native-webview/package.json', { paths: [path.resolve(__dirname, '..')] });
  if (JSON.parse(fs.readFileSync(manifest, 'utf8')).version !== '13.13.5') {
    throw new Error('Review Android media permissions before upgrading react-native-webview.');
  }
  patchWebViewPermissions(path.join(path.dirname(manifest), 'android/src'));
}

if (require.main === module) applyWebViewPermissionsPatch();
module.exports = { applyWebViewPermissionsPatch, patchWebViewPermissions };
