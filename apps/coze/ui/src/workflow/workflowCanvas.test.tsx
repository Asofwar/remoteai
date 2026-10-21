// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage, translate } from "../i18n";
import { defaultGraph, type Graph } from "../types";
import { toEdges } from "./flowAdapter";
import { connectionError } from "./graphEditing";
import { RunResult } from "./RunResult";
import type { Run } from "./useWorkflowExecution";

const branch: Graph = { ...defaultGraph,
  nodes: [...defaultGraph.nodes, { id: "branch", type: "condition", name: "条件", x: 0, y: 0 }],
  edges: [{ source: "branch", target: "answer", port: true }, { source: "branch", target: "end", port: false }],
};

afterEach(() => setLanguage("zh"));

describe("canvas copy", () => {
  it("labels condition edges in the UI language", () => {
    const labels = (edges: ReturnType<typeof toEdges>) => edges.map((edge) => edge.label);
    expect(labels(toEdges(branch))).toEqual(["成立", "不成立"]);
    expect(labels(toEdges(branch, (source, values) => translate("ru", source, values)))).toEqual(["Да", "Нет"]);
    setLanguage("en");
    expect(labels(toEdges(branch))).toEqual(["True", "False"]);
  });

  it("keeps connection errors as Chinese sources and translates them for display", () => {
    const error = connectionError(branch, { source: "answer", target: "answer" });
    expect(error).toBe("不能连接节点自身。");
    expect(translate("en", error!)).toBe("A node can't connect to itself.");
    expect(translate("ru", error!)).toBe("Нельзя связать узел с самим собой.");
  });
});

describe("run result", () => {
  let root: Root | undefined;
  let host: HTMLElement | undefined;
  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove(); root = undefined; host = undefined; vi.unstubAllGlobals();
  });

  const run: Run = { id: "run", status: "paused", output: null, error: "运行已停止。", trace: [],
    interaction: { id: "ask-1", nodeId: "ask", prompt: "请补充以下信息。", choices: [], fields: [
      { name: "city", description: "城市", kind: "string", required: true },
      { name: "days", description: "", kind: "number", required: false },
    ] } };
  const text = (selector: string, index = 0) => host?.querySelectorAll(selector)[index]?.textContent?.trim();

  it("translates labels and stored messages at render and keeps Chinese output unchanged", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<RunResult run={run} busy={false} onResume={vi.fn()} />));
    expect(text("h3")).toBe("运行结果 等待回复");
    expect(text(".ant-alert-message")).toBe("运行已停止。");
    expect(text(".run-result p", 1)).toBe("城市（必填）、days");
    expect(host.querySelector("textarea")?.getAttribute("aria-label")).toBe("补充信息");

    await act(async () => setLanguage("ru"));
    expect(text("h3")).toBe("Результат запуска Ожидает ответа");
    expect(text(".ant-alert-message")).toBe("Запуск остановлен.");
    expect(text(".run-result p", 1)).toBe("城市 (обязательно) и days");
    expect(text(".run-button")).toBe("Продолжить запуск");

    await act(async () => setLanguage("en"));
    expect(text(".ant-tag")).toBe("Waiting for a reply");
    expect(text(".run-result p", 1)).toBe("城市 (required) and days");
    expect(host.querySelector("textarea")?.getAttribute("aria-label")).toBe("Additional information");
  });
});
