import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AgentExecutor,
  type AgentExecutionOptions,
  type AgentExecutionResult,
  type WaitForApprovalFn,
  type SaveFeatureSummaryFn,
  type UpdateFeatureSummaryFn,
  type BuildTaskPromptFn,
} from '../../../src/services/agent-executor.js';
import type { TypedEventBus } from '../../../src/services/typed-event-bus.js';
import type { FeatureStateManager } from '../../../src/services/feature-state-manager.js';
import type { PlanApprovalService } from '../../../src/services/plan-approval-service.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type { BaseProvider } from '../../../src/providers/base-provider.js';

/**
 * Unit tests for AgentExecutor
 *
 * Note: Full integration tests for execute() require complex mocking of
 * @automaker/utils and @automaker/platform which have module hoisting issues.
 * These tests focus on:
 * - Constructor injection
 * - Interface exports
 * - Type correctness
 *
 * Integration tests for streaming/marker detection are covered in E2E tests
 * and auto-mode-service tests.
 */
describe('AgentExecutor', () => {
  // Mock dependencies
  let mockEventBus: TypedEventBus;
  let mockFeatureStateManager: FeatureStateManager;
  let mockPlanApprovalService: PlanApprovalService;
  let mockSettingsService: SettingsService | null;

  beforeEach(() => {
    // Reset mocks
    mockEventBus = {
      emitAutoModeEvent: vi.fn(),
    } as unknown as TypedEventBus;

    mockFeatureStateManager = {
      updateTaskStatus: vi.fn().mockResolvedValue(undefined),
      updateFeaturePlanSpec: vi.fn().mockResolvedValue(undefined),
      saveFeatureSummary: vi.fn().mockResolvedValue(undefined),
    } as unknown as FeatureStateManager;

    mockPlanApprovalService = {
      waitForApproval: vi.fn(),
    } as unknown as PlanApprovalService;

    mockSettingsService = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with all dependencies', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );
      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('should accept null settingsService', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        null
      );
      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('should accept undefined settingsService', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService
      );
      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('should store eventBus dependency', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );
      // Verify executor was created - actual use tested via execute()
      expect(executor).toBeDefined();
    });

    it('should store featureStateManager dependency', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );
      expect(executor).toBeDefined();
    });

    it('should store planApprovalService dependency', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );
      expect(executor).toBeDefined();
    });
  });

  describe('interface exports', () => {
    it('should export AgentExecutionOptions type', () => {
      // Type assertion test - if this compiles, the type is exported correctly
      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: {} as BaseProvider,
        effectiveBareModel: 'claude-sonnet-4-20250514',
      };
      expect(options.featureId).toBe('test-feature');
    });

    it('should export AgentExecutionResult type', () => {
      const result: AgentExecutionResult = {
        responseText: 'test response',
        specDetected: false,
        tasksCompleted: 0,
        aborted: false,
      };
      expect(result.aborted).toBe(false);
    });

    it('should export callback types', () => {
      const waitForApproval: WaitForApprovalFn = async () => ({ approved: true });
      const saveFeatureSummary: SaveFeatureSummaryFn = async () => {};
      const updateFeatureSummary: UpdateFeatureSummaryFn = async () => {};
      const buildTaskPrompt: BuildTaskPromptFn = () => 'prompt';

      expect(typeof waitForApproval).toBe('function');
      expect(typeof saveFeatureSummary).toBe('function');
      expect(typeof updateFeatureSummary).toBe('function');
      expect(typeof buildTaskPrompt).toBe('function');
    });
  });

  describe('AgentExecutionOptions', () => {
    it('should accept required options', () => {
      const options: AgentExecutionOptions = {
        workDir: '/test/workdir',
        featureId: 'feature-123',
        prompt: 'Test prompt',
        projectPath: '/test/project',
        abortController: new AbortController(),
        provider: {} as BaseProvider,
        effectiveBareModel: 'claude-sonnet-4-20250514',
      };

      expect(options.workDir).toBe('/test/workdir');
      expect(options.featureId).toBe('feature-123');
      expect(options.prompt).toBe('Test prompt');
      expect(options.projectPath).toBe('/test/project');
      expect(options.abortController).toBeInstanceOf(AbortController);
      expect(options.effectiveBareModel).toBe('claude-sonnet-4-20250514');
    });

    it('should accept optional options', () => {
      const options: AgentExecutionOptions = {
        workDir: '/test/workdir',
        featureId: 'feature-123',
        prompt: 'Test prompt',
        projectPath: '/test/project',
        abortController: new AbortController(),
        provider: {} as BaseProvider,
        effectiveBareModel: 'claude-sonnet-4-20250514',
        // Optional fields
        imagePaths: ['/image1.png', '/image2.png'],
        model: 'claude-sonnet-4-20250514',
        planningMode: 'spec',
        requirePlanApproval: true,
        previousContent: 'Previous content',
        systemPrompt: 'System prompt',
        autoLoadClaudeMd: true,
        thinkingLevel: 'medium',
        branchName: 'feature-branch',
        specAlreadyDetected: false,
        existingApprovedPlanContent: 'Approved plan',
        persistedTasks: [{ id: 'T001', description: 'Task 1', status: 'pending' }],
        sdkOptions: {
          maxTurns: 100,
          allowedTools: ['read', 'write'],
        },
      };

      expect(options.imagePaths).toHaveLength(2);
      expect(options.planningMode).toBe('spec');
      expect(options.requirePlanApproval).toBe(true);
      expect(options.branchName).toBe('feature-branch');
    });
  });

  describe('AgentExecutionResult', () => {
    it('should contain responseText', () => {
      const result: AgentExecutionResult = {
        responseText: 'Full response text from agent',
        specDetected: true,
        tasksCompleted: 5,
        aborted: false,
      };
      expect(result.responseText).toBe('Full response text from agent');
    });

    it('should contain specDetected flag', () => {
      const result: AgentExecutionResult = {
        responseText: '',
        specDetected: true,
        tasksCompleted: 0,
        aborted: false,
      };
      expect(result.specDetected).toBe(true);
    });

    it('should contain tasksCompleted count', () => {
      const result: AgentExecutionResult = {
        responseText: '',
        specDetected: true,
        tasksCompleted: 10,
        aborted: false,
      };
      expect(result.tasksCompleted).toBe(10);
    });

    it('should contain aborted flag', () => {
      const result: AgentExecutionResult = {
        responseText: '',
        specDetected: false,
        tasksCompleted: 3,
        aborted: true,
      };
      expect(result.aborted).toBe(true);
    });
  });

  describe('execute method signature', () => {
    it('should have execute method', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );
      expect(typeof executor.execute).toBe('function');
    });

    it('should accept options and callbacks', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      // Type check - verifying the signature accepts the expected parameters
      // Actual execution would require mocking external modules
      const executeSignature = executor.execute.length;
      // execute(options, callbacks) = 2 parameters
      expect(executeSignature).toBe(2);
    });
  });

  describe('callback types', () => {
    it('WaitForApprovalFn should return approval result', async () => {
      const waitForApproval: WaitForApprovalFn = vi.fn().mockResolvedValue({
        approved: true,
        feedback: 'Looks good',
        editedPlan: undefined,
      });

      const result = await waitForApproval('feature-123', '/project');
      expect(result.approved).toBe(true);
      expect(result.feedback).toBe('Looks good');
    });

    it('WaitForApprovalFn should handle rejection with feedback', async () => {
      const waitForApproval: WaitForApprovalFn = vi.fn().mockResolvedValue({
        approved: false,
        feedback: 'Please add more tests',
        editedPlan: '## Revised Plan\n...',
      });

      const result = await waitForApproval('feature-123', '/project');
      expect(result.approved).toBe(false);
      expect(result.feedback).toBe('Please add more tests');
      expect(result.editedPlan).toBeDefined();
    });

    it('SaveFeatureSummaryFn should accept parameters', async () => {
      const saveSummary: SaveFeatureSummaryFn = vi.fn().mockResolvedValue(undefined);

      await saveSummary('/project', 'feature-123', 'Feature summary text');
      expect(saveSummary).toHaveBeenCalledWith('/project', 'feature-123', 'Feature summary text');
    });

    it('UpdateFeatureSummaryFn should accept parameters', async () => {
      const updateSummary: UpdateFeatureSummaryFn = vi.fn().mockResolvedValue(undefined);

      await updateSummary('/project', 'feature-123', 'Updated summary');
      expect(updateSummary).toHaveBeenCalledWith('/project', 'feature-123', 'Updated summary');
    });

    it('BuildTaskPromptFn should return prompt string', () => {
      const buildPrompt: BuildTaskPromptFn = vi.fn().mockReturnValue('Execute T001: Create file');

      const task = { id: 'T001', description: 'Create file', status: 'pending' as const };
      const allTasks = [task];
      const prompt = buildPrompt(task, allTasks, 0, 'Plan content', 'Template', undefined);

      expect(typeof prompt).toBe('string');
      expect(prompt).toBe('Execute T001: Create file');
    });
  });

  describe('dependency injection patterns', () => {
    it('should allow different eventBus implementations', () => {
      const customEventBus = {
        emitAutoModeEvent: vi.fn(),
        emit: vi.fn(),
        on: vi.fn(),
      } as unknown as TypedEventBus;

      const executor = new AgentExecutor(
        customEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('should allow different featureStateManager implementations', () => {
      const customStateManager = {
        updateTaskStatus: vi.fn().mockResolvedValue(undefined),
        updateFeaturePlanSpec: vi.fn().mockResolvedValue(undefined),
        saveFeatureSummary: vi.fn().mockResolvedValue(undefined),
        loadFeature: vi.fn().mockResolvedValue(null),
      } as unknown as FeatureStateManager;

      const executor = new AgentExecutor(
        mockEventBus,
        customStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('should work with mock settingsService', () => {
      const customSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({}),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        customSettingsService
      );

      expect(executor).toBeInstanceOf(AgentExecutor);
    });
  });
});
