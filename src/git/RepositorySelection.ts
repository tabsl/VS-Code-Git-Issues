import * as path from 'path';
import type * as vscode from 'vscode';
import { ProviderFactory, type ProviderConfig } from '../providers/ProviderFactory';
import type { IssueProvider } from '../providers/IssueProvider';
import { RepositoryResolver, type DetectedRepository } from './RepositoryResolver';

const SELECTED_KEY = 'gitIssues.selectedRepositoryPaths';
const LEGACY_SELECTED_KEY = 'gitIssues.activeRepositoryPath';

export type SourceState =
  | { kind: 'ready'; provider: IssueProvider }
  | { kind: 'no-token'; platform: 'github' | 'gitlab'; host?: string }
  | { kind: 'error'; message: string };

export interface RepoContext {
  repo: DetectedRepository;
  state: SourceState;
}

export class RepositorySelection {
  static readStored(state: vscode.Memento): string[] {
    const stored = state.get<string[]>(SELECTED_KEY);
    if (Array.isArray(stored)) {
      return stored.filter((p): p is string => typeof p === 'string');
    }
    const legacy = state.get<string>(LEGACY_SELECTED_KEY);
    return legacy ? [legacy] : [];
  }

  static async writeStored(state: vscode.Memento, paths: string[]): Promise<void> {
    await state.update(SELECTED_KEY, paths);
    await state.update(LEGACY_SELECTED_KEY, undefined);
  }

  static isPinned(state: vscode.Memento): boolean {
    return this.readStored(state).length > 0;
  }

  static effective(stored: string[], detected: DetectedRepository[]): DetectedRepository[] {
    const wanted = new Set(stored);
    return detected.filter(d => wanted.has(d.rootPath));
  }

  // Stored paths that are not detected right now stay stored: nested repos are
  // reported asynchronously by the Git extension, and dropping them on the
  // first confirm would silently shrink the selection.
  static merge(picked: string[], stored: string[], detected: DetectedRepository[]): string[] {
    if (picked.length === 0) {
      return [];
    }
    const pickedSet = new Set(picked);
    const detectedKeys = new Set(detected.map(d => d.rootPath));
    return [
      ...detected.filter(d => pickedSet.has(d.rootPath)).map(d => d.rootPath),
      ...stored.filter(p => !detectedKeys.has(p)),
    ];
  }

  static autoPick(
    repos: DetectedRepository[],
    current: DetectedRepository | null,
    activeFile: vscode.Uri | undefined
  ): DetectedRepository {
    // The active file wins over the previous repo — otherwise clearing a
    // fixed selection would keep showing the old repo instead of following
    // the editor.
    if (activeFile) {
      const matching = repos
        .filter(d => RepositoryResolver.contains(d, activeFile))
        .sort((a, b) => b.rootPath.length - a.rootPath.length);
      if (matching.length > 0) {
        return matching[0];
      }
    }

    // Keep the current repo so the view doesn't bounce while nested repos
    // are still being discovered.
    if (current) {
      const stillThere = repos.find(d => d.rootPath === current.rootPath);
      if (stillThere) {
        return stillThere;
      }
    }

    // Worktrees share an origin with the main repo and are rarely the
    // intended default.
    const nonWorktree = repos.filter(
      d => d.isVirtual || !d.rootPath.split(path.sep).includes('worktrees')
    );
    return nonWorktree[0] ?? repos[0];
  }

  static async buildContexts(
    repos: DetectedRepository[],
    config: ProviderConfig
  ): Promise<RepoContext[]> {
    return Promise.all(
      repos.map(async (repo): Promise<RepoContext> => {
        try {
          const result = await ProviderFactory.create(repo, config);
          if (result.provider) {
            return { repo, state: { kind: 'ready', provider: result.provider } };
          }
          return {
            repo,
            state: {
              kind: 'no-token',
              platform: result.remote.platform,
              host: result.remote.platform === 'gitlab' ? result.remote.host : undefined,
            },
          };
        } catch (err) {
          return {
            repo,
            state: { kind: 'error', message: err instanceof Error ? err.message : String(err) },
          };
        }
      })
    );
  }
}
