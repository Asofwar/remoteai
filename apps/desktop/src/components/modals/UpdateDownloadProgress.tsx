import { LoaderCircle } from "lucide-react";
import type { AppUpdateDownloadPhase, AppUpdateDownloadProgress } from "../../api/appUpdateProgress";
import type { Translate, TranslationKey } from "../../i18n";
import { formatUpdateDownloadBytes, formatUpdateDownloadTime } from "../../utils/updateDownloadFormat";
import styles from "./UpdateDownloadProgress.module.less";

interface UpdateDownloadProgressProps {
  progress: AppUpdateDownloadProgress | null;
  t: Translate;
}

const phaseLabels: Record<AppUpdateDownloadPhase, TranslationKey> = {
  preparing: "update.preparingDownload",
  downloading: "update.downloadProgress",
  waiting: "update.waitingForDownload",
  finishing: "update.finishingDownload",
  finished: "update.downloaded",
};

export function UpdateDownloadProgress({ progress, t }: UpdateDownloadProgressProps) {
  const percent = progress?.percent ?? null;
  const label = t("update.downloadProgress");
  const phase = progress?.phase ?? "preparing";
  const active = phase !== "finished";
  const status = t(phaseLabels[phase]);
  const total = progress?.totalBytes ? formatUpdateDownloadBytes(progress.totalBytes) : t("update.unknownSize");
  return (
    <div className={styles.progress}>
      <div className={styles.heading}>
        <span className={styles.status} role="status">
          {active && <LoaderCircle size={14} className={styles.spinner} aria-hidden="true" />}
          {status}
        </span>
        <strong>{percent === null ? "—" : `${percent}%`}</strong>
      </div>
      <div className={styles.track} role="progressbar" aria-label={label}
        aria-valuetext={percent === null ? status : `${status} ${percent}%`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
        <div className={percent === null ? styles.indeterminate : styles.fill}
          style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      <div className={styles.details}>
        <span>{formatUpdateDownloadBytes(progress?.downloadedBytes ?? 0)} / {total}</span>
        <span>{formatUpdateDownloadBytes(progress?.bytesPerSecond ?? 0)}/s</span>
      </div>
      <div className={styles.details}>
        <span>{t("update.downloadElapsed", {
          time: formatUpdateDownloadTime(progress?.elapsedSeconds ?? 0),
        })}</span>
        <span>{t("update.downloadCanContinue")}</span>
      </div>
    </div>
  );
}
