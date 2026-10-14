const { withAndroidManifest, withDangerousMod, withMainApplication } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const SERVICE = 'com.codexswitch.chat.ChatConnectionService';
const PACKAGE_LINE = 'packages.add(com.codexswitch.chat.ChatBackgroundPackage())';

module.exports = function withChatBackground(config) {
  config = withAndroidManifest(config, (result) => {
    const manifest = result.modResults.manifest;
    manifest['uses-permission'] ??= [];
    for (const name of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_REMOTE_MESSAGING',
      'FOREGROUND_SERVICE_CONNECTED_DEVICE', 'CHANGE_NETWORK_STATE', 'WAKE_LOCK']) {
      const permission = 'android.permission.' + name;
      if (!manifest['uses-permission'].some((entry) => entry.$['android:name'] === permission)) {
        manifest['uses-permission'].push({ $: { 'android:name': permission } });
      }
    }
    const application = manifest.application[0];
    application.service ??= [];
    const service = application.service.find((entry) => entry.$['android:name'] === SERVICE);
    if (service) service.$['android:foregroundServiceType'] = 'remoteMessaging|connectedDevice';
    else {
      application.service.push({ $: { 'android:name': SERVICE, 'android:exported': 'false',
        'android:foregroundServiceType': 'remoteMessaging|connectedDevice', 'android:stopWithTask': 'true' } });
    }
    return result;
  });
  config = withMainApplication(config, (result) => {
    const source = result.modResults.contents;
    if (!source.includes(PACKAGE_LINE)) {
      if (!source.includes('return packages')) throw new Error('Cannot register chat background package.');
      result.modResults.contents = source.replace('return packages', PACKAGE_LINE + '\n            return packages');
    }
    return result;
  });
  return withDangerousMod(config, ['android', async (result) => {
    const destination = path.join(result.modRequest.platformProjectRoot, 'app/src/main/java/com/codexswitch/chat');
    await fs.mkdir(destination, { recursive: true });
    for (const name of ['ChatConnectionService.kt', 'ChatBackgroundModule.kt', 'ChatBackgroundPackage.kt']) {
      await fs.copyFile(path.join(__dirname, 'chatBackground', name), path.join(destination, name));
    }
    return result;
  }]);
};
