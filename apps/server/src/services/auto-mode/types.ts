/**
 * Facade Types - Type definitions for AutoModeServiceFacade
 *
 * Contains:
 * - FacadeOptions interface for factory configuration
 * - Re-exports of types from extracted services that routes might need
 * - Additional types for facade method signatures
 */

import type { EventEmitter } from '../../lib/events.js';
import type { Feature, ModelProvider } from '@automaker/types';
import type { SettingsService } from '../settings-service.js';
import type { FeatureLoader } from '../feature-loader.js';

// Re-export types from extracted services for route consumption
export type { AutoModeConfig, ProjectAutoLoopState } from '../auto-loop-coordinator.js';

export type { RunningFeature, AcquireParams } from '../concurrency-manager.js';

export type { WorktreeInfo } from '../worktree-resolver.js';

export type { PipelineContext, PipelineStatusInfo } from '../pipeline-orchestrator.js';

export type { PlanApprovalResult, ResolveApprovalResult } from '../plan-approval-service.js';

export type { ExecutionState } from '../recovery-service.js';

/**
 * Options for creating an AutoModeServiceFacade instance
 */
export interface FacadeOptions {
  /** EventEmitter for broadcasting events to clients */
  events: EventEmitter;
  /** SettingsService for reading project/global settings (optional) */
  settingsService?: SettingsService | null;
  /** FeatureLoader for loading feature data (optional, defaults to new FeatureLoader()) */
  featureLoader?: FeatureLoader;
}

/**
 * Status returned by getStatus()
 */
export interface AutoModeStatus {
  isRunning: boolean;
  runningFeatures: string[];
  runningCount: number;
}

/**
 * Status returned by getStatusForProject()
 */
export interface ProjectAutoModeStatus {
  isAutoLoopRunning: boolean;
  runningFeatures: string[];
  runningCount: number;
  maxConcurrency: number;
  branchName: string | null;
}

/**
 * Capacity info returned by checkWorktreeCapacity()
 */
export interface WorktreeCapacityInfo {
  hasCapacity: boolean;
  currentAgents: number;
  maxAgents: number;
  branchName: string | null;
}

/**
 * Running agent info returned by getRunningAgents()
 */
export interface RunningAgentInfo {
  featureId: string;
  projectPath: string;
  projectName: string;
  isAutoMode: boolean;
  model?: string;
  provider?: ModelProvider;
  title?: string;
  description?: string;
  branchName?: string;
}

/**
 * Orphaned feature info returned by detectOrphanedFeatures()
 */
export interface OrphanedFeatureInfo {
  feature: Feature;
  missingBranch: string;
}
