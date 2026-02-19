/**
 * POST /stage-files endpoint - Stage or unstage files in a worktree
 *
 * Supports two operations:
 * 1. Stage files: `git add <files>` (adds files to the staging area)
 * 2. Unstage files: `git reset HEAD -- <files>` (removes files from staging area)
 *
 * Note: Git repository validation (isGitRepo) is handled by
 * the requireGitRepoOnly middleware in index.ts
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { execGitCommand } from '../../../lib/git.js';

export function createStageFilesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, files, operation } = req.body as {
        worktreePath: string;
        files: string[];
        operation: 'stage' | 'unstage';
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      if (!files || files.length === 0) {
        res.status(400).json({
          success: false,
          error: 'files array required and must not be empty',
        });
        return;
      }

      if (operation !== 'stage' && operation !== 'unstage') {
        res.status(400).json({
          success: false,
          error: 'operation must be "stage" or "unstage"',
        });
        return;
      }

      if (operation === 'stage') {
        // Stage the specified files
        await execGitCommand(['add', '--', ...files], worktreePath);
      } else {
        // Unstage the specified files
        await execGitCommand(['reset', 'HEAD', '--', ...files], worktreePath);
      }

      res.json({
        success: true,
        result: {
          operation,
          filesCount: files.length,
        },
      });
    } catch (error) {
      logError(error, `${(req.body as { operation?: string })?.operation ?? 'stage'} files failed`);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
