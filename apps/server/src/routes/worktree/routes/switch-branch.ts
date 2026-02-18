/**
 * POST /switch-branch endpoint - Switch to an existing branch
 *
 * Handles branch switching with automatic stash/reapply of local changes.
 * If there are uncommitted changes, they are stashed before switching and
 * reapplied after. If the stash pop results in merge conflicts, returns
 * a special response code so the UI can create a conflict resolution task.
 *
 * For remote branches (e.g., "origin/feature"), automatically creates a
 * local tracking branch and checks it out.
 *
 * Also fetches the latest remote refs after switching.
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execFileAsync = promisify(execFile);

function isExcludedWorktreeLine(line: string): boolean {
  return line.includes('.worktrees/') || line.endsWith('.worktrees');
}

/**
 * Check if there are any changes at all (including untracked) that should be stashed
 */
async function hasAnyChanges(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    const lines = stdout
      .trim()
      .split('\n')
      .filter((line) => {
        if (!line.trim()) return false;
        if (isExcludedWorktreeLine(line)) return false;
        return true;
      });
    return lines.length > 0;
  } catch {
    return false;
  }
}

/**
 * Stash all local changes (including untracked files)
 * Returns true if a stash was created, false if there was nothing to stash
 */
async function stashChanges(cwd: string, message: string): Promise<boolean> {
  try {
    // Get stash count before
    const { stdout: beforeCount } = await execFileAsync('git', ['stash', 'list'], { cwd });
    const countBefore = beforeCount
      .trim()
      .split('\n')
      .filter((l) => l.trim()).length;

    // Stash including untracked files
    await execFileAsync('git', ['stash', 'push', '--include-untracked', '-m', message], { cwd });

    // Get stash count after to verify something was stashed
    const { stdout: afterCount } = await execFileAsync('git', ['stash', 'list'], { cwd });
    const countAfter = afterCount
      .trim()
      .split('\n')
      .filter((l) => l.trim()).length;

    return countAfter > countBefore;
  } catch {
    return false;
  }
}

/**
 * Pop the most recent stash entry
 * Returns an object indicating success and whether there were conflicts
 */
async function popStash(
  cwd: string
): Promise<{ success: boolean; hasConflicts: boolean; error?: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', ['stash', 'pop'], { cwd });
    const output = `${stdout}\n${stderr}`;
    // Check for conflict markers in the output
    if (output.includes('CONFLICT') || output.includes('Merge conflict')) {
      return { success: false, hasConflicts: true };
    }
    return { success: true, hasConflicts: false };
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    if (errorMsg.includes('CONFLICT') || errorMsg.includes('Merge conflict')) {
      return { success: false, hasConflicts: true, error: errorMsg };
    }
    return { success: false, hasConflicts: false, error: errorMsg };
  }
}

/**
 * Fetch latest from all remotes (silently, with timeout)
 */
async function fetchRemotes(cwd: string): Promise<void> {
  try {
    await execFileAsync('git', ['fetch', '--all', '--quiet'], {
      cwd,
      timeout: 15000, // 15 second timeout
    });
  } catch {
    // Ignore fetch errors - we may be offline
  }
}

/**
 * Parse a remote branch name like "origin/feature-branch" into its parts
 */
function parseRemoteBranch(branchName: string): { remote: string; branch: string } | null {
  const slashIndex = branchName.indexOf('/');
  if (slashIndex === -1) return null;
  return {
    remote: branchName.substring(0, slashIndex),
    branch: branchName.substring(slashIndex + 1),
  };
}

/**
 * Check if a branch name refers to a remote branch
 */
async function isRemoteBranch(cwd: string, branchName: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '-r', '--format=%(refname:short)'], {
      cwd,
    });
    const remoteBranches = stdout
      .trim()
      .split('\n')
      .map((b) => b.trim().replace(/^['"]|['"]$/g, ''))
      .filter((b) => b);
    return remoteBranches.includes(branchName);
  } catch {
    return false;
  }
}

/**
 * Check if a local branch already exists
 */
async function localBranchExists(cwd: string, branchName: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', `refs/heads/${branchName}`], { cwd });
    return true;
  } catch {
    return false;
  }
}

export function createSwitchBranchHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, branchName } = req.body as {
        worktreePath: string;
        branchName: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      if (!branchName) {
        res.status(400).json({
          success: false,
          error: 'branchName required',
        });
        return;
      }

      // Get current branch
      const { stdout: currentBranchOutput } = await execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: worktreePath }
      );
      const previousBranch = currentBranchOutput.trim();

      // Determine the actual target branch name for checkout
      let targetBranch = branchName;
      let isRemote = false;

      // Check if this is a remote branch (e.g., "origin/feature-branch")
      if (await isRemoteBranch(worktreePath, branchName)) {
        isRemote = true;
        const parsed = parseRemoteBranch(branchName);
        if (parsed) {
          targetBranch = parsed.branch;
        }
      }

      if (previousBranch === targetBranch) {
        res.json({
          success: true,
          result: {
            previousBranch,
            currentBranch: targetBranch,
            message: `Already on branch '${targetBranch}'`,
          },
        });
        return;
      }

      // Check if target branch exists (locally or as remote ref)
      if (!isRemote) {
        try {
          await execFileAsync('git', ['rev-parse', '--verify', branchName], {
            cwd: worktreePath,
          });
        } catch {
          res.status(400).json({
            success: false,
            error: `Branch '${branchName}' does not exist`,
          });
          return;
        }
      }

      // Stash local changes if any exist
      const hadChanges = await hasAnyChanges(worktreePath);
      let didStash = false;

      if (hadChanges) {
        const stashMessage = `automaker-branch-switch: ${previousBranch} → ${targetBranch}`;
        didStash = await stashChanges(worktreePath, stashMessage);
      }

      try {
        // Switch to the target branch
        if (isRemote) {
          const parsed = parseRemoteBranch(branchName);
          if (parsed) {
            if (await localBranchExists(worktreePath, parsed.branch)) {
              // Local branch exists, just checkout
              await execFileAsync('git', ['checkout', parsed.branch], { cwd: worktreePath });
            } else {
              // Create local tracking branch from remote
              await execFileAsync('git', ['checkout', '-b', parsed.branch, branchName], {
                cwd: worktreePath,
              });
            }
          }
        } else {
          await execFileAsync('git', ['checkout', targetBranch], { cwd: worktreePath });
        }

        // Fetch latest from remotes after switching
        await fetchRemotes(worktreePath);

        // Reapply stashed changes if we stashed earlier
        let hasConflicts = false;
        let conflictMessage = '';

        if (didStash) {
          const popResult = await popStash(worktreePath);
          if (popResult.hasConflicts) {
            hasConflicts = true;
            conflictMessage = `Switched to branch '${targetBranch}' but merge conflicts occurred when reapplying your local changes. Please resolve the conflicts.`;
          } else if (!popResult.success) {
            // Stash pop failed for a non-conflict reason - the stash is still there
            conflictMessage = `Switched to branch '${targetBranch}' but failed to reapply stashed changes: ${popResult.error}. Your changes are still in the stash.`;
          }
        }

        if (hasConflicts) {
          res.json({
            success: true,
            result: {
              previousBranch,
              currentBranch: targetBranch,
              message: conflictMessage,
              hasConflicts: true,
              stashedChanges: true,
            },
          });
        } else {
          const stashNote = didStash ? ' (local changes stashed and reapplied)' : '';
          res.json({
            success: true,
            result: {
              previousBranch,
              currentBranch: targetBranch,
              message: `Switched to branch '${targetBranch}'${stashNote}`,
              hasConflicts: false,
              stashedChanges: didStash,
            },
          });
        }
      } catch (checkoutError) {
        // If checkout failed and we stashed, try to restore the stash
        if (didStash) {
          const popResult = await popStash(worktreePath);
          if (popResult.hasConflicts) {
            // Stash pop itself produced merge conflicts — the working tree is now in a
            // conflicted state even though the checkout failed. Surface this clearly so
            // the caller can prompt the user (or AI) to resolve conflicts rather than
            // simply retrying the branch switch.
            const checkoutErrorMsg = getErrorMessage(checkoutError);
            res.status(500).json({
              success: false,
              error: checkoutErrorMsg,
              stashPopConflicts: true,
              stashPopConflictMessage:
                'Stash pop resulted in conflicts: your stashed changes were partially reapplied ' +
                'but produced merge conflicts. Please resolve the conflicts before retrying the branch switch.',
            });
            return;
          } else if (!popResult.success) {
            // Stash pop failed for a non-conflict reason; the stash entry is still intact.
            // Include this detail alongside the original checkout error.
            const checkoutErrorMsg = getErrorMessage(checkoutError);
            const combinedMessage =
              `${checkoutErrorMsg}. Additionally, restoring your stashed changes failed: ` +
              `${popResult.error ?? 'unknown error'} — your changes are still saved in the stash.`;
            res.status(500).json({
              success: false,
              error: combinedMessage,
              stashPopConflicts: false,
            });
            return;
          }
          // popResult.success === true: stash was cleanly restored, re-throw the checkout error
        }
        throw checkoutError;
      }
    } catch (error) {
      logError(error, 'Switch branch failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
