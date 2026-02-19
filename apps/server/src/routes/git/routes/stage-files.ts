/**
 * POST /stage-files endpoint - Stage or unstage files in the main project
 */

import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { execGitCommand } from '../../../lib/git.js';

export function createStageFilesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, files, operation } = req.body as {
        projectPath: string;
        files: string[];
        operation: 'stage' | 'unstage';
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath required',
        });
        return;
      }

      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({
          success: false,
          error: 'files array required and must not be empty',
        });
        return;
      }

      for (const file of files) {
        if (typeof file !== 'string' || file.trim() === '') {
          res.status(400).json({
            success: false,
            error: 'Each element of files must be a non-empty string',
          });
          return;
        }
      }

      if (operation !== 'stage' && operation !== 'unstage') {
        res.status(400).json({
          success: false,
          error: 'operation must be "stage" or "unstage"',
        });
        return;
      }

      // Resolve the canonical (symlink-dereferenced) project path so that
      // startsWith(base) reliably prevents symlink traversal attacks.
      // If projectPath does not exist or is unreadable, realpath rejects and
      // we return a 400 instead of letting the error propagate as a 500.
      let canonicalRoot: string;
      try {
        canonicalRoot = await fs.promises.realpath(projectPath);
      } catch {
        res.status(400).json({
          success: false,
          error: `Invalid projectPath (non-existent or unreadable): ${projectPath}`,
        });
        return;
      }

      // Validate and sanitize each file path to prevent path traversal attacks
      const base = path.resolve(canonicalRoot) + path.sep;
      const sanitizedFiles: string[] = [];
      for (const file of files) {
        // Reject absolute paths
        if (path.isAbsolute(file)) {
          res.status(400).json({
            success: false,
            error: `Invalid file path (absolute paths not allowed): ${file}`,
          });
          return;
        }
        // Reject entries containing '..'
        if (file.includes('..')) {
          res.status(400).json({
            success: false,
            error: `Invalid file path (path traversal not allowed): ${file}`,
          });
          return;
        }
        // Ensure the resolved path stays within the project directory
        const resolved = path.resolve(path.join(canonicalRoot, file));
        if (resolved !== path.resolve(canonicalRoot) && !resolved.startsWith(base)) {
          res.status(400).json({
            success: false,
            error: `Invalid file path (outside project directory): ${file}`,
          });
          return;
        }
        sanitizedFiles.push(file);
      }

      if (operation === 'stage') {
        await execGitCommand(['add', '--', ...sanitizedFiles], canonicalRoot);
      } else {
        await execGitCommand(['reset', 'HEAD', '--', ...sanitizedFiles], canonicalRoot);
      }

      res.json({
        success: true,
        result: {
          operation,
          filesCount: sanitizedFiles.length,
        },
      });
    } catch (error) {
      logError(error, `${(req.body as { operation?: string })?.operation ?? 'stage'} files failed`);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
