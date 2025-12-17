"use client";

import { useState, useCallback } from "react";
import { getElectronAPI } from "@/lib/electron";
import { toast } from "sonner";
import type { WorktreeInfo } from "../types";

interface UseWorktreeActionsOptions {
  fetchWorktrees: () => Promise<void>;
  fetchBranches: (worktreePath: string) => Promise<void>;
}

export function useWorktreeActions({
  fetchWorktrees,
  fetchBranches,
}: UseWorktreeActionsOptions) {
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const handleSwitchBranch = useCallback(
    async (worktree: WorktreeInfo, branchName: string) => {
      if (isSwitching || branchName === worktree.branch) return;
      setIsSwitching(true);
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.switchBranch) {
          toast.error("Switch branch API not available");
          return;
        }
        const result = await api.worktree.switchBranch(worktree.path, branchName);
        if (result.success && result.result) {
          toast.success(result.result.message);
          fetchWorktrees();
        } else {
          toast.error(result.error || "Failed to switch branch");
        }
      } catch (error) {
        console.error("Switch branch failed:", error);
        toast.error("Failed to switch branch");
      } finally {
        setIsSwitching(false);
      }
    },
    [isSwitching, fetchWorktrees]
  );

  const handlePull = useCallback(
    async (worktree: WorktreeInfo) => {
      if (isPulling) return;
      setIsPulling(true);
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.pull) {
          toast.error("Pull API not available");
          return;
        }
        const result = await api.worktree.pull(worktree.path);
        if (result.success && result.result) {
          toast.success(result.result.message);
          fetchWorktrees();
        } else {
          toast.error(result.error || "Failed to pull latest changes");
        }
      } catch (error) {
        console.error("Pull failed:", error);
        toast.error("Failed to pull latest changes");
      } finally {
        setIsPulling(false);
      }
    },
    [isPulling, fetchWorktrees]
  );

  const handlePush = useCallback(
    async (worktree: WorktreeInfo) => {
      if (isPushing) return;
      setIsPushing(true);
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.push) {
          toast.error("Push API not available");
          return;
        }
        const result = await api.worktree.push(worktree.path);
        if (result.success && result.result) {
          toast.success(result.result.message);
          fetchBranches(worktree.path);
          fetchWorktrees();
        } else {
          toast.error(result.error || "Failed to push changes");
        }
      } catch (error) {
        console.error("Push failed:", error);
        toast.error("Failed to push changes");
      } finally {
        setIsPushing(false);
      }
    },
    [isPushing, fetchBranches, fetchWorktrees]
  );

  const handleOpenInEditor = useCallback(async (worktree: WorktreeInfo) => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.openInEditor) {
        console.warn("Open in editor API not available");
        return;
      }
      const result = await api.worktree.openInEditor(worktree.path);
      if (result.success && result.result) {
        toast.success(result.result.message);
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Open in editor failed:", error);
    }
  }, []);

  return {
    isPulling,
    isPushing,
    isSwitching,
    isActivating,
    setIsActivating,
    handleSwitchBranch,
    handlePull,
    handlePush,
    handleOpenInEditor,
  };
}
