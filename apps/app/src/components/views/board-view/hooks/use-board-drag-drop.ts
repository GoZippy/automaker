import { useState, useCallback } from "react";
import { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { Feature } from "@/store/app-store";
import { useAppStore } from "@/store/app-store";
import { toast } from "sonner";
import { COLUMNS, ColumnId } from "../constants";

interface UseBoardDragDropProps {
  features: Feature[];
  currentProject: { path: string; id: string } | null;
  runningAutoTasks: string[];
  persistFeatureUpdate: (
    featureId: string,
    updates: Partial<Feature>
  ) => Promise<void>;
  handleStartImplementation: (feature: Feature) => Promise<boolean>;
  currentWorktreePath: string | null; // Currently selected worktree path
  projectPath: string | null; // Main project path
}

export function useBoardDragDrop({
  features,
  currentProject,
  runningAutoTasks,
  persistFeatureUpdate,
  handleStartImplementation,
  currentWorktreePath,
  projectPath,
}: UseBoardDragDropProps) {
  const [activeFeature, setActiveFeature] = useState<Feature | null>(null);
  const { moveFeature } = useAppStore();

  // Determine the effective worktree path for assigning to features
  const effectiveWorktreePath = currentWorktreePath || projectPath;

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const feature = features.find((f) => f.id === active.id);
      if (feature) {
        setActiveFeature(feature);
      }
    },
    [features]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveFeature(null);

      if (!over) return;

      const featureId = active.id as string;
      const overId = over.id as string;

      // Find the feature being dragged
      const draggedFeature = features.find((f) => f.id === featureId);
      if (!draggedFeature) return;

      // Check if this is a running task (non-skipTests, TDD)
      const isRunningTask = runningAutoTasks.includes(featureId);

      // Determine if dragging is allowed based on status and skipTests
      // - Backlog items can always be dragged
      // - waiting_approval items can always be dragged (to allow manual verification via drag)
      // - verified items can always be dragged (to allow moving back to waiting_approval)
      // - skipTests (non-TDD) items can be dragged between in_progress and verified
      // - Non-skipTests (TDD) items that are in progress cannot be dragged (they are running)
      if (
        draggedFeature.status !== "backlog" &&
        draggedFeature.status !== "waiting_approval" &&
        draggedFeature.status !== "verified"
      ) {
        // Only allow dragging in_progress if it's a skipTests feature and not currently running
        if (!draggedFeature.skipTests || isRunningTask) {
          console.log(
            "[Board] Cannot drag feature - TDD feature or currently running"
          );
          return;
        }
      }

      let targetStatus: ColumnId | null = null;

      // Check if we dropped on a column
      const column = COLUMNS.find((c) => c.id === overId);
      if (column) {
        targetStatus = column.id;
      } else {
        // Dropped on another feature - find its column
        const overFeature = features.find((f) => f.id === overId);
        if (overFeature) {
          targetStatus = overFeature.status;
        }
      }

      if (!targetStatus) return;

      // Same column, nothing to do
      if (targetStatus === draggedFeature.status) return;

      // Handle different drag scenarios
      if (draggedFeature.status === "backlog") {
        // From backlog
        if (targetStatus === "in_progress") {
          // Assign the current worktree to this feature when moving to in_progress
          if (effectiveWorktreePath) {
            await persistFeatureUpdate(featureId, { worktreePath: effectiveWorktreePath });
          }
          // Use helper function to handle concurrency check and start implementation
          await handleStartImplementation(draggedFeature);
        } else {
          moveFeature(featureId, targetStatus);
          persistFeatureUpdate(featureId, { status: targetStatus });
        }
      } else if (draggedFeature.status === "waiting_approval") {
        // waiting_approval features can be dragged to verified for manual verification
        // NOTE: This check must come BEFORE skipTests check because waiting_approval
        // features often have skipTests=true, and we want status-based handling first
        if (targetStatus === "verified") {
          moveFeature(featureId, "verified");
          // Clear justFinishedAt timestamp when manually verifying via drag
          persistFeatureUpdate(featureId, {
            status: "verified",
            justFinishedAt: undefined,
          });
          toast.success("Feature verified", {
            description: `Manually verified: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? "..." : ""}`,
          });
        } else if (targetStatus === "backlog") {
          // Allow moving waiting_approval cards back to backlog
          moveFeature(featureId, "backlog");
          // Clear justFinishedAt timestamp and worktreePath when moving back to backlog
          persistFeatureUpdate(featureId, {
            status: "backlog",
            justFinishedAt: undefined,
            worktreePath: undefined,
          });
          toast.info("Feature moved to backlog", {
            description: `Moved to Backlog: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? "..." : ""}`,
          });
        }
      } else if (draggedFeature.skipTests) {
        // skipTests feature being moved between in_progress and verified
        if (
          targetStatus === "verified" &&
          draggedFeature.status === "in_progress"
        ) {
          // Manual verify via drag
          moveFeature(featureId, "verified");
          persistFeatureUpdate(featureId, { status: "verified" });
          toast.success("Feature verified", {
            description: `Marked as verified: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? "..." : ""}`,
          });
        } else if (
          targetStatus === "waiting_approval" &&
          draggedFeature.status === "verified"
        ) {
          // Move verified feature back to waiting_approval
          moveFeature(featureId, "waiting_approval");
          persistFeatureUpdate(featureId, { status: "waiting_approval" });
          toast.info("Feature moved back", {
            description: `Moved back to Waiting Approval: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? "..." : ""}`,
          });
        } else if (targetStatus === "backlog") {
          // Allow moving skipTests cards back to backlog
          moveFeature(featureId, "backlog");
          // Clear worktreePath when moving back to backlog
          persistFeatureUpdate(featureId, { status: "backlog", worktreePath: undefined });
          toast.info("Feature moved to backlog", {
            description: `Moved to Backlog: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? "..." : ""}`,
          });
        }
      } else if (draggedFeature.status === "verified") {
        // Handle verified TDD (non-skipTests) features being moved back
        if (targetStatus === "waiting_approval") {
          // Move verified feature back to waiting_approval
          moveFeature(featureId, "waiting_approval");
          persistFeatureUpdate(featureId, { status: "waiting_approval" });
          toast.info("Feature moved back", {
            description: `Moved back to Waiting Approval: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? "..." : ""}`,
          });
        } else if (targetStatus === "backlog") {
          // Allow moving verified cards back to backlog
          moveFeature(featureId, "backlog");
          // Clear worktreePath when moving back to backlog
          persistFeatureUpdate(featureId, { status: "backlog", worktreePath: undefined });
          toast.info("Feature moved to backlog", {
            description: `Moved to Backlog: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? "..." : ""}`,
          });
        }
      }
    },
    [
      features,
      runningAutoTasks,
      moveFeature,
      persistFeatureUpdate,
      handleStartImplementation,
      effectiveWorktreePath,
    ]
  );

  return {
    activeFeature,
    handleDragStart,
    handleDragEnd,
  };
}
