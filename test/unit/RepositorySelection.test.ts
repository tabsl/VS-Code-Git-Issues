import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import { RepositorySelection } from '../../src/git/RepositorySelection';
import { ProviderFactory } from '../../src/providers/ProviderFactory';
import type { DetectedRepository } from '../../src/git/RepositoryResolver';
import type { IssueProvider } from '../../src/providers/IssueProvider';

function repo(rootPath: string, platform: 'github' | 'gitlab' = 'github'): DetectedRepository {
  return {
    rootUri: { scheme: 'file', fsPath: rootPath, path: rootPath } as unknown as vscode.Uri,
    rootPath,
    displayName: rootPath.split('/').pop()!,
    remote: { platform, host: platform === 'github' ? 'github.com' : 'gitlab.example.com', owner: 'acme', repo: rootPath.split('/').pop()! },
    isVirtual: false,
  } as DetectedRepository;
}

function fileUri(p: string): vscode.Uri {
  return { scheme: 'file', fsPath: p, path: p } as unknown as vscode.Uri;
}

function memento(initial: Record<string, unknown> = {}): vscode.Memento {
  const store = new Map(Object.entries(initial));
  return {
    get: (k: string, def?: unknown) => (store.has(k) ? store.get(k) : def),
    update: vi.fn(async (k: string, v: unknown) => {
      if (v === undefined) {
        store.delete(k);
      } else {
        store.set(k, v);
      }
    }),
    keys: () => [...store.keys()],
  } as unknown as vscode.Memento;
}

const A = repo('/ws/a');
const B = repo('/ws/b');
const C = repo('/ws/c');

describe('RepositorySelection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('stored selection', () => {
    it('migrates the former single pick into a list and drops the old key on write', async () => {
      const state = memento({ 'gitIssues.activeRepositoryPath': '/ws/a' });
      expect(RepositorySelection.readStored(state)).toEqual(['/ws/a']);
      expect(RepositorySelection.isPinned(state)).toBe(true);

      await RepositorySelection.writeStored(state, ['/ws/a', '/ws/b']);
      expect(state.get('gitIssues.activeRepositoryPath')).toBeUndefined();
      expect(RepositorySelection.readStored(state)).toEqual(['/ws/a', '/ws/b']);
    });

    it('treats an empty stored list as automatic, even with a leftover old key', async () => {
      const state = memento({ 'gitIssues.activeRepositoryPath': '/ws/a' });
      await RepositorySelection.writeStored(state, []);
      expect(RepositorySelection.readStored(state)).toEqual([]);
      expect(RepositorySelection.isPinned(state)).toBe(false);
    });
  });

  describe('effective', () => {
    it('keeps detection order and hides stored repos that are not detected', () => {
      expect(RepositorySelection.effective(['/ws/c', '/ws/a', '/ws/gone'], [A, B, C])).toEqual([A, C]);
      expect(RepositorySelection.effective([], [A, B])).toEqual([]);
    });
  });

  describe('merge', () => {
    it('keeps stored repos that are currently not detected', () => {
      const stored = RepositorySelection.merge(['/ws/a'], ['/ws/a', '/ws/b'], [A]);
      expect(stored).toEqual(['/ws/a', '/ws/b']);
      expect(RepositorySelection.effective(stored, [A, B])).toEqual([A, B]);
    });

    it('clears everything on an empty confirm', () => {
      expect(RepositorySelection.merge([], ['/ws/a', '/ws/gone'], [A])).toEqual([]);
    });
  });

  describe('autoPick', () => {
    it('follows the active file before the previously shown repo', () => {
      expect(RepositorySelection.autoPick([A, B], A, fileUri('/ws/b/src/x.ts'))).toBe(B);
      expect(RepositorySelection.autoPick([A, B], B, fileUri('/ws/a/x.ts'))).toBe(A);
    });

    it('keeps the previous repo when no file matches', () => {
      expect(RepositorySelection.autoPick([A, B], B, fileUri('/elsewhere/x.ts'))).toBe(B);
      expect(RepositorySelection.autoPick([A, B], B, undefined)).toBe(B);
    });

    it('skips worktrees as the default', () => {
      const wt = repo('/ws/worktrees/a');
      expect(RepositorySelection.autoPick([wt, B], null, undefined)).toBe(B);
    });
  });

  describe('buildContexts', () => {
    it('isolates a missing token and a failing repo from a ready one', async () => {
      const provider = { platform: 'github' } as IssueProvider;
      const G = repo('/ws/g', 'gitlab');
      vi.spyOn(ProviderFactory, 'create').mockImplementation(async (r) => {
        if (r === A) { return { provider, remote: r.remote, reason: 'ok' }; }
        if (r === G) { return { provider: null, remote: r.remote, reason: 'no-token' }; }
        throw new Error('boom');
      });

      const contexts = await RepositorySelection.buildContexts([A, G, C], {
        githubToken: 't',
        getGitLabToken: async () => '',
        gitlabUrl: '',
      });

      expect(contexts.map((c) => c.state)).toEqual([
        { kind: 'ready', provider },
        { kind: 'no-token', platform: 'gitlab', host: 'gitlab.example.com' },
        { kind: 'error', message: 'boom' },
      ]);
    });
  });
});
