import type { Page } from "@playwright/test";
import type { ModelRefreshSettings } from "../../admin-ui/src/hooks/useModelRefreshSettings";

export async function officialModelsBackend(page: Page) {
  let settings: ModelRefreshSettings = { enabled: true, intervalMinutes: 30, revision: "settings-1" };
  let failure = false;
  let refreshes = 0;
  const saves: ModelRefreshSettings[] = [];
  const catalog = { catalog: { models: [{ slug: "gpt-test" }] }, revision: "catalog-1",
    updatedAt: new Date().toISOString(), source: "official" };
  await page.route("**/admin/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/help-assistant")) {
      return route.fulfill({ json: { model: "gpt-test", systemPrompt: "Be concise.", revision: "help-1" } });
    }
    if (path.endsWith("/settings")) {
      if (route.request().method() === "PATCH") {
        const input = route.request().postDataJSON() as ModelRefreshSettings;
        saves.push(input);
        if (failure) return route.fulfill({ status: 409,
          json: { message: "自动更新设置已更改，请重新加载后再保存。" } });
        settings = { ...input, revision: `settings-${saves.length + 1}` };
      }
      return route.fulfill({ json: settings });
    }
    if (path.endsWith("/refresh")) refreshes++;
    return route.fulfill({ json: catalog });
  });
  return { saves, failSave: () => { failure = true; }, refreshes: () => refreshes };
}
