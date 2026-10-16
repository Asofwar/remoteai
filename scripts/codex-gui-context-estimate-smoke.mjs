// Real Codex diagnostics + mocked Responses API; no credentials, external service, or user files.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { connectAppServer } from "./fixtures/codex-app-server-client.mjs";
import { guiContextCatalog } from "./fixtures/gui-context-catalog.mjs";

const executable = resolve(process.argv[2]);
const outputPath = process.argv[3];
const home = await mkdtemp(join(tmpdir(), "gui-context-estimate-"));
const diagnostics = [];
let requests = 0;
const server = createServer(async (request, response) => {
  request.resume();
  await once(request, "end");
  const index = ++requests;
  const id = `response-${index}`;
  const message = { type: "message", id: `message-${index}`, role: "assistant",
    content: [{ type: "output_text", text: "Fixture completed." }] };
  const output = index === 1 ? [{ type: "reasoning", id: "reasoning-1", summary: [],
    encrypted_content: "x".repeat(220_000) }, message]
    : index === 2 ? [{ type: "function_call", id: "tool-1", call_id: "tool-call-1",
      name: "context_fixture", arguments: "{}" }] : [message];
  const total = index <= 2 ? 206_357 : 1000;
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const emit = (event) => response.write(`data: ${JSON.stringify(event)}\n\n`);
  emit({ type: "response.created", response: { id } });
  for (const [output_index, item] of output.entries()) {
    emit({ type: "response.output_item.added", output_index, item });
    emit({ type: "response.output_item.done", output_index, item });
  }
  emit({ type: "response.completed", response: { id, output,
    usage: { input_tokens: total - 5, output_tokens: 5, total_tokens: total } } });
  response.end();
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
await writeFile(join(home, "models.json"), JSON.stringify(guiContextCatalog(null)));
await writeFile(join(home, "config.toml"), `model = "gpt-5.4"
model_context_window = 272000
model_auto_compact_token_limit = 244800
model_provider = "fixture"
model_catalog_json = ${JSON.stringify(join(home, "models.json").replaceAll("\\", "/"))}
approval_policy = "never"
[model_providers.fixture]
name = "Context fixture"
base_url = "http://127.0.0.1:${server.address().port}/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`);
const client = connectAppServer({ executable, home, cwd: home,
  env: { LOG_FORMAT: "json", RUST_LOG: "off,codex_core::session::turn=trace,codex_core::codex=trace",
    NO_PROXY: "localhost,127.0.0.1,::1", no_proxy: "localhost,127.0.0.1,::1" },
  onDiagnostic(line) {
    try {
      const log = JSON.parse(line);
      if (log.fields?.message === "post sampling token usage") diagnostics.push(log);
    } catch { /* Non-diagnostic startup output is not part of the bridge. */ }
  } });
try {
  await client.initialize();
  const { thread } = await client.rpc("thread/start", { model: "gpt-5.4", sandbox: "read-only",
    dynamicTools: [{ name: "context_fixture", description: "Return fixture data.",
      inputSchema: { type: "object", properties: {} } }] });
  const first = await client.rpc("turn/start", { threadId: thread.id,
    input: [{ type: "text", text: "Reply once." }] });
  await client.waitFor((e) => e.method === "turn/completed" && e.params.turn.id === first.turn.id);
  const second = await client.rpc("turn/start", { threadId: thread.id,
    input: [{ type: "text", text: "Use the fixture tool, then finish." }] });
  const call = await client.waitFor((e) => e.method === "item/tool/call");
  client.respond(call.id, { success: true, contentItems: [{ type: "inputText", text: "z".repeat(40_000) }] });
  await client.waitFor((e) => e.method === "turn/completed" && e.params.turn.id === second.turn.id);
  assert.ok(client.events.some((e) => e.method === "item/completed" && e.params.item.type === "contextCompaction"),
    JSON.stringify(diagnostics.map((log) => log.fields)));
  const decision = diagnostics.find((log) => log.fields.token_limit_reached === true);
  assert.ok(decision, JSON.stringify(diagnostics));
  assert.ok(decision.fields.total_usage_tokens >= 244_800);
  const usage = client.events.find((e) => e.method === "thread/tokenUsage/updated"
    && e.params.turnId === second.turn.id && e.params.tokenUsage.last.totalTokens === 206_357)?.params.tokenUsage;
  assert.ok(usage);
  const result = { diagnostic: decision, usage, threadId: thread.id, turnId: second.turn.id };
  if (outputPath) await writeFile(outputPath, JSON.stringify(result));
  console.log(JSON.stringify({ reported: usage.last.totalTokens, estimate: decision.fields.total_usage_tokens,
    capacity: usage.modelContextWindow, threshold: 244800, compacted: true }));
} finally {
  await client.close();
  server.close();
  server.closeAllConnections();
}
