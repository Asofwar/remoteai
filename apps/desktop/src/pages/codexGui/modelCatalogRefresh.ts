import { guiText } from "../../i18n/guiText";
import type { GuiModelCatalog } from "./modelCatalog";
import { subscribeGuiEvent } from "./webEvents";
import { isHostedWebApp, subscribeToProviderEvents } from "../../api/backend";

/** Only real account/Provider changes invalidate the catalog; time and hosted polls do not. */
export function watchModelCatalog(catalog: GuiModelCatalog, report: (error: unknown) => void) {
  let stopped = false;
  let unsubscribe: (() => void) | undefined;
  let observed: Promise<void> | undefined;
  const failed = () => { if (!stopped) report(guiText("模型列表暂时无法更新，请稍后重试。")); };
  const refresh = () => {
    if (stopped) return;
    const pending = catalog.invalidate();
    if (observed === pending) return;
    observed = pending;
    void pending.catch(() => { /* The picker displays failures until recovery or an explicit retry. */ })
      .finally(() => { if (observed === pending) observed = undefined; });
  };
  const stopProviders = isHostedWebApp ? undefined : subscribeToProviderEvents(refresh);
  void subscribeGuiEvent("codex-gui-account-changed", refresh).then((stop) => {
    if (stopped) stop();
    else unsubscribe = stop;
  }).catch(failed);
  return () => { stopped = true; stopProviders?.(); unsubscribe?.(); };
}
