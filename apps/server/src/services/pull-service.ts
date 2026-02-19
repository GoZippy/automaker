/**
 * PullService - Pull git operations without HTTP
 *
 * Encapsulates the full git pull workflow including:
 * - Branch name and detached HEAD detection
 * - Fetching from remote
 * - Status parsing and local change detection
 * - Stash push/pop logic
 * - Upstream verification (rev-parse / --verify)
 * - Pull execution and conflict detection
 * - Conflict file list collection
 *
 * Extracted from the worktree pull route to improve organization
 * and testability. Follows the same pattern as rebase-service.ts
 * and cherry-pick-service.ts.
 */

import { createLogger } from '@automaker/utils';
import { execGitCommand, execGitCommandWithLockRetry } from '../lib/git.js';
import { getErrorMessage } from '../routes/worktree/common.js';

const logger = createLogger('PullService');

// ============================================================================
// Types
// ============================================================================

export interface PullOptions {
  /** Remote name to pull from (defaults to 'origin') */
  remote?: string;
  /** When true, automatically stash local changes before pulling and reapply after */
  stashIfNeeded?: boolean;
}

export interface PullResult {
  success: boolean;
  error?: string;
  branch?: string;
  pulled?: boolean;
  hasLocalChanges?: boolean;
  localChangedFiles?: string[];
  stashed?: boolean;
  stashRestored?: boolean;
  stashRecoveryFailed?: boolean;
  hasConflicts?: boolean;
  conflictSource?: 'pull' | 'stash';
  conflictFiles?: string[];
  message?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the current branch name for the worktree.
 *
 * @param worktreePath - Path to the git worktree
 * @returns The current branch name (returns 'HEAD' for detached HEAD state)
 */
export async function getCurrentBranch(worktreePath: string): Promise<string> {
  const branchOutput = await execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
  return branchOutput.trim();
}

/**
 * Fetch the latest refs from a remote.
 *
 * @param worktreePath - Path to the git worktree
 * @param remote - Remote name (e.g. 'origin')
 */
export async function fetchRemote(worktreePath: string, remote: string): Promise<void> {
  await execGitCommand(['fetch', remote], worktreePath);
}

/**
 * Parse `git status --porcelain` output into a list of changed file paths.
 *
 * @param worktreePath - Path to the git worktree
 * @returns Object with hasLocalChanges flag and list of changed file paths
 */
export async function getLocalChanges(
  worktreePath: string
): Promise<{ hasLocalChanges: boolean; localChangedFiles: string[] }> {
  const statusOutput = await execGitCommand(['status', '--porcelain'], worktreePath);
  const hasLocalChanges = statusOutput.trim().length > 0;

  let localChangedFiles: string[] = [];
  if (hasLocalChanges) {
    localChangedFiles = statusOutput
      .trim()
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => line.substring(3).trim());
  }

  return { hasLocalChanges, localChangedFiles };
}

/**
 * Stash local changes with a descriptive message.
 *
 * @param worktreePath - Path to the git worktree
 * @param branchName - Current branch name (used in stash message)
 * @returns true if stash was created
 */
export async function stashChanges(worktreePath: string, branchName: string): Promise<void> {
  const stashMessage = `automaker-pull-stash: Pre-pull stash on ${branchName}`;
  await execGitCommandWithLockRetry(
    ['stash', 'push', '--include-untracked', '-m', stashMessage],
    worktreePath
  );
}

/**
 * Pop the top stash entry.
 *
 * @param worktreePath - Path to the git worktree
 * @returns The stdout from stash pop
 */
export async function popStash(worktreePath: string): Promise<string> {
  return await execGitCommand(['stash', 'pop'], worktreePath);
}

/**
 * Try to pop the stash, returning whether the pop succeeded.
 *
 * @param worktreePath - Path to the git worktree
 * @returns true if stash pop succeeded, false if it failed
 */
async function tryPopStash(worktreePath: string): Promise<boolean> {
  try {
    await execGitCommand(['stash', 'pop'], worktreePath);
    return true;
  } catch (stashPopError) {
    // Stash pop failed - leave it in stash list for manual recovery
    logger.error('Failed to reapply stash during error recovery', {
      worktreePath,
      error: getErrorMessage(stashPopError),
    });
    return false;
  }
}

/**
 * Check whether the branch has an upstream tracking ref, or whether
 * the remote branch exists.
 *
 * @param worktreePath - Path to the git worktree
 * @param branchName - Current branch name
 * @param remote - Remote name
 * @returns true if upstream or remote branch exists
 */
export async function hasUpstreamOrRemoteBranch(
  worktreePath: string,
  branchName: string,
  remote: string
): Promise<boolean> {
  try {
    await execGitCommand(['rev-parse', '--abbrev-ref', `${branchName}@{upstream}`], worktreePath);
    return true;
  } catch {
    // No upstream tracking - check if the remote branch exists
    try {
      await execGitCommand(['rev-parse', '--verify', `${remote}/${branchName}`], worktreePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Get the list of files with unresolved merge conflicts.
 *
 * @param worktreePath - Path to the git worktree
 * @returns Array of file paths with conflicts
 */
export async function getConflictFiles(worktreePath: string): Promise<string[]> {
  try {
    const diffOutput = await execGitCommand(
      ['diff', '--name-only', '--diff-filter=U'],
      worktreePath
    );
    return diffOutput
      .trim()
      .split('\n')
      .filter((f) => f.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * Check whether an error output string indicates a merge conflict.
 */
function isConflictError(errorOutput: string): boolean {
  return errorOutput.includes('CONFLICT') || errorOutput.includes('Automatic merge failed');
}

/**
 * Check whether an output string indicates a stash conflict.
 */
function isStashConflict(output: string): boolean {
  return output.includes('CONFLICT') || output.includes('Merge conflict');
}

// ============================================================================
// Main Service Function
// ============================================================================

/**
 * Perform a full git pull workflow on the given worktree.
 *
 * The workflow:
 * 1. Get current branch name (detect detached HEAD)
 * 2. Fetch from remote
 * 3. Check for local changes
 * 4. If local changes and stashIfNeeded, stash them
 * 5. Verify upstream tracking or remote branch exists
 * 6. Execute `git pull`
 * 7. If stash was created and pull succeeded, reapply stash
 * 8. Detect and report conflicts from pull or stash reapplication
 *
 * @param worktreePath - Path to the git worktree
 * @param options - Pull options (remote, stashIfNeeded)
 * @returns PullResult with detailed status information
 */
export async function performPull(
  worktreePath: string,
  options?: PullOptions
): Promise<PullResult> {
  const targetRemote = options?.remote || 'origin';
  const stashIfNeeded = options?.stashIfNeeded ?? false;

  // 1. Get current branch name
  const branchName = await getCurrentBranch(worktreePath);

  // 2. Check for detached HEAD state
  if (branchName === 'HEAD') {
    return {
      success: false,
      error: 'Cannot pull in detached HEAD state. Please checkout a branch first.',
    };
  }

  // 3. Fetch latest from remote
  try {
    await fetchRemote(worktreePath, targetRemote);
  } catch (fetchError) {
    return {
      success: false,
      error: `Failed to fetch from remote '${targetRemote}': ${getErrorMessage(fetchError)}`,
    };
  }

  // 4. Check for local changes
  const { hasLocalChanges, localChangedFiles } = await getLocalChanges(worktreePath);

  // 5. If there are local changes and stashIfNeeded is not requested, return info
  if (hasLocalChanges && !stashIfNeeded) {
    return {
      success: true,
      branch: branchName,
      pulled: false,
      hasLocalChanges: true,
      localChangedFiles,
      message:
        'Local changes detected. Use stashIfNeeded to automatically stash and reapply changes.',
    };
  }

  // 6. Stash local changes if needed
  let didStash = false;
  if (hasLocalChanges && stashIfNeeded) {
    try {
      await stashChanges(worktreePath, branchName);
      didStash = true;
    } catch (stashError) {
      return {
        success: false,
        error: `Failed to stash local changes: ${getErrorMessage(stashError)}`,
      };
    }
  }

  // 7. Verify upstream tracking or remote branch exists
  const hasUpstream = await hasUpstreamOrRemoteBranch(worktreePath, branchName, targetRemote);
  if (!hasUpstream) {
    let stashRecoveryFailed = false;
    if (didStash) {
      const stashPopped = await tryPopStash(worktreePath);
      stashRecoveryFailed = !stashPopped;
    }
    return {
      success: false,
      error: `Branch '${branchName}' has no upstream branch on remote '${targetRemote}'. Push it first or set upstream with: git branch --set-upstream-to=${targetRemote}/${branchName}${stashRecoveryFailed ? ' Local changes remain stashed and need manual recovery (run: git stash pop).' : ''}`,
      stashRecoveryFailed: stashRecoveryFailed || undefined,
    };
  }

  // 8. Pull latest changes
  let pullConflict = false;
  let pullConflictFiles: string[] = [];
  try {
    const pullOutput = await execGitCommand(['pull', targetRemote, branchName], worktreePath);

    const alreadyUpToDate = pullOutput.includes('Already up to date');

    // If no stash to reapply, return success
    if (!didStash) {
      return {
        success: true,
        branch: branchName,
        pulled: !alreadyUpToDate,
        hasLocalChanges: false,
        stashed: false,
        stashRestored: false,
        message: alreadyUpToDate ? 'Already up to date' : 'Pulled latest changes',
      };
    }
  } catch (pullError: unknown) {
    const err = pullError as { stderr?: string; stdout?: string; message?: string };
    const errorOutput = `${err.stderr || ''} ${err.stdout || ''} ${err.message || ''}`;

    if (isConflictError(errorOutput)) {
      pullConflict = true;
      pullConflictFiles = await getConflictFiles(worktreePath);
    } else {
      // Non-conflict pull error
      let stashRecoveryFailed = false;
      if (didStash) {
        const stashPopped = await tryPopStash(worktreePath);
        stashRecoveryFailed = !stashPopped;
      }

      // Check for common errors
      const errorMsg = err.stderr || err.message || 'Pull failed';
      if (errorMsg.includes('no tracking information')) {
        return {
          success: false,
          error: `Branch '${branchName}' has no upstream branch. Push it first or set upstream with: git branch --set-upstream-to=${targetRemote}/${branchName}${stashRecoveryFailed ? ' Local changes remain stashed and need manual recovery (run: git stash pop).' : ''}`,
          stashRecoveryFailed: stashRecoveryFailed || undefined,
        };
      }

      return {
        success: false,
        error: `${errorMsg}${stashRecoveryFailed ? ' Local changes remain stashed and need manual recovery (run: git stash pop).' : ''}`,
        stashRecoveryFailed: stashRecoveryFailed || undefined,
      };
    }
  }

  // 9. If pull had conflicts, return conflict info (don't try stash pop)
  if (pullConflict) {
    return {
      success: true,
      branch: branchName,
      pulled: true,
      hasConflicts: true,
      conflictSource: 'pull',
      conflictFiles: pullConflictFiles,
      stashed: didStash,
      stashRestored: false,
      message:
        `Pull resulted in merge conflicts. ${didStash ? 'Your local changes are still stashed.' : ''}`.trim(),
    };
  }

  // 10. Pull succeeded, now try to reapply stash
  if (didStash) {
    return await reapplyStash(worktreePath, branchName);
  }

  // Shouldn't reach here, but return a safe default
  return {
    success: true,
    branch: branchName,
    pulled: true,
    message: 'Pulled latest changes',
  };
}

/**
 * Attempt to reapply stashed changes after a successful pull.
 * Handles both clean reapplication and conflict scenarios.
 *
 * @param worktreePath - Path to the git worktree
 * @param branchName - Current branch name
 * @returns PullResult reflecting stash reapplication status
 */
async function reapplyStash(worktreePath: string, branchName: string): Promise<PullResult> {
  try {
    const stashPopOutput = await popStash(worktreePath);
    const stashPopCombined = stashPopOutput || '';

    // Check if stash pop had conflicts
    if (isStashConflict(stashPopCombined)) {
      const stashConflictFiles = await getConflictFiles(worktreePath);

      return {
        success: true,
        branch: branchName,
        pulled: true,
        hasConflicts: true,
        conflictSource: 'stash',
        conflictFiles: stashConflictFiles,
        stashed: true,
        stashRestored: true, // Stash was applied but with conflicts
        message: 'Pull succeeded but reapplying your stashed changes resulted in merge conflicts.',
      };
    }

    // Stash pop succeeded cleanly
    return {
      success: true,
      branch: branchName,
      pulled: true,
      hasConflicts: false,
      stashed: true,
      stashRestored: true,
      message: 'Pulled latest changes and restored your stashed changes.',
    };
  } catch (stashPopError: unknown) {
    const err = stashPopError as { stderr?: string; stdout?: string; message?: string };
    const errorOutput = `${err.stderr || ''} ${err.stdout || ''} ${err.message || ''}`;

    // Check if stash pop failed due to conflicts
    if (isStashConflict(errorOutput)) {
      const stashConflictFiles = await getConflictFiles(worktreePath);

      return {
        success: true,
        branch: branchName,
        pulled: true,
        hasConflicts: true,
        conflictSource: 'stash',
        conflictFiles: stashConflictFiles,
        stashed: true,
        stashRestored: true,
        message: 'Pull succeeded but reapplying your stashed changes resulted in merge conflicts.',
      };
    }

    // Non-conflict stash pop error - stash is still in the stash list
    logger.warn('Failed to reapply stash after pull', { worktreePath, error: errorOutput });

    return {
      success: true,
      branch: branchName,
      pulled: true,
      hasConflicts: false,
      stashed: true,
      stashRestored: false,
      message:
        'Pull succeeded but failed to reapply stashed changes. Your changes are still in the stash list.',
    };
  }
}
