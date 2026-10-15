import { describe, expect, it } from "vitest";
import { parseRequestOptions, retainedRequestOptions } from "./providerRequestOptions";

describe("provider advanced settings", () => {
  const draft = { useFullUrl: true, headers: "", body: "" };
  it("accepts empty settings and optional upstream parameters", () => {
    expect(parseRequestOptions(draft).value).toEqual({ useFullUrl: true, headers: {}, body: {} });
    expect(parseRequestOptions({ ...draft, body: '{"thinking":{"type":"enabled"}}' }).error).toBeUndefined();
  });
  it("rejects malformed objects and authentication or protocol overrides", () => {
    for (const body of ["[]", "null", "{broken}"]) {
      expect(parseRequestOptions({ ...draft, body }).error).toBe("invalidJson");
    }
    expect(parseRequestOptions({ ...draft, headers: '{"Authorization":"secret"}' }).error).toBe("invalidHeaders");
    expect(parseRequestOptions({ ...draft, headers: '{"X-A":"one","x-a":"two"}' }).error).toBe("invalidHeaders");
    expect(parseRequestOptions({ ...draft, body: '{"stream":false}' }).error).toBe("reservedBody");
  });
  it("limits payload size and nesting", () => {
    expect(parseRequestOptions({ ...draft, body: JSON.stringify({ extra: "a".repeat(17_000) }) }).error)
      .toBe("tooLarge");
    let body: unknown = true;
    for (let depth = 0; depth < 10; depth += 1) body = { extra: body };
    expect(parseRequestOptions({ ...draft, body: JSON.stringify(body) }).error).toBe("tooDeep");
  });
  it("protects native conversation and tool routing fields", () => {
    for (const field of ["contents", "systemInstruction", "system_instruction", "cachedContent", "cached_content",
      "toolConfig", "tool_config"]) {
      expect(parseRequestOptions({ ...draft, body: JSON.stringify({ [field]: {} }) }).error).toBe("reservedBody");
    }
  });
  it("rejects prototype fields at every nesting level without modifying built-in prototypes", () => {
    for (const body of [
      '{"__proto__":{"polluted":true}}',
      '{"metadata":[{"constructor":{"prototype":{"polluted":true}}}]}',
    ]) {
      expect(parseRequestOptions({ ...draft, body }).error).toBe("reservedBody");
    }
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
  it("counts the complete serialized settings at the payload boundary", () => {
    const maxBytes = 16 * 1024;
    const settings = { useFullUrl: false, headers: {}, body: { extra: "" } };
    const overhead = new TextEncoder().encode(JSON.stringify(settings)).length;
    const allowed = JSON.stringify({ extra: "x".repeat(maxBytes - overhead) });
    const oversized = JSON.stringify({ extra: "x".repeat(maxBytes - overhead + 1) });
    expect(parseRequestOptions({ ...draft, useFullUrl: false, body: allowed }).error).toBeUndefined();
    expect(parseRequestOptions({ ...draft, useFullUrl: false, body: oversized }).error).toBe("tooLarge");
  });
  it("preserves legacy edits but explicitly clears old settings when the endpoint changes", () => {
    const existing = { baseUrl: "https://upstream.example/custom/?route=west/", requestOptions: {
      useFullUrl: true, headers: { "X-Region": "east" }, body: { temperature: 0.4 },
    } };
    expect(retainedRequestOptions(existing, { baseUrl: existing.baseUrl })).toEqual(existing.requestOptions);
    expect(retainedRequestOptions(existing, { baseUrl: `${existing.baseUrl}new` })).toEqual({
      useFullUrl: false, headers: {}, body: {},
    });
    const cleared = { useFullUrl: false, headers: {}, body: {} };
    expect(retainedRequestOptions(existing, { baseUrl: existing.baseUrl, requestOptions: cleared })).toEqual(cleared);
  });
});
