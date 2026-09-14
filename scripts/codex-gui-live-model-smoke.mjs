// Verify live model changes against the installed CLI and a local Responses fixture, without model credits.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";

assert.ok(process.argv[2], "Pass the Codex executable path");
const root = await mkdtemp(join(tmpdir(), "gui-live-model-"));
const home = join(root, "home");
await mkdir(home);
const bodies = [];
const server = createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => { raw += chunk; });
  request.on("end", () => {
    bodies.push(JSON.parse(raw));
    const count = bodies.length;
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const emit = (event) => response.write(`data: ${JSON.stringify(event)}\n\n`);
    const item = count === 1
      ? { type: "function_call", id: "tool-1", call_id: "call-1", name: "fixture_wait", arguments: "{}" }
      : { type: "message", id: `message-${count}`, role: "assistant",
        content: [{ type: "output_text", text: "completed" }] };
    emit({ type: "response.created", response: { id: `response-${count}` } });
    emit({ type: "response.output_item.added", output_index: 0, item });
    emit({ type: "response.output_item.done", output_index: 0, item });
    emit({ type: "response.completed", response: { id: `response-${count}`, output: [item],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } });
    response.end();
  });
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
await writeFile(join(home, "config.toml"), `model = "gpt-5.4"
model_provider = "fixture"
approval_policy = "never"
[model_providers.fixture]
name = "fixture"
base_url = "http://127.0.0.1:${server.address().port}/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`);
const child = spawn(resolve(process.argv[2]), ["app-server", "-c", "features.step_model_switching=true"], {
  cwd: root, env: { ...process.env, CODEX_HOME: home }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
});
const pending = new Map();
const events = [];
let sequence = 0;
let stderr = "";
child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  const value = JSON.parse(line);
  if (value.method) events.push(value);
  else {
    const call = pending.get(value.id);
    if (!call) return;
    pending.delete(value.id);
    clearTimeout(call.timer);
    if (value.error) call.reject(new Error(JSON.stringify(value.error)));
    else call.resolve(value.result);
  }
});
const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
const rpc = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => reject(new Error(`Timed out: ${method}\n${stderr}`)), 20000);
  pending.set(id, { resolve, reject, timer });
  send({ id, method, params });
});
async function waitFor(predicate) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const found = events.find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Event timed out: ${JSON.stringify(events).slice(-3000)}\n${stderr}`);
}
try {
  await rpc("initialize", { clientInfo: { name: "gui-live-fixture", version: "1.0.0" },
    capabilities: { experimentalApi: true } });
  send({ method: "initialized" });
  const { thread } = await rpc("thread/start", { model: "gpt-5.4", cwd: root,
    dynamicTools: [{ type: "function", name: "fixture_wait", description: "Wait for fixture",
      inputSchema: { type: "object", properties: {}, additionalProperties: false } }] });
  const { turn } = await rpc("turn/start", { threadId: thread.id, model: "gpt-5.4", effort: "low",
    input: [{ type: "text", text: "Call fixture_wait, then finish." }] });
  const tool = await waitFor((event) => event.method === "item/tool/call");
  assert.equal(bodies.length, 1);
  await rpc("thread/settings/update", { threadId: thread.id, model: "gpt-5.5", effort: "high" });
  const update = await rpc("turn/settings/update", {
    threadId: thread.id, turnId: turn.id, model: "gpt-5.5", effort: "high",
  });
  assert.equal(update.status, "applied");
  send({ id: tool.id, result: { contentItems: [{ type: "inputText", text: "Ready" }], success: true } });
  await waitFor((event) => event.method === "turn/completed" && event.params.turn.id === turn.id);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].model, "gpt-5.4");
  assert.equal(bodies[1].model, "gpt-5.5");
  assert.equal(bodies[1].reasoning.effort, "high");
  assert.equal(events.filter((event) => event.method === "turn/started").length, 1);
  const ended = await rpc("turn/settings/update", {
    threadId: thread.id, turnId: turn.id, model: "gpt-5.4", effort: "low",
  });
  assert.equal(ended.status, "targetUnavailable");
  const next = await rpc("turn/start", { threadId: thread.id, input: [{ type: "text", text: "Continue." }] });
  await waitFor((event) => event.method === "turn/completed" && event.params.turn.id === next.turn.id);
  assert.equal(bodies[2].model, "gpt-5.5");
  assert.equal(bodies[2].reasoning.effort, "high");
  console.log("PASS: next request switches without interruption, and subsequent turns retain the new model.");
} finally {
  for (const call of pending.values()) clearTimeout(call.timer);
  lines.close();
  child.kill();
  server.closeAllConnections();
  server.close();
}
