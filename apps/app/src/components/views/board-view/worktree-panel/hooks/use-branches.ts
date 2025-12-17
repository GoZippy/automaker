"use client";

import { useState, useCallback } from "react";
import { getElectronAPI } from "@/lib/electron";
import type { BranchInfo } from "../types";

export function useBranches() {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [aheadCount, setAheadCount] = useState(0);
  const [behindCount, setBehindCount] = useState(0);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");

  const fetchBranches = useCallback(async (worktreePath: string) => {
    setIsLoadingBranches(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listBranches) {
        console.warn("List branches API not available");
        return;
      }
      const result = await api.worktree.listBranches(worktreePath);
      if (result.success && result.result) {
        setBranches(result.result.branches);
        setAheadCount(result.result.aheadCount || 0);
        setBehindCount(result.result.behindCount || 0);
      }
    } catch (error) {
      console.error("Failed to fetch branches:", error);
    } finally {
      setIsLoadingBranches(false);
    }
  }, []);

  const resetBranchFilter = useCallback(() => {
    setBranchFilter("");
  }, []);

  const filteredBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(branchFilter.toLowerCase())
  );

  return {
    branches,
    filteredBranches,
    aheadCount,
    behindCount,
    isLoadingBranches,
    branchFilter,
    setBranchFilter,
    resetBranchFilter,
    fetchBranches,
  };
}
