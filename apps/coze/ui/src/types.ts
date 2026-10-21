// Playwright specs import this module outside Vite: import only plain modules here, never ./i18n (index).
import type { Translate } from "./i18n";

export type Kind = "app" | "agent" | "workflow" | "knowledge" | "prompt" | "table" | "plugin";
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Draft = Record<string, Json>;
export interface Resource {
  id: string; kind: Kind; name: string; description: string; draft: Draft; revision: number;
  publishedRevision: number | null; mcpEnabled: boolean; updatedAt: string;
}
export interface Document { id: string; name: string; chunks: number; bytes: number; createdAt: string }
export interface Citation { chunkId: string; documentName: string; text: string; score: number }
export interface Message { role: string; content: string; citations: Citation[] }
export interface Model { id: string; name: string }

export interface Node {
  id: string; name: string; x: number; y: number; type: string; [key: string]: Json;
}
export interface Edge { source: string; target: string; port?: boolean | null }
export interface InputField { name: string; description: string; kind: string; required: boolean }
export interface Graph { nodes: Node[]; edges: Edge[]; inputs?: InputField[] }

/** Default content is user data: it is localized once, when a resource is created. */
export function createDefaultGraph(t: Translate): Graph {
  return {
    inputs: [{ name: "text", description: t("要处理的文本"), kind: "string", required: true }],
    nodes: [
      { id: "start", name: t("开始"), type: "start", x: 30, y: 70 },
      { id: "answer", name: t("文本处理"), type: "template", template: "{{input.text}}", x: 300, y: 70 },
      { id: "end", name: t("结束"), type: "end", value: "{{answer.output}}", x: 570, y: 70 },
    ],
    edges: [{ source: "start", target: "answer" }, { source: "answer", target: "end" }],
  };
}

/** The Chinese default graph, kept for tests and e2e fixtures. */
export const defaultGraph: Graph = createDefaultGraph((source) => source);

/** Column names of a new table; TableEditor's sample row uses the same names. */
export function defaultTableColumns(t: Translate): string[] {
  return [t("名称"), t("内容")];
}

export function defaultDraft(kind: Kind, t: Translate): Draft {
  switch (kind) {
    case "app": return { entryId: "", resourceIds: [] };
    case "agent": return { model: "", prompt: t("你是一位耐心、准确的助手。"), knowledgeIds: [], temperature: 0.7 };
    case "workflow": return JSON.parse(JSON.stringify(createDefaultGraph(t))) as Draft;
    case "knowledge": return {};
    case "prompt": return { text: "" };
    case "table": return { columns: defaultTableColumns(t) };
    case "plugin": return { url: "https://", method: "GET", body: {} };
  }
}
