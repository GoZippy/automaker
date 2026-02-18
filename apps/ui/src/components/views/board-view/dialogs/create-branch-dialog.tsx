import { useState, useEffect, useCallback } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { GitBranchPlus, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

const logger = createLogger('CreateBranchDialog');

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  onCreated: () => void;
}

export function CreateBranchDialog({
  open,
  onOpenChange,
  worktree,
  onCreated,
}: CreateBranchDialogProps) {
  const [branchName, setBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBranches = useCallback(async () => {
    if (!worktree) return;

    setIsLoadingBranches(true);

    try {
      const api = getHttpApiClient();
      const result = await api.worktree.listBranches(worktree.path, true);

      if (result.success && result.result) {
        setBranches(result.result.branches);
        // Default to current branch
        if (result.result.currentBranch) {
          setBaseBranch(result.result.currentBranch);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch branches:', err);
    } finally {
      setIsLoadingBranches(false);
    }
  }, [worktree]);

  // Reset state and fetch branches when dialog opens
  useEffect(() => {
    if (open) {
      setBranchName('');
      setBaseBranch('');
      setError(null);
      setBranches([]);
      fetchBranches();
    }
  }, [open, fetchBranches]);

  const handleCreate = async () => {
    if (!worktree || !branchName.trim()) return;

    // Basic validation
    const invalidChars = /[\s~^:?*[\]\\]/;
    if (invalidChars.test(branchName)) {
      setError('Branch name contains invalid characters');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.checkoutBranch) {
        toast.error('Branch API not available');
        return;
      }

      // Pass baseBranch if user selected one different from the current branch
      const selectedBase = baseBranch || undefined;
      const result = await api.worktree.checkoutBranch(
        worktree.path,
        branchName.trim(),
        selectedBase
      );

      if (result.success && result.result) {
        toast.success(result.result.message);
        onCreated();
        onOpenChange(false);
      } else {
        setError(result.error || 'Failed to create branch');
      }
    } catch (err) {
      logger.error('Create branch failed:', err);
      setError('Failed to create branch');
    } finally {
      setIsCreating(false);
    }
  };

  // Separate local and remote branches
  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranchPlus className="w-5 h-5" />
            Create New Branch
          </DialogTitle>
          <DialogDescription>Create a new branch from a base branch</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="branch-name">Branch Name</Label>
            <Input
              id="branch-name"
              placeholder="feature/my-new-feature"
              value={branchName}
              onChange={(e) => {
                setBranchName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && branchName.trim() && !isCreating) {
                  handleCreate();
                }
              }}
              disabled={isCreating}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="base-branch">Base Branch</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchBranches}
                disabled={isLoadingBranches || isCreating}
                className="h-6 px-2 text-xs"
              >
                {isLoadingBranches ? (
                  <Spinner size="xs" className="mr-1" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-1" />
                )}
                Refresh
              </Button>
            </div>
            {isLoadingBranches && branches.length === 0 ? (
              <div className="flex items-center justify-center py-3 border rounded-md border-input">
                <Spinner size="sm" className="mr-2" />
                <span className="text-sm text-muted-foreground">Loading branches...</span>
              </div>
            ) : (
              <Select value={baseBranch} onValueChange={setBaseBranch} disabled={isCreating}>
                <SelectTrigger id="base-branch">
                  <SelectValue placeholder="Select base branch" />
                </SelectTrigger>
                <SelectContent>
                  {localBranches.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Local Branches</SelectLabel>
                      {localBranches.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name}>
                          <span className={branch.isCurrent ? 'font-medium' : ''}>
                            {branch.name}
                            {branch.isCurrent ? ' (current)' : ''}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {remoteBranches.length > 0 && (
                    <>
                      {localBranches.length > 0 && <SelectSeparator />}
                      <SelectGroup>
                        <SelectLabel>Remote Branches</SelectLabel>
                        {remoteBranches.map((branch) => (
                          <SelectItem key={branch.name} value={branch.name}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                  {localBranches.length === 0 && remoteBranches.length === 0 && (
                    <SelectItem value="HEAD" disabled>
                      No branches found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!branchName.trim() || isCreating}>
            {isCreating ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creating...
              </>
            ) : (
              'Create Branch'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
