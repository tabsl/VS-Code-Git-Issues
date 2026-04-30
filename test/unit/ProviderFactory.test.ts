import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderFactory } from '../../src/providers/ProviderFactory';
import { GitRemoteDetector } from '../../src/git/GitRemoteDetector';

vi.mock('../../src/git/GitRemoteDetector', () => ({
  GitRemoteDetector: {
    detect: vi.fn(),
  },
}));

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

describe('ProviderFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ProviderFactory.clear();
  });

  it('returns no-remote when no git remote is detected', async () => {
    (GitRemoteDetector.detect as any).mockResolvedValue(null);

    const result = await ProviderFactory.create('/workspace', {
      githubToken: 'token', getGitLabToken: async () => '', gitlabUrl: 'https://gitlab.com',
    });

    expect(result.reason).toBe('no-remote');
    expect(result.provider).toBeNull();
  });

  it('returns no-token for GitHub remote without token', async () => {
    (GitRemoteDetector.detect as any).mockResolvedValue({
      platform: 'github', owner: 'octocat', repo: 'hello', host: 'github.com',
    });

    const result = await ProviderFactory.create('/workspace', {
      githubToken: '', getGitLabToken: async () => '', gitlabUrl: 'https://gitlab.com',
    });

    expect(result.reason).toBe('no-token');
    expect(result.remote?.platform).toBe('github');
  });

  it('returns no-token for GitLab remote without token', async () => {
    (GitRemoteDetector.detect as any).mockResolvedValue({
      platform: 'gitlab', owner: 'group', repo: 'project', host: 'gitlab.com',
    });

    const result = await ProviderFactory.create('/workspace', {
      githubToken: '', getGitLabToken: async () => '', gitlabUrl: 'https://gitlab.com',
    });

    expect(result.reason).toBe('no-token');
  });

  it('creates GitHub provider when token is available', async () => {
    (GitRemoteDetector.detect as any).mockResolvedValue({
      platform: 'github', owner: 'octocat', repo: 'hello', host: 'github.com',
    });

    const result = await ProviderFactory.create('/workspace', {
      githubToken: 'ghp_test', getGitLabToken: async () => '', gitlabUrl: 'https://gitlab.com',
    });

    expect(result.reason).toBe('ok');
    expect(result.provider).toBeDefined();
    expect(result.provider!.platform).toBe('github');
  });

  it('creates GitLab provider when token is available', async () => {
    (GitRemoteDetector.detect as any).mockResolvedValue({
      platform: 'gitlab', owner: 'group', repo: 'project', host: 'gitlab.com',
    });

    const result = await ProviderFactory.create('/workspace', {
      githubToken: '', getGitLabToken: async () => 'glpat-test', gitlabUrl: 'https://gitlab.com',
    });

    expect(result.reason).toBe('ok');
    expect(result.provider!.platform).toBe('gitlab');
  });

  it('passes the resolved gitlab host to the token resolver', async () => {
    (GitRemoteDetector.detect as any).mockResolvedValue({
      platform: 'gitlab', owner: 'group', repo: 'project', host: 'gitlab.example.com',
    });

    const resolver = vi.fn().mockResolvedValue('glpat-self-hosted');
    const result = await ProviderFactory.create('/workspace', {
      githubToken: '', getGitLabToken: resolver, gitlabUrl: 'https://gitlab.com',
    });

    expect(resolver).toHaveBeenCalledWith('gitlab.example.com');
    expect(result.reason).toBe('ok');
    expect(result.provider!.platform).toBe('gitlab');
  });

  it('caches providers by workspace root', async () => {
    (GitRemoteDetector.detect as any).mockResolvedValue({
      platform: 'github', owner: 'octocat', repo: 'hello', host: 'github.com',
    });

    const result1 = await ProviderFactory.create('/workspace', {
      githubToken: 'ghp_test', getGitLabToken: async () => '', gitlabUrl: '',
    });
    const result2 = await ProviderFactory.create('/workspace', {
      githubToken: 'ghp_test', getGitLabToken: async () => '', gitlabUrl: '',
    });

    expect(result1.provider).toBe(result2.provider);
    expect(GitRemoteDetector.detect).toHaveBeenCalledTimes(1);
  });

  it('clear() removes cached providers', async () => {
    (GitRemoteDetector.detect as any).mockResolvedValue({
      platform: 'github', owner: 'octocat', repo: 'hello', host: 'github.com',
    });

    await ProviderFactory.create('/workspace', {
      githubToken: 'ghp_test', getGitLabToken: async () => '', gitlabUrl: '',
    });

    ProviderFactory.clear();

    await ProviderFactory.create('/workspace', {
      githubToken: 'ghp_test', getGitLabToken: async () => '', gitlabUrl: '',
    });

    expect(GitRemoteDetector.detect).toHaveBeenCalledTimes(2);
  });
});
