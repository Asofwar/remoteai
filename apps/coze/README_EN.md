# Rust local runtime for Coze

> Chinese is the default documentation language. For the Chinese README, see [README.md](README.md).
> For the Russian README (Русский), see [README_RU.md](README_RU.md).

Remote AI installs this optional component through the `coze` entry under **Plugins** in the left sidebar. Opening it for the first time only checks its status; the separately signed package is downloaded only after the user clicks to download it. The main installer does not include the runtime, the editor or the embedding model.

The upstream Go backend is neither bundled nor started, and no Docker, MySQL, Redis, Elasticsearch, Milvus, Python or Node.js runtime is required.

## Current implementation and limits

| Upstream responsibility | Rust implementation | Current capabilities |
| --- | --- | --- |
| Model management | `src/proxy.rs` | Automatically uses the Codex GUI local proxy, model catalog and current account of Remote AI; upstream keys are not copied |
| Knowledge base | `src/knowledge/`, `src/embedding.rs` | Documents, web pages, images and scanned PDFs; source refresh, original images, chunk editing, hybrid search, citations; background progress and cancellation |
| Workflow | `src/workflow/` | Visual orchestration, Chatflow human-in-the-loop interaction and resume, variables, aggregation and intent classification, loop control, conversation nodes, knowledge reads and writes, SQL, run traces; upstream canvas compatibility |
| Code node | `src/code_runtime/` | JavaScript, TypeScript and a Python subset; compiled or interpreted in Rust, without calling the system Python or Node |
| Agents and conversations | `src/agents/`, `src/proxy/` | Knowledge Q&A, autonomous tool calls, per-tool authorization for table writes, tool history, multi-turn memory, true streaming output and stopping |
| Apps and publishing | `src/projects.rs`, `src/publications.rs` | Composing apps from resources, running entry points, recursively freezing published dependencies, switching between versions; knowledge documents and table records keep updating |
| Shared access | `src/collaboration_access/` | App-scoped view, use and edit permissions, expiry and revocation, isolated drafts and run history; access links on this computer |
| Templates and backup | `src/catalog.rs`, `src/backup.rs` | Local template gallery, export and import together with dependencies, full database backup and restore including original document files, indexes and history |
| Tools and MCP | `src/plugins.rs`, `src/mcp.rs` | Calling apps, workflows, agents, knowledge bases, tools, prompts and tables on this computer, and resuming Chatflows; registers itself in both Codex Homes automatically |
| Tables | `src/tables/` | Field types, pagination, transactional bulk import, create/read/update/delete, isolated SQL, natural-language query generation with preview |

This is a port of the features for desktop use, not a replacement service for the upstream Go HTTP/Thrift APIs or database. Canvas import rejects nodes that have no implementation yet; it never skips them silently. For the detailed node mapping, see the [workflow migration notes](../../docs/coze-workflow-parity.md); for the knowledge base and SQL scope, see the [knowledge base migration notes](../../docs/coze-knowledge-parity.md) (both in Chinese).

Python uses Monty's restricted Python syntax and standard library and supports the upstream `async def main(args)` entry point; arbitrary third-party pip packages and host file or network access are not supported. Each run executes in a separate Rust child process with memory and time limits. TypeScript is transpiled locally and then runs in a restricted QuickJS. Do not describe the code language support as a complete CPython or Node environment.

The template gallery is a local template library that can be shared; it is not connected to Coze's online store, billing or review services. Collaborative editing links are for apps published on this computer. Calling tools from other computers requires turning on External access separately, and it does not replace cloud organization sign-in or team management. Recognition of scanned files and images uses the selected vision model and the existing proxy routing, so it must not be described as guaranteed to work offline.

Publishing pins the resource definitions of the whole dependency chain, so they do not drift when a sub-workflow is republished. Knowledge documents, table fields and records still keep updating. Single-item exports and template exports include the referenced configuration and field constraints. **Backup and restore** exports the full database; restoring requires the same database schema and invalidates old share links.

## Runtime and data

- Tauri commands only hand work off to blocking worker threads. Downloading, extracting, starting processes, accessing configuration and checking status never occupy the window thread.
- The editor listens on a random port on `127.0.0.1` and requires a credential generated at each start. A separate tools-only port can be turned on; it does not serve the editor, backups or management operations.
- Startup information is passed through stdin; the runtime exits when the parent process's pipe closes. On Windows, the background start does not open a console window.
- The desktop connection uses the Codex GUI Responses API, which carries text, images and tool calls alike; the client version is filled in to the model catalog automatically.
  Standalone tests against a plain `/v1` proxy keep Chat Completions compatibility. An interrupted or failed stream is never recorded as a successful answer.
- Data is stored in `coze/data/coze.sqlite3` in the app data directory. WAL, foreign keys and transactions ensure that a failed indexing run never leaves half a document behind, and deleting a document also removes its vector and full-text records.
- The component lives in `coze/packages/<version>`; replacing the package does not delete `coze/data`. An unfinished download never creates an installation-complete marker.
- The embedding model is a pinned version of `multilingual-e5-small`, run by Candle on the CPU. It is loaded into memory only when a knowledge base is first used, and the model is not downloaded again.
- The MCP tool `coze_list` returns the currently published content and its input schemas, `coze_call` calls that content, and `coze_resume` answers a paused Chatflow. Drafts and disabled content cannot be called. Tool names are stable, so newly published content does not require restarting the conversation.
- JavaScript has no host capabilities such as file access, network access or module loading, and it runs with memory, stack, time and output limits. External access goes through a separate HTTPS node and does not carry the local proxy credentials.

## Development and verification

### Using it from Codex GUI

1. Open Coze from the left sidebar, then create and publish the workflows, agents, knowledge bases or tools you need.
2. Go back to Codex GUI, type `#` or `#name` in the input box and select the published content from the pop-up list.
3. Describe the task and the input, then send. For example, select `#Stock lookup` and type "Look up the stock of product A".

The selection is kept as a reference in messages, the queue and edited drafts. The model uses the already registered `remoteai_coze` MCP server to look up the input requirements and call the resource; if names are duplicated, the ID of the selected item still decides. Typing `#` only starts a component that is already installed and never triggers an automatic download; the first installation still has to be downloaded on demand from the Coze entry.

### Making it available to other apps and computers

Open the resource's **Settings → External access**, choose **Apps on this computer only** or **Allow other computers**, turn on the service and create a dedicated access key. Each key authorizes only one published resource, can be valid for 1–365 days and can be revoked at any time. The key is shown only once; the settings provide a copyable MCP configuration and API examples.

- **MCP**: use the Streamable HTTP URL `http://<computer address>:15461/mcp` and set the request header `Authorization: Bearer <access key>`. `coze_list`, `coze_call` and `coze_resume` are supported. Protocol negotiation supports 2025-03-26, 2025-06-18 and 2025-11-25; the legacy standalone SSE endpoint is not provided.
- **API**: send a POST request with a JSON body to `http://<computer address>:15461/api/run`, using the same authorization header. Workflows and tools take `{ "input": { ... } }`, agents take `{ "message": "..." }` and knowledge bases take `{ "query": "..." }`; the key determines the resource automatically. To continue a chat, pass the returned `conversationId` as `conversation_id`.
- **Chatflow resume**: send `{ "run_id": "...", "interaction_id": "...", "input": { ... } }` to `/api/resume`. Only runs created with the same key can be resumed.
- On this computer, use `127.0.0.1`. Other computers use a LAN or VPN address at which this computer is reachable; allow the selected port through the firewall if needed. Access across the internet goes through a VPN or an HTTPS gateway; no public tunnel is created automatically. This interface is meant for servers and desktop clients; browsers are not allowed to call it directly across origins.
- The connection scope and port are shared settings for this computer, and turning them off pauses all external access. Remote AI and Coze must keep running; the next time Coze starts, it restores the listening settings. If the port is already in use, turn external access on again from the settings. Network settings are separate from content backups, so restoring content never opens a network port as a side effect.
- The editor's startup credential is separate from the external access keys; an external key cannot access the management API, drafts or the run records of other keys. After the content is unpublished, its existing keys can no longer run it; knowledge base documents and table records keep updating under the existing publishing rules.

### Verification commands

Run from the repository root:

```powershell
cargo test --manifest-path apps/coze/Cargo.toml
cargo clippy --manifest-path apps/coze/Cargo.toml --all-targets -- -D warnings
node node_modules/typescript/bin/tsc -p apps/coze/ui/tsconfig.json
node node_modules/vite/bin/vite.js build --config apps/coze/ui/vite.config.ts
npm run test -w @codex-switch/coze
npx playwright install chromium
npm run test:e2e -w @codex-switch/coze
node scripts/prepare-coze-model.mjs
cargo test --manifest-path apps/coze/Cargo.toml --test local_embedding -- --ignored
$env:RUSTFLAGS = "-C target-feature=+crt-static"
cargo build --bins --manifest-path apps/coze/Cargo.toml
node scripts/package-coze.mjs apps/coze/target/debug/remoteai-coze.exe .codex-tmp/coze-package
node scripts/verify-windows-runtime.mjs .codex-tmp/coze-package/remoteai-coze.exe
node scripts/verify-windows-runtime.mjs .codex-tmp/coze-package/remoteai-coze-python.exe
node scripts/smoke-coze.mjs .codex-tmp/coze-package/remoteai-coze.exe
```

Rust 1.96 or newer is required. `package-coze.mjs` requires a new output directory and verifies both the main program and the Python node program. On macOS and Linux, drop `.exe`. The smoke test uses temporary data and a test model proxy and does not modify the user's knowledge bases or real model configuration; local embedding inference uses the real weights.

Windows builds use the static C runtime, and the DLL imports of both programs are checked so that users do not need to install the Visual C++ runtime separately.
On other platforms, do not set the `RUSTFLAGS` above and do not run the Windows DLL check.

`scripts/smoke-coze-live.mjs` can connect to the real model proxy started by the desktop app. It verifies streaming output, cancellation, Q&A with citations, tool calls and history, SQL, code nodes, images and scanned PDFs.
It also tests a full database restore, so it must use an empty, dedicated acceptance workspace. Pass `runtime.json`, the model ID, the report path, a test image and a scanned PDF;
both image files must contain `Verification code: VX-84620`. The report records only the test results, never the runtime credentials.

## Standalone release

`.github/workflows/coze-runtime.yml` builds standalone ZIP packages for Windows x64/ARM64, macOS x64/ARM64 and Linux x64. Each contains both Rust programs, the React editor, the knowledge base model and the license texts. The release tag comes from `runtime.json` and is currently `coze-v0.2.1`. The release is never marked as Remote AI's latest release, and the main app's `v*` tag rule does not trigger it again.

The main release workflow calls this workflow, and it can also be run manually on its own. The package is signed with the existing `TAURI_SIGNING_PRIVATE_KEY`, and the desktop app verifies it with its built-in public key before extracting it. Published versions cannot be overwritten: any change to a published runtime package requires updating the Cargo version and `runtime.json` together. The downloader pins a compatible version, so any change to the runtime protocol requires a matching desktop update.

A successful local build does not mean that all five platforms or the signed GitHub release have passed. Production downloads require the corresponding CI jobs to publish successfully; do not treat a release that does not exist yet as live.
