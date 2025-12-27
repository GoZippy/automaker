# Phase 4: Setup Routes & Status Endpoints

**Status:** `completed`
**Dependencies:** Phase 3 (Factory)
**Estimated Effort:** Medium (API endpoints)

---

## Objective

Create API endpoints for checking Cursor CLI status and managing configuration.

---

## Tasks

### Task 4.1: Create Cursor Status Route

**Status:** `completed`

**File:** `apps/server/src/routes/setup/routes/cursor-status.ts`

```typescript
import { Router, Request, Response } from 'express';
import { CursorProvider } from '../../../providers/cursor-provider';
import { createLogger } from '@automaker/utils';

// Create logger for this module
const logger = createLogger('CursorStatusRoute');

/**
 * GET /api/setup/cursor-status
 * Returns Cursor CLI installation and authentication status
 */
export function createCursorStatusHandler() {
  return async (req: Request, res: Response) => {
    try {
      const provider = new CursorProvider();

      const [installed, version, auth] = await Promise.all([
        provider.isInstalled(),
        provider.getVersion(),
        provider.checkAuth(),
      ]);

      res.json({
        success: true,
        installed,
        version: version || null,
        path: installed ? (provider as any).cliPath : null,
        auth: {
          authenticated: auth.authenticated,
          method: auth.method,
        },
        installCommand: 'curl https://cursor.com/install -fsS | bash',
        loginCommand: 'cursor-agent login',
      });
    } catch (error) {
      logger.error('[cursor-status] Error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createCursorStatusRoute(): Router {
  const router = Router();
  router.get('/cursor-status', createCursorStatusHandler());
  return router;
}
```

### Task 4.2: Create Cursor Config Routes

**Status:** `completed`

**File:** `apps/server/src/routes/setup/routes/cursor-config.ts`

```typescript
import { Router, Request, Response } from 'express';
import { CursorConfigManager } from '../../../providers/cursor-config-manager';
import { CURSOR_MODEL_MAP, CursorModelId } from '@automaker/types';
import { createLogger } from '@automaker/utils';

// Create logger for this module
const logger = createLogger('CursorConfigRoute');

export function createCursorConfigRoutes(dataDir: string): Router {
  const router = Router();
  const configManager = new CursorConfigManager(dataDir);

  /**
   * GET /api/setup/cursor-config
   * Get current Cursor configuration
   */
  router.get('/cursor-config', (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        config: configManager.getConfig(),
        availableModels: Object.values(CURSOR_MODEL_MAP),
      });
    } catch (error) {
      logger.error('[cursor-config] GET error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/setup/cursor-config/default-model
   * Set the default Cursor model
   */
  router.post('/cursor-config/default-model', (req: Request, res: Response) => {
    try {
      const { model } = req.body;

      if (!model || !(model in CURSOR_MODEL_MAP)) {
        res.status(400).json({
          success: false,
          error: `Invalid model ID. Valid models: ${Object.keys(CURSOR_MODEL_MAP).join(', ')}`,
        });
        return;
      }

      configManager.setDefaultModel(model as CursorModelId);
      res.json({ success: true, model });
    } catch (error) {
      logger.error('[cursor-config] POST default-model error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/setup/cursor-config/models
   * Set enabled Cursor models
   */
  router.post('/cursor-config/models', (req: Request, res: Response) => {
    try {
      const { models } = req.body;

      if (!Array.isArray(models)) {
        res.status(400).json({
          success: false,
          error: 'Models must be an array',
        });
        return;
      }

      // Filter to valid models only
      const validModels = models.filter((m): m is CursorModelId => m in CURSOR_MODEL_MAP);

      if (validModels.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No valid models provided',
        });
        return;
      }

      configManager.setEnabledModels(validModels);
      res.json({ success: true, models: validModels });
    } catch (error) {
      logger.error('[cursor-config] POST models error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
```

### Task 4.3: Register Routes in Setup Index

**Status:** `completed`

**File:** `apps/server/src/routes/setup/index.ts`

Add to existing router:

```typescript
import { createCursorStatusRoute } from './routes/cursor-status';
import { createCursorConfigRoutes } from './routes/cursor-config';

// In the router setup function:
export function createSetupRouter(dataDir: string): Router {
  const router = Router();

  // Existing routes...
  router.get('/claude-status', createClaudeStatusHandler());
  // ...

  // Add Cursor routes
  router.use(createCursorStatusRoute());
  router.use(createCursorConfigRoutes(dataDir));

  return router;
}
```

### Task 4.4: Update HttpApiClient

**Status:** `completed`

**File:** `apps/ui/src/lib/http-api-client.ts`

Add Cursor methods to the HttpApiClient setup object:

```typescript
// In HttpApiClient class, extend the setup object:

setup = {
  // Existing methods...
  getClaudeStatus: () => this.get('/api/setup/claude-status'),

  // Add Cursor methods
  getCursorStatus: () =>
    this.get<{
      success: boolean;
      installed?: boolean;
      version?: string;
      path?: string;
      auth?: {
        authenticated: boolean;
        method: string;
      };
      installCommand?: string;
      loginCommand?: string;
      error?: string;
    }>('/api/setup/cursor-status'),

  getCursorConfig: () =>
    this.get<{
      success: boolean;
      config?: CursorCliConfig;
      availableModels?: CursorModelConfig[];
      error?: string;
    }>('/api/setup/cursor-config'),

  setCursorDefaultModel: (model: CursorModelId) =>
    this.post<{ success: boolean; error?: string }>('/api/setup/cursor-config/default-model', {
      model,
    }),

  setCursorModels: (models: CursorModelId[]) =>
    this.post<{ success: boolean; error?: string }>('/api/setup/cursor-config/models', { models }),
};
```

This integrates with the existing HttpApiClient pattern used throughout the UI.

---

## Verification

### Test 1: Status Endpoint

```bash
# Start the server, then:
curl http://localhost:3001/api/setup/cursor-status

# Expected response (if installed):
# {
#   "success": true,
#   "installed": true,
#   "version": "0.1.0",
#   "path": "/home/user/.local/bin/cursor-agent",
#   "auth": { "authenticated": true, "method": "login" }
# }

# Expected response (if not installed):
# {
#   "success": true,
#   "installed": false,
#   "installCommand": "curl https://cursor.com/install -fsS | bash"
# }
```

### Test 2: Config Endpoints

```bash
# Get config
curl http://localhost:3001/api/setup/cursor-config

# Set default model
curl -X POST http://localhost:3001/api/setup/cursor-config/default-model \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o"}'

# Set enabled models
curl -X POST http://localhost:3001/api/setup/cursor-config/models \
  -H "Content-Type: application/json" \
  -d '{"models": ["auto", "gpt-4o", "claude-sonnet-4"]}'
```

### Test 3: Error Handling

```bash
# Invalid model should return 400
curl -X POST http://localhost:3001/api/setup/cursor-config/default-model \
  -H "Content-Type: application/json" \
  -d '{"model": "invalid-model"}'

# Expected: {"success": false, "error": "Invalid model ID..."}
```

---

## Verification Checklist

Before marking this phase complete:

- [x] `/api/setup/cursor-status` returns installation status
- [x] `/api/setup/cursor-config` returns current config
- [x] `/api/setup/cursor-config/default-model` updates default
- [x] `/api/setup/cursor-config/models` updates enabled models
- [x] Error responses have correct status codes (400, 500)
- [x] Config persists to file after changes
- [x] HttpApiClient updated with Cursor methods (using web mode, not Electron IPC)

---

## Files Changed

| File                                                   | Action | Description                   |
| ------------------------------------------------------ | ------ | ----------------------------- |
| `apps/server/src/routes/setup/routes/cursor-status.ts` | Create | Status endpoint               |
| `apps/server/src/routes/setup/routes/cursor-config.ts` | Create | Config endpoints              |
| `apps/server/src/routes/setup/index.ts`                | Modify | Register routes               |
| `apps/ui/src/lib/http-api-client.ts`                   | Modify | Add Cursor API client methods |

---

## Notes

- Config is stored in `.automaker/cursor-config.json`
- The status endpoint is optimized for quick checks (parallel calls)
- Install/login commands are included in response for UI display
