/**
 * Line-based three-way merge.
 *
 * The previous implementation compared lines BY INDEX (`b[i]`, `l[i]`, `r[i]`),
 * which mis-merges every non-trivial case: as soon as one side inserts a line,
 * every following index shifts and lines that never changed are reported as
 * conflicting (or, worse, spliced from the wrong side). This version diffs the
 * base against each side (LCS), converts the diffs into edit regions and only
 * reports a conflict when the SAME base region was edited differently.
 *
 * Output is plain text on success, or `null` when the edits overlap.
 */

type Side = 'local' | 'remote';

interface Hunk {
  /** Base line range [start, end) that this hunk replaces. */
  start: number;
  end: number;
  /** Replacement lines. */
  lines: string[];
  side: Side;
}

/** LCS-based diff of base → other, expressed as hunks over base indices. */
export function diffHunks(base: string[], other: string[], side: Side): Hunk[] {
  const n = base.length;
  const m = other.length;
  // Guard: an O(n*m) table on pathological files (10k+ lines each) is a
  // multi-second freeze inside Obsidian's main thread. Skip auto-merge there.
  if (n * m > 4_000_000) return [];
  // Standard LCS length table, computed bottom-up in a flat array.
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    const row = i * width;
    const nextRow = (i + 1) * width;
    for (let j = m - 1; j >= 0; j--) {
      lcs[row + j] = base[i] === other[j]
        ? lcs[nextRow + j + 1] + 1
        : Math.max(lcs[nextRow + j], lcs[row + j + 1]);
    }
  }
  // Walk forward emitting matches and collecting runs of non-matching lines.
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  let pending: Hunk | null = null;
  while (i < n && j < m) {
    if (base[i] === other[j]) {
      if (pending) { hunks.push(pending); pending = null; }
      i++; j++;
      continue;
    }
    if (!pending) pending = { start: i, end: i, lines: [], side };
    if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) { pending.end = ++i; }
    else { pending.lines.push(other[j]); j++; }
  }
  if (pending) {
    // Trailing deletions in base (edges) belong to this hunk too.
    while (i < n) { pending.end = ++i; }
    hunks.push(pending);
    pending = null;
  }
  if (j < m) {
    // Trailing insertions at EOF.
    const h: Hunk = { start: n, end: n, lines: other.slice(j), side };
    hunks.push(h);
  }
  return hunks;
}

function overlaps(a: Hunk, b: Hunk): boolean {
  // Zero-width ranges (pure insertions) overlap when they sit at the same
  // anchor point, which is the classic "both added a line here" case.
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  if (a.start === a.end) return b.start < a.start && a.start < b.end;
  if (b.start === b.end) return a.start < b.start && b.start < a.end;
  return a.start < b.end && b.start < a.end;
}

/**
 * Merge `local` and `remote` against `base`.
 * Returns merged text, or null when both sides changed the same region.
 */
export function merge3(base: string, local: string, remote: string): string | null {
  if (local === remote) return local;
  if (local === base) return remote;
  if (remote === base) return local;

  const baseLines = base.split('\n');
  const localHunks = diffHunks(baseLines, local.split('\n'), 'local');
  const remoteHunks = diffHunks(baseLines, remote.split('\n'), 'remote');

  // Identical replacements on both sides are not a conflict.
  const conflicts = localHunks.some(lh => remoteHunks.some(rh =>
    overlaps(lh, rh) && lh.lines.join('\n') !== rh.lines.join('\n')));
  if (conflicts) return null;

  // Apply every hunk to the base, ordered by start index. Because conflicting
  // hunks were rejected above, the remaining ones are disjoint (or identical).
  const all = [...localHunks, ...remoteHunks].sort((x, y) => x.start - y.start || x.end - y.end);
  const out: string[] = [];
  let cursor = 0;
  for (const h of all) {
    if (h.start < cursor) continue; // duplicate/overlapping-identical hunk
    out.push(...baseLines.slice(cursor, h.start));
    out.push(...h.lines);
    cursor = Math.max(cursor, h.end);
  }
  out.push(...baseLines.slice(cursor));
  return out.join('\n');
}
