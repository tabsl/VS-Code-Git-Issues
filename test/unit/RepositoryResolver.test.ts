import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { RepositoryResolver } from '../../src/git/RepositoryResolver';
import { GitRemoteDetector } from '../../src/git/GitRemoteDetector';
import { getGitApi } from '../../src/git/VscodeGitApi';

vi.mock('../../src/git/VscodeGitApi', () => ({
  getGitApi: vi.fn(),
}));

function uri(value: string): vscode.Uri {
  const [scheme, rest] = value.split('://');
  const authority = scheme === 'file' ? '' : rest.slice(0, rest.indexOf('/'));
  const path = scheme === 'file' ? rest : rest.slice(rest.indexOf('/'));
  return {
    scheme,
    authority,
    path,
    fsPath: path,
    toString: () => value,
  } as unknown as vscode.Uri;
}

function setFolders(...uris: string[]): void {
  (vscode.workspace as any).workspaceFolders = uris.map((u) => ({
    uri: uri(u),
    name: u.split('/').pop(),
  }));
}

describe('RepositoryResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getGitApi as any).mockResolvedValue(null);
    (vscode.workspace as any).workspaceFolders = undefined;
    vi.spyOn(GitRemoteDetector, 'detect').mockResolvedValue(null);
  });

  it('detects a Remote Repository from the workspace folder URI', async () => {
    setFolders('vscode-vfs://github/tabsl/VS-Code-Git-Issues');

    const [repo] = await RepositoryResolver.detectAll();

    expect(repo.remote).toEqual({
      platform: 'github',
      owner: 'tabsl',
      repo: 'VS-Code-Git-Issues',
      host: 'github.com',
    });
    expect(repo.isVirtual).toBe(true);
    expect(repo.rootPath).toBe('vscode-vfs://github/tabsl/VS-Code-Git-Issues');
    expect(GitRemoteDetector.detect).not.toHaveBeenCalled();
  });

  it('reports a virtual repository alongside repositories from the Git extension', async () => {
    setFolders('file:///Users/me/local', 'vscode-vfs://github/octocat/hello');
    (getGitApi as any).mockResolvedValue({
      repositories: [{
        rootUri: uri('file:///Users/me/local'),
        state: { remotes: [{ name: 'origin', fetchUrl: 'git@github.com:me/local.git' }] },
      }],
    });

    const repos = await RepositoryResolver.detectAll();

    expect(repos.map((r) => r.rootPath)).toEqual([
      '/Users/me/local',
      'vscode-vfs://github/octocat/hello',
    ]);
    expect(repos.map((r) => r.isVirtual)).toEqual([false, true]);
  });

  it('skips virtual folders when scanning for local remotes', async () => {
    setFolders('vscode-vfs://azurerepos/org/project/repo');

    expect(await RepositoryResolver.detectAll()).toEqual([]);
    expect(GitRemoteDetector.detect).not.toHaveBeenCalled();
  });

  it('has no local checkout for a virtual repository', () => {
    setFolders('file:///Users/me/other', 'vscode-vfs://github/octocat/hello');
    const virtualRepo = {
      rootUri: uri('vscode-vfs://github/octocat/hello'),
      rootPath: 'vscode-vfs://github/octocat/hello',
      displayName: 'octocat/hello',
      remote: { platform: 'github' as const, owner: 'octocat', repo: 'hello', host: 'github.com' },
      isVirtual: true,
    };

    expect(RepositoryResolver.localCheckout(virtualRepo)).toBeNull();
    expect(RepositoryResolver.localCheckout()).toBe('/Users/me/other');
  });

  it('matches local files that carry a Git extension scheme', () => {
    const repo = {
      rootUri: uri('file:///Users/me/local'),
      rootPath: '/Users/me/local',
      displayName: 'local',
      remote: { platform: 'github' as const, owner: 'me', repo: 'local', host: 'github.com' },
      isVirtual: false,
    };
    // The Git extension's diff editors use `git:` but keep the on-disk path.
    const diffUri = {
      scheme: 'git',
      path: '/Users/me/local/src/a.ts',
      fsPath: '/Users/me/local/src/a.ts',
      toString: () => 'git:/Users/me/local/src/a.ts?%7B%22ref%22%3A%22%22%7D',
    } as unknown as vscode.Uri;

    expect(RepositoryResolver.contains(repo, diffUri)).toBe(true);
    expect(RepositoryResolver.contains(repo, uri('file:///Users/me/other/a.ts'))).toBe(false);
  });

  it('does not match a virtual repository against a different authority', () => {
    const repo = {
      rootUri: uri('vscode-vfs://github/octocat/hello'),
      rootPath: 'vscode-vfs://github/octocat/hello',
      displayName: 'octocat/hello',
      remote: { platform: 'github' as const, owner: 'octocat', repo: 'hello', host: 'github.com' },
      isVirtual: true,
    };

    expect(
      RepositoryResolver.contains(repo, uri('vscode-vfs://azurerepos/octocat/hello/a.ts'))
    ).toBe(false);
  });

  it('matches files against the repository root by URI', () => {
    const repo = {
      rootUri: uri('vscode-vfs://github/octocat/hello'),
      rootPath: 'vscode-vfs://github/octocat/hello',
      displayName: 'octocat/hello',
      remote: { platform: 'github' as const, owner: 'octocat', repo: 'hello', host: 'github.com' },
      isVirtual: true,
    };

    expect(RepositoryResolver.contains(repo, uri('vscode-vfs://github/octocat/hello/src/a.ts'))).toBe(true);
    expect(RepositoryResolver.contains(repo, uri('vscode-vfs://github/octocat/hello-world/a.ts'))).toBe(false);
  });
});
