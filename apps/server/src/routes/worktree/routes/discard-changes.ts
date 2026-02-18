/**
 * POST /discard-changes endpoint - Discard uncommitted changes in a worktree
 *
 * Supports two modes:
 * 1. Discard ALL changes (when no files array is provided)
 *    - Resets staged changes (git reset HEAD)
 *    - Discards modified tracked files (git checkout .)
 *    - Removes untracked files and directories (git clean -fd)
 *
 * 2. Discard SELECTED files (when files array is provided)
 *    - Unstages selected staged files (git reset HEAD -- <files>)
 *    - Reverts selected tracked file changes (git checkout -- <files>)
 *    - Removes selected untracked files (git clean -fd -- <files>)
 *
 * Note: Git repository validation (isGitRepo) is handled by
 * the requireGitRepoOnly middleware in index.ts
 */

import type { Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { getErrorMessage, logError } from '../common.js';

const execFileAsync = promisify(execFile);

/**
 * Validate that a file path does not escape the worktree directory.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 */
function validateFilePath(filePath: string, worktreePath: string): boolean {
  // Resolve the full path relative to the worktree
  const resolved = path.resolve(worktreePath, filePath);
  const normalizedWorktree = path.resolve(worktreePath);
  // Ensure the resolved path starts with the worktree path
  return resolved.startsWith(normalizedWorktree + path.sep) || resolved === normalizedWorktree;
}

export function createDiscardChangesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, files } = req.body as {
        worktreePath: string;
        files?: string[];
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Check for uncommitted changes first
      const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: worktreePath,
      });

      if (!status.trim()) {
        res.json({
          success: true,
          result: {
            discarded: false,
            message: 'No changes to discard',
          },
        });
        return;
      }

      // Get branch name before discarding
      const { stdout: branchOutput } = await execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        {
          cwd: worktreePath,
        }
      );
      const branchName = branchOutput.trim();

      // Parse the status output to categorize files
      const statusLines = status.trim().split('\n').filter(Boolean);
      const allFiles = statusLines.map((line) => {
        const fileStatus = line.substring(0, 2).trim();
        const filePath = line.substring(3).trim();
        return { status: fileStatus, path: filePath };
      });

      // Determine which files to discard
      const isSelectiveDiscard = files && files.length > 0 && files.length < allFiles.length;

      if (isSelectiveDiscard) {
        // Selective discard: only discard the specified files
        const filesToDiscard = new Set(files);

        // Validate all requested file paths stay within the worktree
        const invalidPaths = files.filter((f) => !validateFilePath(f, worktreePath));
        if (invalidPaths.length > 0) {
          res.status(400).json({
            success: false,
            error: `Invalid file paths detected (path traversal): ${invalidPaths.join(', ')}`,
          });
          return;
        }

        // Separate files into categories for proper git operations
        const trackedModified: string[] = []; // Modified/deleted tracked files
        const stagedFiles: string[] = []; // Files that are staged
        const untrackedFiles: string[] = []; // Untracked files (?)
        const warnings: string[] = [];

        for (const file of allFiles) {
          if (!filesToDiscard.has(file.path)) continue;

          if (file.status === '?') {
            untrackedFiles.push(file.path);
          } else {
            // Check if the file has staged changes (first character of status)
            const indexStatus = statusLines
              .find((l) => l.substring(3).trim() === file.path)
              ?.charAt(0);
            if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
              stagedFiles.push(file.path);
            }
            // Check for working tree changes (tracked files)
            if (file.status === 'M' || file.status === 'D' || file.status === 'A') {
              trackedModified.push(file.path);
            }
          }
        }

        // 1. Unstage selected staged files (using execFile to bypass shell)
        if (stagedFiles.length > 0) {
          try {
            await execFileAsync('git', ['reset', 'HEAD', '--', ...stagedFiles], {
              cwd: worktreePath,
            });
          } catch (error) {
            const msg = getErrorMessage(error);
            logError(error, `Failed to unstage files: ${msg}`);
            warnings.push(`Failed to unstage some files: ${msg}`);
          }
        }

        // 2. Revert selected tracked file changes
        if (trackedModified.length > 0) {
          try {
            await execFileAsync('git', ['checkout', '--', ...trackedModified], {
              cwd: worktreePath,
            });
          } catch (error) {
            const msg = getErrorMessage(error);
            logError(error, `Failed to revert tracked files: ${msg}`);
            warnings.push(`Failed to revert some tracked files: ${msg}`);
          }
        }

        // 3. Remove selected untracked files
        if (untrackedFiles.length > 0) {
          try {
            await execFileAsync('git', ['clean', '-fd', '--', ...untrackedFiles], {
              cwd: worktreePath,
            });
          } catch (error) {
            const msg = getErrorMessage(error);
            logError(error, `Failed to clean untracked files: ${msg}`);
            warnings.push(`Failed to remove some untracked files: ${msg}`);
          }
        }

        const fileCount = files.length;

        // Verify the remaining state
        const { stdout: finalStatus } = await execFileAsync('git', ['status', '--porcelain'], {
          cwd: worktreePath,
        });

        const remainingCount = finalStatus.trim()
          ? finalStatus.trim().split('\n').filter(Boolean).length
          : 0;
        const actualDiscarded = allFiles.length - remainingCount;

        let message =
          actualDiscarded < fileCount
            ? `Discarded ${actualDiscarded} of ${fileCount} selected files, ${remainingCount} files remaining`
            : `Discarded ${actualDiscarded} ${actualDiscarded === 1 ? 'file' : 'files'}`;

        res.json({
          success: true,
          result: {
            discarded: true,
            filesDiscarded: actualDiscarded,
            filesRemaining: remainingCount,
            branch: branchName,
            message,
            ...(warnings.length > 0 && { warnings }),
          },
        });
      } else {
        // Discard ALL changes (original behavior)
        const fileCount = allFiles.length;
        const warnings: string[] = [];

        // 1. Reset any staged changes
        try {
          await execFileAsync('git', ['reset', 'HEAD'], { cwd: worktreePath });
        } catch (error) {
          const msg = getErrorMessage(error);
          logError(error, `git reset HEAD failed: ${msg}`);
          warnings.push(`Failed to unstage changes: ${msg}`);
        }

        // 2. Discard changes in tracked files
        try {
          await execFileAsync('git', ['checkout', '.'], { cwd: worktreePath });
        } catch (error) {
          const msg = getErrorMessage(error);
          logError(error, `git checkout . failed: ${msg}`);
          warnings.push(`Failed to revert tracked changes: ${msg}`);
        }

        // 3. Remove untracked files and directories
        try {
          await execFileAsync('git', ['clean', '-fd'], { cwd: worktreePath });
        } catch (error) {
          const msg = getErrorMessage(error);
          logError(error, `git clean -fd failed: ${msg}`);
          warnings.push(`Failed to remove untracked files: ${msg}`);
        }

        // Verify all changes were discarded
        const { stdout: finalStatus } = await execFileAsync('git', ['status', '--porcelain'], {
          cwd: worktreePath,
        });

        if (finalStatus.trim()) {
          const remainingCount = finalStatus.trim().split('\n').filter(Boolean).length;
          res.json({
            success: true,
            result: {
              discarded: true,
              filesDiscarded: fileCount - remainingCount,
              filesRemaining: remainingCount,
              branch: branchName,
              message: `Discarded ${fileCount - remainingCount} files, ${remainingCount} files could not be removed`,
              ...(warnings.length > 0 && { warnings }),
            },
          });
        } else {
          res.json({
            success: true,
            result: {
              discarded: true,
              filesDiscarded: fileCount,
              filesRemaining: 0,
              branch: branchName,
              message: `Discarded ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`,
              ...(warnings.length > 0 && { warnings }),
            },
          });
        }
      }
    } catch (error) {
      logError(error, 'Discard changes failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
