import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderFactory } from '../../src/providers/ProviderFactory';
import type { RemoteInfo } from '../../src/git/GitRemoteDetector';
import type { DetectedRepository } from '../../src/git/RepositoryResolver';

vi.mock('../../src/providers/GitHubProvider', () => ({
  GitHubProvider: vi.fn().mockImplementation((owner, repo, token) => ({
    platform: 'github',
    getRepositoryInfo: () => ({ owner, repo, platform: 'github', baseUrl: 'https://github.com' }),
  })),
}));

vi.mock('../../src/providers/GitLabProvider', () => ({
  GitLabProvider: vi.fn().mockImplementation((owner, repo, token, baseUrl) => ({
    platform: 'gitlab',
    getRepositoryInfo: () => ({ owner, repo, platform: 'gitlab', baseUrl }),
  })),
}));

function repository(remote: RemoteInfo, rootPath = '/workspace'): DetectedRepository {
  return {
    rootUri: { scheme: 'file', fsPath: rootPath, toString: () => `file://${rootPath}` } as any,
    rootPath,
    displayName: 'workspace',
    remote,
    isVirtual: false,
  };
}

const GITHUB: RemoteInfo = { platform: 'github', owner: 'octocat', repo: 'hello', host: 'github.com' };
const GITLAB: RemoteInfo = { platform: 'gitlab', owner: 'group', repo: 'project', host: 'gitlab.com' };

describe('ProviderFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ProviderFactory.clear();
  });

  it('returns no-token for GitHub remote without token', async () => {
    const result = await ProviderFactory.create(repository(GITHUB), {
      githubToken: '', getGitLabToken: async () => '', gitlabUrl: 'https://gitlab.com',
    });

    expect(result.reason).toBe('no-token');
    expect(result.provider).toBeNull();
    expect(result.remote.platform).toBe('github');
  });

  it('returns no-token for GitLab remote without token', async () => {
    const result = await ProviderFactory.create(repository(GITLAB), {
      githubToken: '', getGitLabToken: async () => '', gitlabUrl: 'https://gitlab.com',
    });

    expect(result.reason).toBe('no-token');
  });

  it('creates GitHub provider when token is available', async () => {
    const result = await ProviderFactory.create(repository(GITHUB), {
      githubToken: 'ghp_test', getGitLabToken: async () => '', gitlabUrl: 'https://gitlab.com',
    });

    expect(result.reason).toBe('ok');
    expect(result.provider!.platform).toBe('github');
  });

  it('creates a provider for a virtual repository without touching the file system', async () => {
    const virtualRepo: DetectedRepository = {
      rootUri: {
        scheme: 'vscode-vfs',
        toString: () => 'vscode-vfs://github/octocat/hello',
      } as any,
      rootPath: 'vscode-vfs://github/octocat/hello',
      displayName: 'octocat/hello',
      remote: GITHUB,
      isVirtual: true,
    };

    const result = await ProviderFactory.create(virtualRepo, {
      githubToken: 'ghp_test', getGitLabToken: async () => '', gitlabUrl: '',
    });

    expect(result.reason).toBe('ok');
    expect(result.provider!.getRepositoryInfo()).toMatchObject({
      owner: 'octocat',
      repo: 'hello',
    });
  });

  it('creates GitLab provider when token is available', async () => {
    const result = await ProviderFactory.create(repository(GITLAB), {
      githubToken: '', getGitLabToken: async () => 'glpat-test', gitlabUrl: 'https://gitlab.com',
    });

    expect(result.reason).toBe('ok');
    expect(result.provider!.platform).toBe('gitlab');
  });

  it('passes the resolved gitlab host to the token resolver', async () => {
    const resolver = vi.fn().mockResolvedValue('glpat-self-hosted');
    const result = await ProviderFactory.create(
      repository({ ...GITLAB, host: 'gitlab.example.com' }),
      { githubToken: '', getGitLabToken: resolver, gitlabUrl: 'https://gitlab.com' }
    );

    expect(resolver).toHaveBeenCalledWith('gitlab.example.com');
    expect(result.reason).toBe('ok');
    expect(result.provider!.platform).toBe('gitlab');
  });

  it('caches providers by repository root', async () => {
    const config = {
      githubToken: 'ghp_test', getGitLabToken: async () => '', gitlabUrl: '',
    };
    const result1 = await ProviderFactory.create(repository(GITHUB), config);
    const result2 = await ProviderFactory.create(repository(GITHUB), config);

    expect(result1.provider).toBe(result2.provider);
  });

  it('keeps separate providers for separate repository roots', async () => {
    const config = {
      githubToken: 'ghp_test', getGitLabToken: async () => '', gitlabUrl: '',
    };
    const a = await ProviderFactory.create(repository(GITHUB, '/a'), config);
    const b = await ProviderFactory.create(repository(GITHUB, '/b'), config);

    expect(a.provider).not.toBe(b.provider);
  });

  it('clear() removes cached providers', async () => {
    const config = {
      githubToken: 'ghp_test', getGitLabToken: async () => '', gitlabUrl: '',
    };
    const first = await ProviderFactory.create(repository(GITHUB), config);
    ProviderFactory.clear();
    const second = await ProviderFactory.create(repository(GITHUB), config);

    expect(first.provider).not.toBe(second.provider);
  });
});
