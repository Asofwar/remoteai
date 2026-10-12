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
catalog, set the reasoning effort, and edit the system instructions. These fields save atomically with
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
  account and consume its normal allowance. There are no tools or filesystem actions in the model request.
- Requests follow the existing local proxy conversation-history and token-usage recording behavior,
  with the label **Remote AI 问题解答**. Clearing the panel does not delete those local records.
- Help requests bypass automatic account switching and custom GUI prompt rewriting. A selection
  revision guards dispatch; changed-account answers are discarded. Help never modifies GUI selection.
- Replies show the supplied reference paths. These are evidence supplied to the model, not proof that
  every reference was cited. Missing evidence should result in a limitation or a clarifying question.

The independent mobile apps and cloud web console do not host this desktop-sidebar widget. Their
remote-chat behavior is unchanged.

## Validation

Rust tests cover input bounds, credential exclusion, retrieval, request isolation, stream validation
and the loopback transport. Frontend tests cover prerequisite guidance, conversation persistence,
duplicate submission prevention, failure recovery and safe Markdown rendering. Build with the normal
desktop TypeScript/Vite pipeline; run Rust formatting, tests and Clippy before release.
Visibility tests cover saved preferences, settings/menu synchronization, keyboard access, storage errors
and preserving drafts and pending answers while hidden.

From `apps/desktop`, run `npm run test:chat:e2e -- help-assistant.pw.ts` for the browser regression.
It checks all sidebar entries, responsive interaction during a pending answer and session polling,
prerequisite guidance, narrow-screen layout and light/dark text contrast. The test uses mocked model
responses and does not charge a real account.
