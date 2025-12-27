# Cursor CLI Integration Plan

> Integration of Cursor Agent CLI (`cursor-agent`) as an alternative AI provider in AutoMaker

## Status Overview

| Phase | Name                                                         | Status      | Test Status |
| ----- | ------------------------------------------------------------ | ----------- | ----------- |
| 0     | [Analysis & Documentation](phases/phase-0-analysis.md)       | `completed` | ✅          |
| 1     | [Core Types & Configuration](phases/phase-1-types.md)        | `completed` | ✅          |
| 2     | [Cursor Provider Implementation](phases/phase-2-provider.md) | `completed` | ✅          |
| 3     | [Provider Factory Integration](phases/phase-3-factory.md)    | `completed` | ✅          |
| 4     | [Setup Routes & Status Endpoints](phases/phase-4-routes.md)  | `completed` | ✅          |
| 5     | [Log Parser Integration](phases/phase-5-log-parser.md)       | `pending`   | -           |
| 6     | [UI Setup Wizard](phases/phase-6-setup-wizard.md)            | `pending`   | -           |
| 7     | [Settings View Provider Tabs](phases/phase-7-settings.md)    | `pending`   | -           |
| 8     | [AI Profiles Integration](phases/phase-8-profiles.md)        | `pending`   | -           |
| 9     | [Task Execution Integration](phases/phase-9-execution.md)    | `pending`   | -           |
| 10    | [Testing & Validation](phases/phase-10-testing.md)           | `pending`   | -           |

**Status Legend:** `pending` | `in_progress` | `completed` | `blocked`

---

## Quick Links

- **Reference PR**: [#279](https://github.com/AutoMaker-Org/automaker/pull/279) (incomplete, patterns only)
- **Cursor CLI Docs**: [cursor.com/docs/cli](https://cursor.com/docs/cli)
- **Output Format Spec**: [Output Format Reference](https://cursor.com/docs/cli/reference/output-format)

---

## Architecture Summary

### Existing Provider Pattern

AutoMaker uses an extensible provider architecture:

```
BaseProvider (abstract)
    ├── getName(): string
    ├── executeQuery(options): AsyncGenerator<ProviderMessage>
    ├── detectInstallation(): Promise<InstallationStatus>
    └── getAvailableModels(): ModelDefinition[]

ClaudeProvider extends BaseProvider
    └── Uses @anthropic-ai/claude-agent-sdk

ProviderFactory
    └── getProviderForModel(modelId) → routes to correct provider
```

### Target Architecture

```
BaseProvider
    ├── ClaudeProvider (existing)
    └── CursorProvider (new)
            ├── Spawns cursor-agent CLI process
            ├── Uses --output-format stream-json
            └── Normalizes events to ProviderMessage format
```

---

## Key Requirements

1. **Model Selection**: Explicit model selection via config (not just "auto" mode)
2. **Authentication**: Browser login (`cursor-agent login`) as primary method
3. **Setup Wizard**: Optional CLI status check (skippable, configure later)
4. **AI Profiles**: Separate Cursor profiles with embedded thinking mode (e.g., `claude-sonnet-4-thinking`)
5. **Settings View**: Separate tabs/sections per provider
6. **Streaming**: Full `stream-json` parsing with tool call events for log-viewer
7. **Error Handling**: Detailed error mapping with recovery suggestions

---

## Cursor CLI Reference

### Installation

```bash
curl https://cursor.com/install -fsS | bash
```

### Authentication Methods

1. **Browser Login** (Recommended): `cursor-agent login`
2. **API Key**: `CURSOR_API_KEY` environment variable

### CLI Flags for Integration

```bash
cursor-agent \
  -p "prompt"                    # Print/non-interactive mode
  --model gpt-4o                 # Explicit model selection
  --output-format stream-json    # NDJSON streaming
  --stream-partial-output        # Real-time character streaming
  --force                        # Allow file modifications
```

### Available Models (from Cursor docs)

| Model ID                   | Description                | Thinking |
| -------------------------- | -------------------------- | -------- |
| `auto`                     | Auto-select best model     | -        |
| `claude-sonnet-4`          | Claude Sonnet 4            | No       |
| `claude-sonnet-4-thinking` | Claude Sonnet 4 + Thinking | Yes      |
| `gpt-4o`                   | GPT-4o                     | No       |
| `gpt-4o-mini`              | GPT-4o Mini                | No       |
| `gemini-2.5-pro`           | Gemini 2.5 Pro             | No       |
| `o3-mini`                  | O3 Mini (reasoning)        | Built-in |

---

## Stream JSON Event Types

### System Init

```json
{
  "type": "system",
  "subtype": "init",
  "apiKeySource": "login",
  "cwd": "/path",
  "session_id": "uuid",
  "model": "Claude 4 Sonnet",
  "permissionMode": "default"
}
```

### User Message

```json
{
  "type": "user",
  "message": { "role": "user", "content": [{ "type": "text", "text": "prompt" }] },
  "session_id": "uuid"
}
```

### Assistant Message

```json
{
  "type": "assistant",
  "message": { "role": "assistant", "content": [{ "type": "text", "text": "response" }] },
  "session_id": "uuid"
}
```

### Tool Call Started

```json
{
  "type": "tool_call",
  "subtype": "started",
  "call_id": "id",
  "tool_call": { "readToolCall": { "args": { "path": "file.txt" } } },
  "session_id": "uuid"
}
```

### Tool Call Completed

```json
{
  "type": "tool_call",
  "subtype": "completed",
  "call_id": "id",
  "tool_call": {
    "readToolCall": {
      "args": { "path": "file.txt" },
      "result": { "success": { "content": "...", "totalLines": 54 } }
    }
  },
  "session_id": "uuid"
}
```

### Result (Final)

```json
{
  "type": "result",
  "subtype": "success",
  "duration_ms": 1234,
  "is_error": false,
  "result": "full text",
  "session_id": "uuid"
}
```

---

## File Map

### Files to Create

| File                                                                           | Phase | Description                  |
| ------------------------------------------------------------------------------ | ----- | ---------------------------- |
| `libs/types/src/cursor-models.ts`                                              | 1     | Cursor model definitions     |
| `apps/server/src/providers/cursor-provider.ts`                                 | 2     | Main provider implementation |
| `apps/server/src/providers/cursor-config-manager.ts`                           | 2     | Config file management       |
| `apps/server/src/routes/setup/routes/cursor-status.ts`                         | 4     | CLI status endpoint          |
| `apps/server/src/routes/setup/routes/cursor-config.ts`                         | 4     | Config management endpoints  |
| `apps/ui/src/components/views/setup-view/steps/cursor-setup-step.tsx`          | 6     | Setup wizard step            |
| `apps/ui/src/components/views/settings-view/providers/cursor-settings-tab.tsx` | 7     | Settings tab                 |
| `apps/ui/src/components/views/settings-view/providers/provider-tabs.tsx`       | 7     | Tab container                |
| `apps/server/tests/unit/providers/cursor-provider.test.ts`                     | 10    | Unit tests                   |

### Files to Modify

| File                                                                     | Phase | Changes                        |
| ------------------------------------------------------------------------ | ----- | ------------------------------ |
| `libs/types/src/index.ts`                                                | 1     | Export Cursor types            |
| `libs/types/src/settings.ts`                                             | 1     | Extend `ModelProvider` type    |
| `apps/server/src/providers/provider-factory.ts`                          | 3     | Add Cursor routing             |
| `apps/server/src/routes/setup/index.ts`                                  | 4     | Register Cursor routes         |
| `apps/ui/src/lib/log-parser.ts`                                          | 5     | Add Cursor event normalization |
| `apps/ui/src/components/views/setup-view.tsx`                            | 6     | Add Cursor setup step          |
| `apps/ui/src/components/views/profiles-view/components/profile-form.tsx` | 8     | Add Cursor provider fields     |
| `apps/server/src/services/agent-service.ts`                              | 9     | Use ProviderFactory            |

---

## Dependencies

### Between Phases

```
Phase 0 ─────────────────────────────────────────────┐
    │                                                │
Phase 1 (Types) ─────────────────────────────────────┤
    │                                                │
Phase 2 (Provider) ──────────────────────────────────┤
    │                                                │
Phase 3 (Factory) ───────────────────────────────────┤
    │                                                │
    ├── Phase 4 (Routes) ────────────────────────────┤
    │       │                                        │
    │       ├── Phase 6 (Setup Wizard) ──────────────┤
    │       │                                        │
    │       └── Phase 7 (Settings View) ─────────────┤
    │                                                │
    ├── Phase 5 (Log Parser) ────────────────────────┤
    │                                                │
    └── Phase 8 (Profiles) ──────────────────────────┤
            │                                        │
            Phase 9 (Execution) ─────────────────────┤
                                                     │
                                    Phase 10 (Tests) ┘
```

### External Dependencies

- `cursor-agent` CLI must be installed for testing
- Cursor account for authentication testing

---

## Design Decisions

### 1. Use HttpApiClient for All API Requests

All UI components must use `HttpApiClient` from `@/lib/http-api-client.ts` instead of raw `fetch()`:

```typescript
// ✓ Correct - uses HttpApiClient
import { api } from '@/lib/http-api-client';
const result = await api.setup.getCursorStatus();

// ✗ Incorrect - raw fetch
const response = await fetch('/api/setup/cursor-status');
```

New Cursor API methods added to `HttpApiClient.setup`:

- `getCursorStatus()` - Installation and auth status
- `getCursorConfig()` - Configuration settings
- `setCursorDefaultModel(model)` - Update default model
- `setCursorModels(models)` - Update enabled models

### 2. Use Existing UI Components

All UI must use components from `@/components/ui/*`:

- `Card`, `CardHeader`, `CardTitle`, `CardContent` - Layout
- `Button`, `Badge`, `Label` - Controls
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` - Selection
- `Checkbox` - Toggle inputs
- `Alert`, `AlertDescription` - Messages
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` - Navigation

Icons from `lucide-react`:

- `Terminal` - Cursor provider
- `Bot` - Claude provider
- `CheckCircle2`, `XCircle` - Status indicators
- `Loader2` - Loading states
- `RefreshCw` - Refresh action
- `ExternalLink` - External links

### 3. Cursor CLI Installation Paths

Based on official cursor-agent install script:

**Linux/macOS:**

- Primary symlink: `~/.local/bin/cursor-agent`
- Versions directory: `~/.local/share/cursor-agent/versions/<version>/cursor-agent`
- Fallback: `/usr/local/bin/cursor-agent`

**Windows:**

- Primary: `%APPDATA%\Local\Programs\cursor-agent\cursor-agent.exe`
- Fallback: `~/.local/bin/cursor-agent.exe`
- Fallback: `C:\Program Files\cursor-agent\cursor-agent.exe`

### 4. Use @automaker/\* Packages

All server-side code must use shared packages from `libs/`:

**From `@automaker/types`:**

- Reuse existing `InstallationStatus` (don't create `CursorInstallationStatus`)
- Extend `ModelProvider` type to include `'cursor'`
- Extend `DEFAULT_MODELS` to include `cursor: 'auto'`
- Update `ModelOption.provider` from `'claude'` to `ModelProvider`

**From `@automaker/utils`:**

```typescript
import { createLogger, isAbortError } from '@automaker/utils';

const logger = createLogger('CursorProvider');
// Use isAbortError() for abort signal detection
```

**From `@automaker/platform`:**

```typescript
import { spawnJSONLProcess, getAutomakerDir } from '@automaker/platform';

// Use spawnJSONLProcess for JSONL streaming (handles buffering, timeout, abort)
// Use getAutomakerDir for consistent .automaker path resolution
```

### 5. Do NOT Extend @automaker/model-resolver

The model-resolver is Claude-specific and should **not** be extended for Cursor:

- Claude uses aliases (`sonnet` → `claude-sonnet-4-5-20250929`)
- Cursor model IDs are final-form (`claude-sonnet-4` passed directly to CLI)
- Cursor models have metadata (`hasThinking`, `tier`) that doesn't fit the string-only map

Cursor models use their own `CURSOR_MODEL_MAP` in `@automaker/types`.

---

## Risk Mitigation

1. **Phase Isolation**: Each phase can be tested independently
2. **Feature Flags**: Cursor provider can be disabled if issues arise
3. **Fallback**: Default to Claude provider for unknown models
4. **Graceful Degradation**: UI shows "not installed" state clearly

---

## How to Use This Plan

1. **Start with Phase 0** - Read and understand existing patterns
2. **Complete phases sequentially** - Dependencies require order
3. **Test each phase** - Run the verification steps before moving on
4. **Update status** - Mark phases as `in_progress`, `completed`, or `blocked`
5. **Document issues** - Add notes to individual phase files

---

## Changelog

| Date       | Phase | Change                                                                             |
| ---------- | ----- | ---------------------------------------------------------------------------------- |
| 2025-12-27 | -     | Initial plan created                                                               |
| 2025-12-27 | 2     | Updated findCliPath() with platform-specific paths and versions directory scanning |
| 2025-12-27 | 4     | Updated to use HttpApiClient instead of raw fetch                                  |
| 2025-12-27 | 6     | Updated to use HttpApiClient and existing UI components                            |
| 2025-12-27 | 7     | Updated to use HttpApiClient and existing UI components                            |
| 2025-12-27 | -     | Added Design Decisions section to README                                           |
| 2025-12-27 | 2     | Updated to use `createLogger` from `@automaker/utils`                              |
| 2025-12-27 | 4     | Updated to use `createLogger` from `@automaker/utils`                              |
| 2025-12-27 | 8     | Added proper UI component imports from `@/components/ui/*`                         |
| 2025-12-27 | 1     | Added tasks 1.5-1.7: ModelOption, DEFAULT_MODELS, reuse InstallationStatus         |
| 2025-12-27 | 2     | Refactored to use `spawnJSONLProcess` and `isAbortError` from @automaker packages  |
| 2025-12-27 | -     | Added design decisions 4-5: @automaker packages usage, model-resolver note         |
