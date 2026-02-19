/**
 * Git routes - HTTP API for git operations (non-worktree)
 */

import { Router } from 'express';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createDiffsHandler } from './routes/diffs.js';
import { createFileDiffHandler } from './routes/file-diff.js';
import { createStageFilesHandler } from './routes/stage-files.js';

export function createGitRoutes(): Router {
  const router = Router();

  router.post('/diffs', validatePathParams('projectPath'), createDiffsHandler());
  router.post('/file-diff', validatePathParams('projectPath', 'filePath'), createFileDiffHandler());
  router.post('/stage-files', validatePathParams('projectPath'), createStageFilesHandler());

  return router;
}
