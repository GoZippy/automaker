"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw, Globe, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorktreeInfo, BranchInfo, DevServerInfo } from "../types";
import { BranchSwitchDropdown } from "./branch-switch-dropdown";
import { WorktreeActionsDropdown } from "./worktree-actions-dropdown";

interface WorktreeTabProps {
  worktree: WorktreeInfo;
  isSelected: boolean;
  isRunning: boolean;
  isActivating: boolean;
  isDevServerRunning: boolean;
  devServerInfo?: DevServerInfo;
  defaultEditorName: string;
  branches: BranchInfo[];
  filteredBranches: BranchInfo[];
  branchFilter: string;
  isLoadingBranches: boolean;
  isSwitching: boolean;
  isPulling: boolean;
  isPushing: boolean;
  isStartingDevServer: boolean;
  aheadCount: number;
  behindCount: number;
  onSelectWorktree: (worktree: WorktreeInfo) => void;
  onBranchDropdownOpenChange: (open: boolean) => void;
  onActionsDropdownOpenChange: (open: boolean) => void;
  onBranchFilterChange: (value: string) => void;
  onSwitchBranch: (worktree: WorktreeInfo, branchName: string) => void;
  onCreateBranch: (worktree: WorktreeInfo) => void;
  onPull: (worktree: WorktreeInfo) => void;
  onPush: (worktree: WorktreeInfo) => void;
  onOpenInEditor: (worktree: WorktreeInfo) => void;
  onCommit: (worktree: WorktreeInfo) => void;
  onCreatePR: (worktree: WorktreeInfo) => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onStartDevServer: (worktree: WorktreeInfo) => void;
  onStopDevServer: (worktree: WorktreeInfo) => void;
  onOpenDevServerUrl: (worktree: WorktreeInfo) => void;
}

export function WorktreeTab({
  worktree,
  isSelected,
  isRunning,
  isActivating,
  isDevServerRunning,
  devServerInfo,
  defaultEditorName,
  branches,
  filteredBranches,
  branchFilter,
  isLoadingBranches,
  isSwitching,
  isPulling,
  isPushing,
  isStartingDevServer,
  aheadCount,
  behindCount,
  onSelectWorktree,
  onBranchDropdownOpenChange,
  onActionsDropdownOpenChange,
  onBranchFilterChange,
  onSwitchBranch,
  onCreateBranch,
  onPull,
  onPush,
  onOpenInEditor,
  onCommit,
  onCreatePR,
  onDeleteWorktree,
  onStartDevServer,
  onStopDevServer,
  onOpenDevServerUrl,
}: WorktreeTabProps) {
  return (
    <div className="flex items-center">
      {worktree.isMain ? (
        <>
          <Button
            variant={isSelected ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 px-3 text-xs font-mono gap-1.5 border-r-0 rounded-l-md rounded-r-none",
              isSelected && "bg-primary text-primary-foreground",
              !isSelected && "bg-secondary/50 hover:bg-secondary"
            )}
            onClick={() => onSelectWorktree(worktree)}
            disabled={isActivating}
            title="Click to preview main"
          >
            {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
            {isActivating && !isRunning && (
              <RefreshCw className="w-3 h-3 animate-spin" />
            )}
            {worktree.branch}
            {worktree.hasChanges && (
              <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
                {worktree.changedFilesCount}
              </span>
            )}
          </Button>
          <BranchSwitchDropdown
            worktree={worktree}
            isSelected={isSelected}
            branches={branches}
            filteredBranches={filteredBranches}
            branchFilter={branchFilter}
            isLoadingBranches={isLoadingBranches}
            isSwitching={isSwitching}
            onOpenChange={onBranchDropdownOpenChange}
            onFilterChange={onBranchFilterChange}
            onSwitchBranch={onSwitchBranch}
            onCreateBranch={onCreateBranch}
          />
        </>
      ) : (
        <Button
          variant={isSelected ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-7 px-3 text-xs font-mono gap-1.5 rounded-l-md rounded-r-none border-r-0",
            isSelected && "bg-primary text-primary-foreground",
            !isSelected && "bg-secondary/50 hover:bg-secondary",
            !worktree.hasWorktree && !isSelected && "opacity-70"
          )}
          onClick={() => onSelectWorktree(worktree)}
          disabled={isActivating}
          title={
            worktree.hasWorktree
              ? "Click to switch to this worktree's branch"
              : "Click to switch to this branch"
          }
        >
          {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
          {isActivating && !isRunning && (
            <RefreshCw className="w-3 h-3 animate-spin" />
          )}
          {worktree.branch}
          {worktree.hasChanges && (
            <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
              {worktree.changedFilesCount}
            </span>
          )}
        </Button>
      )}

      {isDevServerRunning && (
        <Button
          variant={isSelected ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-7 w-7 p-0 rounded-none border-r-0",
            isSelected && "bg-primary text-primary-foreground",
            !isSelected && "bg-secondary/50 hover:bg-secondary",
            "text-green-500"
          )}
          onClick={() => onOpenDevServerUrl(worktree)}
          title={`Open dev server (port ${devServerInfo?.port})`}
        >
          <Globe className="w-3 h-3" />
        </Button>
      )}

      <WorktreeActionsDropdown
        worktree={worktree}
        isSelected={isSelected}
        defaultEditorName={defaultEditorName}
        aheadCount={aheadCount}
        behindCount={behindCount}
        isPulling={isPulling}
        isPushing={isPushing}
        isStartingDevServer={isStartingDevServer}
        isDevServerRunning={isDevServerRunning}
        devServerInfo={devServerInfo}
        onOpenChange={onActionsDropdownOpenChange}
        onPull={onPull}
        onPush={onPush}
        onOpenInEditor={onOpenInEditor}
        onCommit={onCommit}
        onCreatePR={onCreatePR}
        onDeleteWorktree={onDeleteWorktree}
        onStartDevServer={onStartDevServer}
        onStopDevServer={onStopDevServer}
        onOpenDevServerUrl={onOpenDevServerUrl}
      />
    </div>
  );
}
