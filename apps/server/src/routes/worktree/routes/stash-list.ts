/**
 * POST /stash-list endpoint - List all stashes in a worktree
 *
 * Returns a list of all stash entries with their index, message, branch, and date.
 * Also includes the list of files changed in each stash.
 *
 * Note: Git repository validation (isGitRepo) is handled by
 * the requireGitRepoOnly middleware in index.ts
 */

import type { Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execFileAsync = promisify(execFile);

interface StashEntry {
  index: number;
  message: string;
  branch: string;
  date: string;
  files: string[];
}

export function createStashListHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Get stash list with format: index, message, date
      // Use %aI (strict ISO 8601) instead of %ai to ensure cross-browser compatibility
      const { stdout: stashOutput } = await execFileAsync(
        'git',
        ['stash', 'list', '--format=%gd|||%s|||%aI'],
        { cwd: worktreePath }
      );

      if (!stashOutput.trim()) {
        res.json({
          success: true,
          result: {
            stashes: [],
            total: 0,
          },
        });
        return;
      }

      const stashLines = stashOutput
        .trim()
        .split('\n')
        .filter((l) => l.trim());
      const stashes: StashEntry[] = [];

      for (const line of stashLines) {
        const parts = line.split('|||');
        if (parts.length < 3) continue;

        const refSpec = parts[0].trim(); // e.g., "stash@{0}"
        const message = parts[1].trim();
        const date = parts[2].trim();

        // Extract index from stash@{N}; skip entries that don't match the expected format
        const indexMatch = refSpec.match(/stash@\{(\d+)\}/);
        if (!indexMatch) continue;
        const index = parseInt(indexMatch[1], 10);

        // Extract branch name from message (format: "WIP on branch: hash message" or "On branch: hash message")
        let branch = '';
        const branchMatch = message.match(/^(?:WIP on|On) ([^:]+):/);
        if (branchMatch) {
          branch = branchMatch[1];
        }

        // Get list of files in this stash
        let files: string[] = [];
        try {
          const { stdout: filesOutput } = await execFileAsync(
            'git',
            ['stash', 'show', refSpec, '--name-only'],
            { cwd: worktreePath }
          );
          files = filesOutput
            .trim()
            .split('\n')
            .filter((f) => f.trim());
        } catch {
          // Ignore errors getting file list
        }

        stashes.push({
          index,
          message,
          branch,
          date,
          files,
        });
      }

      res.json({
        success: true,
        result: {
          stashes,
          total: stashes.length,
        },
      });
    } catch (error) {
      logError(error, 'Stash list failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
