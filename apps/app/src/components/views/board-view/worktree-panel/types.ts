export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean;
  hasWorktree: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface DevServerInfo {
  worktreePath: string;
  port: number;
  url: string;
}

export interface FeatureInfo {
  id: string;
  worktreePath?: string;
  branchName?: string;
}

export interface WorktreePanelProps {
  projectPath: string;
  onCreateWorktree: () => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onCommit: (worktree: WorktreeInfo) => void;
  onCreatePR: (worktree: WorktreeInfo) => void;
  onCreateBranch: (worktree: WorktreeInfo) => void;
  runningFeatureIds?: string[];
  features?: FeatureInfo[];
  refreshTrigger?: number;
}
