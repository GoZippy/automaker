/**
 * POST /stash-drop endpoint - Drop (delete) a stash entry
 *
 * Removes a specific stash entry from the stash list.
 *
 * Note: Git repository validation (isGitRepo) is handled by
 * the requireGitRepoOnly middleware in index.ts
 */

import type { Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execFileAsync = promisify(execFile);

export function createStashDropHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, stashIndex } = req.body as {
        worktreePath: string;
        stashIndex: number;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      if (!Number.isInteger(stashIndex) || stashIndex < 0) {
        res.status(400).json({
          success: false,
          error: 'stashIndex required',
        });
        return;
      }

      const stashRef = `stash@{${stashIndex}}`;

      await execFileAsync('git', ['stash', 'drop', stashRef], {
        cwd: worktreePath,
      });

      res.json({
        success: true,
        result: {
          dropped: true,
          stashIndex,
          message: `Stash ${stashRef} dropped successfully`,
        },
      });
    } catch (error) {
      logError(error, 'Stash drop failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
