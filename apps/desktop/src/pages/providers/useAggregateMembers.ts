import { useEffect, useMemo, useState } from "react";
import { loadOfficialModelContextSettings } from "../../api/backend";
import type { Translate } from "../../i18n";
import type { Account, Provider } from "../../types";
import { buildAggregateMembers } from "../../utils/aggregateMembers";

export function useAggregateMembers(options: {
  providers: Provider[];
  accounts: Account[];
  loadModels: boolean;
  privacyMode: boolean;
  t: Translate;
}) {
  const { providers, accounts, loadModels, privacyMode, t } = options;
  const [officialModels, setOfficialModels] = useState<string[]>([]);
  useEffect(() => {
    if (!loadModels) return;
    let active = true;
    void loadOfficialModelContextSettings().then(settings => {
      if (active) setOfficialModels(settings.models);
    }).catch(() => {
      // A saved model or a manually entered name remains usable without the cached catalog.
      if (active) setOfficialModels([]);
    });
    return () => { active = false; };
  }, [loadModels]);
  return useMemo(() => buildAggregateMembers({
    providers, accounts, officialModels, privacyMode, officialLabel: t("accounts.officialTab"),
  }), [providers, accounts, officialModels, privacyMode, t]);
}
