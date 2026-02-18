/**
 * POST /branch-commit-log endpoint - Get recent commit history for a specific branch
 *
 * Similar to commit-log but allows specifying a branch name to get commits from
 * any branch, not just the currently checked out one. Useful for cherry-pick workflows
 * where you need to browse commits from other branches.
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { execGitCommand, getErrorMessage, logError } from '../common.js';

export function createBranchCommitLogHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        worktreePath,
        branchName,
        limit = 20,
      } = req.body as {
        worktreePath: string;
        branchName?: string;
        limit?: number;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Clamp limit to a reasonable range
      const commitLimit = Math.min(Math.max(1, Number(limit) || 20), 100);

      // Use the specified branch or default to HEAD
      const targetRef = branchName || 'HEAD';

      // Get detailed commit log for the specified branch
      const logOutput = await execGitCommand(
        [
          'log',
          targetRef,
          `--max-count=${commitLimit}`,
          '--format=%H%n%h%n%an%n%ae%n%aI%n%s%n%b%n---END---',
        ],
        worktreePath
      );

      // Parse the output into structured commit objects
      const commits: Array<{
        hash: string;
        shortHash: string;
        author: string;
        authorEmail: string;
        date: string;
        subject: string;
        body: string;
        files: string[];
      }> = [];

      const commitBlocks = logOutput.split('---END---\n').filter((block) => block.trim());

      for (const block of commitBlocks) {
        const lines = block.split('\n');
        if (lines.length >= 6) {
          const hash = lines[0].trim();

          // Get list of files changed in this commit
          let files: string[] = [];
          try {
            const filesOutput = await execGitCommand(
              ['diff-tree', '--no-commit-id', '--name-only', '-r', hash],
              worktreePath
            );
            files = filesOutput
              .trim()
              .split('\n')
              .filter((f) => f.trim());
          } catch {
            // Ignore errors getting file list
          }

          commits.push({
            hash,
            shortHash: lines[1].trim(),
            author: lines[2].trim(),
            authorEmail: lines[3].trim(),
            date: lines[4].trim(),
            subject: lines[5].trim(),
            body: lines.slice(6).join('\n').trim(),
            files,
          });
        }
      }

      // If branchName wasn't specified, get current branch for display
      let displayBranch = branchName;
      if (!displayBranch) {
        const branchOutput = await execGitCommand(
          ['rev-parse', '--abbrev-ref', 'HEAD'],
          worktreePath
        );
        displayBranch = branchOutput.trim();
      }

      res.json({
        success: true,
        result: {
          branch: displayBranch,
          commits,
          total: commits.length,
        },
      });
    } catch (error) {
      logError(error, 'Get branch commit log failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
