import { useState } from "react";
import { Alert, Button } from "antd";
import { copyText } from "../../../utils/clipboard";
import type { ThreadCopy } from "../copy";

export function HomeMigrationError({ error, text }: { error: string; text: ThreadCopy }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await copyText(error);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };
  return <Alert type="error" style={{ marginTop: 12, maxWidth: 400 }}
    message={<div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{error}</div>}
    description={<>
      <Button size="small" onClick={() => void copy()}>
        {copyStatus === "copied" ? text.homeMigrationErrorCopied : text.homeMigrationCopyError}
      </Button>
      {copyStatus === "failed" && <div role="status">{text.homeMigrationCopyFailed}</div>}
    </>} />;
}
