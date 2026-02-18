/**
 * WorktreeService - File-system operations for git worktrees
 *
 * Extracted from the worktree create route to centralise file-copy logic,
 * surface errors through an EventEmitter instead of swallowing them, and
 * make the behaviour testable in isolation.
 */

import path from 'path';
import fs from 'fs/promises';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';

/**
 * Error thrown when one or more file copy operations fail during
 * `copyConfiguredFiles`.  The caller can inspect `failures` for details.
 */
export class CopyFilesError extends Error {
  constructor(public readonly failures: Array<{ path: string; error: string }>) {
    super(`Failed to copy ${failures.length} file(s): ${failures.map((f) => f.path).join(', ')}`);
    this.name = 'CopyFilesError';
  }
}

/**
 * WorktreeService encapsulates file-system operations that run against
 * git worktrees (e.g. copying project-configured files into a new worktree).
 *
 * All operations emit typed events so the frontend can stream progress to the
 * user.  Errors are collected and surfaced to the caller rather than silently
 * swallowed.
 */
export class WorktreeService {
  /**
   * Copy files / directories listed in the project's `worktreeCopyFiles`
   * setting from `projectPath` into `worktreePath`.
   *
   * Security: paths containing `..` segments or absolute paths are rejected.
   *
   * Events emitted via `emitter`:
   * - `worktree:copy-files:copied`  – a file or directory was successfully copied
   * - `worktree:copy-files:skipped` – a source file was not found (ENOENT)
   * - `worktree:copy-files:failed`  – an unexpected error occurred copying a file
   *
   * @throws {CopyFilesError} if any copy operation fails for a reason other
   *   than ENOENT (missing source file).
   */
  async copyConfiguredFiles(
    projectPath: string,
    worktreePath: string,
    settingsService: SettingsService | undefined,
    emitter: EventEmitter
  ): Promise<void> {
    if (!settingsService) return;

    const projectSettings = await settingsService.getProjectSettings(projectPath);
    const copyFiles = projectSettings.worktreeCopyFiles;

    if (!copyFiles || copyFiles.length === 0) return;

    const failures: Array<{ path: string; error: string }> = [];

    for (const relativePath of copyFiles) {
      // Security: prevent path traversal
      const normalized = path.normalize(relativePath);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        const reason = 'Suspicious path rejected (traversal or absolute)';
        emitter.emit('worktree:copy-files:skipped', {
          path: relativePath,
          reason,
        });
        continue;
      }

      const sourcePath = path.join(projectPath, normalized);
      const destPath = path.join(worktreePath, normalized);

      try {
        // Check if source exists
        const stat = await fs.stat(sourcePath);

        // Ensure destination directory exists
        const destDir = path.dirname(destPath);
        await fs.mkdir(destDir, { recursive: true });

        if (stat.isDirectory()) {
          // Recursively copy directory
          await fs.cp(sourcePath, destPath, { recursive: true, force: true });
        } else {
          // Copy single file
          await fs.copyFile(sourcePath, destPath);
        }

        emitter.emit('worktree:copy-files:copied', {
          path: normalized,
          type: stat.isDirectory() ? 'directory' : 'file',
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          emitter.emit('worktree:copy-files:skipped', {
            path: normalized,
            reason: 'File not found in project root',
          });
        } else {
          const errorMessage = err instanceof Error ? err.message : String(err);
          emitter.emit('worktree:copy-files:failed', {
            path: normalized,
            error: errorMessage,
          });
          failures.push({ path: normalized, error: errorMessage });
        }
      }
    }

    if (failures.length > 0) {
      throw new CopyFilesError(failures);
    }
  }
}
