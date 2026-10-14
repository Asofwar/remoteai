import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createRuntime } from "./fixtures/context-settings-runtime.mjs";

test("real CLI follows native capacity changes instead of inherited compaction thresholds", {
  skip: !process.env.CODEX_CONTEXT_TEST_CLI && "Set CODEX_CONTEXT_TEST_CLI to an installed Codex binary",
}, async () => {
  const runtime = createRuntime();
  const configurations = {};
  for (const [name, capacity] of [["large", 1000000], ["small", 400000], ["default", null]]) {
    await runtime.adapter.save("one", capacity);
    const reload = runtime.calls.filter(call => call.method === "thread/resume" && call.params.config).at(-1);
    configurations[name] = reload.params.config;
  }
  const script = fileURLToPath(new URL("./codex-gui-context-compaction-smoke.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, process.env.CODEX_CONTEXT_TEST_CLI,
    JSON.stringify(configurations)], { encoding: "utf8", windowsHide: true, timeout: 60000 });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
});
