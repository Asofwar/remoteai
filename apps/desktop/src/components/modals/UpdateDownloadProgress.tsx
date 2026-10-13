import type { AppUpdateDownloadProgress } from "../../api/appUpdateProgress";
import type { Translate } from "../../i18n";
import { formatUpdateDownloadBytes } from "../../utils/updateDownloadFormat";
import styles from "./UpdateDownloadProgress.module.less";

interface UpdateDownloadProgressProps {
  progress: AppUpdateDownloadProgress | null;
  t: Translate;
}

export function UpdateDownloadProgress({ progress, t }: UpdateDownloadProgressProps) {
  const percent = progress?.percent ?? null;
  const label = t("update.downloadProgress");
  const total = progress?.totalBytes ? formatUpdateDownloadBytes(progress.totalBytes) : t("update.unknownSize");
  return (
    <div className={styles.progress}>
      <div className={styles.heading}>
        <span>{label}</span>
        <strong>{percent === null ? "—" : `${percent}%`}</strong>
      </div>
      <div className={styles.track} role="progressbar" aria-label={label}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
        <div className={percent === null ? styles.indeterminate : styles.fill}
          style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      <div className={styles.details}>
        <span>{formatUpdateDownloadBytes(progress?.downloadedBytes ?? 0)} / {total}</span>
        <span>{formatUpdateDownloadBytes(progress?.bytesPerSecond ?? 0)}/s</span>
      </div>
    </div>
  );
}
