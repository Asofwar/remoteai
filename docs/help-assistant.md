# Remote AI help assistant

Every page in the desktop sidebar, including the desktop-hosted web UI, has the same lower-right
help entry. The supplied robot image is bundled locally. Opening, minimizing or changing pages
preserves the current help conversation in memory. The panel starts a fresh conversation after an
application restart; it does not create or restore a regular Codex conversation.

The assistant requires the GUI-managed Codex installation, a live initialized GUI connection and
an account selected in Codex. **Install now** downloads and installs Codex directly inside the assistant,
shows progress and enables it without switching pages. An existing installation has an **Enable assistant**
action instead. Both reuse the normal installation/connection commands and preserve any live GUI connection.
Installation and initialization happen only after a click; opening the assistant does not start either.
The user still chooses their account in Codex using **Choose account**. Each question rechecks prerequisites.

## Evidence and privacy

- Repository documentation and a small set of relevant source files are embedded at build time.
  Bounded keyword retrieval supports Chinese and English and refreshes with each application build.
  This works in packaged installations without a checkout or repository network access.
- Each question reads a fresh allowlisted configuration summary: platform/version, GUI model and
  routing policy, plus saved account-manager proxy, LAN, prompt and image-routing switches.
  Saved configuration is not presented as a live connectivity diagnosis.
- API keys, tokens, account identifiers, custom prompt contents, local paths, logs and other
  conversation histories are not part of the evidence snapshot. Users should not paste secrets.
- Questions, recent help messages, relevant excerpts and the summary go through the selected GUI
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

From `apps/desktop`, run `npm run test:chat:e2e -- help-assistant.pw.ts` for the browser regression.
It checks all sidebar entries, responsive interaction during a pending answer and session polling,
prerequisite guidance, narrow-screen layout and light/dark text contrast. The test uses mocked model
responses and does not charge a real account.
