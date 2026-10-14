// Exercise catalogs produced by the actual proxy Rust code with an isolated Codex app-server.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { connectAppServer } from "./fixtures/codex-app-server-client.mjs";
import { guiContextCatalog } from "./fixtures/gui-context-catalog.mjs";

const executable = resolve(process.argv[2]);
const catalogs = JSON.parse(process.argv[3]);
const MODEL = "gpt-6.1-sol";
const root = await mkdtemp(join(tmpdir(), "official-context-"));
let nextUsage = 15;
let sequence = 0;
const server = createServer(async (request, response) => {
  request.resume();
  await once(request, "end");
  const id = `context-fixture-${++sequence}`;
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
server.listen(0, "127.0.0.1");
await once(server, "listening");

async function configure(name) {
  const home = join(root, name);
  await mkdir(home);
  const path = join(home, "models.json");
  const template = guiContextCatalog(272_000).models[0];
  // Fill protocol fields omitted by the Rust fixture; all generated limits remain untouched.
  const models = catalogs[name].models.map((model) => ({ ...template, ...model,
    display_name: model.slug, default_reasoning_level: "high", use_responses_lite: false }));
  await writeFile(path, JSON.stringify({ models }));
  await writeFile(join(home, "config.toml"), `model = "${MODEL}"
model_provider = "context-fixture"
model_catalog_json = ${JSON.stringify(path.replaceAll("\\", "/"))}
approval_policy = "never"
[model_providers.context-fixture]
name = "Context fixture"
base_url = "http://127.0.0.1:${server.address().port}/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`);
  return home;
}

async function turn(client, threadId) {
  const { turn } = await client.rpc("turn/start", {
    threadId, input: [{ type: "text", text: "Reply OK without using tools." }],
  });
  const event = await client.waitFor((event) => event.method === "turn/completed"
    && event.params.turn.id === turn.id);
  assert.equal(event.params.turn.status, "completed", JSON.stringify(event));
}

async function check(client, threadId, { used, capacity, compact }) {
  client.events.length = 0;
  nextUsage = used;
  await turn(client, threadId);
  const usage = client.events.find((event) => event.method === "thread/tokenUsage/updated"
    && event.params.tokenUsage.last.totalTokens === used)?.params.tokenUsage;
  assert.ok(usage, "Missing token usage event");
  assert.equal(usage.modelContextWindow, capacity);
  await turn(client, threadId);
  const compacted = client.events.some((event) => event.method === "item/completed"
    && event.params.item.type === "contextCompaction");
  assert.equal(compacted, compact, `Unexpected compaction at ${used} / ${capacity}`);
}

try {
  for (const name of ["original", "updated"]) {
    const client = connectAppServer({ executable, home: await configure(name), cwd: root });
    try {
      await client.initialize();
      const { thread } = await client.rpc("thread/start", { cwd: root, sandbox: "read-only" });
      await check(client, thread.id, { used: 285_000,
        capacity: name === "original" ? 258_400 : 475_000, compact: name === "original" });
      if (name === "updated") {
        await check(client, thread.id, { used: 455_000, capacity: 475_000, compact: true });
      }
      console.log(`PASS ${name}: ${name === "original" ? "272K fallback reproduced"
        : "500K capacity, no compaction at 285K, compaction above 450K"}`);
    } finally { await client.close(); }
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
