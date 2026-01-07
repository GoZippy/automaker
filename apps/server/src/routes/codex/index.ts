import { Router, Request, Response } from 'express';
import { CodexUsageService } from '../../services/codex-usage-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Codex');

export function createCodexRoutes(service: CodexUsageService): Router {
  const router = Router();

  // Get current usage (attempts to fetch from Codex CLI)
  router.get('/usage', async (req: Request, res: Response) => {
    try {
      // Check if Codex CLI is available first
      const isAvailable = await service.isAvailable();
      if (!isAvailable) {
        res.status(503).json({
          error: 'Codex CLI not found',
          message: "Please install Codex CLI and run 'codex login' to authenticate",
        });
        return;
      }

      const usage = await service.fetchUsageData();
      res.json(usage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('not authenticated') || message.includes('login')) {
        res.status(401).json({
          error: 'Authentication required',
          message: "Please run 'codex login' to authenticate",
        });
      } else if (message.includes('not available') || message.includes('does not provide')) {
        // This is the expected case - Codex doesn't provide usage stats
        res.status(503).json({
          error: 'Usage statistics not available',
          message: message,
        });
      } else if (message.includes('timed out')) {
        res.status(504).json({
          error: 'Command timed out',
          message: 'The Codex CLI took too long to respond',
        });
      } else {
        logger.error('Error fetching usage:', error);
        res.status(500).json({ error: message });
      }
    }
  });

  return router;
}
