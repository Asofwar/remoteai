import { guiText } from "../../i18n/guiText";
import { Badge } from "antd";
import { Info } from "lucide-react";

export function CliUpdateIcon({ version, release }: {
  version: string | null; release: { version: string } | null;
}) {
  const available = Boolean(version && release && release.version !== version);
  return <Badge dot={available} offset={[1, 0]} styles={{ root: { display: "inline-flex" } }}
    title={available ? guiText("有新版本") : undefined}>
    <Info size={16} />
  </Badge>;
}
