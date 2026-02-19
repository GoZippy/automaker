/**
 * MergeService - Direct merge operations without HTTP
 *
 * Extracted from worktree merge route to allow internal service calls.
 */

import { createLogger } from '@automaker/utils';
import { type EventEmitter } from '../lib/events.js';
import { execGitCommand } from '../lib/git.js';
const logger = createLogger('MergeService');

export interface MergeOptions {
  squash?: boolean;
  message?: string;
  deleteWorktreeAndBranch?: boolean;
}

export interface MergeServiceResult {
  success: boolean;
  error?: string;
  hasConflicts?: boolean;
  conflictFiles?: string[];
  mergedBranch?: string;
  targetBranch?: string;
  deleted?: {
    worktreeDeleted: boolean;
    branchDeleted: boolean;
  };
}

/**
 * Validate branch name to prevent command injection.
 * The first character must not be '-' to prevent git argument injection
 * via names like "-flag" or "--option".
 */
function isValidBranchName(name: string): boolean {
  // First char must be alphanumeric, dot, underscore, or slash (not dash)
  return /^[a-zA-Z0-9._/][a-zA-Z0-9._\-/]*$/.test(name) && name.length < 250;
}

/**
 * Perform a git merge operation directly without HTTP.
 *
 * @param projectPath - Path to the git repository
 * @param branchName - Source branch to merge
 * @param worktreePath - Path to the worktree (used for deletion if requested)
 * @param targetBranch - Branch to merge into (defaults to 'main')
 * @param options - Merge options (squash, message, deleteWorktreeAndBranch)
 */
export async function performMerge(
  projectPath: string,
  branchName: string,
  worktreePath: string,
  targetBranch: string = 'main',
  options?: MergeOptions,
  emitter?: EventEmitter
): Promise<MergeServiceResult> {
  if (!projectPath || !branchName || !worktreePath) {
    return {
      success: false,
      error: 'projectPath, branchName, and worktreePath are required',
    };
  }

  const mergeTo = targetBranch || 'main';

  // Validate branch names early to reject invalid input before any git operations
  if (!isValidBranchName(branchName)) {
    return {
      success: false,
      error: `Invalid source branch name: "${branchName}"`,
    };
  }
  if (!isValidBranchName(mergeTo)) {
    return {
      success: false,
      error: `Invalid target branch name: "${mergeTo}"`,
    };
  }

  // Validate source branch exists (using safe array-based command)
  try {
    await execGitCommand(['rev-parse', '--verify', branchName], projectPath);
  } catch {
    return {
      success: false,
      error: `Branch "${branchName}" does not exist`,
    };
  }

  // Validate target branch exists (using safe array-based command)
  try {
    await execGitCommand(['rev-parse', '--verify', mergeTo], projectPath);
  } catch {
    return {
      success: false,
      error: `Target branch "${mergeTo}" does not exist`,
    };
  }

  // Emit merge:start after validating inputs
  emitter?.emit('merge:start', { branchName, targetBranch: mergeTo, worktreePath });

  // Merge the feature branch into the target branch (using safe array-based commands)
  const mergeMessage = options?.message || `Merge ${branchName} into ${mergeTo}`;
  const mergeArgs = options?.squash
    ? ['merge', '--squash', branchName]
    : ['merge', branchName, '-m', mergeMessage];

  try {
    await execGitCommand(mergeArgs, projectPath);
  } catch (mergeError: unknown) {
    // Check if this is a merge conflict
    const err = mergeError as { stdout?: string; stderr?: string; message?: string };
    const output = `${err.stdout || ''} ${err.stderr || ''} ${err.message || ''}`;
    const hasConflicts = output.includes('CONFLICT') || output.includes('Automatic merge failed');

    if (hasConflicts) {
      // Get list of conflicted files
      let conflictFiles: string[] | undefined;
      try {
        const diffOutput = await execGitCommand(
          ['diff', '--name-only', '--diff-filter=U'],
          projectPath
        );
        conflictFiles = diffOutput
          .trim()
          .split('\n')
          .filter((f) => f.trim().length > 0);
      } catch {
        // If we can't get the file list, leave conflictFiles undefined so callers
        // can distinguish "no conflicts" (empty array) from "unknown due to diff failure" (undefined)
      }

      // Emit merge:conflict event with conflict details
      emitter?.emit('merge:conflict', { branchName, targetBranch: mergeTo, conflictFiles });

      return {
        success: false,
        error: `Merge CONFLICT: Automatic merge of "${branchName}" into "${mergeTo}" failed. Please resolve conflicts manually.`,
        hasConflicts: true,
        conflictFiles,
      };
    }

    // Emit merge:error for non-conflict errors before re-throwing
    emitter?.emit('merge:error', {
      branchName,
      targetBranch: mergeTo,
      error: err.message || String(mergeError),
    });

    // Re-throw non-conflict errors
    throw mergeError;
  }

  // If squash merge, need to commit (using safe array-based command)
  if (options?.squash) {
    const squashMessage = options?.message || `Merge ${branchName} (squash)`;
    await execGitCommand(['commit', '-m', squashMessage], projectPath);
  }

  // Optionally delete the worktree and branch after merging
  let worktreeDeleted = false;
  let branchDeleted = false;

  if (options?.deleteWorktreeAndBranch) {
    // Remove the worktree
    try {
      await execGitCommand(['worktree', 'remove', worktreePath, '--force'], projectPath);
      worktreeDeleted = true;
    } catch {
      // Try with prune if remove fails
      try {
        await execGitCommand(['worktree', 'prune'], projectPath);
        worktreeDeleted = true;
      } catch {
        logger.warn(`Failed to remove worktree: ${worktreePath}`);
      }
    }

    // Delete the branch (but not main/master)
    if (branchName !== 'main' && branchName !== 'master') {
      if (!isValidBranchName(branchName)) {
        logger.warn(`Invalid branch name detected, skipping deletion: ${branchName}`);
      } else {
        try {
          await execGitCommand(['branch', '-D', branchName], projectPath);
          branchDeleted = true;
        } catch {
          logger.warn(`Failed to delete branch: ${branchName}`);
        }
      }
    }
  }

  // Emit merge:success with merged branch, target branch, and deletion info
  emitter?.emit('merge:success', {
    mergedBranch: branchName,
    targetBranch: mergeTo,
    deleted: options?.deleteWorktreeAndBranch ? { worktreeDeleted, branchDeleted } : undefined,
  });

  return {
    success: true,
    mergedBranch: branchName,
    targetBranch: mergeTo,
    deleted: options?.deleteWorktreeAndBranch ? { worktreeDeleted, branchDeleted } : undefined,
  };
}
