import type { GuiState } from "./types";

export function canForkConversation(state: GuiState): boolean {
  return Boolean(state.selected && state.connection === "ready" && !state.forking
    && !state.sending && !state.deleting && !state.workspaceBusy && !state.modelSettingsLoading
    && !state.archived && state.compacting !== state.selected);
}
