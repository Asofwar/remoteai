const DOWNLOADS_START = '<!-- codex-switch-downloads:start -->';
const DOWNLOADS_END = '<!-- codex-switch-downloads:end -->';
const UPDATE_HEADING = /^##[ \t]+更新内容[ \t]*(?:\n|$)/;
const LEGACY_INTRO = 'Windows, macOS, Linux, Android, and iOS build artifacts are attached below.';

/** Remove the release page's installer catalogue before displaying the actual changes. */
export function extractReleaseNotes(body: string): string {
  let notes = body.replace(/\r\n?/g, '\n');
  let start = notes.indexOf(DOWNLOADS_START);
  while (start !== -1) {
    const end = notes.indexOf(DOWNLOADS_END, start + DOWNLOADS_START.length);
    if (end !== -1) {
      notes = notes.slice(0, start) + notes.slice(end + DOWNLOADS_END.length);
    } else {
      // A partially published download block must not hide the changes that follow it.
      const remaining = notes.slice(start + DOWNLOADS_START.length);
      const heading = remaining.search(/^##[ \t]+更新内容[ \t]*$/m);
      notes = notes.slice(0, start) + (heading === -1 ? '' : remaining.slice(heading));
    }
    start = notes.indexOf(DOWNLOADS_START);
  }
  notes = notes.trim().replace(UPDATE_HEADING, '').trim();
  if (notes === LEGACY_INTRO || notes.startsWith(`${LEGACY_INTRO}\n`)) {
    notes = notes.slice(LEGACY_INTRO.length).trim();
  }
  return notes;
}
