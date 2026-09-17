import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { checkForUpdate } from "../api/backend";
import type { UpdateInfo } from "../types";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

interface BackgroundUpdateOptions {
  availableUpdateRef: MutableRefObject<UpdateInfo | null>;
  downloadUpdate: (update: UpdateInfo, promptWhenReady: boolean) => Promise<boolean>;
  downloadingUpdateRef: MutableRefObject<boolean>;
  setUpdateDownloaded: Dispatch<SetStateAction<boolean>>;
  updateDownloadedRef: MutableRefObject<boolean>;
  userInitiatedDownloadRef: MutableRefObject<boolean>;
}

export function useBackgroundUpdateCheck(options: BackgroundUpdateOptions) {
  useEffect(() => {
    let cancelled = false;
    let checking = false;
    const checkAndDownload = async () => {
      if (checking || options.downloadingUpdateRef.current || options.userInitiatedDownloadRef.current) return;
      checking = true;
      try {
        const replacePending = options.updateDownloadedRef.current;
        const previousVersion = options.availableUpdateRef.current?.latestVersion;
        const update = await checkForUpdate({ force: true, replacePending });
        if (cancelled || options.userInitiatedDownloadRef.current) return;
        if (!update || (replacePending && update.latestVersion === previousVersion)) return;
        if (replacePending) {
          options.updateDownloadedRef.current = false;
          options.setUpdateDownloaded(false);
        }
        await options.downloadUpdate(update, false);
      } catch {
        // Background update checks retry quietly on the next interval.
      } finally {
        checking = false;
      }
    };
    void checkAndDownload();
    const timer = window.setInterval(() => void checkAndDownload(), UPDATE_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [options]);
}
