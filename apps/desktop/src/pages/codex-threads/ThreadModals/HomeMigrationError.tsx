import { useState } from "react";
import { Alert, Button } from "antd";
import { translateBackendMessage } from "../../../../../../shared/i18n/backend/translateBackendMessage";
import { useGuiLanguage } from "../../../i18n/useGuiLanguage";
import { copyText } from "../../../utils/clipboard";
import type { ThreadCopy } from "../copy";

export function HomeMigrationError({ error, text }: { error: string; text: ThreadCopy }) {
  const language = useGuiLanguage();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      // The copied report keeps the original backend text for troubleshooting.
      await copyText(error);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };
  return <Alert type="error" style={{ marginTop: 12, maxWidth: 400 }}
    message={<div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {translateBackendMessage(language, error)}
    </div>}
    description={<>
      <Button size="small" onClick={() => void copy()}>
        {copyStatus === "copied" ? text.homeMigrationErrorCopied : text.homeMigrationCopyError}
      </Button>
      {copyStatus === "failed" && <div role="status">{text.homeMigrationCopyFailed}</div>}
    </>} />;
}
