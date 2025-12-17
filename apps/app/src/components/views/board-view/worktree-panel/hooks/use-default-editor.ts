"use client";

import { useState, useEffect, useCallback } from "react";
import { getElectronAPI } from "@/lib/electron";

export function useDefaultEditor() {
  const [defaultEditorName, setDefaultEditorName] = useState<string>("Editor");

  const fetchDefaultEditor = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.getDefaultEditor) {
        return;
      }
      const result = await api.worktree.getDefaultEditor();
      if (result.success && result.result?.editorName) {
        setDefaultEditorName(result.result.editorName);
      }
    } catch (error) {
      console.error("Failed to fetch default editor:", error);
    }
  }, []);

  useEffect(() => {
    fetchDefaultEditor();
  }, [fetchDefaultEditor]);

  return {
    defaultEditorName,
  };
}
