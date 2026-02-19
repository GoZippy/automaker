/**
 * Shared diff parsing utilities.
 *
 * Extracted from commit-worktree-dialog, discard-worktree-changes-dialog,
 * stash-changes-dialog and git-diff-panel to eliminate duplication.
 */

export interface ParsedDiffHunk {
  header: string;
  lines: {
    type: 'context' | 'addition' | 'deletion' | 'header';
    content: string;
    lineNumber?: { old?: number; new?: number };
  }[];
}

export interface ParsedFileDiff {
  filePath: string;
  hunks: ParsedDiffHunk[];
  isNew?: boolean;
  isDeleted?: boolean;
  isRenamed?: boolean;
  /** Pre-computed count of added lines across all hunks */
  additions: number;
  /** Pre-computed count of deleted lines across all hunks */
  deletions: number;
}

/**
 * Parse unified diff format into structured data.
 *
 * Note: The regex `diff --git a\/(.*?) b\/(.*)` uses a non-greedy match for
 * the `a/` path and a greedy match for `b/`. This can mis-handle paths that
 * literally contain " b/" or are quoted by git. In practice this covers the
 * vast majority of real-world paths; exotic cases will fall back to "unknown".
 */
export function parseDiff(diffText: string): ParsedFileDiff[] {
  if (!diffText) return [];

  const files: ParsedFileDiff[] = [];
  const lines = diffText.split('\n');
  let currentFile: ParsedFileDiff | null = null;
  let currentHunk: ParsedDiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git')) {
      if (currentFile) {
        if (currentHunk) currentFile.hunks.push(currentHunk);
        files.push(currentFile);
      }
      const match = line.match(/diff --git a\/(.*?) b\/(.*)/);
      currentFile = {
        filePath: match ? match[2] : 'unknown',
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      currentHunk = null;
      continue;
    }

    if (line.startsWith('new file mode')) {
      if (currentFile) currentFile.isNew = true;
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      if (currentFile) currentFile.isDeleted = true;
      continue;
    }
    if (line.startsWith('rename from') || line.startsWith('rename to')) {
      if (currentFile) currentFile.isRenamed = true;
      continue;
    }
    if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue;
    }

    if (line.startsWith('@@')) {
      if (currentHunk && currentFile) currentFile.hunks.push(currentHunk);
      const hunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldLineNum = hunkMatch ? parseInt(hunkMatch[1], 10) : 1;
      newLineNum = hunkMatch ? parseInt(hunkMatch[2], 10) : 1;
      currentHunk = {
        header: line,
        lines: [{ type: 'header', content: line }],
      };
      continue;
    }

    if (currentHunk) {
      // Skip trailing empty line produced by split('\n') to avoid phantom context line
      if (line === '' && i === lines.length - 1) {
        continue;
      }
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'addition',
          content: line.substring(1),
          lineNumber: { new: newLineNum },
        });
        newLineNum++;
        if (currentFile) currentFile.additions++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'deletion',
          content: line.substring(1),
          lineNumber: { old: oldLineNum },
        });
        oldLineNum++;
        if (currentFile) currentFile.deletions++;
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push({
          type: 'context',
          content: line.substring(1) || '',
          lineNumber: { old: oldLineNum, new: newLineNum },
        });
        oldLineNum++;
        newLineNum++;
      }
    }
  }

  if (currentFile) {
    if (currentHunk) currentFile.hunks.push(currentHunk);
    files.push(currentFile);
  }

  return files;
}
