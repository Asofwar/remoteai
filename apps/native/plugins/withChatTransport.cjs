const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

// Base Info.plist copy; the en/ru/zh-Hans/zh-Hant prompts come from expo.locales (locales/*.json).
const LOCAL_NETWORK_USAGE = '允许 Remote AI 连接同一网络中的电脑，用于聊天和远程桌面';

module.exports = function withChatTransport(config) {
  config = require('./withChatConnectivity.cjs')(config);
  require('../scripts/patch-tcp-punch.cjs').applyTcpPunchPatch();
  require('../scripts/patch-webrtc-audio.cjs').applyWebrtcAudioPatch();
  config = require('./withIosTcpPunch.cjs')(config);
  config = require('./withIosUdp.cjs')(config);
  config = withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application[0];
    // Expo does not map the existing android.usesCleartextTraffic setting into release manifests by itself.
    application.$['android:usesCleartextTraffic'] = config.android?.usesCleartextTraffic ? 'true' : 'false';
    return result;
  });
  // Register before permission plugins: Expo runs Info.plist mods in reverse registration order.
  return withInfoPlist(config, (result) => {
    result.modResults.NSLocalNetworkUsageDescription = LOCAL_NETWORK_USAGE;
    // Chat uses data channels; remote desktop only receives media. Neither feature records a microphone.
    delete result.modResults.NSMicrophoneUsageDescription;
    return result;
  });
};
module.exports.LOCAL_NETWORK_USAGE = LOCAL_NETWORK_USAGE;
