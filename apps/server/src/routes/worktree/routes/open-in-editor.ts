/**
 * POST /open-in-editor endpoint - Open a worktree directory in the default code editor
 * GET /default-editor endpoint - Get the name of the default code editor
 */

import type { Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { isAbsolute, join } from 'path';
import { access } from 'fs/promises';
import type { EditorInfo } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

const execFileAsync = promisify(execFile);

// Cache with TTL for editor detection
let cachedEditor: EditorInfo | null = null;
let cachedEditors: EditorInfo[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isCacheValid(): boolean {
  return Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

/**
 * Check if a CLI command exists in PATH
 * Uses execFile to avoid shell injection
 */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    await execFileAsync(whichCmd, [cmd]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a macOS app bundle exists and return the path if found
 * Uses Node fs methods instead of shell commands for safety
 */
async function findMacApp(appName: string): Promise<string | null> {
  if (process.platform !== 'darwin') return null;

  // Check /Applications first
  const systemAppPath = join('/Applications', `${appName}.app`);
  try {
    await access(systemAppPath);
    return systemAppPath;
  } catch {
    // Not in /Applications
  }

  // Check ~/Applications (used by JetBrains Toolbox and others)
  const userAppPath = join(homedir(), 'Applications', `${appName}.app`);
  try {
    await access(userAppPath);
    return userAppPath;
  } catch {
    return null;
  }
}

/**
 * Try to find an editor - checks CLI first, then macOS app bundle
 * Returns EditorInfo if found, null otherwise
 */
async function findEditor(
  name: string,
  cliCommand: string,
  macAppName: string
): Promise<EditorInfo | null> {
  // Try CLI command first
  if (await commandExists(cliCommand)) {
    return { name, command: cliCommand };
  }

  // Try macOS app bundle (checks /Applications and ~/Applications)
  if (process.platform === 'darwin') {
    const appPath = await findMacApp(macAppName);
    if (appPath) {
      // Use 'open -a' with full path for apps not in /Applications
      return { name, command: `open -a "${appPath}"` };
    }
  }

  return null;
}

async function detectAllEditors(): Promise<EditorInfo[]> {
  // Return cached result if still valid
  if (cachedEditors && isCacheValid()) {
    return cachedEditors;
  }

  const isMac = process.platform === 'darwin';

  // Check all editors in parallel for better performance
  const editorChecks = [
    findEditor('Cursor', 'cursor', 'Cursor'),
    findEditor('VS Code', 'code', 'Visual Studio Code'),
    findEditor('Zed', 'zed', 'Zed'),
    findEditor('Sublime Text', 'subl', 'Sublime Text'),
    findEditor('Windsurf', 'windsurf', 'Windsurf'),
    findEditor('Trae', 'trae', 'Trae'),
    findEditor('Rider', 'rider', 'Rider'),
    findEditor('WebStorm', 'webstorm', 'WebStorm'),
    // Xcode (macOS only) - will return null on other platforms
    isMac ? findEditor('Xcode', 'xed', 'Xcode') : Promise.resolve(null),
    findEditor('Android Studio', 'studio', 'Android Studio'),
    findEditor('Antigravity', 'agy', 'Antigravity'),
  ];

  // Wait for all checks to complete in parallel
  const results = await Promise.all(editorChecks);

  // Filter out null results (editors not found)
  const editors = results.filter((e): e is EditorInfo => e !== null);

  // Always add file manager as fallback
  const platform = process.platform;
  if (platform === 'darwin') {
    editors.push({ name: 'Finder', command: 'open' });
  } else if (platform === 'win32') {
    editors.push({ name: 'Explorer', command: 'explorer' });
  } else {
    editors.push({ name: 'File Manager', command: 'xdg-open' });
  }

  cachedEditors = editors;
  cacheTimestamp = Date.now();
  return editors;
}

/**
 * Detect the default (first available) code editor on the system
 */
async function detectDefaultEditor(): Promise<EditorInfo> {
  // Return cached result if available
  if (cachedEditor) {
    return cachedEditor;
  }

  // Get all editors and return the first one (highest priority)
  const editors = await detectAllEditors();
  cachedEditor = editors[0];
  return cachedEditor;
}

export function createGetAvailableEditorsHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const editors = await detectAllEditors();
      res.json({
        success: true,
        result: {
          editors,
        },
      });
    } catch (error) {
      logError(error, 'Get available editors failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createGetDefaultEditorHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const editor = await detectDefaultEditor();
      res.json({
        success: true,
        result: {
          editorName: editor.name,
          editorCommand: editor.command,
        },
      });
    } catch (error) {
      logError(error, 'Get default editor failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * Safely execute an editor command with a path argument
 * Uses execFile to prevent command injection
 */
async function safeOpenInEditor(command: string, targetPath: string): Promise<void> {
  // Handle 'open -a "AppPath"' style commands (macOS)
  if (command.startsWith('open -a ')) {
    const appPath = command.replace('open -a ', '').replace(/"/g, '');
    await execFileAsync('open', ['-a', appPath, targetPath]);
  } else {
    // Simple commands like 'code', 'cursor', 'zed', etc.
    await execFileAsync(command, [targetPath]);
  }
}

export function createOpenInEditorHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, editorCommand } = req.body as {
        worktreePath: string;
        editorCommand?: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Security: Validate that worktreePath is an absolute path
      if (!isAbsolute(worktreePath)) {
        res.status(400).json({
          success: false,
          error: 'worktreePath must be an absolute path',
        });
        return;
      }

      // Use specified editor command or detect default
      let editor: EditorInfo;
      if (editorCommand) {
        // Find the editor info from the available editors list
        const allEditors = await detectAllEditors();
        const specifiedEditor = allEditors.find((e) => e.command === editorCommand);
        editor = specifiedEditor ?? (await detectDefaultEditor());
      } else {
        editor = await detectDefaultEditor();
      }

      try {
        await safeOpenInEditor(editor.command, worktreePath);
        res.json({
          success: true,
          result: {
            message: `Opened ${worktreePath} in ${editor.name}`,
            editorName: editor.name,
          },
        });
      } catch (editorError) {
        // If the detected editor fails, try opening in default file manager as fallback
        const platform = process.platform;
        let fallbackCommand: string;
        let fallbackName: string;

        if (platform === 'darwin') {
          fallbackCommand = 'open';
          fallbackName = 'Finder';
        } else if (platform === 'win32') {
          fallbackCommand = 'explorer';
          fallbackName = 'Explorer';
        } else {
          fallbackCommand = 'xdg-open';
          fallbackName = 'File Manager';
        }

        await execFileAsync(fallbackCommand, [worktreePath]);
        res.json({
          success: true,
          result: {
            message: `Opened ${worktreePath} in ${fallbackName}`,
            editorName: fallbackName,
          },
        });
      }
    } catch (error) {
      logError(error, 'Open in editor failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
