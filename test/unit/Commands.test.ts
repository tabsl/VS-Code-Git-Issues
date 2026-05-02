import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { registerCommands } from '../../src/commands';
import type { Configuration } from '../../src/config/Configuration';
import type { IssueTreeDataProvider } from '../../src/tree/IssueTreeDataProvider';
import type { IssueProvider } from '../../src/providers/IssueProvider';
import { __resetConfigStores } from './__mocks__/vscode';

function createMockContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() },
    extensionUri: vscode.Uri.parse('file:///ext'),
  } as unknown as vscode.ExtensionContext;
}

function createMockConfig(): Configuration {
  return {
    setGitHubToken: vi.fn(),
    setGitLabToken: vi.fn(),
    removeGitLabToken: vi.fn(),
    listGitLabTokenHosts: vi.fn().mockResolvedValue([]),
    hasLegacyGitLabToken: vi.fn().mockResolvedValue(false),
    removeLegacyGitLabToken: vi.fn().mockResolvedValue({ configCleanupFailed: false }),
    getGitLabUrl: vi.fn().mockReturnValue('https://gitlab.com'),
  } as unknown as Configuration;
}

function createMockTreeDataProvider() {
  return {
    refresh: vi.fn(),
    getFilter: vi.fn().mockReturnValue({ state: 'open', sort: 'created' }),
    setFilter: vi.fn(),
  } as unknown as IssueTreeDataProvider;
}

function createMockProvider(): IssueProvider {
  return {
    platform: 'github',
    isAuthenticated: () => true,
    listIssues: vi.fn(),
    getIssue: vi.fn(),
    createIssue: vi.fn().mockResolvedValue({ number: 42, title: 'Test' }),
    updateIssue: vi.fn(),
    listComments: vi.fn(),
    addComment: vi.fn(),
    listLabels: vi.fn(),
    listAssignees: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({ id: 1, login: 'user' }),
    getIssueUrl: vi.fn().mockReturnValue('https://github.com/o/r/issues/1'),
    getRepositoryInfo: vi.fn(),
  };
}

describe('registerCommands', () => {
  let ctx: vscode.ExtensionContext;
  let config: Configuration;
  let tdp: ReturnType<typeof createMockTreeDataProvider>;
  let provider: IssueProvider;
  let registeredCommands: Map<string, (...args: any[]) => any>;
  let reinitializeProvider: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetConfigStores();
    ctx = createMockContext();
    config = createMockConfig();
    tdp = createMockTreeDataProvider();
    provider = createMockProvider();
    reinitializeProvider = vi.fn();
    registeredCommands = new Map();

    (vscode.commands.registerCommand as any).mockImplementation(
      (id: string, cb: (...args: any[]) => any) => {
        registeredCommands.set(id, cb);
        return { dispose: vi.fn() };
      }
    );

    registerCommands(ctx, config, tdp as any, () => provider, () => null, reinitializeProvider);
  });

  it('registers all 12 commands', () => {
    expect(registeredCommands.size).toBe(12);
    expect(registeredCommands.has('gitIssues.refresh')).toBe(true);
    expect(registeredCommands.has('gitIssues.search')).toBe(true);
    expect(registeredCommands.has('gitIssues.clearSearch')).toBe(true);
    expect(registeredCommands.has('gitIssues.openIssue')).toBe(true);
    expect(registeredCommands.has('gitIssues.createIssue')).toBe(true);
    expect(registeredCommands.has('gitIssues.filter')).toBe(true);
    expect(registeredCommands.has('gitIssues.openInBrowser')).toBe(true);
    expect(registeredCommands.has('gitIssues.createBranchFromIssue')).toBe(true);
    expect(registeredCommands.has('gitIssues.selectRepository')).toBe(true);
    expect(registeredCommands.has('gitIssues.configureGitHubToken')).toBe(true);
    expect(registeredCommands.has('gitIssues.configureGitLabToken')).toBe(true);
    expect(registeredCommands.has('gitIssues.manageGitLabTokens')).toBe(true);
  });

  describe('refresh', () => {
    it('calls treeDataProvider.refresh()', () => {
      registeredCommands.get('gitIssues.refresh')!();
      expect(tdp.refresh).toHaveBeenCalled();
    });
  });

  describe('createIssue', () => {
    it('creates issue with title and body', async () => {
      (vscode.window.showInputBox as any)
        .mockResolvedValueOnce('My Title')
        .mockResolvedValueOnce('My Body');

      await registeredCommands.get('gitIssues.createIssue')!();

      expect(provider.createIssue).toHaveBeenCalledWith(expect.objectContaining({
        title: 'My Title',
        body: 'My Body',
      }));
      expect(tdp.refresh).toHaveBeenCalled();
    });

    it('does nothing when title is cancelled', async () => {
      (vscode.window.showInputBox as any).mockResolvedValueOnce(undefined);

      await registeredCommands.get('gitIssues.createIssue')!();
      expect(provider.createIssue).not.toHaveBeenCalled();
    });

    it('shows error when no provider', async () => {
      registerCommands(ctx, config, tdp as any, () => null, () => null, reinitializeProvider);
      const cmd = registeredCommands.get('gitIssues.createIssue')!;
      await cmd();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Git Issues: No provider available'
      );
    });
  });

  describe('openInBrowser', () => {
    it('opens issue URL in external browser', () => {
      const item = { issue: { number: 1 } };
      registeredCommands.get('gitIssues.openInBrowser')!(item);
      expect(provider.getIssueUrl).toHaveBeenCalledWith(1);
      expect(vscode.env.openExternal).toHaveBeenCalled();
    });

    it('does nothing without item', () => {
      registeredCommands.get('gitIssues.openInBrowser')!(undefined);
      expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });
  });

  describe('configureGitHubToken', () => {
    it('saves token and reinitializes', async () => {
      (vscode.window.showInputBox as any).mockResolvedValue('ghp_test');

      await registeredCommands.get('gitIssues.configureGitHubToken')!();

      expect(config.setGitHubToken).toHaveBeenCalledWith('ghp_test');
      expect(reinitializeProvider).toHaveBeenCalled();
    });

    it('does nothing when cancelled', async () => {
      (vscode.window.showInputBox as any).mockResolvedValue(undefined);

      await registeredCommands.get('gitIssues.configureGitHubToken')!();
      expect(config.setGitHubToken).not.toHaveBeenCalled();
    });
  });

  describe('configureGitLabToken', () => {
    it('saves token for the prompted host and reinitializes', async () => {
      (vscode.window.showInputBox as any)
        .mockResolvedValueOnce('gitlab.example.com')
        .mockResolvedValueOnce('glpat-test');

      await registeredCommands.get('gitIssues.configureGitLabToken')!();

      expect(config.setGitLabToken).toHaveBeenCalledWith('glpat-test', 'gitlab.example.com');
      expect(reinitializeProvider).toHaveBeenCalled();
    });

    it('does nothing when host prompt is cancelled', async () => {
      (vscode.window.showInputBox as any).mockResolvedValueOnce(undefined);

      await registeredCommands.get('gitIssues.configureGitLabToken')!();
      expect(config.setGitLabToken).not.toHaveBeenCalled();
    });
  });

  describe('manageGitLabTokens', () => {
    it('shows info when no tokens are configured', async () => {
      (config.listGitLabTokenHosts as any).mockResolvedValue([]);

      await registeredCommands.get('gitIssues.manageGitLabTokens')!();

      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
      expect(config.removeGitLabToken).not.toHaveBeenCalled();
    });

    it('removes the picked host after confirmation', async () => {
      (config.listGitLabTokenHosts as any).mockResolvedValue([
        'gitlab.com',
        'gitlab.example.com',
      ]);
      (vscode.window.showQuickPick as any).mockResolvedValue({
        label: 'gitlab.example.com',
        host: 'gitlab.example.com',
        isLegacy: false,
      });
      (vscode.window.showWarningMessage as any) = vi.fn().mockResolvedValue('Remove');

      await registeredCommands.get('gitIssues.manageGitLabTokens')!();

      expect(config.removeGitLabToken).toHaveBeenCalledWith('gitlab.example.com');
      expect(reinitializeProvider).toHaveBeenCalled();
    });

    it('offers and removes the legacy fallback token', async () => {
      (config.listGitLabTokenHosts as any).mockResolvedValue([]);
      (config.hasLegacyGitLabToken as any).mockResolvedValue(true);
      (vscode.window.showQuickPick as any).mockResolvedValue({
        label: '$(history) Legacy default token',
        host: '',
        isLegacy: true,
      });
      (vscode.window.showWarningMessage as any) = vi.fn().mockResolvedValue('Remove');

      await registeredCommands.get('gitIssues.manageGitLabTokens')!();

      expect(config.removeLegacyGitLabToken).toHaveBeenCalled();
      expect(config.removeGitLabToken).not.toHaveBeenCalled();
      expect(reinitializeProvider).toHaveBeenCalled();
    });
  });
});
