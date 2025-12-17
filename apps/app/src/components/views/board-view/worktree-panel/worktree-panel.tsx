"use client";

import { Button } from "@/components/ui/button";
import { GitBranch, Plus, RefreshCw } from "lucide-react";
import { cn, pathsEqual } from "@/lib/utils";
import type { WorktreePanelProps, WorktreeInfo } from "./types";
import {
  useWorktrees,
  useDevServers,
  useBranches,
  useWorktreeActions,
  useDefaultEditor,
  useRunningFeatures,
} from "./hooks";
import { WorktreeTab } from "./components";

export function WorktreePanel({
  projectPath,
  onCreateWorktree,
  onDeleteWorktree,
  onCommit,
  onCreatePR,
  onCreateBranch,
  runningFeatureIds = [],
  features = [],
  refreshTrigger = 0,
}: WorktreePanelProps) {
  const {
    isLoading,
    worktrees,
    currentWorktree,
    currentWorktreePath,
    useWorktreesEnabled,
    fetchWorktrees,
    handleSelectWorktree,
  } = useWorktrees({ projectPath, refreshTrigger });

  const {
    isStartingDevServer,
    getWorktreeKey,
    isDevServerRunning,
    getDevServerInfo,
    handleStartDevServer,
    handleStopDevServer,
    handleOpenDevServerUrl,
  } = useDevServers({ projectPath });

  const {
    branches,
    filteredBranches,
    aheadCount,
    behindCount,
    isLoadingBranches,
    branchFilter,
    setBranchFilter,
    resetBranchFilter,
    fetchBranches,
  } = useBranches();

  const {
    isPulling,
    isPushing,
    isSwitching,
    isActivating,
    handleSwitchBranch,
    handlePull,
    handlePush,
    handleOpenInEditor,
  } = useWorktreeActions({
    fetchWorktrees,
    fetchBranches,
  });

  const { defaultEditorName } = useDefaultEditor();

  const { hasRunningFeatures } = useRunningFeatures({
    projectPath,
    runningFeatureIds,
    features,
    getWorktreeKey,
  });

  const isWorktreeSelected = (worktree: WorktreeInfo) => {
    return worktree.isMain
      ? currentWorktree === null ||
          currentWorktree === undefined ||
          currentWorktree.path === null
      : pathsEqual(worktree.path, currentWorktreePath);
  };

  const handleBranchDropdownOpenChange = (worktree: WorktreeInfo) => (open: boolean) => {
    if (open) {
      fetchBranches(worktree.path);
      resetBranchFilter();
    }
  };

  const handleActionsDropdownOpenChange = (worktree: WorktreeInfo) => (open: boolean) => {
    if (open) {
      fetchBranches(worktree.path);
    }
  };

  if (!useWorktreesEnabled) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-glass/50 backdrop-blur-sm">
      <GitBranch className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground mr-2">Branch:</span>

      <div className="flex items-center gap-1 flex-wrap">
        {worktrees.map((worktree) => (
          <WorktreeTab
            key={worktree.path}
            worktree={worktree}
            isSelected={isWorktreeSelected(worktree)}
            isRunning={hasRunningFeatures(worktree)}
            isActivating={isActivating}
            isDevServerRunning={isDevServerRunning(worktree)}
            devServerInfo={getDevServerInfo(worktree)}
            defaultEditorName={defaultEditorName}
            branches={branches}
            filteredBranches={filteredBranches}
            branchFilter={branchFilter}
            isLoadingBranches={isLoadingBranches}
            isSwitching={isSwitching}
            isPulling={isPulling}
            isPushing={isPushing}
            isStartingDevServer={isStartingDevServer}
            aheadCount={aheadCount}
            behindCount={behindCount}
            onSelectWorktree={handleSelectWorktree}
            onBranchDropdownOpenChange={handleBranchDropdownOpenChange(worktree)}
            onActionsDropdownOpenChange={handleActionsDropdownOpenChange(worktree)}
            onBranchFilterChange={setBranchFilter}
            onSwitchBranch={handleSwitchBranch}
            onCreateBranch={onCreateBranch}
            onPull={handlePull}
            onPush={handlePush}
            onOpenInEditor={handleOpenInEditor}
            onCommit={onCommit}
            onCreatePR={onCreatePR}
            onDeleteWorktree={onDeleteWorktree}
            onStartDevServer={handleStartDevServer}
            onStopDevServer={handleStopDevServer}
            onOpenDevServerUrl={handleOpenDevServerUrl}
          />
        ))}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={onCreateWorktree}
          title="Create new worktree"
        >
          <Plus className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={fetchWorktrees}
          disabled={isLoading}
          title="Refresh worktrees"
        >
          <RefreshCw
            className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
          />
        </Button>
      </div>
    </div>
  );
}
