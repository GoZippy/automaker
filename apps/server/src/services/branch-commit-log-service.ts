/**
 * Service for fetching branch commit log data.
 *
 * Extracts the heavy Git command execution and parsing logic from the
 * branch-commit-log route handler so the handler only validates input,
 * invokes this service, streams lifecycle events, and sends the response.
 */

import { execGitCommand } from '../routes/worktree/common.js';

// ============================================================================
// Types
// ============================================================================

export interface BranchCommit {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: string;
  subject: string;
  body: string;
  files: string[];
}

export interface BranchCommitLogResult {
  branch: string;
  commits: BranchCommit[];
  total: number;
}

// ============================================================================
// Service
// ============================================================================

/**
 * Fetch the commit log for a specific branch (or HEAD).
 *
 * Runs `git log`, `git diff-tree`, and `git rev-parse` inside
 * the given worktree path and returns a structured result.
 *
 * @param worktreePath - Absolute path to the worktree / repository
 * @param branchName   - Branch to query (omit or pass undefined for HEAD)
 * @param limit        - Maximum number of commits to return (clamped 1-100)
 */
export async function getBranchCommitLog(
  worktreePath: string,
  branchName: string | undefined,
  limit: number
): Promise<BranchCommitLogResult> {
  // Clamp limit to a reasonable range
  const parsedLimit = Number(limit);
  const commitLimit = Math.min(Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 20), 100);

  // Use the specified branch or default to HEAD
  const targetRef = branchName || 'HEAD';

  // Get detailed commit log for the specified branch
  const logOutput = await execGitCommand(
    [
      'log',
      targetRef,
      `--max-count=${commitLimit}`,
      '--format=%H%n%h%n%an%n%ae%n%aI%n%s%n%b%n---END---',
    ],
    worktreePath
  );

  // Parse the output into structured commit objects
  const commits: BranchCommit[] = [];

  const commitBlocks = logOutput.split('---END---\n').filter((block) => block.trim());

  for (const block of commitBlocks) {
    const lines = block.split('\n');
    if (lines.length >= 6) {
      const hash = lines[0].trim();

      // Get list of files changed in this commit
      let files: string[] = [];
      try {
        const filesOutput = await execGitCommand(
          ['diff-tree', '--no-commit-id', '--name-only', '-r', hash],
          worktreePath
        );
        files = filesOutput
          .trim()
          .split('\n')
          .filter((f) => f.trim());
      } catch {
        // Ignore errors getting file list
      }

      commits.push({
        hash,
        shortHash: lines[1].trim(),
        author: lines[2].trim(),
        authorEmail: lines[3].trim(),
        date: lines[4].trim(),
        subject: lines[5].trim(),
        body: lines.slice(6).join('\n').trim(),
        files,
      });
    }
  }

  // If branchName wasn't specified, get current branch for display
  let displayBranch = branchName;
  if (!displayBranch) {
    const branchOutput = await execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
    displayBranch = branchOutput.trim();
  }

  return {
    branch: displayBranch,
    commits,
    total: commits.length,
  };
}
