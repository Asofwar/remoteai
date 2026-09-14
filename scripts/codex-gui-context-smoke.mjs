// Verify per-thread capacity on the installed CLI using a local Responses fixture, without model credits.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";

assert.ok(process.argv[2], "Pass the Codex executable path");
const root = await mkdtemp(join(tmpdir(), "gui-context-"));
const home = join(root, "home");
await mkdir(home);
let responses = 0;
const server = createServer((request, response) => {
  request.resume();
  request.on("end", () => {
    responses++;
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const emit = (event) => response.write(`data: ${JSON.stringify(event)}\n\n`);
    const item = { type: "message", id: `message-${responses}`, role: "assistant",
      content: [{ type: "output_text", text: "completed" }] };
    emit({ type: "response.created", response: { id: `response-${responses}` } });
    emit({ type: "response.output_item.added", output_index: 0, item });
    emit({ type: "response.output_item.done", output_index: 0, item });
    emit({ type: "response.completed", response: { id: `response-${responses}`, output: [item],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } });
    response.end();
  });
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
await writeFile(join(home, "config.toml"), `model = "gpt-5.4"
model_context_window = 200000
model_provider = "fixture"
approval_policy = "never"
[model_providers.fixture]
name = "fixture"
base_url = "http://127.0.0.1:${server.address().port}/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`);

function connect() {
  const child = spawn(resolve(process.argv[2]), ["app-server"], {
    cwd: root, env: { ...process.env, CODEX_HOME: home }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  const events = [];
  let sequence = 0;
  const lines = createInterface({ input: child.stdout });
  child.stderr.resume();
  lines.on("line", (line) => {
    const value = JSON.parse(line);
    if (value.method) { events.push(value); return; }
    const call = pending.get(value.id);
    if (!call) return;
    pending.delete(value.id); clearTimeout(call.timer);
    if (value.error) call.reject(new Error(JSON.stringify(value.error)));
    else call.resolve(value.result);
  });
  const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(new Error(`Timed out: ${method}`)), 20000);
    pending.set(id, { resolve, reject, timer }); send({ id, method, params });
  });
  return { rpc, events, async initialize() {
    await rpc("initialize", { clientInfo: { name: "gui-context-fixture", version: "1.0.0" },
      capabilities: { experimentalApi: true } });
    send({ method: "initialized" });
  }, async close() {
    for (const call of pending.values()) clearTimeout(call.timer);
    lines.close(); child.kill(); await once(child, "exit");
  } };
}

async function waitFor(client, predicate) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const found = client.events.find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for thread usage");
}

async function turnCapacity(client, threadId) {
  client.events.length = 0;
  const { turn } = await client.rpc("turn/start", { threadId, input: [{ type: "text", text: "Reply OK." }] });
  await waitFor(client, (event) => event.method === "turn/completed" && event.params.turn.id === turn.id);
  const event = await waitFor(client, (event) => event.method === "thread/tokenUsage/updated"
    && event.params.threadId === threadId);
  const latest = client.events.filter((entry) => entry.method === event.method
    && entry.params.threadId === threadId).at(-1);
  return latest.params.tokenUsage.modelContextWindow;
}

let client = connect();
try {
  await client.initialize();
  const { thread: first } = await client.rpc("thread/start", { cwd: root });
  const original = await turnCapacity(client, first.id);
  const { thread: second } = await client.rpc("thread/start", { cwd: root });
  assert.equal(await turnCapacity(client, second.id), original);
  await client.close(); client = connect(); await client.initialize();
  await client.rpc("thread/resume", { threadId: first.id, config: { model_context_window: 100000 } });
  assert.equal(await turnCapacity(client, first.id), original / 2);
  await client.rpc("thread/resume", { threadId: second.id });
  assert.equal(await turnCapacity(client, second.id), original);
  await client.close(); client = connect(); await client.initialize();
  await client.rpc("thread/resume", { threadId: first.id });
  assert.equal(await turnCapacity(client, first.id), original);
  console.log("PASS: reconnect applies per-thread capacity; other conversations and reset retain the default.");
} finally {
  await client.close(); server.closeAllConnections(); server.close();
}
