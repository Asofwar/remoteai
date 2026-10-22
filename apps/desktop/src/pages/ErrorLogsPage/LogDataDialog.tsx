import { Button, Modal } from "antd";
import type { ErrorLogEntry } from "../../api/errorLogs";
import type { Translate } from "../../i18n";
import styles from "./index.module.less";

/** Keep the selected record stable while the table continues polling. */
export function LogDataDialog({ entry, onClose, t }: {
  entry: ErrorLogEntry | null; onClose: () => void; t: Translate;
}) {
  return <Modal open={entry !== null} title={t("errorLogs.rawData")} onCancel={onClose}
    width={400} destroyOnHidden footer={<Button onClick={onClose}>{t("errorLogs.close")}</Button>}>
    {entry && <pre className={styles.rawData} tabIndex={0}>{JSON.stringify(entry, null, 2)}</pre>}
  </Modal>;
}
