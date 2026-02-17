/**
 * POST /commit endpoint - Commit changes in a worktree
 *
 * Note: Git repository validation (isGitRepo) is handled by
 * the requireGitRepoOnly middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createCommitHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, message, files } = req.body as {
        worktreePath: string;
        message: string;
        files?: string[];
      };

      if (!worktreePath || !message) {
        res.status(400).json({
          success: false,
          error: 'worktreePath and message required',
        });
        return;
      }

      // Check for uncommitted changes
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
      });

      if (!status.trim()) {
        res.json({
          success: true,
          result: {
            committed: false,
            message: 'No changes to commit',
          },
        });
        return;
      }

      // Stage changes - either specific files or all changes
      if (files && files.length > 0) {
        // Reset any previously staged changes first
        await execAsync('git reset HEAD', { cwd: worktreePath }).catch(() => {
          // Ignore errors from reset (e.g., if nothing is staged)
        });
        // Stage only the selected files
        const escapedFiles = files.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(' ');
        await execAsync(`git add ${escapedFiles}`, { cwd: worktreePath });
      } else {
        // Stage all changes (original behavior)
        await execAsync('git add -A', { cwd: worktreePath });
      }

      // Create commit
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: worktreePath,
      });

      // Get commit hash
      const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
        cwd: worktreePath,
      });
      const commitHash = hashOutput.trim().substring(0, 8);

      // Get branch name
      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const branchName = branchOutput.trim();

      res.json({
        success: true,
        result: {
          committed: true,
          commitHash,
          branch: branchName,
          message,
        },
      });
    } catch (error) {
      logError(error, 'Commit worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
