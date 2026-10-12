# Remote AI help assistant

Every page in the desktop sidebar, including the desktop-hosted web UI, has the same lower-right
help entry. The supplied robot image is bundled locally. Opening, minimizing or changing pages
preserves the current help conversation in memory. The panel starts a fresh conversation after an
application restart; it does not create or restore a regular Codex conversation.

Right-click the launcher and choose **Hide assistant**, or toggle **Settings → Appearance → Help assistant →
Show assistant button**. The preference is saved locally for this desktop/browser and defaults to visible.
Hiding closes the panel without clearing the current conversation, draft, attachments or pending answer.
Turning it back on restores the launcher; click it to continue. The context menu also supports Shift+F10.

The assistant requires the GUI-managed Codex installation, a live initialized GUI connection and
an account selected in Codex. **Install now** downloads and installs Codex directly inside the assistant,
shows progress and enables it without switching pages. An existing installation has an **Enable assistant**
action instead. Both reuse the normal installation/connection commands and preserve any live GUI connection.
Installation and initialization happen only after a click; opening the assistant does not start either.
The user still chooses their account in Codex using **Choose account**. Each question rechecks prerequisites.

## Composer and administration

The empty composer is a single line, with the send button inside its right edge. Any text or attached
image expands it to multiple lines, with send at the bottom right. There is no explanatory footer.
Users can select or paste up to four PNG, JPEG, WebP or GIF images (5 MiB each). Attachments have previews
and removal controls, can be sent without text, and are restored after failure. Reading images blocks
submission. Recent images are included in follow-up questions, bounded to 20 MiB across a request and
the in-memory conversation. The backend rejects remote URLs, filesystem paths and invalid images.

In **Admin → Official models → Help assistant**, choose a model from the saved visible official model
catalog, set the reasoning effort, edit the system instructions, and maintain the suggested questions.
Questions support Chinese and English text, with a fallback to the filled language. Add up to 12 questions,
with 200 characters per language; at least one language must be filled. Removing all entries hides suggestions.
Opening the assistant reloads this list. Clicking a suggestion immediately sends it, with the same duplicate
submission and attachment guards as the composer. Existing settings retain the original three suggestions;
older admin clients that omit the field preserve the saved list. These fields save atomically with
revision checks and an audit entry; official-account read/manage permissions govern access. Settings use
the `help-assistant` row in the existing `chat_settings` table, so no schema migration is needed and normal
chat policy is untouched.
The desktop fetches `/help-assistant/settings` without credentials for every question. The prompt is
public application configuration: do not include secrets. Basic evidence/privacy safeguards remain in
force alongside the configured instructions.

Reasoning effort supports `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` and `ultra`;
choose a level supported by the selected model. Higher effort usually takes longer. Existing settings
without an effort default to `low`. Updated clients apply the saved effort to the next question,
independently of the regular Codex conversation settings; older clients continue to use `low`.

Deploy the updated admin-go and admin-ui, then save a model and prompt before using the updated assistant.
Missing or unavailable configuration is an error; there is no fallback to the GUI model or a hard-coded
model. Provider requests must support the exact configured model, and their normal default cannot replace
it. Unsupported-model responses are reported without retrying another model or account. Official API
providers use their upstream model validation; other providers are checked against their saved model list.

## Evidence and privacy

- Repository documentation and a small set of relevant source files are embedded at build time.
  Bounded keyword retrieval supports Chinese and English and refreshes with each application build.
  This works in packaged installations without a checkout or repository network access.
- Each question reads a fresh allowlisted configuration summary: platform/version, assistant model,
  GUI routing policy, plus saved account-manager proxy, LAN, prompt and image-routing switches.
  Saved configuration is not presented as a live connectivity diagnosis.
- API keys, tokens, account identifiers, custom prompt contents, local paths, logs and other
  conversation histories are not part of the evidence snapshot. Users should not paste secrets.
- Questions, user-attached images, recent help messages, relevant excerpts and the summary go through the selected GUI
  account and consume its normal allowance. Computer-use screenshots and tool results also go through this account.
- Requests follow the existing local proxy conversation-history and token-usage recording behavior,
  with the label **Remote AI 问题解答**. Clearing the panel does not delete those local records.
- Help requests bypass automatic account switching and custom GUI prompt rewriting. A selection
  revision guards dispatch; changing accounts cancels the running help task and discards its answer.
  Help does not automatically switch accounts.
- Replies show the supplied reference paths. These are evidence supplied to the model, not proof that
  every reference was cited. Missing evidence should result in a limitation or a clarifying question.

The independent mobile apps and cloud web console do not host this desktop-sidebar widget. Their
remote-chat behavior is unchanged.

## Computer Use

The assistant reuses the GUI home's installed and enabled Computer Use driver, including its standard
permission policy. Each help request owns a separate `mcp --direct` process, so it does not use another
Codex conversation's native session. Missing or disabled installations leave ordinary questions available;
the assistant can explain how to enable the plugin. No extra plugin installation occurs when asking a question.

Only a fixed desktop-tool allowlist is exposed, using the installed driver's actual input schemas.
It covers application/window discovery, screenshots, accessibility inspection and interface interaction.
Shell execution, browser scripts, arbitrary file access and permission escalation are not exposed.
The model selects tools when asked to inspect or operate Remote AI, verifies results, and treats visible
content as untrusted. Screenshots remain in the tool conversation; only the most recent results keep images.

The panel displays desktop activity and replaces Send with **Stop** while a request is running.
Stopping, unmounting, an account change, a timeout or plugin revocation terminates the help runtime.
Minimizing preserves the request. Calls run asynchronously and serially, with a 24-action budget,
60-second tool timeout and ten-minute total limit. The GUI's normal conversation and polling remain independent.

## Validation

Rust tests cover input bounds, credential exclusion, retrieval, request isolation, stream validation
and the loopback transport, including function-call continuations, reasoning items, screenshots and tool limits.
Frontend tests cover prerequisite guidance, conversation persistence, editable suggestions and cancellation,
duplicate submission prevention, failure recovery and safe Markdown rendering. Build with the normal
desktop TypeScript/Vite pipeline; run Rust formatting, tests and Clippy before release.
Visibility tests cover saved preferences, settings/menu synchronization, keyboard access, storage errors
and preserving drafts and pending answers while hidden.

From `apps/desktop`, run `npm run test:chat:e2e -- help-assistant.pw.ts` for the browser regression.
It checks all sidebar entries, responsive interaction during a pending answer and session polling,
prerequisite guidance, narrow-screen layout and light/dark text contrast. The test uses mocked model
responses and does not charge a real account.

Run `help-assistant-settings.pw.ts` for admin question persistence and narrow-layout checks. PostgreSQL
integration tests use an isolated database via `HELP_SETTINGS_TEST_DSN`. The ignored Rust test
`managed_installation_connects_and_lists_applications` can verify the real managed driver without changing
any application: set `CSW_HELP_COMPUTER_TEST_HOME` to the GUI home and run that test with `--ignored`.
