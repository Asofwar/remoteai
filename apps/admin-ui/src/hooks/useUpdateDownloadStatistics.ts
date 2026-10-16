import { useEffect, useState } from 'react';
import type { DownloadReport } from '../../../../shared/app-update/downloadReport';
import type { UpdateSharingSettingsProps } from './useUpdateSharingSettings';

export interface DailyDownloads {
  date: string;
  peerDownloads: number;
  serverDownloads: number;
  serverUsers: number;
  peerBytes: number;
  serverBytes: number;
  failedDownloads: number;
  reportsWithFailures: number;
}

export type FailureReport = DownloadReport & { userId: string; createdAt: string };
type Api = UpdateSharingSettingsProps['api'];
interface Page<T> { items: T[]; total: number }

function useStatisticsRequest<T>(api: Api, path: string | null, revision: number) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setData(undefined); setFailed(false);
    if (!path) { setLoading(false); return; }
    setLoading(true);
    void api<T>(path).then(value => { if (!cancelled) setData(value); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, path, revision]);
  return { data, loading, failed };
}

export function useUpdateDownloadStatistics(api: Api) {
  const [days, setDays] = useState(30);
  const [revision, setRevision] = useState(0);
  const [date, setDate] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const daily = useStatisticsRequest<{ items: DailyDownloads[] }>(api,
    `/admin/api/update-sharing/daily?days=${days}`, revision);
  const failures = useStatisticsRequest<Page<FailureReport>>(api, date
    ? `/admin/api/update-sharing/failures?date=${date}&page=${page}&pageSize=20` : null, revision);
  return { days, setDays, daily, failures, date, page, setPage,
    reload: () => setRevision(value => value + 1),
    showFailures: (value: string | null) => { setDate(value); setPage(1); } };
}
