/**
 * UI Cache Store - Persisted UI State for Instant Restore
 *
 * This lightweight Zustand store persists critical UI state to localStorage
 * so that after a tab discard, the user sees their previous UI configuration
 * instantly without waiting for the server.
 *
 * This is NOT a replacement for the app-store or the API-first settings sync.
 * It's a fast cache layer that provides instant visual continuity during:
 * - Tab discard recovery
 * - Page reloads
 * - App restarts
 *
 * The app-store remains the source of truth. This cache is reconciled
 * when server settings are loaded (hydrateStoreFromSettings overwrites everything).
 *
 * Only stores UI-visual state that affects what the user sees immediately:
 * - Selected project ID (to restore board context)
 * - Sidebar state (open/closed, style)
 * - View preferences (board view mode, collapsed sections)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UICacheState {
  /** ID of the currently selected project */
  cachedProjectId: string | null;
  /** Whether sidebar is open */
  cachedSidebarOpen: boolean;
  /** Sidebar style (unified or discord) */
  cachedSidebarStyle: 'unified' | 'discord';
  /** Whether worktree panel is collapsed */
  cachedWorktreePanelCollapsed: boolean;
  /** Collapsed nav sections */
  cachedCollapsedNavSections: Record<string, boolean>;
}

interface UICacheActions {
  /** Update the cached UI state from the main app store */
  updateFromAppStore: (state: Partial<UICacheState>) => void;
}

const STORE_NAME = 'automaker-ui-cache';

export const useUICacheStore = create<UICacheState & UICacheActions>()(
  persist(
    (set) => ({
      cachedProjectId: null,
      cachedSidebarOpen: true,
      cachedSidebarStyle: 'unified',
      cachedWorktreePanelCollapsed: false,
      cachedCollapsedNavSections: {},

      updateFromAppStore: (state) => set(state),
    }),
    {
      name: STORE_NAME,
      version: 1,
      partialize: (state) => ({
        cachedProjectId: state.cachedProjectId,
        cachedSidebarOpen: state.cachedSidebarOpen,
        cachedSidebarStyle: state.cachedSidebarStyle,
        cachedWorktreePanelCollapsed: state.cachedWorktreePanelCollapsed,
        cachedCollapsedNavSections: state.cachedCollapsedNavSections,
      }),
    }
  )
);

/**
 * Sync critical UI state from the main app store to the UI cache.
 * Call this whenever the app store changes to keep the cache up to date.
 *
 * This is intentionally a function (not a hook) so it can be called
 * from store subscriptions without React.
 */
export function syncUICache(appState: {
  currentProject?: { id: string } | null;
  sidebarOpen?: boolean;
  sidebarStyle?: 'unified' | 'discord';
  worktreePanelCollapsed?: boolean;
  collapsedNavSections?: Record<string, boolean>;
}): void {
  useUICacheStore.getState().updateFromAppStore({
    cachedProjectId: appState.currentProject?.id ?? null,
    cachedSidebarOpen: appState.sidebarOpen ?? true,
    cachedSidebarStyle: appState.sidebarStyle ?? 'unified',
    cachedWorktreePanelCollapsed: appState.worktreePanelCollapsed ?? false,
    cachedCollapsedNavSections: appState.collapsedNavSections ?? {},
  });
}

/**
 * Restore cached UI state into the main app store.
 * Call this early during initialization — before server settings arrive —
 * so the user sees their previous UI layout instantly on tab discard recovery
 * or page reload, instead of a flash of default state.
 *
 * This is reconciled later when hydrateStoreFromSettings() overwrites
 * the app store with authoritative server data.
 *
 * @param appStoreSetState - The setState function from the app store (avoids circular import)
 */
export function restoreFromUICache(
  appStoreSetState: (state: Record<string, unknown>) => void
): boolean {
  const cache = useUICacheStore.getState();

  // Only restore if we have meaningful cached data (not just defaults)
  if (cache.cachedProjectId === null) {
    return false;
  }

  appStoreSetState({
    sidebarOpen: cache.cachedSidebarOpen,
    sidebarStyle: cache.cachedSidebarStyle,
    worktreePanelCollapsed: cache.cachedWorktreePanelCollapsed,
    collapsedNavSections: cache.cachedCollapsedNavSections,
  });

  return true;
}
