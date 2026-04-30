import * as vscode from 'vscode';

const SECTION = 'gitIssues';
const GITHUB_TOKEN_SECRET_KEY = 'gitIssues.github.token';
const GITLAB_TOKEN_SECRET_KEY_PREFIX = 'gitIssues.gitlab.token:';
const GITLAB_LEGACY_TOKEN_SECRET_KEY = 'gitIssues.gitlab.token';
const GITLAB_HOSTS_STATE_KEY = 'gitIssues.gitlab.tokenHosts';
const GITLAB_LEGACY_DISABLED_STATE_KEY = 'gitIssues.gitlab.legacyTokenDisabled';

export class Configuration {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getGitHubToken(): Promise<string> {
    return this.getTokenWithMigration(
      GITHUB_TOKEN_SECRET_KEY,
      'github.token'
    );
  }

  async getGitLabToken(host?: string): Promise<string> {
    const targetHost = this.normalizeHost(host ?? this.getDefaultGitLabHost());

    const direct = await this.context.secrets.get(
      this.gitlabTokenKey(targetHost)
    );
    if (direct) {
      return direct;
    }

    // Legacy fallback: never moved or deleted automatically. The user must
    // explicitly migrate via "Configure GitLab Token" (which writes a host-
    // specific entry) or remove it via "Manage GitLab Tokens".
    return this.readLegacyGitLabToken();
  }

  getGitLabUrl(): string {
    return this.get<string>('gitlab.url', 'https://gitlab.com');
  }

  getDefaultState(): 'open' | 'closed' | 'all' {
    return this.get<'open' | 'closed' | 'all'>('defaultState', 'open');
  }

  getDefaultSort(): 'created' | 'updated' | 'comments' {
    return this.get<'created' | 'updated' | 'comments'>('defaultSort', 'created');
  }

  getAutoRefreshInterval(): number {
    return this.get<number>('autoRefreshInterval', 0);
  }

  async setGitHubToken(token: string): Promise<void> {
    await this.context.secrets.store(GITHUB_TOKEN_SECRET_KEY, token);
  }

  async setGitLabToken(token: string, host?: string): Promise<void> {
    const targetHost = this.normalizeHost(host ?? this.getDefaultGitLabHost());
    await this.context.secrets.store(this.gitlabTokenKey(targetHost), token);
    await this.addGitLabHostToIndex(targetHost);
  }

  async removeGitLabToken(host: string): Promise<void> {
    const targetHost = this.normalizeHost(host);
    await this.context.secrets.delete(this.gitlabTokenKey(targetHost));
    await this.removeGitLabHostFromIndex(targetHost);
  }

  async listGitLabTokenHosts(): Promise<string[]> {
    const stored = this.context.globalState.get<string[]>(GITLAB_HOSTS_STATE_KEY, []);
    return [...stored].sort();
  }

  async hasLegacyGitLabToken(): Promise<boolean> {
    return (await this.readLegacyGitLabToken()) !== '';
  }

  async removeLegacyGitLabToken(): Promise<{ configCleanupFailed: boolean }> {
    // Set tombstone first so the legacy fallback is reliably disabled even if
    // a subsequent cleanup step fails (e.g. the legacy config key was never
    // registered, so update() throws). Without the tombstone a stale
    // config value at any scope could otherwise resurrect the token.
    await this.context.globalState.update(GITLAB_LEGACY_DISABLED_STATE_KEY, true);
    await this.context.secrets.delete(GITLAB_LEGACY_TOKEN_SECRET_KEY);

    const cfg = vscode.workspace.getConfiguration(SECTION);
    const inspected = cfg.inspect?.<string>('gitlab.token');
    if (!inspected) {
      return { configCleanupFailed: false };
    }

    const scopes: Array<{
      target: vscode.ConfigurationTarget;
      value: string | undefined;
    }> = [
      { target: vscode.ConfigurationTarget.Global, value: inspected.globalValue },
      { target: vscode.ConfigurationTarget.Workspace, value: inspected.workspaceValue },
      { target: vscode.ConfigurationTarget.WorkspaceFolder, value: inspected.workspaceFolderValue },
    ];

    let cleanupFailed = false;
    for (const { target, value } of scopes) {
      if (value === undefined) {
        continue;
      }
      try {
        await cfg.update('gitlab.token', undefined, target);
      } catch {
        cleanupFailed = true;
      }
    }

    // Verify nothing survived at any scope — this also catches the case where
    // update() resolved successfully but the value is still present.
    const after = vscode.workspace
      .getConfiguration(SECTION)
      .inspect?.<string>('gitlab.token');
    if (
      after &&
      (after.globalValue !== undefined ||
        after.workspaceValue !== undefined ||
        after.workspaceFolderValue !== undefined)
    ) {
      cleanupFailed = true;
    }

    return { configCleanupFailed: cleanupFailed };
  }

  onDidChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        callback();
      }
    });
  }

  private get<T>(key: string, defaultValue: T): T {
    return vscode.workspace
      .getConfiguration(SECTION)
      .get<T>(key, defaultValue);
  }

  private async set(key: string, value: unknown): Promise<void> {
    await vscode.workspace
      .getConfiguration(SECTION)
      .update(key, value, vscode.ConfigurationTarget.Global);
  }

  private gitlabTokenKey(host: string): string {
    return `${GITLAB_TOKEN_SECRET_KEY_PREFIX}${host}`;
  }

  private getDefaultGitLabHost(): string {
    const url = this.getGitLabUrl().trim();
    if (!url) {
      return 'gitlab.com';
    }
    try {
      const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      return new URL(withProtocol).host || 'gitlab.com';
    } catch {
      return 'gitlab.com';
    }
  }

  private normalizeHost(host: string): string {
    const trimmed = host.trim().replace(/\/+$/, '');
    if (!trimmed) {
      return '';
    }
    // Use URL parsing to canonicalise: lowercases the host, applies Punycode
    // for IDN, preserves bracketed IPv6 literals, and keeps an explicit port.
    // Falls back to a plain lowercase if URL parsing rejects the input
    // (e.g. exotic SSH aliases the URL parser doesn't accept).
    try {
      return new URL(`https://${trimmed}/`).host;
    } catch {
      return trimmed.toLowerCase();
    }
  }

  private async addGitLabHostToIndex(host: string): Promise<void> {
    const current = this.context.globalState.get<string[]>(GITLAB_HOSTS_STATE_KEY, []);
    if (current.includes(host)) {
      return;
    }
    await this.context.globalState.update(
      GITLAB_HOSTS_STATE_KEY,
      [...current, host]
    );
  }

  private async removeGitLabHostFromIndex(host: string): Promise<void> {
    const current = this.context.globalState.get<string[]>(GITLAB_HOSTS_STATE_KEY, []);
    if (!current.includes(host)) {
      return;
    }
    await this.context.globalState.update(
      GITLAB_HOSTS_STATE_KEY,
      current.filter((h) => h !== host)
    );
  }

  private async readLegacyGitLabToken(): Promise<string> {
    if (this.context.globalState.get<boolean>(GITLAB_LEGACY_DISABLED_STATE_KEY, false)) {
      return '';
    }
    const secret = await this.context.secrets.get(GITLAB_LEGACY_TOKEN_SECRET_KEY);
    if (secret) {
      return secret;
    }
    return this.get<string>('gitlab.token', '').trim();
  }

  private async getTokenWithMigration(
    secretKey: string,
    legacyConfigKey: string
  ): Promise<string> {
    const secret = await this.context.secrets.get(secretKey);
    if (secret) {
      return secret;
    }

    const legacyToken = this.get<string>(legacyConfigKey, '').trim();
    if (!legacyToken) {
      return '';
    }

    await this.context.secrets.store(secretKey, legacyToken);
    try {
      await this.set(legacyConfigKey, undefined);
    } catch {
      // Legacy config key may not be registered — ignore cleanup failure
    }
    return legacyToken;
  }
}
