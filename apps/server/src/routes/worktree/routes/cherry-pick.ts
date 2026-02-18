/**
 * POST /cherry-pick endpoint - Cherry-pick one or more commits into the current branch
 *
 * Applies commits from another branch onto the current branch.
 * Supports single or multiple commit cherry-picks.
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { execGitCommand, getErrorMessage, logError } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Worktree');

export function createCherryPickHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, commitHashes, options } = req.body as {
        worktreePath: string;
        commitHashes: string[];
        options?: {
          noCommit?: boolean;
        };
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath is required',
        });
        return;
      }

      if (!commitHashes || !Array.isArray(commitHashes) || commitHashes.length === 0) {
        res.status(400).json({
          success: false,
          error: 'commitHashes array is required and must contain at least one commit hash',
        });
        return;
      }

      // Validate each commit hash format (should be hex string)
      for (const hash of commitHashes) {
        if (!/^[a-fA-F0-9]+$/.test(hash)) {
          res.status(400).json({
            success: false,
            error: `Invalid commit hash format: "${hash}"`,
          });
          return;
        }
      }

      // Verify each commit exists
      for (const hash of commitHashes) {
        try {
          await execGitCommand(['rev-parse', '--verify', hash], worktreePath);
        } catch {
          res.status(400).json({
            success: false,
            error: `Commit "${hash}" does not exist`,
          });
          return;
        }
      }

      // Build cherry-pick command args
      const args = ['cherry-pick'];
      if (options?.noCommit) {
        args.push('--no-commit');
      }
      // Add commit hashes in order
      args.push(...commitHashes);

      // Execute the cherry-pick
      try {
        await execGitCommand(args, worktreePath);

        // Get current branch name
        const branchOutput = await execGitCommand(
          ['rev-parse', '--abbrev-ref', 'HEAD'],
          worktreePath
        );

        res.json({
          success: true,
          result: {
            cherryPicked: true,
            commitHashes,
            branch: branchOutput.trim(),
            message: `Successfully cherry-picked ${commitHashes.length} commit(s)`,
          },
        });
      } catch (cherryPickError: unknown) {
        // Check if this is a cherry-pick conflict
        const err = cherryPickError as { stdout?: string; stderr?: string; message?: string };
        const output = `${err.stdout || ''} ${err.stderr || ''} ${err.message || ''}`;
        const hasConflicts =
          output.includes('CONFLICT') ||
          output.includes('cherry-pick failed') ||
          output.includes('could not apply');

        if (hasConflicts) {
          // Abort the cherry-pick to leave the repo in a clean state
          try {
            await execGitCommand(['cherry-pick', '--abort'], worktreePath);
          } catch {
            logger.warn('Failed to abort cherry-pick after conflict');
          }

          res.status(409).json({
            success: false,
            error: `Cherry-pick CONFLICT: Could not apply commit(s) cleanly. Conflicts need to be resolved manually.`,
            hasConflicts: true,
          });
          return;
        }

        // Re-throw non-conflict errors
        throw cherryPickError;
      }
    } catch (error) {
      logError(error, 'Cherry-pick failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
