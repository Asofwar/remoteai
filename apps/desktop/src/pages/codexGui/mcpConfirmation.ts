import type { EventParams } from "./types";

const CHROME_ACTIONS: Record<string, string> = {
  browser_open: "打开这个网页", browser_navigate: "前往这个网页", browser_close: "关闭这个标签页",
  browser_reload: "刷新网页", browser_back: "返回上一页", browser_forward: "前往下一页",
  browser_focus: "切换到这个标签页", browser_click: "点击页面中的元素", browser_fill: "填写页面内容",
  browser_type: "输入这些内容", browser_key: "按下这些按键", browser_select: "选择这个选项",
  browser_check: "更改勾选状态", browser_scroll: "滚动页面", browser_drag: "拖动页面中的元素",
};
const PARAMETER_LABELS: Record<string, string> = {
  url: "网页", text: "内容", value: "内容", values: "选项", key: "按键", keys: "按键",
  checked: "勾选", direction: "方向", amount: "距离", button: "鼠标按键",
};
const PAGE_REFERENCES = new Set(["browserId", "tabId", "ref", "frameId", "fromRef", "toRef"]);

export function mcpConfirmation(params: EventParams) {
  const tool = params.message?.match(/"(browser_[a-z_]+)"/)?.[1];
  const action = params.serverName === "codex_switch_chrome" && tool ? CHROME_ACTIONS[tool] : undefined;
  const entries = Object.entries(params._meta?.tool_params ?? {});
  return {
    message: action ? `允许${action}吗？` : params.message,
    details: entries.filter(([key]) => !action || !PAGE_REFERENCES.has(key)).map(([key, value]) => ({
      label: action ? PARAMETER_LABELS[key] ?? key : key,
      value: typeof value === "string" ? value : JSON.stringify(value),
    })),
  };
}
