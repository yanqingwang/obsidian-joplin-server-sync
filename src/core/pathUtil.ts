/**
 * Filename sanitization shared by push and pull so that a pushed local
 * basename round-trips exactly when pulled back.
 *
 * We only strip characters that are illegal in a file name on the target
 * filesystem. On Linux/macOS that is `/` and `\` (and control chars).
 * Earlier code also stripped `: * ? " < > | # ^ [ ]` which are perfectly
 * valid on Linux/macOS, causing push (used the raw basename) and pull
 * (stripped them) to disagree and produce different file names — the
 * classic "can't reach full consistency" symptom.
 *
 * This keeps the plugin consistent on a single OS. Cross-OS sync (e.g. a
 * Linux vault pulled onto Windows) remains a known limitation, since the
 * two filesystems disagree on which characters are legal.
 */
export function safeFileName(name: string): string {
  const cleaned = (name || '')
    .replace(/[\/\\]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  return cleaned || 'Untitled';
}
