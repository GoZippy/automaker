/**
 * POST /stash-push endpoint - Stash changes in a worktree
 *
 * Stashes uncommitted changes (including untracked files) with an optional message.
 * Supports selective file stashing when a files array is provided.
 *
 * Note: Git repository validation (isGitRepo) is handled by
 * the requireGitRepoOnly middleware in index.ts
 */

import type { Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execFileAsync = promisify(execFile);

export function createStashPushHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, message, files } = req.body as {
        worktreePath: string;
        message?: string;
        files?: string[];
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Check for any changes to stash
      const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: worktreePath,
      });

      if (!status.trim()) {
        res.json({
          success: true,
          result: {
            stashed: false,
            message: 'No changes to stash',
          },
        });
        return;
      }

      // Build stash push command args
      const args = ['stash', 'push', '--include-untracked'];
      if (message && message.trim()) {
        args.push('-m', message.trim());
      }

      // If specific files are provided, add them as pathspecs after '--'
      if (files && files.length > 0) {
        args.push('--');
        args.push(...files);
      }

      // Execute stash push
      await execFileAsync('git', args, { cwd: worktreePath });

      // Get current branch name
      const { stdout: branchOutput } = await execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: worktreePath }
      );
      const branchName = branchOutput.trim();

      res.json({
        success: true,
        result: {
          stashed: true,
          branch: branchName,
          message: message?.trim() || `WIP on ${branchName}`,
        },
      });
    } catch (error) {
      logError(error, 'Stash push failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
