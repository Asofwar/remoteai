export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
export interface ModelCatalog extends JsonObject { models: JsonObject[] }
export type CatalogError = "syntax" | "structure" | "empty" | "name" | "hidden";
export interface CatalogDraft { catalog: ModelCatalog | null; error: CatalogError | null }

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseCatalog(draft: string): CatalogDraft {
  let value: unknown;
  try { value = JSON.parse(draft); }
  catch { return { catalog: null, error: "syntax" }; }
  if (!isObject(value) || !Array.isArray(value.models) || !value.models.every(isObject)) {
    return { catalog: null, error: "structure" };
  }
  const catalog = value as ModelCatalog;
  return { catalog, error: validateCatalog(catalog) };
}

function validateCatalog(catalog: ModelCatalog): CatalogError | null {
  if (!catalog.models.length) return "empty";
  const names = new Set<string>();
  for (const model of catalog.models) {
    const name = typeof model.slug === "string" && model.slug ? model.slug : model.id;
    if (typeof name !== "string" || !name.trim() || names.has(name.trim())) return "name";
    names.add(name.trim());
  }
  return catalog.models.every((model) => model.visibility === "hide") ? "hidden" : null;
}

export function catalogErrorMessage(error: CatalogError, zh: boolean): string {
  const messages = {
    syntax: ["JSON 格式有误，请修正后再切换表格或保存。", "Fix the JSON syntax before switching to the table or saving."],
    structure: ["请提供包含 models 数组的对象，每个模型需为一个对象。",
      "Provide an object with a models array containing model objects."],
    empty: ["请至少添加一个模型。", "Add at least one model."],
    name: ["模型标识不能为空或重复，请检查 slug 或 id。", "Each model needs a unique, non-empty slug or id."],
    hidden: ["请至少保留一个可见模型。", "Keep at least one model visible."],
  };
  return messages[error][zh ? 0 : 1];
}

export function updateModel(catalog: ModelCatalog, index: number, patch: JsonObject): ModelCatalog {
  return { ...catalog, models: catalog.models.map((model, position) => (
    position === index ? { ...model, ...patch } : model
  )) };
}

export function addModel(catalog: ModelCatalog): ModelCatalog {
  const names = new Set(catalog.models.flatMap((model) => [model.slug, model.id]));
  let suffix = 1;
  while (names.has(`new-model-${suffix}`)) suffix++;
  const model = { slug: `new-model-${suffix}`, display_name: "", visibility: "list" };
  return { ...catalog, models: [...catalog.models, model] };
}

export function removeModel(catalog: ModelCatalog, index: number): ModelCatalog {
  return { ...catalog, models: catalog.models.filter((_, position) => position !== index) };
}
