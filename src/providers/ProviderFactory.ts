import { GitRemoteDetector, type RemoteInfo } from '../git/GitRemoteDetector';
import { GitHubProvider } from './GitHubProvider';
import { GitLabProvider } from './GitLabProvider';
import type { IssueProvider } from './IssueProvider';

export interface ProviderConfig {
  githubToken: string;
  gitlabToken: string;
  gitlabUrl: string;
}

export interface CreateResult {
  provider: IssueProvider | null;
  remote: RemoteInfo | null;
  reason: 'ok' | 'no-remote' | 'no-token';
}

export class ProviderFactory {
  private static cache = new Map<string, IssueProvider>();

  static async create(
    workspaceRoot: string,
    config: ProviderConfig
  ): Promise<CreateResult> {
    const cached = this.cache.get(workspaceRoot);
    if (cached) {
      return { provider: cached, remote: null, reason: 'ok' };
    }

    const remote = await GitRemoteDetector.detect(workspaceRoot);
    if (!remote) {
      return { provider: null, remote: null, reason: 'no-remote' };
    }

    let provider: IssueProvider;

    if (remote.platform === 'github') {
      if (!config.githubToken) {
        return { provider: null, remote, reason: 'no-token' };
      }
      provider = new GitHubProvider(remote.owner, remote.repo, config.githubToken);
    } else {
      if (!config.gitlabToken) {
        return { provider: null, remote, reason: 'no-token' };
      }
      const baseUrl = this.resolveGitLabBaseUrl(remote.host, config.gitlabUrl);
      provider = new GitLabProvider(
        remote.owner,
        remote.repo,
        config.gitlabToken,
        baseUrl
      );
    }

    this.cache.set(workspaceRoot, provider);
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
}
