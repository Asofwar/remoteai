# Preserve paginated history during provider transitions

Codex paginated history refers to rollout bytes. A child can store a
`history_base.end_byte_offset` in its own metadata, while SQLite projections
also depend on offsets in the source rollout.

Previously, both proxy provider synchronization and conversation visibility
repair reserialized the first record to change `payload.model_provider`.
For example, replacing `codex-switch-local` with `openai` removes 12 bytes
even when no other serialization changes occur. A child cutoff at the
original EOF then exceeds the parent file's new length. Codex rejects the
lineage with `cutoff byte offset is past the source rollout`. Cutoffs away
from EOF and existing projections can also point at the wrong bytes.

Provider transitions now use one shared metadata updater. It leaves the
entire file unchanged when the metadata declares a non-legacy history mode,
a history base, or an ordinal-based fork boundary. Unknown non-null modes
are protected as well. This applies to plain and zstd rollouts. The callers
continue to update database and desktop catalog routing. Visibility
previews exclude protected files from their rewritten-file count.

Legacy provider changes retain the previous behavior: update metadata while
copying the remaining bytes unchanged. Unknown metadata fields are retained,
and staged replacement occurs after the original reader is closed on Windows.

## Synthetic reproduction

With Node 22.13 or newer and a Codex executable that supports paginated history:

```text
node scripts/repro-paginated-provider-rewrite.mjs /path/to/codex
```

The script uses a newly generated temporary `CODEX_HOME`, fake thread IDs,
synthetic history, and a loopback fixture provider with no credentials.
It never sends a turn or invokes a model. It checks:

1. The original parent and child can be read.
2. A provider-only rewrite makes the parent 12 bytes shorter and reproduces
   the exact lineage error.
3. Restoring the original bytes restores readability.
4. Setting the state database provider makes `thread/resume` select that
   provider with the original rollout header intact.

An optional second executable argument can exercise a compiled production
updater. That helper must accept `<rollout path> <target provider>`. The
script checks that the parent remains byte-identical and readable.

The Rust regression tests also exercise the real proxy restore/sync entry
points with a database, parent rollout, and child cutoff, including zstd
history and the existing rollback behavior.

## Compatibility and recovery limits

This change prevents provider updates from corrupting byte-addressed
history. It does not repair already-rewritten files or claim that every
history-loading failure has the same origin. Simply clearing SQLite caches
cannot repair an incorrect cutoff embedded in a child rollout.

Routing relies on the updated state database. Keep the existing provider
compatibility aliases when rebuilding state from immutable historical
headers. Resume/provider selection was verified with Codex 0.163.0 and
0.163.0-alpha.10.2; future changes to Codex routing need revalidation.

Existing damaged history needs separately backed-up recovery and validation.
Never clamp a cutoff to EOF or remove `history_base` to hide the error:
either action can silently remove inherited history. Never attach real
rollouts, databases, account configuration, or unredacted logs to a bug report.
