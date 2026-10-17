const { withPodfile } = require('expo/config-plugins');

const marker = '# Codex Switch: complete empty UDP sends before forwarding the next batch.';
function addUdpHook(contents) {
  if (contents.includes(marker)) return contents;
  const anchor = 'post_install do |installer|';
  if (contents.split(anchor).length !== 2) throw new Error('Review iOS UDP patch hook after Podfile changes.');
  return contents.replace(anchor, `${anchor}
    ${marker}
    udp_pod = installer.pod_targets.find { |pod| pod.pod_name == 'CocoaAsyncSocket' }
    raise 'CocoaAsyncSocket is missing from the resolved Pods.' unless udp_pod
    system('node', File.join(__dir__, '../scripts/patch-cocoa-udp.cjs'),
      installer.sandbox.root.to_s, udp_pod.root_spec.version.to_s, exception: true)
`);
}

module.exports = config => withPodfile(config, result => {
  result.modResults.contents = addUdpHook(result.modResults.contents);
  return result;
});
module.exports.addUdpHook = addUdpHook;
