import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, GitBranchPlus, Globe, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

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
  const [baseBranchPopoverOpen, setBaseBranchPopoverOpen] = useState(false);
  const baseBranchTriggerRef = useRef<HTMLButtonElement>(null);
  const [baseBranchTriggerWidth, setBaseBranchTriggerWidth] = useState<number>(0);

  const fetchBranches = useCallback(async () => {
    if (!worktree) return;

    setIsLoadingBranches(true);

    try {
      const api = getHttpApiClient();
      const result = await api.worktree.listBranches(worktree.path, true);

      if (result.success && result.result) {
        setBranches(result.result.branches);
        // Only set the default base branch if no branch is currently selected,
        // or if the currently selected branch is no longer present in the fetched list
        const branchNames = result.result.branches.map((b: BranchInfo) => b.name);
        if (!baseBranch || !branchNames.includes(baseBranch)) {
          if (result.result.currentBranch) {
            setBaseBranch(result.result.currentBranch);
          }
        }
      }
    } catch (err) {
      logger.error('Failed to fetch branches:', err);
    } finally {
      setIsLoadingBranches(false);
    }
  }, [worktree, baseBranch]);

  // Reset state and fetch branches when dialog opens
  useEffect(() => {
    if (open) {
      setBranchName('');
      setBaseBranch('');
      setError(null);
      setBranches([]);
      setBaseBranchPopoverOpen(false);
      fetchBranches();
    }
  }, [open, fetchBranches]);

  // Track trigger width for popover sizing
  useEffect(() => {
    const el = baseBranchTriggerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setBaseBranchTriggerWidth(el.offsetWidth);
    });
    observer.observe(el);
    setBaseBranchTriggerWidth(el.offsetWidth);
    return () => observer.disconnect();
  }, [baseBranchPopoverOpen]);

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
  const localBranches = useMemo(() => branches.filter((b) => !b.isRemote), [branches]);
  const remoteBranches = useMemo(() => branches.filter((b) => b.isRemote), [branches]);

  // Display label for the selected base branch
  const baseBranchDisplayLabel = useMemo(() => {
    if (!baseBranch) return null;
    const found = branches.find((b) => b.name === baseBranch);
    if (!found) return baseBranch;
    return found.isCurrent ? `${found.name} (current)` : found.name;
  }, [baseBranch, branches]);

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
              <Popover open={baseBranchPopoverOpen} onOpenChange={setBaseBranchPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="base-branch"
                    ref={baseBranchTriggerRef}
                    variant="outline"
                    role="combobox"
                    aria-expanded={baseBranchPopoverOpen}
                    disabled={isCreating}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate text-sm">
                      {baseBranchDisplayLabel ?? (
                        <span className="text-muted-foreground">Select base branch</span>
                      )}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="p-0"
                  style={{ width: Math.max(baseBranchTriggerWidth, 200) }}
                  onWheel={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                >
                  <Command shouldFilter={true}>
                    <CommandInput placeholder="Filter branches..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>No matching branches</CommandEmpty>
                      {localBranches.length > 0 && (
                        <CommandGroup heading="Local Branches">
                          {localBranches.map((branch) => (
                            <CommandItem
                              key={branch.name}
                              value={branch.name}
                              onSelect={(value) => {
                                setBaseBranch(value);
                                setBaseBranchPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4 shrink-0',
                                  baseBranch === branch.name ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <span className={cn('truncate', branch.isCurrent && 'font-medium')}>
                                {branch.name}
                              </span>
                              {branch.isCurrent && (
                                <span className="ml-1.5 text-xs text-muted-foreground shrink-0">
                                  (current)
                                </span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                      {remoteBranches.length > 0 && (
                        <>
                          {localBranches.length > 0 && <CommandSeparator />}
                          <CommandGroup heading="Remote Branches">
                            {remoteBranches.map((branch) => (
                              <CommandItem
                                key={branch.name}
                                value={branch.name}
                                onSelect={(value) => {
                                  setBaseBranch(value);
                                  setBaseBranchPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4 shrink-0',
                                    baseBranch === branch.name ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <Globe className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{branch.name}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
