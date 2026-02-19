/**
 * RebaseService - Rebase git operations without HTTP
 *
 * Handles git rebase operations with conflict detection and reporting.
 * Follows the same pattern as merge-service.ts and cherry-pick-service.ts.
 */

import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '@automaker/utils';
import { getConflictFiles } from '@automaker/git-utils';
import { execGitCommand, getCurrentBranch } from '../lib/git.js';

const logger = createLogger('RebaseService');

// ============================================================================
// Types
// ============================================================================

export interface RebaseResult {
  success: boolean;
  error?: string;
  hasConflicts?: boolean;
  conflictFiles?: string[];
  aborted?: boolean;
  branch?: string;
  ontoBranch?: string;
  message?: string;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Run a git rebase operation on the given worktree.
 *
 * @param worktreePath - Path to the git worktree
 * @param ontoBranch - The branch to rebase onto (e.g., 'origin/main')
 * @returns RebaseResult with success/failure information
 */
export async function runRebase(worktreePath: string, ontoBranch: string): Promise<RebaseResult> {
  // Reject branch names that start with a dash to prevent them from being
  // misinterpreted as git options.
  if (ontoBranch.startsWith('-')) {
    return {
      success: false,
      error: `Invalid branch name: "${ontoBranch}" must not start with a dash.`,
    };
  }

  // Get current branch name before rebase
  const currentBranch = await getCurrentBranch(worktreePath);

  try {
    // Pass ontoBranch after '--' so git treats it as a ref, not an option.
    // Set LC_ALL=C so git always emits English output regardless of the system
    // locale, making text-based conflict detection reliable.
    await execGitCommand(['rebase', '--', ontoBranch], worktreePath, { LC_ALL: 'C' });

    return {
      success: true,
      branch: currentBranch,
      ontoBranch,
      message: `Successfully rebased ${currentBranch} onto ${ontoBranch}`,
    };
  } catch (rebaseError: unknown) {
    // Check if this is a rebase conflict.  We use a multi-layer strategy so
    // that detection is reliable even when locale settings vary or git's text
    // output changes across versions:
    //
    //  1. Primary (text-based): scan the error output for well-known English
    //     conflict markers.  Because we pass LC_ALL=C above these strings are
    //     always in English, but we keep the check as one layer among several.
    //
    //  2. Repository-state check: run `git rev-parse --git-dir` to find the
    //     actual .git directory, then verify whether the in-progress rebase
    //     state directories (.git/rebase-merge or .git/rebase-apply) exist.
    //     These are created by git at the start of a rebase and are the most
    //     reliable indicator that a rebase is still in progress (i.e. stopped
    //     due to conflicts).
    //
    //  3. Unmerged-path check: run `git status --porcelain` (machine-readable,
    //     locale-independent) and look for lines whose first two characters
    //     indicate an unmerged state (UU, AA, DD, AU, UA, DU, UD).
    //
    // hasConflicts is true when ANY of the three layers returns positive.
    const err = rebaseError as { stdout?: string; stderr?: string; message?: string };
    const output = `${err.stdout || ''} ${err.stderr || ''} ${err.message || ''}`;

    // Layer 1 – text matching (locale-safe because we set LC_ALL=C above).
    const textIndicatesConflict =
      output.includes('CONFLICT') ||
      output.includes('could not apply') ||
      output.includes('Resolve all conflicts') ||
      output.includes('fix conflicts');

    // Layers 2 & 3 – repository state inspection (locale-independent).
    let rebaseStateExists = false;
    let hasUnmergedPaths = false;
    try {
      // Find the canonical .git directory for this worktree.
      const gitDir = (await execGitCommand(['rev-parse', '--git-dir'], worktreePath)).trim();
      // git rev-parse --git-dir returns a path relative to cwd when the repo is
      // a worktree, so we resolve it against worktreePath.
      const resolvedGitDir = path.resolve(worktreePath, gitDir);

      // Layer 2: check for rebase state directories.
      const rebaseMergeDir = path.join(resolvedGitDir, 'rebase-merge');
      const rebaseApplyDir = path.join(resolvedGitDir, 'rebase-apply');
      const [rebaseMergeExists, rebaseApplyExists] = await Promise.all([
        fs
          .access(rebaseMergeDir)
          .then(() => true)
          .catch(() => false),
        fs
          .access(rebaseApplyDir)
          .then(() => true)
          .catch(() => false),
      ]);
      rebaseStateExists = rebaseMergeExists || rebaseApplyExists;
    } catch {
      // If rev-parse fails the repo may be in an unexpected state; fall back to
      // text-based detection only.
    }

    try {
      // Layer 3: check for unmerged paths via machine-readable git status.
      const statusOutput = await execGitCommand(['status', '--porcelain'], worktreePath, {
        LC_ALL: 'C',
      });
      // Unmerged status codes occupy the first two characters of each line.
      // Standard unmerged codes: UU, AA, DD, AU, UA, DU, UD.
      hasUnmergedPaths = statusOutput
        .split('\n')
        .some((line) => /^(UU|AA|DD|AU|UA|DU|UD)/.test(line));
    } catch {
      // git status failing is itself a sign something is wrong; leave
      // hasUnmergedPaths as false and rely on the other layers.
    }

    const hasConflicts = textIndicatesConflict || rebaseStateExists || hasUnmergedPaths;

    if (hasConflicts) {
      // Get list of conflicted files
      const conflictFiles = await getConflictFiles(worktreePath);

      // Abort the rebase to leave the repo in a clean state
      const aborted = await abortRebase(worktreePath);

      if (!aborted) {
        logger.error('Failed to abort rebase after conflict; repository may be in a dirty state', {
          worktreePath,
        });
      }

      return {
        success: false,
        error: aborted
          ? `Rebase of "${currentBranch}" onto "${ontoBranch}" aborted due to conflicts; no changes were applied.`
          : `Rebase of "${currentBranch}" onto "${ontoBranch}" failed due to conflicts and the abort also failed; repository may be in a dirty state.`,
        hasConflicts: true,
        conflictFiles,
        aborted,
        branch: currentBranch,
        ontoBranch,
      };
    }

    // Non-conflict error - propagate
    throw rebaseError;
  }
}

/**
 * Abort an in-progress rebase operation.
 *
 * @param worktreePath - Path to the git worktree
 * @returns true if abort succeeded, false if it failed (logged as warning)
 */
export async function abortRebase(worktreePath: string): Promise<boolean> {
  try {
    await execGitCommand(['rebase', '--abort'], worktreePath);
    return true;
  } catch (err) {
    logger.warn('Failed to abort rebase after conflict', err instanceof Error ? err.message : err);
    return false;
  }
}
