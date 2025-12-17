"use client";

import { useCallback } from "react";
import { pathsEqual } from "@/lib/utils";
import type { WorktreeInfo, FeatureInfo } from "../types";

interface UseRunningFeaturesOptions {
  projectPath: string;
  runningFeatureIds: string[];
  features: FeatureInfo[];
  getWorktreeKey: (worktree: WorktreeInfo) => string;
}

export function useRunningFeatures({
  projectPath,
  runningFeatureIds,
  features,
  getWorktreeKey,
}: UseRunningFeaturesOptions) {
  const hasRunningFeatures = useCallback(
    (worktree: WorktreeInfo) => {
      if (runningFeatureIds.length === 0) return false;

      const worktreeKey = getWorktreeKey(worktree);

      return runningFeatureIds.some((featureId) => {
        const feature = features.find((f) => f.id === featureId);
        if (!feature) return false;

        if (feature.worktreePath) {
          if (worktree.isMain) {
            return pathsEqual(feature.worktreePath, projectPath);
          }
          return pathsEqual(feature.worktreePath, worktreeKey);
        }

        if (feature.branchName) {
          return worktree.branch === feature.branchName;
        }

        return worktree.isMain;
      });
    },
    [runningFeatureIds, features, projectPath, getWorktreeKey]
  );

  return {
    hasRunningFeatures,
  };
}
