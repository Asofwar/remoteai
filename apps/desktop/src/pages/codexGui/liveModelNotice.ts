import type { ModelSettingsSnapshot } from "./threadModelSettings";
import type { GuiState, Item } from "./types";
import { rememberTurnDetails } from "./turnDetailsStorage";

export interface PendingModelChange {
  turnId: string;
  fromModel: string;
  toModel: string;
  modelChanged: boolean;
}

/** Only a runtime acknowledgement confirms a live change; saving preferences is insufficient. */
export function modelChangeItem(snapshot: ModelSettingsSnapshot, change: PendingModelChange): Item {
  const item: Item = { id: `model-change-${snapshot.threadId}-${snapshot.revision}`,
    type: "modelChange", status: "completed", success: snapshot.liveUpdate !== "failed" };
  if (snapshot.liveUpdate === "failed") return { ...item, text: "当前任务的模型设置未能更新",
    summary: ["设置已保存。请更新 Codex 后重试，或停止生成后继续。"] };
  const text = change.modelChanged ? `模型已从 ${change.fromModel} 更改为 ${change.toModel}` : "推理强度已更新";
  const timing = snapshot.liveUpdate === "applied" ? "将从下一次请求起生效。" : "将在下一轮对话生效。";
  return { ...item, text, summary: [timing + (change.modelChanged ? "中途切换模型可能使响应变慢。" : "")] };
}

export function appendModelChange(state: GuiState, snapshot: ModelSettingsSnapshot,
  change: PendingModelChange): Partial<GuiState> {
  const threadId = snapshot.threadId;
  const current = threadId ? state.conversations[threadId] : undefined;
  if (!threadId || !current) return {};
  const item = modelChangeItem(snapshot, change);
  const conversation = { ...current, turns: current.turns.map((turn) => turn.id === change.turnId
    ? { ...turn, items: [...turn.items.filter((entry) => entry.id !== item.id), item] } : turn) };
  rememberTurnDetails(conversation, change.turnId);
  return { conversations: { ...state.conversations, [threadId]: conversation } };
}
