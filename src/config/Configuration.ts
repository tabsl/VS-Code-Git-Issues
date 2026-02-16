import * as vscode from 'vscode';

const SECTION = 'gitIssues';
const GITHUB_TOKEN_SECRET_KEY = 'gitIssues.github.token';
const GITLAB_TOKEN_SECRET_KEY = 'gitIssues.gitlab.token';

export class Configuration {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getGitHubToken(): Promise<string> {
    return this.getTokenWithMigration(
      GITHUB_TOKEN_SECRET_KEY,
      'github.token'
    );
  }

  async getGitLabToken(): Promise<string> {
    return this.getTokenWithMigration(
      GITLAB_TOKEN_SECRET_KEY,
      'gitlab.token'
    );
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

  async setGitLabToken(token: string): Promise<void> {
    await this.context.secrets.store(GITLAB_TOKEN_SECRET_KEY, token);
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
