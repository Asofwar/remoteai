// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError, api } from "../api";
import { setLanguage } from "../i18n";
import { useKnowledgeJob } from "./useKnowledgeJob";

vi.mock("../api", async (importOriginal) => ({ ...await importOriginal<typeof import("../api")>(), api: vi.fn() }));
let root: Root | undefined;
let value: ReturnType<typeof useKnowledgeJob>;
const onError = vi.fn();
const onComplete = vi.fn(async () => {});
function Fixture() { value = useKnowledgeJob({ scope: "kb", onComplete, onError }); return null; }

beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  root = createRoot(document.createElement("div"));
  await act(async () => root?.render(<Fixture />));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  await act(async () => setLanguage("zh"));
  vi.resetAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

it("keeps the stage as data and translates the progress when the language changes", async () => {
  vi.mocked(api).mockResolvedValueOnce({ id: "job" });
  vi.mocked(api).mockResolvedValueOnce({ status: "running",
    events: [{ sequence: 1, event: { type: "progress", stage: "index", completed: 2, total: 5 } }] });
  await act(async () => value.start("import_document_start", {}));
  expect(value.progress).toBe("正在整理知识（2 / 5）");
  await act(async () => setLanguage("ru"));
  expect(value.progress).toBe("Индексация знаний… (2 из 5)");
  await act(async () => setLanguage("en"));
  expect(value.progress).toBe("Indexing knowledge… (2 / 5)");
  vi.mocked(api).mockResolvedValueOnce({ status: "completed", events: [] });
  await act(async () => vi.advanceTimersByTime(500));
  expect(value.progress).toBe("Import complete");
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it("reports an unknown stage as processing and passes Rust errors on untranslated", async () => {
  vi.mocked(api).mockResolvedValueOnce({ id: "job" });
  vi.mocked(api).mockResolvedValueOnce({ status: "running",
    events: [{ sequence: 1, event: { type: "progress", stage: "constructor" } }] });
  await act(async () => value.start("import_document_start", {}));
  expect(value.progress).toBe("正在处理");
  vi.mocked(api).mockResolvedValueOnce({ status: "failed", events: [], error: "文件内容无法读取。" });
  await act(async () => setLanguage("en"));
  await act(async () => vi.advanceTimersByTime(500));
  expect(onError).toHaveBeenLastCalledWith("文件内容无法读取。");
  expect(value.progress).toBe("");
});

it("treats a missing job (HTTP 404) as finished, whatever the error text", async () => {
  sessionStorage.setItem("coze-import-kb", "old");
  vi.mocked(api).mockRejectedValueOnce(new ApiError("Not found", 404));
  await act(async () => root?.render(<Fixture key="restored" />));
  expect(sessionStorage.getItem("coze-import-kb")).toBeNull();
  expect(onError).toHaveBeenLastCalledWith("上次导入已结束或连接已重启，请检查文档列表。");
  expect(value.busy).toBe(false);
});
