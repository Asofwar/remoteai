# Desktop image draft regression

Verified on 2026-09-15 in the local Hyper-V Windows 11 VM `win11`.

## Cause and fix

`ImageAttachments` and `ComposerReferences` were siblings with the same React key.
Changing conversations could leave the old image DOM behind without a corresponding
draft entry. Returning to the new conversation rendered a second copy; removing or
sending the draft could not clear the orphaned preview.

Give each sibling its own key prefix while retaining the conversation-specific reset.
The regression tests render the complete composer and exercise clipboard paste,
conversation switching, removal, and a successful send that selects a conversation.
Both scenarios failed on the original implementation and pass with the fix.

## VM verification

- Original installed app: paste one bitmap, select an existing conversation, return to
  new conversation. Two previews appear; deletion leaves one unresponsive preview.
- Fixed app: the same navigation restores exactly one image; removal clears it completely.
- Paste again and send a real image plus a short test message. The model replies
  `IMAGE-OK`; one image appears in the sent message and the composer is empty.
- Return to new conversation after sending: the composer remains empty.
- The VM retains the fixed executable and a backup of its previous executable.

Test executable SHA256:
`3F673F3D5483815677FB33A827A3998F9F20205D3E7FBE8973DB2D1912B607BF`.

Local screenshots: `.codex-tmp/image-draft-vm/before-duplicate.png`, `after-switch.png`,
`after-send.png`, and `after-send-new.png` in that directory.

## Automated checks

- Desktop tests: 923 Vitest cases and 8 schema cases passed.
- `npm run check`: all workspace builds, Rust formatting, Rust tests and installer checks passed.
- `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings`: passed.
- `node scripts/build-desktop-app.mjs --no-bundle`: Windows release executable built successfully.

UI verification covers Windows bitmap clipboard input. Other platforms and clipboard
file-drop formats were not part of this VM run.
