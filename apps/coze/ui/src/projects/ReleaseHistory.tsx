import { useEffect, useState } from "react";
import { Alert, Button, List, Popconfirm } from "antd";
import { api, errorText } from "../api";
import { formatDateTime, useT } from "../i18n";
import type { Resource } from "../types";

interface Release { revision: number; createdAt: string; dependencies: Record<string, number> | null }
export function ReleaseHistory({ resource, onSaved }: { resource: Resource; onSaved: (resource: Resource) => void }) {
  const t = useT();
  const [releases, setReleases] = useState<Release[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void api<Release[]>("releases", { id: resource.id }).then((value) => { if (active) setReleases(value); })
      .catch((error: unknown) => { if (active) setError(errorText(error)); });
    return () => { active = false; };
  }, [resource.id, resource.publishedRevision]);
  const activate = async (revision: number) => {
    setBusy(true); setError("");
    try { onSaved(await api<Resource>("activate_release", { id: resource.id, revision, expected: resource.revision })); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  return <>{error && <Alert type="error" message={t(error)} />}
    <List size="small" dataSource={releases} locale={{ emptyText: t("发布后可在这里切换版本") }} renderItem={(release) =>
      <List.Item actions={release.revision === resource.publishedRevision ? [<span key="current">{t("当前使用")}</span>] : [
        <Popconfirm key="activate" title={t("切换到版本 {revision}？草稿会保留。", { revision: release.revision })}
          styles={{ root: { maxWidth: 400 } }} onConfirm={() => activate(release.revision)}>
          <Button size="small" loading={busy}>{t("使用此版本")}</Button></Popconfirm>]}>
        {t("版本 {revision} · {date}", { revision: release.revision, date: formatDateTime(release.createdAt) })}
      </List.Item>} />
  </>;
}
