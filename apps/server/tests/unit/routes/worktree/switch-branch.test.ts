import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response } from 'express';
import { createMockExpressContext } from '../../../utils/mocks.js';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: vi.fn(),
  };
});

vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return {
    ...actual,
    promisify: (fn: unknown) => fn,
  };
});

import { execFile } from 'child_process';
import { createSwitchBranchHandler } from '@/routes/worktree/routes/switch-branch.js';

const mockExecFile = execFile as Mock;

describe('switch-branch route', () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
  });

  it('should allow switching when only untracked files exist', async () => {
    req.body = {
      worktreePath: '/repo/path',
      branchName: 'feature/test',
    };

    mockExecFile.mockImplementation(async (file: string, args: string[]) => {
      const command = `${file} ${args.join(' ')}`;
      if (command === 'git rev-parse --abbrev-ref HEAD') {
        return { stdout: 'main\n', stderr: '' };
      }
      if (command === 'git rev-parse --verify feature/test') {
        return { stdout: 'abc123\n', stderr: '' };
      }
      if (command === 'git branch -r --format=%(refname:short)') {
        return { stdout: '', stderr: '' };
      }
      if (command === 'git status --porcelain') {
        return { stdout: '?? .automaker/\n?? notes.txt\n', stderr: '' };
      }
      if (command === 'git checkout feature/test') {
        return { stdout: '', stderr: '' };
      }
      if (command === 'git fetch --all --quiet') {
        return { stdout: '', stderr: '' };
      }
      if (command === 'git stash list') {
        return { stdout: '', stderr: '' };
      }
      if (command.startsWith('git stash push')) {
        return { stdout: '', stderr: '' };
      }
      if (command === 'git stash pop') {
        return { stdout: '', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    const handler = createSwitchBranchHandler();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      result: {
        previousBranch: 'main',
        currentBranch: 'feature/test',
        message: "Switched to branch 'feature/test'",
        hasConflicts: false,
        stashedChanges: false,
      },
    });
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['checkout', 'feature/test'],
      expect.objectContaining({ cwd: '/repo/path' })
    );
  });

  it('should stash changes and switch when tracked files are modified', async () => {
    req.body = {
      worktreePath: '/repo/path',
      branchName: 'feature/test',
    };

    let stashListCallCount = 0;

    mockExecFile.mockImplementation(async (file: string, args: string[]) => {
      const command = `${file} ${args.join(' ')}`;
      if (command === 'git rev-parse --abbrev-ref HEAD') {
        return { stdout: 'main\n', stderr: '' };
      }
      if (command === 'git rev-parse --verify feature/test') {
        return { stdout: 'abc123\n', stderr: '' };
      }
      if (command === 'git status --porcelain') {
        return { stdout: ' M src/index.ts\n?? notes.txt\n', stderr: '' };
      }
      if (command === 'git branch -r --format=%(refname:short)') {
        return { stdout: '', stderr: '' };
      }
      if (command === 'git stash list') {
        stashListCallCount++;
        if (stashListCallCount === 1) {
          return { stdout: '', stderr: '' };
        }
        return { stdout: 'stash@{0}: automaker-branch-switch\n', stderr: '' };
      }
      if (command.startsWith('git stash push')) {
        return { stdout: '', stderr: '' };
      }
      if (command === 'git checkout feature/test') {
        return { stdout: '', stderr: '' };
      }
      if (command === 'git fetch --all --quiet') {
        return { stdout: '', stderr: '' };
      }
      if (command === 'git stash pop') {
        return { stdout: 'Already applied.\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    const handler = createSwitchBranchHandler();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      result: {
        previousBranch: 'main',
        currentBranch: 'feature/test',
        message: "Switched to branch 'feature/test' (local changes stashed and reapplied)",
        hasConflicts: false,
        stashedChanges: true,
      },
    });
  });
});
