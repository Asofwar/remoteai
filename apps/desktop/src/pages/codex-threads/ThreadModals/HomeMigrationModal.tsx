import { Alert, Modal, Select } from "antd";
import { homeLabel } from "../../../components/CodexHomeScope";
import type { ThreadCopy } from "../copy";
import type { useHomeMigration } from "../useHomeMigration";

export function HomeMigrationModal({ migration, busy, text }: {
  migration: ReturnType<typeof useHomeMigration>;
  busy: boolean;
  text: ThreadCopy;
}) {
  return <Modal open={migration.open} title={text.moveToHome} width={448}
    onCancel={() => migration.setOpen(false)} onOk={() => void migration.commit()}
    okText={text.startHomeMigration} cancelText={text.close} confirmLoading={busy}
    closable={!busy} maskClosable={!busy} keyboard={!busy} cancelButtonProps={{ disabled: busy }}
    okButtonProps={{ disabled: busy || !migration.targetHomeId || !migration.count }}>
    <div style={{ maxWidth: 400, overflowWrap: "anywhere" }}>
      <p>{text.homeMigrationHint.replace("{count}", String(migration.count))}</p>
      <Select aria-label={text.homeMigrationTarget} placeholder={text.homeMigrationTarget}
        style={{ width: "100%" }} value={migration.targetHomeId} onChange={migration.setTargetHomeId}
        disabled={busy} options={migration.homes.map((home) => ({ value: home.id, label: homeLabel(home) }))} />
      {migration.error && <Alert type="error" message={migration.error} style={{ marginTop: 12 }} />}
      {!migration.homes.length && <p>{text.noMigrationHome}</p>}
    </div>
  </Modal>;
}
