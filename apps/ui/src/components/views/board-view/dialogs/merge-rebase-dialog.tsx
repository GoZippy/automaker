import { useState, useEffect } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { GitMerge, RefreshCw, AlertTriangle, GitBranch } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import type { WorktreeInfo } from '../worktree-panel/types';

export type PullStrategy = 'merge' | 'rebase';

interface RemoteBranch {
  name: string;
  fullRef: string;
}

interface RemoteInfo {
  name: string;
  url: string;
  branches: RemoteBranch[];
}

const logger = createLogger('MergeRebaseDialog');

interface MergeRebaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  onConfirm: (
    worktree: WorktreeInfo,
    remoteBranch: string,
    strategy: PullStrategy
  ) => void | Promise<void>;
}

export function MergeRebaseDialog({
  open,
  onOpenChange,
  worktree,
  onConfirm,
}: MergeRebaseDialogProps) {
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedStrategy, setSelectedStrategy] = useState<PullStrategy>('merge');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch remotes when dialog opens
  useEffect(() => {
    if (open && worktree) {
      fetchRemotes();
    }
  }, [open, worktree]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedRemote('');
      setSelectedBranch('');
      setSelectedStrategy('merge');
      setError(null);
    }
  }, [open]);

  // Auto-select default remote and branch when remotes are loaded
  useEffect(() => {
    if (remotes.length > 0 && !selectedRemote) {
      // Default to 'origin' if available, otherwise first remote
      const defaultRemote = remotes.find((r) => r.name === 'origin') || remotes[0];
      setSelectedRemote(defaultRemote.name);

      // Try to select a matching branch name or default to main/master
      if (defaultRemote.branches.length > 0 && worktree) {
        const matchingBranch = defaultRemote.branches.find((b) => b.name === worktree.branch);
        const mainBranch = defaultRemote.branches.find(
          (b) => b.name === 'main' || b.name === 'master'
        );
        const defaultBranch = matchingBranch || mainBranch || defaultRemote.branches[0];
        setSelectedBranch(defaultBranch.fullRef);
      }
    }
  }, [remotes, selectedRemote, worktree]);

  // Update selected branch when remote changes
  useEffect(() => {
    if (selectedRemote && remotes.length > 0 && worktree) {
      const remote = remotes.find((r) => r.name === selectedRemote);
      if (remote && remote.branches.length > 0) {
        // Try to select a matching branch name or default to main/master
        const matchingBranch = remote.branches.find((b) => b.name === worktree.branch);
        const mainBranch = remote.branches.find((b) => b.name === 'main' || b.name === 'master');
        const defaultBranch = matchingBranch || mainBranch || remote.branches[0];
        setSelectedBranch(defaultBranch.fullRef);
      } else {
        setSelectedBranch('');
      }
    }
  }, [selectedRemote, remotes, worktree]);

  const fetchRemotes = async () => {
    if (!worktree) return;

    setIsLoading(true);
    setError(null);

    try {
      const api = getHttpApiClient();
      const result = await api.worktree.listRemotes(worktree.path);

      if (result.success && result.result) {
        setRemotes(result.result.remotes);
        if (result.result.remotes.length === 0) {
          setError('No remotes found in this repository');
        }
      } else {
        setError(result.error || 'Failed to fetch remotes');
      }
    } catch (err) {
      logger.error('Failed to fetch remotes:', err);
      setError('Failed to fetch remotes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!worktree) return;

    setIsRefreshing(true);
    setError(null);

    try {
      const api = getHttpApiClient();
      const result = await api.worktree.listRemotes(worktree.path);

      if (result.success && result.result) {
        setRemotes(result.result.remotes);
        toast.success('Remotes refreshed');
      } else {
        toast.error(result.error || 'Failed to refresh remotes');
      }
    } catch (err) {
      logger.error('Failed to refresh remotes:', err);
      toast.error('Failed to refresh remotes');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConfirm = () => {
    if (!worktree || !selectedBranch) return;
    onConfirm(worktree, selectedBranch, selectedStrategy);
    onOpenChange(false);
  };

  const selectedRemoteData = remotes.find((r) => r.name === selectedRemote);
  const branches = selectedRemoteData?.branches || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-purple-500" />
            Merge & Rebase
          </DialogTitle>
          <DialogDescription>
            Select a remote branch to merge or rebase with{' '}
            <span className="font-mono text-foreground">
              {worktree?.branch || 'current branch'}
            </span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={fetchRemotes}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="remote-select">Remote</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="h-6 px-2 text-xs"
                >
                  {isRefreshing ? (
                    <Spinner size="xs" className="mr-1" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Refresh
                </Button>
              </div>
              <Select value={selectedRemote} onValueChange={setSelectedRemote}>
                <SelectTrigger id="remote-select">
                  <SelectValue placeholder="Select a remote" />
                </SelectTrigger>
                <SelectContent>
                  {remotes.map((remote) => (
                    <SelectItem
                      key={remote.name}
                      value={remote.name}
                      description={
                        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {remote.url}
                        </span>
                      }
                    >
                      <span className="font-medium">{remote.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="branch-select">Branch</Label>
              <Select
                value={selectedBranch}
                onValueChange={setSelectedBranch}
                disabled={!selectedRemote || branches.length === 0}
              >
                <SelectTrigger id="branch-select">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{selectedRemote} branches</SelectLabel>
                    {branches.map((branch) => (
                      <SelectItem key={branch.fullRef} value={branch.fullRef}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {selectedRemote && branches.length === 0 && (
                <p className="text-sm text-muted-foreground">No branches found for this remote</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="strategy-select">Strategy</Label>
              <Select
                value={selectedStrategy}
                onValueChange={(value) => setSelectedStrategy(value as PullStrategy)}
              >
                <SelectTrigger id="strategy-select">
                  <SelectValue placeholder="Select a strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="merge"
                    description={
                      <span className="text-xs text-muted-foreground">
                        Creates a merge commit preserving history
                      </span>
                    }
                  >
                    <span className="flex items-center gap-2">
                      <GitMerge className="w-3.5 h-3.5 text-purple-500" />
                      <span className="font-medium">Merge</span>
                    </span>
                  </SelectItem>
                  <SelectItem
                    value="rebase"
                    description={
                      <span className="text-xs text-muted-foreground">
                        Replays commits on top for linear history
                      </span>
                    }
                  >
                    <span className="flex items-center gap-2">
                      <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                      <span className="font-medium">Rebase</span>
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedBranch && (
              <div className="mt-2 p-3 rounded-md bg-muted/50 border border-border">
                <p className="text-sm text-muted-foreground">
                  This will create a feature task to{' '}
                  {selectedStrategy === 'rebase' ? (
                    <>
                      rebase <span className="font-mono text-foreground">{worktree?.branch}</span>{' '}
                      onto <span className="font-mono text-foreground">{selectedBranch}</span>
                    </>
                  ) : (
                    <>
                      merge <span className="font-mono text-foreground">{selectedBranch}</span> into{' '}
                      <span className="font-mono text-foreground">{worktree?.branch}</span>
                    </>
                  )}{' '}
                  and resolve any conflicts.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedBranch || isLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <GitMerge className="w-4 h-4 mr-2" />
            Merge & Rebase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
