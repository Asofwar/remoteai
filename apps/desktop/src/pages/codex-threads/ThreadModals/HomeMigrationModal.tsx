import { Alert, Descriptions, Modal, Select } from "antd";
import { homeLabel } from "../../../components/CodexHomeScope";
import { MIGRATION_MODEL_PROVIDERS } from "../../../types/conversationMigration";
import type { ThreadCopy } from "../copy";
import type { useHomeMigration } from "../useHomeMigration";

export function HomeMigrationModal({ migration, busy, text }: {
  migration: ReturnType<typeof useHomeMigration>;
  busy: boolean;
  text: ThreadCopy;
}) {
  return <Modal open={migration.open}
    title={migration.fixedTarget ? text.confirmHomeMigration : text.moveToHome} width={448}
    onCancel={() => migration.setOpen(false)} onOk={() => void migration.commit()}
    okText={text.startHomeMigration} cancelText={text.close} confirmLoading={busy}
    closable={!busy} maskClosable={!busy} keyboard={!busy} cancelButtonProps={{ disabled: busy }}
    okButtonProps={{ disabled: busy || !migration.targetHome || !migration.count }}>
    <div style={{ maxWidth: 400, overflowWrap: "anywhere" }}>
      {migration.fixedTarget ? <>
        <Descriptions size="small" column={1} items={[
          { key: "source", label: text.homeMigrationSource,
            children: migration.sourceHome && homeLabel(migration.sourceHome) },
          { key: "target", label: text.homeMigrationDestination,
            children: migration.targetHome && homeLabel(migration.targetHome) },
          { key: "selection", label: text.homeMigrationSelection,
            children: text.homeMigrationCount.replace("{count}", String(migration.count)) },
        ]} />
        <p style={{ marginTop: 16 }}>{text.homeMigrationConfirmHint}</p>
      </> : <>
        <p>{text.homeMigrationHint.replace("{count}", String(migration.count))}</p>
        <Select aria-label={text.homeMigrationTarget} placeholder={text.homeMigrationTarget}
          style={{ width: "100%" }} value={migration.targetHomeId} onChange={migration.setTargetHomeId}
          disabled={busy} options={migration.homes.map((home) => ({ value: home.id, label: homeLabel(home) }))} />
      </>}
      <div style={{ marginTop: 16 }}>
        <label htmlFor="migration-model-provider">{text.homeMigrationModelProvider}</label>
        <Select id="migration-model-provider" aria-label={text.homeMigrationModelProvider}
          style={{ width: "100%", marginTop: 8 }} value={migration.modelProvider}
          onChange={migration.setModelProvider} disabled={busy}
          options={MIGRATION_MODEL_PROVIDERS.map((value) => ({ value, label: value }))} />
        <p style={{ marginTop: 8 }}>{text.homeMigrationModelProviderHint}</p>
      </div>
      {migration.error && <Alert type="error" message={migration.error} style={{ marginTop: 12 }} />}
      {migration.fixedTarget && !migration.targetHome && <Alert type="warning" message={text.migrationHomeUnavailable} />}
      {!migration.fixedTarget && !migration.homes.length && <p>{text.noMigrationHome}</p>}
    </div>
  </Modal>;
}
