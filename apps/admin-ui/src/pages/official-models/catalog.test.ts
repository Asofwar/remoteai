import { describe, expect, it } from "vitest";
import { addModel, parseCatalog, removeModel, updateModel, type ModelCatalog } from "./catalog";

const catalog: ModelCatalog = {
  metadata: { revision: "future", extra: [null, true, 12] },
  models: [{ slug: "first", context_window: 373000, visibility: "list",
    base_instructions: "Instructions\n\"quoted\" 文本".repeat(3000),
    supported_reasoning_levels: [{ effort: "low", description: "Fast" }],
    unknown: { nested: [null, false, { value: "keep me" }] } }, { id: "second", visibility: "hide" }],
};

describe("official model catalog editing", () => {
  it("changes only the selected field, retaining long strings, unknown data and id-only models", () => {
    const original = JSON.stringify(catalog);
    const parsed = parseCatalog(original);
    expect(parsed.error).toBeNull();
    const updated = updateModel(parsed.catalog!, 0, { context_window: 400000 });
    expect(parseCatalog(JSON.stringify(updated)).catalog).toEqual({ ...catalog,
      models: [{ ...catalog.models[0], context_window: 400000 }, catalog.models[1]] });
    expect(JSON.stringify(catalog)).toBe(original);
  });

  it("preserves JSON types when replacing nested, nullable and boolean fields", () => {
    const patch = { supported_reasoning_levels: [{ effort: "high" }],
      auto_compact_token_limit: null, supported_in_api: false };
    const updated = updateModel(catalog, 0, patch);
    expect(updated.models[0]).toEqual({ ...catalog.models[0], ...patch });
    expect(updated.metadata).toEqual(catalog.metadata);
  });

  it("adds unique models and removes only the requested model", () => {
    const updated = addModel(addModel(catalog));
    expect(updated.models.slice(-2).map((model) => model.slug)).toEqual(["new-model-1", "new-model-2"]);
    expect(removeModel(updated, 0).models).toEqual(updated.models.slice(1));
    expect(removeModel(updated, 0).metadata).toEqual(catalog.metadata);
  });

  it.each(["{", "[]", "null", "{}", '{"models":[null]}', '{"models":[[]]}']) (
    "rejects malformed or incompatible content without inventing a table: %s", (draft) => {
      expect(parseCatalog(draft).catalog).toBeNull();
    },
  );

  it.each([
    [{ models: [] }, "empty"],
    [{ models: [{ slug: " " }] }, "name"],
    [{ models: [{ slug: " first " }, { id: "first" }] }, "name"],
    [{ models: [{ slug: "first", visibility: "hide" }] }, "hidden"],
  ])("retains fixable table drafts while preventing invalid saves", (draft, error) => {
    expect(parseCatalog(JSON.stringify(draft))).toEqual({ catalog: draft, error });
  });
});
