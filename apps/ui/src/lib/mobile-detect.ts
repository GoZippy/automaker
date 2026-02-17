/**
 * Mobile Detection Utility
 *
 * Provides a cached, non-reactive mobile detection for use outside React components.
 * Used by service worker registration, query client configuration, and other
 * non-component code that needs to know if the device is mobile.
 *
 * For React components, use the `useIsMobile()` hook from `hooks/use-media-query.ts`
 * instead, which responds to viewport changes reactively.
 */

/**
 * Cached mobile detection result.
 * Evaluated once on module load for consistent behavior across the app lifetime.
 * Uses both media query and user agent for reliability:
 * - Media query catches small desktop windows
 * - User agent catches mobile browsers at any viewport size
 * - Touch detection as supplementary signal
 */
export const isMobileDevice: boolean = (() => {
  if (typeof window === 'undefined') return false;

  // Check viewport width (consistent with useIsMobile hook's 768px breakpoint)
  const isSmallViewport = window.matchMedia('(max-width: 768px)').matches;

  // Check user agent for mobile devices
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  // Check for touch-primary device (most mobile devices)
  const isTouchPrimary = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Consider it mobile if viewport is small OR if it's a mobile UA with touch
  return isSmallViewport || (isMobileUA && isTouchPrimary);
})();

/**
 * Check if the device has a slow connection.
 * Uses the Network Information API when available.
 * Falls back to mobile detection as a heuristic.
 */
export function isSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;

  const connection = (
    navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        saveData?: boolean;
      };
    }
  ).connection;

  if (connection) {
    // Respect data saver mode
    if (connection.saveData) return true;
    // 2g and slow-2g are definitely slow
    if (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g') return true;
  }

  // On mobile without connection info, assume potentially slow
  return false;
}

/**
 * Multiplier for polling intervals on mobile.
 * Mobile devices benefit from less frequent polling to save battery and bandwidth.
 * Slow connections get an even larger multiplier.
 */
export function getMobilePollingMultiplier(): number {
  if (!isMobileDevice) return 1;
  if (isSlowConnection()) return 4;
  return 2;
}
