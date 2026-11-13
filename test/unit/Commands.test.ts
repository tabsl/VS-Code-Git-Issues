import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { registerCommands } from '../../src/commands';
import type { Configuration } from '../../src/config/Configuration';
import type { IssueTreeDataProvider } from '../../src/tree/IssueTreeDataProvider';
import type { IssueProvider } from '../../src/providers/IssueProvider';
import { __resetConfigStores } from './__mocks__/vscode';
import type { RepoContext } from '../../src/git/RepositorySelection';
import type { DetectedRepository } from '../../src/git/RepositoryResolver';

const showPanel = vi.fn();
vi.mock('../../src/webview/IssueWebviewPanel', () => ({
  IssueWebviewPanel: { show: (...args: unknown[]) => showPanel(...args) },
}));

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
    clearGitHubToken: vi.fn(),
    signInToGitHub: vi.fn().mockResolvedValue('gho_session'),
    setGitLabToken: vi.fn(),
    removeGitLabToken: vi.fn(),
    listGitLabTokenHosts: vi.fn().mockResolvedValue([]),
    hasLegacyGitLabToken: vi.fn().mockResolvedValue(false),
    removeLegacyGitLabToken: vi.fn().mockResolvedValue({ configCleanupFailed: false }),
    getGitLabUrl: vi.fn().mockReturnValue('https://gitlab.com'),
    getClaudeCliCommand: vi.fn().mockReturnValue('claude'),
    getClaudeCliArgs: vi.fn().mockReturnValue([]),
    getClaudePromptLanguage: vi.fn().mockReturnValue('auto'),
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
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    listLabels: vi.fn(),
    listMilestones: vi.fn(),
    listAssignees: vi.fn(),
    toggleIssueReaction: vi.fn(),
    toggleCommentReaction: vi.fn(),
    listLinkedPullRequests: vi.fn(),
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

  it('registers all 19 commands', () => {
    expect(registeredCommands.size).toBe(19);
    expect(registeredCommands.has('gitIssues.referenceInCommit')).toBe(true);
    expect(registeredCommands.has('gitIssues.refresh')).toBe(true);
    expect(registeredCommands.has('gitIssues.search')).toBe(true);
    expect(registeredCommands.has('gitIssues.clearSearch')).toBe(true);
    expect(registeredCommands.has('gitIssues.openIssue')).toBe(true);
    expect(registeredCommands.has('gitIssues.openIssueBeside')).toBe(true);
    expect(registeredCommands.has('gitIssues.createIssue')).toBe(true);
    expect(registeredCommands.has('gitIssues.filter')).toBe(true);
    expect(registeredCommands.has('gitIssues.filterByLabels')).toBe(true);
    expect(registeredCommands.has('gitIssues.filterByMilestone')).toBe(true);
    expect(registeredCommands.has('gitIssues.toggleMyIssues')).toBe(true);
    expect(registeredCommands.has('gitIssues.toggleMyIssuesActive')).toBe(true);
    expect(registeredCommands.has('gitIssues.openInBrowser')).toBe(true);
    expect(registeredCommands.has('gitIssues.createBranchFromIssue')).toBe(true);
    expect(registeredCommands.has('gitIssues.selectRepository')).toBe(true);
    expect(registeredCommands.has('gitIssues.configureGitHubToken')).toBe(true);
    expect(registeredCommands.has('gitIssues.configureGitLabToken')).toBe(true);
    expect(registeredCommands.has('gitIssues.manageGitLabTokens')).toBe(true);
    expect(registeredCommands.has('gitIssues.startClaudeSession')).toBe(true);
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
    it('signs in via VSCode auth and reinitializes', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValue({
        label: 'Sign in with GitHub',
      });

      await registeredCommands.get('gitIssues.configureGitHubToken')!();

      expect(config.signInToGitHub).toHaveBeenCalled();
      expect(config.clearGitHubToken).toHaveBeenCalled();
      expect(reinitializeProvider).toHaveBeenCalled();
      expect(config.setGitHubToken).not.toHaveBeenCalled();
    });

    it('saves PAT and reinitializes when user picks token entry', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValue({
        label: 'Enter Personal Access Token',
      });
      (vscode.window.showInputBox as any).mockResolvedValue('ghp_test');

      await registeredCommands.get('gitIssues.configureGitHubToken')!();

      expect(config.setGitHubToken).toHaveBeenCalledWith('ghp_test');
      expect(reinitializeProvider).toHaveBeenCalled();
    });

    it('does nothing when picker is cancelled', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValue(undefined);

      await registeredCommands.get('gitIssues.configureGitHubToken')!();
      expect(config.signInToGitHub).not.toHaveBeenCalled();
      expect(config.setGitHubToken).not.toHaveBeenCalled();
    });

    it('does nothing when PAT entry is cancelled', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValue({
        label: 'Enter Personal Access Token',
      });
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

  describe('startClaudeSession', () => {
    it('passes the issue reference to the configured CLI when no Claude extension is present', async () => {
      (vscode.commands.getCommands as any).mockResolvedValue([]);
      const terminal = { show: vi.fn(), sendText: vi.fn() };
      (vscode.window.createTerminal as any).mockReturnValue(terminal);
      const issue = { number: 42, title: 'Broken export', state: 'open' };

      await registeredCommands.get('gitIssues.startClaudeSession')!({ issue });

      expect(terminal.sendText).toHaveBeenCalledWith(
        "claude 'Work on issue #42 \"Broken export\": https://github.com/o/r/issues/1'"
      );
    });

    it('does nothing without an issue', async () => {
      await registeredCommands.get('gitIssues.startClaudeSession')!(undefined);
      expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    });
  });

  describe('with several repositories', () => {
    let providerA: IssueProvider;
    let providerB: IssueProvider;
    let contexts: RepoContext[];

    function repo(name: string): DetectedRepository {
      return {
        rootUri: {} as never,
        rootPath: `/ws/${name}`,
        displayName: name,
        remote: { platform: 'github', host: 'github.com', owner: 'acme', repo: name },
        isVirtual: false,
      } as DetectedRepository;
    }

    beforeEach(() => {
      providerA = createMockProvider();
      providerB = createMockProvider();
      (providerA.getRepositoryInfo as any).mockReturnValue({ owner: 'acme', repo: 'web', platform: 'github', baseUrl: '' });
      (providerB.getRepositoryInfo as any).mockReturnValue({ owner: 'acme', repo: 'api', platform: 'github', baseUrl: '' });
      (providerB.getIssueUrl as any).mockReturnValue('https://github.com/acme/api/issues/5');
      contexts = [
        { repo: repo('web'), state: { kind: 'ready', provider: providerA } },
        { repo: repo('api'), state: { kind: 'ready', provider: providerB } },
      ];
      registerCommands(
        ctx, config, tdp as any, () => providerA, () => contexts[0].repo, reinitializeProvider, () => contexts
      );
    });

    it('opens an issue with the provider of the repo it was listed under', async () => {
      await registeredCommands.get('gitIssues.openIssue')!(5, '/ws/api');
      expect(showPanel).toHaveBeenCalledWith(expect.anything(), providerB, 5, contexts[1].repo);
    });

    it('refuses an unknown repo instead of falling back to another one', async () => {
      await registeredCommands.get('gitIssues.openIssue')!(5, '/ws/gone');
      expect(showPanel).not.toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Git Issues: Repository not loaded');
    });

    it('opens the browser URL of the item\'s repo', () => {
      registeredCommands.get('gitIssues.openInBrowser')!({ issue: { number: 5 }, repoKey: '/ws/api' });
      expect(providerB.getIssueUrl).toHaveBeenCalledWith(5);
      expect(providerA.getIssueUrl).not.toHaveBeenCalled();
    });

    it('creates an issue in the repo of the clicked node without asking', async () => {
      (vscode.window.showInputBox as any).mockResolvedValueOnce('Title').mockResolvedValueOnce('');
      await registeredCommands.get('gitIssues.createIssue')!({ repoKey: '/ws/api' });
      expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
      expect(providerB.createIssue).toHaveBeenCalled();
      expect(providerA.createIssue).not.toHaveBeenCalled();
    });

    it('asks for the target repo when creating from the title bar', async () => {
      (vscode.window.showQuickPick as any).mockImplementationOnce(async (items: any[]) => items[1]);
      (vscode.window.showInputBox as any).mockResolvedValueOnce('Title').mockResolvedValueOnce('');
      await registeredCommands.get('gitIssues.createIssue')!();
      const offered = (vscode.window.showQuickPick as any).mock.calls[0][0].map((i: any) => i.label);
      expect(offered).toEqual(['acme/web', 'acme/api']);
      expect(providerB.createIssue).toHaveBeenCalled();
    });

    it('offers the labels of all repos once each', async () => {
      (providerA.listLabels as any).mockResolvedValue([{ name: 'bug', color: 'f00' }, { name: 'ui', color: '0f0' }]);
      (providerB.listLabels as any).mockResolvedValue([{ name: 'bug', color: 'f00' }, { name: 'api', color: '00f' }]);
      (vscode.window.showQuickPick as any).mockResolvedValueOnce(undefined);
      await registeredCommands.get('gitIssues.filterByLabels')!();
      const offered = (vscode.window.showQuickPick as any).mock.calls[0][0].map((i: any) => i.label);
      expect(offered).toEqual(['api', 'bug', 'ui']);
    });
  });
});
