export const COZE_DESKTOP_READY = "remoteai:coze:ready";
export const COZE_DESKTOP_STOP = "remoteai:coze:stop";
export const COZE_DESKTOP_STATE = "remoteai:coze:state";

export interface CozeDesktopState {
  type: typeof COZE_DESKTOP_STATE;
  busy: boolean;
}

export function isCozeDesktopState(value: unknown): value is CozeDesktopState {
  return typeof value === "object" && value !== null && "type" in value
    && value.type === COZE_DESKTOP_STATE && "busy" in value && typeof value.busy === "boolean";
}
