/**
 * POST /cherry-pick endpoint - Cherry-pick one or more commits into the current branch
 *
 * Applies commits from another branch onto the current branch.
 * Supports single or multiple commit cherry-picks.
 *
 * Git business logic is delegated to cherry-pick-service.ts.
 * Events are emitted at key lifecycle points for WebSocket subscribers.
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import path from 'path';
import { getErrorMessage, logError } from '../common.js';
import type { EventEmitter } from '../../../lib/events.js';
import { verifyCommits, runCherryPick } from '../../../services/cherry-pick-service.js';

export function createCherryPickHandler(events: EventEmitter) {
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

      // Normalize the path to prevent path traversal and ensure consistent paths
      const resolvedWorktreePath = path.resolve(worktreePath);

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

      // Verify each commit exists via the service
      const invalidHash = await verifyCommits(resolvedWorktreePath, commitHashes);
      if (invalidHash !== null) {
        res.status(400).json({
          success: false,
          error: `Commit "${invalidHash}" does not exist`,
        });
        return;
      }

      // Emit started event
      events.emit('cherry-pick:started', {
        worktreePath: resolvedWorktreePath,
        commitHashes,
        options,
      });

      // Execute the cherry-pick via the service
      const result = await runCherryPick(resolvedWorktreePath, commitHashes, options);

      if (result.success) {
        // Emit success event
        events.emit('cherry-pick:success', {
          worktreePath: resolvedWorktreePath,
          commitHashes,
          branch: result.branch,
        });

        res.json({
          success: true,
          result: {
            cherryPicked: result.cherryPicked,
            commitHashes: result.commitHashes,
            branch: result.branch,
            message: result.message,
          },
        });
      } else if (result.hasConflicts) {
        // Emit conflict event
        events.emit('cherry-pick:conflict', {
          worktreePath: resolvedWorktreePath,
          commitHashes,
          aborted: result.aborted,
        });

        res.status(409).json({
          success: false,
          error: result.error,
          hasConflicts: true,
          aborted: result.aborted,
        });
      }
    } catch (error) {
      // Emit failure event
      events.emit('cherry-pick:failure', {
        error: getErrorMessage(error),
      });

      logError(error, 'Cherry-pick failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
