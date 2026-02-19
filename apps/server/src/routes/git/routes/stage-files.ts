/**
 * POST /stage-files endpoint - Stage or unstage files in the main project
 */

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
        await execGitCommand(['add', '--', ...files], projectPath);
      } else {
        await execGitCommand(['reset', 'HEAD', '--', ...files], projectPath);
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
