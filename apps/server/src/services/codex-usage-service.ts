import { spawn } from 'child_process';
import * as os from 'os';

export interface CodexRateLimitWindow {
  limit: number;
  used: number;
  remaining: number;
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number;
}

export interface CodexCreditsSnapshot {
  balance?: string;
  unlimited?: boolean;
  hasCredits?: boolean;
}

export type CodexPlanType = 'free' | 'plus' | 'pro' | 'team' | 'enterprise' | 'edu' | 'unknown';

export interface CodexUsageData {
  rateLimits: {
    primary?: CodexRateLimitWindow;
    secondary?: CodexRateLimitWindow;
    credits?: CodexCreditsSnapshot;
    planType?: CodexPlanType;
  } | null;
  lastUpdated: string;
}

/**
 * Codex Usage Service
 *
 * Unlike Claude Code CLI which provides a `/usage` command, Codex CLI
 * does not expose usage statistics directly. This service returns a
 * clear message explaining this limitation.
 *
 * Future enhancement: Could query OpenAI API headers for rate limit info.
 */
export class CodexUsageService {
  private codexBinary = 'codex';
  private isWindows = os.platform() === 'win32';

  /**
   * Check if Codex CLI is available on the system
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkCmd = this.isWindows ? 'where' : 'which';
      const proc = spawn(checkCmd, [this.codexBinary]);
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Attempt to fetch usage data
   *
   * Note: Codex CLI doesn't provide usage statistics like Claude Code does.
   * This method returns an error explaining this limitation.
   */
  async fetchUsageData(): Promise<CodexUsageData> {
    // Check authentication status first
    const isAuthenticated = await this.checkAuthentication();

    if (!isAuthenticated) {
      throw new Error("Codex is not authenticated. Please run 'codex login' to authenticate.");
    }

    // Codex CLI doesn't provide a usage command
    // Return an error that will be caught and displayed
    throw new Error(
      'Codex usage statistics are not available. Unlike Claude Code, the Codex CLI does not provide a built-in usage command. ' +
        'Usage limits are enforced by OpenAI but cannot be queried via the CLI. ' +
        'Check your OpenAI dashboard at https://platform.openai.com/usage for detailed usage information.'
    );
  }

  /**
   * Check if Codex is authenticated
   */
  private async checkAuthentication(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.codexBinary, ['login', 'status'], {
        env: {
          ...process.env,
          TERM: 'dumb', // Avoid interactive output
        },
      });

      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        // Check if output indicates logged in
        const isLoggedIn = output.toLowerCase().includes('logged in');
        resolve(code === 0 && isLoggedIn);
      });

      proc.on('error', () => {
        resolve(false);
      });
    });
  }
}
