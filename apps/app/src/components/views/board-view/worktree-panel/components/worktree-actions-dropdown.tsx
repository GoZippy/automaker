"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Trash2,
  MoreHorizontal,
  GitCommit,
  GitPullRequest,
  ExternalLink,
  Download,
  Upload,
  Play,
  Square,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorktreeInfo, DevServerInfo } from "../types";

interface WorktreeActionsDropdownProps {
  worktree: WorktreeInfo;
  isSelected: boolean;
  defaultEditorName: string;
  aheadCount: number;
  behindCount: number;
  isPulling: boolean;
  isPushing: boolean;
  isStartingDevServer: boolean;
  isDevServerRunning: boolean;
  devServerInfo?: DevServerInfo;
  onOpenChange: (open: boolean) => void;
  onPull: (worktree: WorktreeInfo) => void;
  onPush: (worktree: WorktreeInfo) => void;
  onOpenInEditor: (worktree: WorktreeInfo) => void;
  onCommit: (worktree: WorktreeInfo) => void;
  onCreatePR: (worktree: WorktreeInfo) => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onStartDevServer: (worktree: WorktreeInfo) => void;
  onStopDevServer: (worktree: WorktreeInfo) => void;
  onOpenDevServerUrl: (worktree: WorktreeInfo) => void;
}

export function WorktreeActionsDropdown({
  worktree,
  isSelected,
  defaultEditorName,
  aheadCount,
  behindCount,
  isPulling,
  isPushing,
  isStartingDevServer,
  isDevServerRunning,
  devServerInfo,
  onOpenChange,
  onPull,
  onPush,
  onOpenInEditor,
  onCommit,
  onCreatePR,
  onDeleteWorktree,
  onStartDevServer,
  onStopDevServer,
  onOpenDevServerUrl,
}: WorktreeActionsDropdownProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isSelected ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-7 w-7 p-0 rounded-l-none",
            isSelected && "bg-primary text-primary-foreground",
            !isSelected && "bg-secondary/50 hover:bg-secondary"
          )}
        >
          <MoreHorizontal className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {isDevServerRunning ? (
          <>
            <DropdownMenuLabel className="text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Dev Server Running (:{devServerInfo?.port})
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onOpenDevServerUrl(worktree)}
              className="text-xs"
            >
              <Globe className="w-3.5 h-3.5 mr-2" />
              Open in Browser
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onStopDevServer(worktree)}
              className="text-xs text-destructive focus:text-destructive"
            >
              <Square className="w-3.5 h-3.5 mr-2" />
              Stop Dev Server
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : (
          <>
            <DropdownMenuItem
              onClick={() => onStartDevServer(worktree)}
              disabled={isStartingDevServer}
              className="text-xs"
            >
              <Play
                className={cn(
                  "w-3.5 h-3.5 mr-2",
                  isStartingDevServer && "animate-pulse"
                )}
              />
              {isStartingDevServer ? "Starting..." : "Start Dev Server"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={() => onPull(worktree)}
          disabled={isPulling}
          className="text-xs"
        >
          <Download
            className={cn("w-3.5 h-3.5 mr-2", isPulling && "animate-pulse")}
          />
          {isPulling ? "Pulling..." : "Pull"}
          {behindCount > 0 && (
            <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">
              {behindCount} behind
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onPush(worktree)}
          disabled={isPushing || aheadCount === 0}
          className="text-xs"
        >
          <Upload
            className={cn("w-3.5 h-3.5 mr-2", isPushing && "animate-pulse")}
          />
          {isPushing ? "Pushing..." : "Push"}
          {aheadCount > 0 && (
            <span className="ml-auto text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
              {aheadCount} ahead
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onOpenInEditor(worktree)}
          className="text-xs"
        >
          <ExternalLink className="w-3.5 h-3.5 mr-2" />
          Open in {defaultEditorName}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {worktree.hasChanges && (
          <DropdownMenuItem onClick={() => onCommit(worktree)} className="text-xs">
            <GitCommit className="w-3.5 h-3.5 mr-2" />
            Commit Changes
          </DropdownMenuItem>
        )}
        {(worktree.branch !== "main" || worktree.hasChanges) && (
          <DropdownMenuItem onClick={() => onCreatePR(worktree)} className="text-xs">
            <GitPullRequest className="w-3.5 h-3.5 mr-2" />
            Create Pull Request
          </DropdownMenuItem>
        )}
        {!worktree.isMain && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteWorktree(worktree)}
              className="text-xs text-destructive focus:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Delete Worktree
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
