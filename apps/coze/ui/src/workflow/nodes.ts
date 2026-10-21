import { msg, t as currentTranslate, type Translate } from "../i18n";
import type { Json, Node } from "../types";

/** Node type names as Chinese source strings; render them with `t(nodeLabels[type])`. */
export const nodeLabels: Record<string, string> = {
  start: msg("开始"), end: msg("结束"), llm: msg("大模型"), knowledge: msg("知识检索"), template: msg("文本处理"),
  condition: msg("条件分支"), http: msg("HTTP 请求"), json_parse: msg("解析 JSON"), json_stringify: msg("生成 JSON"),
  subworkflow: msg("子工作流"), loop: msg("批量执行"),
  code: msg("代码"),
  input: msg("等待用户输入"), output: msg("输出消息"), variable: msg("设置变量"), aggregate: msg("合并分支变量"),
  aggregate_groups: msg("分组合并变量"), conversation: msg("会话与消息"),
  sql: msg("SQL 查询"), nl2sql: msg("自然语言生成 SQL"),
  intent: msg("意图识别"), knowledge_write: msg("写入知识库"), knowledge_delete: msg("删除知识文档"),
  table_update: msg("更新数据"), repeat: msg("按次数循环"), break: msg("终止循环"), continue: msg("继续下次循环"),
  plugin: msg("工具调用"), table_query: msg("查询数据"), table_write: msg("写入数据"), table_delete: msg("删除数据"),
};

/**
 * Creates a node with default content. The name, prompts and sample values become user data,
 * so they are localized once here (current UI language by default) and never re-translated.
 */
export function newNode(type: string, index: number, t: Translate = currentTranslate): Node {
  const config: Record<string, Record<string, Json>> = {
    input: { prompt: t("请补充以下信息。"), fields: [{ name: "answer", description: t("回答"), kind: "string", required: true }], choices: [] },
    output: { value: "{{input.text}}" }, variable: { variable_name: "result", value: "{{input.text}}" },
    aggregate: { values: ["{{input.text}}"] }, aggregate_groups: { groups: { result: ["{{input.text}}"] } },
    conversation: { operation: "create", input: { title: t("新的会话") } },
    sql: { table_ids: [], sql: "SELECT * FROM t1 LIMIT 100" },
    nl2sql: { table_ids: [], model: "", question: "{{input.text}}" },
    intent: { model: "", query: "{{input.text}}", intents: [t("咨询"), t("反馈")] },
    knowledge_write: { knowledge_id: "", document_name: t("新的文档"), text: "{{input.text}}" },
    knowledge_delete: { knowledge_id: "", document_ids: [] },
    table_update: { table_id: "", row_id: "{{input.id}}", value: "{{input.value}}" },
    repeat: { workflow_id: "", count: 3 }, break: {}, continue: {},
    code: { code: "return { result: input.text };", input: "{{input}}", language: "javascript", entrypoint: false },
    plugin: { plugin_id: "", input: "{{input}}" },
    table_query: { table_id: "", filter: {} }, table_write: { table_id: "", value: "{{input}}" },
    table_delete: { table_id: "", row_id: "{{input.id}}" },
    llm: { model: "", prompt: "{{input.text}}", system: "", temperature: 0.7 },
    knowledge: { knowledge_ids: [], query: "{{input.text}}", limit: 6 },
    template: { template: "{{input.text}}" },
    condition: { left: "{{input.text}}", right: "", operator: "equal" },
    http: { url: "https://", method: "GET", body: {} },
    json_parse: { text: "{{input.text}}" }, json_stringify: { value: "{{input}}" },
    subworkflow: { workflow_id: "", input: "{{input}}" },
    loop: { workflow_id: "", items: "{{input.items}}" }, end: { value: "{{input}}" },
  };
  // An unknown type (only its id is used, e.g. by node duplication) falls back to the type id.
  return { id: `node_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`, name: t(nodeLabels[type] ?? type),
    x: 40 + (index % 4) * 250, y: 220 + Math.floor(index / 4) * 140, type, ...config[type] };
}
