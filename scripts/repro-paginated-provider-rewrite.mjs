// Synthetic, offline regression. Requires Node 22.13+ and a Codex with paginated history.
// Usage: node scripts/repro-paginated-provider-rewrite.mjs <codex> [provider-updater]
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { connectAppServer } from "./fixtures/codex-app-server-client.mjs";

assert.ok(process.argv[2], "Pass the path to a Codex executable.");
const executable = resolve(process.argv[2]);
const updater = process.argv[3] ? resolve(process.argv[3]) : null;
const home = mkdtempSync(join(tmpdir(), "remoteai-history-fixture-"));
const parentId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-01-01T00:00:00.000Z";
const folder = join(home, "sessions", "2026", "01", "01");
mkdirSync(folder, { recursive: true });
writeFileSync(join(home, "config.toml"), [
  'model_provider = "fixture"', 'model = "fixture-model"',
  '[model_providers.fixture]', 'name = "Offline fixture"',
  'base_url = "http://127.0.0.1:1"', 'wire_api = "responses"', 'requires_openai_auth = false',
  '[features]', 'image_generation = false', 'remote_models = false', "",
].join("\n"));

function metadata(id, historyBase) {
  return { timestamp, ordinal: historyBase ? 1 : 0, type: "session_meta", payload: {
    id, timestamp, cwd: home, originator: "synthetic-test", cli_version: "0.163.0",
    source: "cli", model_provider: "codex-switch-local", base_instructions: { text: "" },
    history_mode: "paginated",
    ...(historyBase ? { history_base: historyBase, forked_from_id: parentId } : {}),
  } };
}

const parentPath = join(folder, `rollout-2026-01-01T00-00-00-${parentId}.jsonl`);
const childPath = join(folder, `rollout-2026-01-01T00-00-01-${childId}.jsonl`);
const parent = JSON.stringify(metadata(parentId)) + "\n";
const base = { thread_id: parentId, end_ordinal_exclusive: 1, end_byte_offset: Buffer.byteLength(parent) };
writeFileSync(parentPath, parent);
writeFileSync(childPath, JSON.stringify(metadata(childId, base)) + "\n");

async function probe(resume = false) {
  // Explicit undefined overrides inherited secrets when the shared client merges environments.
  const env = Object.fromEntries(Object.keys(process.env)
    .filter(key => /API_KEY|ACCESS_TOKEN|AUTH_TOKEN/i.test(key)).map(key => [key, undefined]));
  const client = connectAppServer({ executable, home, cwd: home, env });
  try {
    await client.initialize();
    await client.rpc("thread/turns/list", { threadId: childId, limit: 10 });
    if (resume) {
      const result = await client.rpc("thread/resume", { threadId: childId, cwd: home, excludeTurns: true });
      assert.equal(result.modelProvider, "fixture");
    }
  } finally {
    await client.close();
  }
}

function setDatabaseProvider() {
  const db = new DatabaseSync(join(home, "state_5.sqlite"));
  try {
    for (const [id, rollout] of [[parentId, parentPath], [childId, childPath]]) {
      db.prepare(`INSERT OR REPLACE INTO threads
        (id,rollout_path,created_at,updated_at,source,model_provider,cwd,title,sandbox_policy,approval_mode,history_mode)
        VALUES (?,?,0,0,'cli','fixture',?,'Synthetic test','{"type":"read-only"}','never','paginated')`
      ).run(id, rollout, home);
    }
  } finally {
    db.close();
  }
}

await probe();
const rewritten = JSON.parse(parent);
rewritten.payload.model_provider = "openai";
writeFileSync(parentPath, JSON.stringify(rewritten) + "\n");
const providerLengthDifference = Buffer.byteLength("codex-switch-local") - Buffer.byteLength("openai");
assert.equal(base.end_byte_offset - statSync(parentPath).size, providerLengthDifference);
await assert.rejects(probe(), /cutoff byte offset is past the source rollout/);
writeFileSync(parentPath, parent);
await probe();
console.log("PASS: original -> provider header shrink -> lineage failure -> restored bytes -> success.");
if (updater) {
  const result = spawnSync(updater, [parentPath, "openai"], { encoding: "utf8", windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(parentPath, "utf8"), parent);
  await probe();
  console.log("PASS: production provider updater preserves the parent and readable lineage.");
}
setDatabaseProvider();
await probe(true);
console.log("PASS: resume uses the database provider with the original rollout header unchanged.");
console.log("Synthetic fixture retained at:", home);
