import { useMemo, useCallback } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import { GraphCanvas } from './graph-canvas';
import { useBoardBackground } from '../board-view/hooks';

interface GraphViewProps {
  features: Feature[];
  runningAutoTasks: string[];
  currentWorktreePath: string | null;
  currentWorktreeBranch: string | null;
  projectPath: string | null;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onEditFeature: (feature: Feature) => void;
  onViewOutput: (feature: Feature) => void;
}

export function GraphView({
  features,
  runningAutoTasks,
  currentWorktreePath,
  currentWorktreeBranch,
  projectPath,
  searchQuery,
  onSearchQueryChange,
  onEditFeature,
  onViewOutput,
}: GraphViewProps) {
  const { currentProject } = useAppStore();

  // Use the same background hook as the board view
  const { backgroundImageStyle } = useBoardBackground({ currentProject });

  // Filter features by current worktree (same logic as board view)
  const filteredFeatures = useMemo(() => {
    const effectiveBranch = currentWorktreeBranch;

    return features.filter((f) => {
      // Skip completed features (they're in archive)
      if (f.status === 'completed') return false;

      const featureBranch = f.branchName;

      if (!featureBranch) {
        // No branch assigned - show only on primary worktree
        return currentWorktreePath === null;
      } else if (effectiveBranch === null) {
        // Viewing main but branch not initialized
        return projectPath
          ? useAppStore.getState().isPrimaryWorktreeBranch(projectPath, featureBranch)
          : false;
      } else {
        // Match by branch name
        return featureBranch === effectiveBranch;
      }
    });
  }, [features, currentWorktreePath, currentWorktreeBranch, projectPath]);

  // Handle node click - view details
  const handleNodeClick = useCallback(
    (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (feature) {
        onViewOutput(feature);
      }
    },
    [features, onViewOutput]
  );

  // Handle node double click - edit
  const handleNodeDoubleClick = useCallback(
    (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (feature) {
        onEditFeature(feature);
      }
    },
    [features, onEditFeature]
  );

  return (
    <div className="flex-1 overflow-hidden relative">
      <GraphCanvas
        features={filteredFeatures}
        runningAutoTasks={runningAutoTasks}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        backgroundStyle={backgroundImageStyle}
        className="h-full"
      />
    </div>
  );
}
