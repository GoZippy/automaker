/**
 * POST /commit-log endpoint - Get recent commit history for a worktree
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { execGitCommand, getErrorMessage, logError } from '../common.js';

export function createCommitLogHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, limit = 20 } = req.body as {
        worktreePath: string;
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

      // Get detailed commit log using the secure execGitCommand helper
      const logOutput = await execGitCommand(
        ['log', `--max-count=${commitLimit}`, '--format=%H%n%h%n%an%n%ae%n%aI%n%s%n%b%n---END---'],
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

      const commitBlocks = logOutput.split('---END---').filter((block) => block.trim());

      for (const block of commitBlocks) {
        const lines = block.split('\n');
        if (lines.length >= 6) {
          const hash = lines[0].trim();

          // Get list of files changed in this commit
          let files: string[] = [];
          try {
            const filesOutput = await execGitCommand(
              // -m causes merge commits to be diffed against each parent,
              // showing all files touched by the merge (without -m, diff-tree
              // produces no output for merge commits because they have 2+ parents)
              ['diff-tree', '--no-commit-id', '--name-only', '-r', '-m', hash],
              worktreePath
            );
            // Deduplicate: -m can list the same file multiple times
            // (once per parent diff for merge commits)
            files = [
              ...new Set(
                filesOutput
                  .trim()
                  .split('\n')
                  .filter((f) => f.trim())
              ),
            ];
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

      // Get current branch name
      const branchOutput = await execGitCommand(
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        worktreePath
      );
      const branch = branchOutput.trim();

      res.json({
        success: true,
        result: {
          branch,
          commits,
          total: commits.length,
        },
      });
    } catch (error) {
      logError(error, 'Get commit log failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
