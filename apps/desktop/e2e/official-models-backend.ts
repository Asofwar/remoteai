import type { Page } from "@playwright/test";
import type { ModelRefreshSettings } from "../../admin-ui/src/hooks/useModelRefreshSettings";
import type { HelpSettings } from "../../admin-ui/src/hooks/useHelpSettings";

export async function officialModelsBackend(page: Page) {
  let settings: ModelRefreshSettings = { enabled: true, intervalMinutes: 30, revision: "settings-1" };
  let failure = false;
  let refreshes = 0;
  const saves: ModelRefreshSettings[] = [];
  let help: Omit<HelpSettings, "effort" | "questions"> & Partial<Pick<HelpSettings, "effort" | "questions">> = {
    model: "gpt-test", systemPrompt: "Be concise.", revision: "help-1",
  };
  const helpSaves: HelpSettings[] = [];
  const catalog = { catalog: { models: [{ slug: "gpt-test" }] }, revision: "catalog-1",
    updatedAt: new Date().toISOString(), source: "official" };
  await page.route("**/admin/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/help-assistant")) {
      if (route.request().method() === "PATCH") {
        const input = route.request().postDataJSON() as HelpSettings;
        helpSaves.push(input);
        if (failure) return route.fulfill({ status: 409,
          json: { message: "助手设置已更新，请重新加载后再保存。" } });
        help = { ...input, revision: `help-${helpSaves.length + 1}` };
      }
      return route.fulfill({ json: help });
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
  return { saves, helpSaves, failSave: () => { failure = true; }, refreshes: () => refreshes };
}
