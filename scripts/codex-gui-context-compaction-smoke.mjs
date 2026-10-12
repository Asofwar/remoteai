// Invoked by the Rust smoke test with overrides produced by the real GUI capacity code.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { connectAppServer } from "./fixtures/codex-app-server-client.mjs";
import { guiContextCatalog } from "./fixtures/gui-context-catalog.mjs";
import { contextUsage } from "../shared/context-usage/values.js";

assert.ok(process.argv[2] && process.argv[3], "Run the real_cli_context_compaction_follows_gui_capacity Rust test");
const executable = resolve(process.argv[2]);
const configurations = JSON.parse(process.argv[3]);
const REPORTED_USAGE = 285_000;
const STALE_LIMIT = 250_000;

function fixture() {
  let nextUsage = 15;
  let sequence = 0;
  const server = createServer(async (request, response) => {
    request.resume();
    await once(request, "end");
    const id = `fixture-${++sequence}`;
    const item = { type: "message", id, role: "assistant",
      content: [{ type: "output_text", text: "OK" }] };
    const usage = { input_tokens: nextUsage - 5, output_tokens: 5, total_tokens: nextUsage };
    nextUsage = 15;
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const emit = (event) => response.write(`data: ${JSON.stringify(event)}\n\n`);
    emit({ type: "response.created", response: { id } });
    emit({ type: "response.output_item.added", output_index: 0, item });
    emit({ type: "response.output_item.done", output_index: 0, item });
    emit({ type: "response.completed", response: { id, output: [item], usage } });
    response.end();
  });
  return { server, reportUsage(value) { nextUsage = value; } };
}

async function turn(client, threadId) {
  const { turn } = await client.rpc("turn/start", {
    threadId, input: [{ type: "text", text: "Reply OK without using tools." }],
  });
  const event = await client.waitFor((event) => event.method === "turn/completed"
    && event.params.turn.id === turn.id);
  assert.equal(event.params.turn.status, "completed", JSON.stringify(event));
}

async function rejoin(client, threadId, config) {
  await client.rpc("thread/unsubscribe", { threadId });
  await client.rpc("thread/resume", { threadId, sandbox: "read-only", config });
}

async function checkUsage({ client, threadId, provider, used = REPORTED_USAGE, capacity, compact }) {
  client.events.length = 0;
  provider.reportUsage(used);
  await turn(client, threadId);
  const usage = client.events.find((event) => event.method === "thread/tokenUsage/updated"
    && event.params.tokenUsage.last.totalTokens === used)?.params.tokenUsage;
  assert.ok(usage, "Missing reported usage");
  assert.deepEqual(contextUsage(usage), { used, capacity, percent: Math.round(used / capacity * 100) });
  await turn(client, threadId);
  const compacted = client.events.some((event) => event.method === "item/completed"
    && event.params.item.type === "contextCompaction");
  assert.equal(compacted, compact, `Unexpected compaction at ${used} / ${capacity}`);
}

async function configure({ home, port, source }) {
  const catalogPath = join(home, "models.json");
  const catalog = guiContextCatalog(null);
  if (source === "catalog") catalog.models[0].auto_compact_token_limit = STALE_LIMIT;
  await writeFile(catalogPath, JSON.stringify(catalog));
  await writeFile(join(home, "config.toml"), `model = "gpt-5.4"
model_context_window = 400000
model_provider = "codex-switch-gui"
model_catalog_json = ${JSON.stringify(catalogPath.replaceAll("\\", "/"))}
approval_policy = "never"
${source === "config" ? `model_auto_compact_token_limit = ${STALE_LIMIT}` : ""}
[model_providers.codex-switch-gui]
name = "Codex GUI"
base_url = "http://127.0.0.1:${port}/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`);
}

async function checkChanges({ client, threadId, provider }) {
  const check = (options) => checkUsage({ client, threadId, provider, ...options });
  // Baseline reproduces the previous GUI request: 30% still triggers compaction.
  await check({ capacity: 950_000, compact: true });
  await rejoin(client, threadId, configurations.large);
  await check({ capacity: 950_000, compact: false });
  // The new limit must still compact near capacity instead of disabling compaction.
  await check({ used: 905_000, capacity: 950_000, compact: true });
  await rejoin(client, threadId, configurations.small);
  await check({ capacity: 380_000, compact: false });
  await check({ used: 365_000, capacity: 380_000, compact: true });
  await rejoin(client, threadId, configurations.default);
  await check({ capacity: 380_000, compact: true });
  const { thread } = await client.rpc("thread/start", { sandbox: "read-only", config: configurations.large });
  await checkUsage({ client, threadId: thread.id, provider, capacity: 950_000, compact: false });
  const { thread: other } = await client.rpc("thread/start", { sandbox: "read-only" });
  await checkUsage({ client, threadId: other.id, provider, capacity: 380_000, compact: true });
  await rejoin(client, threadId, configurations.large);
}

async function exercise(source) {
  const root = await mkdtemp(join(tmpdir(), "gui-context-compaction-"));
  const home = join(root, "home");
  await mkdir(home);
  const provider = fixture();
  provider.server.listen(0, "127.0.0.1");
  await once(provider.server, "listening");
  await configure({ home, port: provider.server.address().port, source });
  let client = connectAppServer({ executable, home, cwd: root });
  try {
    await client.initialize();
    const { thread } = await client.rpc("thread/start", { cwd: root, sandbox: "read-only",
      config: { model_context_window: 1_000_000 } });
    await checkChanges({ client, threadId: thread.id, provider });
    await client.close();
    client = connectAppServer({ executable, home, cwd: root });
    await client.initialize();
    await client.rpc("thread/resume", { threadId: thread.id, sandbox: "read-only", config: configurations.large });
    await checkUsage({ client, threadId: thread.id, provider, capacity: 950_000, compact: false });
    console.log(`PASS ${source}: 30% regression, 1M/400K thresholds, default, new/other threads, restart`);
  } finally {
    await client.close();
    provider.server.closeAllConnections();
    await new Promise((done) => provider.server.close(done));
  }
}

await exercise("config");
await exercise("catalog");
