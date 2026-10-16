import { DeviceEventEmitter, NativeModules } from 'react-native';
import type { AppRelease } from './appUpdate';
import { findUpdatePeers } from '../../../../shared/app-update/peerLookup';
import { watchUpdatePeers } from '../../../../shared/app-update/peerDiscovery';
import { updateMirrorUrl } from '../../../../shared/app-update/mirrorUrl';
import { updateNotificationLabels } from './androidUpdateNotifications';
import { reportDownload, type DownloadReport } from '../../../../shared/app-update/downloadReport';

interface UpdateModule {
  sharingProtocol?: number;
  canAutoDownload(): Promise<boolean>;
  updatePath(version: string): Promise<string>;
  artifactId(metadata: string): Promise<string>;
  downloadPeers(options: string): Promise<string>;
  downloadPeersReported?(options: string): Promise<string>;
  addUpdatePeers?(options: string): Promise<boolean>;
  downloadOfficial(options: string): Promise<string>;
  verifyPackage(options: string): Promise<boolean>;
}
const module = () => NativeModules.AppUpdate as UpdateModule | undefined;
export const canAutoDownload = () => module()?.canAutoDownload?.() ?? Promise.resolve(false);
export const nativeUpdatePath = (version: string) => module()?.updatePath?.(version);

export async function verifyAndroidPackage(options: { path: string; size: number; sha256?: string }) {
  const native = module();
  // Old installed binaries retain the existing system-installer signature check.
  return native?.verifyPackage ? native.verifyPackage(JSON.stringify(options)) : true;
}

export async function downloadSharedAndroidUpdate(options: {
  release: AppRelease; path: string; wifiOnly: boolean;
}): Promise<string | null> {
  const native = module();
  const asset = options.release.androidAsset;
  if (!native?.downloadPeers || !asset?.sha256) return null;
  const metadata = { version: options.release.version, url: asset.downloadUrl, size: asset.size, sha256: asset.sha256 };
  let lease: Awaited<ReturnType<typeof findUpdatePeers>> | undefined;
  const listener = DeviceEventEmitter?.addListener('updateSharingFailure', (sessionId: unknown) => {
    if (typeof sessionId === 'string') lease?.failed(sessionId);
  });
  try {
    const { loadSession } = await import('../api/client');
    const session = await loadSession();
    const artifact = await native.artifactId(JSON.stringify(metadata));
    if (session) {
      lease = await (native.addUpdatePeers
        ? watchUpdatePeers({ session, artifact, onPeers: configs => native.addUpdatePeers!(JSON.stringify({ artifact, configs })) })
        : findUpdatePeers(session, artifact, { protocol: native.sharingProtocol === 2 ? 2 : 0 }))
        .catch(() => undefined);
    }
    const input = JSON.stringify({ ...metadata, path: options.path,
      mirrorUrl: session ? updateMirrorUrl(session.baseUrl, asset.downloadUrl) : undefined,
      notification: updateNotificationLabels(),
      wifiOnly: options.wifiOnly, artifact, configs: lease?.configs ?? [] });
    if (!native.downloadPeersReported) return await native.downloadPeers(input);
    const result = JSON.parse(await native.downloadPeersReported(input)) as {
      path: string | null; report: DownloadReport;
    };
    if (!lease && result.report.failures.length < 16) {
      result.report.failures.push({ source: 'peer', stage: 'lookup', code: 'unavailable', count: 1 });
    }
    if (session) void reportDownload(session, result.report);
    return result.path;
  } catch {
    // Peer lookup, transport, file and integrity failures all return to the original GitHub URL.
    return null;
  } finally { listener?.remove(); lease?.close(); }
}

export function downloadOfficialAndroidUpdate(options: {
  release: AppRelease; path: string; wifiOnly: boolean;
}) {
  const native = module();
  if (!native?.downloadOfficial) return null;
  return native.downloadOfficial(JSON.stringify({ path: options.path, wifiOnly: options.wifiOnly,
    url: options.release.androidAsset?.downloadUrl, version: options.release.version,
    size: options.release.androidAsset?.size, sha256: options.release.androidAsset?.sha256,
    notification: updateNotificationLabels() }));
}
