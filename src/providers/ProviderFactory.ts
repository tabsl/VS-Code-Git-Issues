import type { DetectedRepository } from '../git/RepositoryResolver';
import type { RemoteInfo } from '../git/GitRemoteDetector';
import { GitHubProvider } from './GitHubProvider';
import { GitLabProvider } from './GitLabProvider';
import type { IssueProvider } from './IssueProvider';

export interface ProviderConfig {
  githubToken: string;
  getGitLabToken: (host: string) => Promise<string>;
  gitlabUrl: string;
}

export interface CreateResult {
  provider: IssueProvider | null;
  remote: RemoteInfo;
  reason: 'ok' | 'no-token';
}

export class ProviderFactory {
  private static cache = new Map<string, IssueProvider>();

  static async create(
    repository: DetectedRepository,
    config: ProviderConfig
  ): Promise<CreateResult> {
    const remote = repository.remote;
    const cached = this.cache.get(repository.rootPath);
    if (cached) {
      return { provider: cached, remote, reason: 'ok' };
    }

    let provider: IssueProvider;

    if (remote.platform === 'github') {
      if (!config.githubToken) {
        return { provider: null, remote, reason: 'no-token' };
      }
      provider = new GitHubProvider(remote.owner, remote.repo, config.githubToken);
    } else {
      const baseUrl = this.resolveGitLabBaseUrl(remote.host, config.gitlabUrl);
      const tokenHost = this.hostFromBaseUrl(baseUrl) ?? remote.host;
      const token = await config.getGitLabToken(tokenHost);
      if (!token) {
        return { provider: null, remote, reason: 'no-token' };
      }
      provider = new GitLabProvider(
        remote.owner,
        remote.repo,
        token,
        baseUrl
      );
    }

    this.cache.set(repository.rootPath, provider);
    return { provider, remote, reason: 'ok' };
  }

  static clear(): void {
    this.cache.clear();
  }

  private static resolveGitLabBaseUrl(
    remoteHost: string,
    configuredUrl: string
  ): string {
    const trimmed = configuredUrl.trim();

    // Keep existing default behavior unless the user explicitly configured an override.
    if (!trimmed || trimmed === 'https://gitlab.com') {
      return `https://${remoteHost}`;
    }

    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return withProtocol.replace(/\/+$/, '');
  }

  private static hostFromBaseUrl(baseUrl: string): string | null {
    try {
      return new URL(baseUrl).host.toLowerCase();
    } catch {
      return null;
    }
  }
}
