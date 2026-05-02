import * as vscode from 'vscode';
import type { Configuration } from '../config/Configuration';
import type { IssueProvider } from '../providers/IssueProvider';
import type { IssueTreeDataProvider } from '../tree/IssueTreeDataProvider';
import type { IssueTreeItem } from '../tree/IssueTreeItem';
import type { DetectedRepository } from '../git/RepositoryResolver';
import { RepositoryResolver } from '../git/RepositoryResolver';
import { GitOperations } from '../git/GitOperations';
import { setSearchDescription } from '../extension';

export function registerCommands(
  context: vscode.ExtensionContext,
  config: Configuration,
  treeDataProvider: IssueTreeDataProvider,
  getProvider: () => IssueProvider | null,
  getActiveRepository: () => DetectedRepository | null,
  reinitializeProvider: (folderPath?: string) => Promise<void>
): void {
  // Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.refresh', () => {
      treeDataProvider.refresh();
    })
  );

  // Search (local filter)
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.search', async () => {
      const current = treeDataProvider.getSearchQuery();
      const query = await vscode.window.showInputBox({
        prompt: 'Search issues (title, #number, author, label, assignee)',
        placeHolder: 'Type to filter loaded issues, leave empty to clear',
        value: current,
        ignoreFocusOut: true,
      });
      if (query === undefined) { return; }
      const trimmed = query.trim();
      treeDataProvider.setSearchQuery(trimmed);
      setSearchDescription(trimmed);
      await vscode.commands.executeCommand(
        'setContext',
        'gitIssues.hasSearchQuery',
        trimmed.length > 0
      );
    })
  );

  // Clear search
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.clearSearch', async () => {
      treeDataProvider.setSearchQuery('');
      setSearchDescription('');
      await vscode.commands.executeCommand(
        'setContext',
        'gitIssues.hasSearchQuery',
        false
      );
    })
  );

  // Open Issue in Webview
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.openIssue', async (issueNumber: number) => {
      const provider = getProvider();
      if (!provider) {
        vscode.window.showErrorMessage('Git Issues: No provider available');
        return;
      }

      const { IssueWebviewPanel } = await import('../webview/IssueWebviewPanel');
      IssueWebviewPanel.show(context.extensionUri, provider, issueNumber);
    })
  );

  // Create Issue
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.createIssue', async () => {
      const provider = getProvider();
      if (!provider) {
        vscode.window.showErrorMessage('Git Issues: No provider available');
        return;
      }

      const title = await vscode.window.showInputBox({
        prompt: 'Issue Title',
        placeHolder: 'Enter issue title...',
        ignoreFocusOut: true,
      });
      if (!title) { return; }

      const body = await vscode.window.showInputBox({
        prompt: 'Issue Description (optional)',
        placeHolder: 'Enter issue description...',
        ignoreFocusOut: true,
      });

      try {
        const currentUser = await provider.getCurrentUser().catch(() => null);
        const issue = await provider.createIssue({
          title,
          body: body || '',
          assignees: currentUser ? [currentUser.login] : undefined,
        });
        vscode.window.showInformationMessage(`Issue #${issue.number} created`);
        treeDataProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to create issue: ${err instanceof Error ? err.message : err}`
        );
      }
    })
  );

  // Filter
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.filter', async () => {
      const currentFilter = treeDataProvider.getFilter();

      const stateItems: vscode.QuickPickItem[] = [
        { label: 'Open', description: 'Show open issues', picked: currentFilter.state === 'open' },
        { label: 'Closed', description: 'Show closed issues', picked: currentFilter.state === 'closed' },
        { label: 'All', description: 'Show all issues', picked: currentFilter.state === 'all' },
      ];

      const selected = await vscode.window.showQuickPick(stateItems, {
        placeHolder: 'Filter issues by state',
      });
      if (!selected) { return; }

      const sortItems: vscode.QuickPickItem[] = [
        { label: 'Created', description: 'Sort by creation date', picked: (currentFilter.sort || 'created') === 'created' },
        { label: 'Updated', description: 'Sort by last update', picked: currentFilter.sort === 'updated' },
        { label: 'Comments', description: 'Sort by comment count / popularity', picked: currentFilter.sort === 'comments' },
      ];

      const selectedSort = await vscode.window.showQuickPick(sortItems, {
        placeHolder: 'Sort issues by',
      });
      if (!selectedSort) { return; }

      const stateMap: Record<string, 'open' | 'closed' | 'all'> = {
        Open: 'open',
        Closed: 'closed',
        All: 'all',
      };
      const sortMap: Record<string, 'created' | 'updated' | 'comments'> = {
        Created: 'created',
        Updated: 'updated',
        Comments: 'comments',
      };

      treeDataProvider.setFilter({
        state: stateMap[selected.label],
        sort: sortMap[selectedSort.label],
      });
    })
  );

  // Open in Browser
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.openInBrowser', (item: IssueTreeItem) => {
      const provider = getProvider();
      if (!provider || !item?.issue) { return; }
      const url = provider.getIssueUrl(item.issue.number);
      vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );

  // Create Branch from Issue
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.createBranchFromIssue', async (item: IssueTreeItem) => {
      if (!item?.issue) { return; }

      const repo = getActiveRepository();
      const folderPath = repo?.rootPath
        ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!folderPath) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
      }

      const defaultName = GitOperations.generateBranchName(item.issue.number, item.issue.title);

      const branchName = await vscode.window.showInputBox({
        prompt: 'Branch name',
        value: defaultName,
        ignoreFocusOut: true,
      });
      if (!branchName) { return; }

      try {
        GitOperations.createBranch(folderPath, branchName);
        vscode.window.showInformationMessage(`Switched to new branch: ${branchName}`);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to create branch: ${err instanceof Error ? err.message : err}`
        );
      }
    })
  );

  // Select Repository (only meaningful in multi-root workspaces)
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.selectRepository', async () => {
      // Re-detect to pick up any newly added repos
      const detected = await RepositoryResolver.detectAll();
      if (detected.length === 0) {
        vscode.window.showInformationMessage(
          'Git Issues: No git repositories with an "origin" remote found in workspace'
        );
        return;
      }

      const active = getActiveRepository();
      const items = detected.map(d => ({
        label: `${d.remote.owner}/${d.remote.repo}`,
        description: d.displayName,
        detail: d.rootPath,
        picked: active?.rootPath === d.rootPath,
        folderPath: d.rootPath,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select repository for Git Issues',
      });
      if (!picked) { return; }

      await reinitializeProvider(picked.folderPath);
    })
  );

  // Configure GitHub Token
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.configureGitHubToken', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'Enter your GitHub Personal Access Token',
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'ghp_...',
      });
      if (token) {
        await config.setGitHubToken(token);
        await reinitializeProvider();
        vscode.window.showInformationMessage('GitHub token saved');
      }
    })
  );

  // Configure GitLab Token
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.configureGitLabToken', async () => {
      const suggestedHost = suggestGitLabHost(config, getActiveRepository());

      const host = await vscode.window.showInputBox({
        prompt: 'GitLab host (e.g. gitlab.com or gitlab.example.com)',
        value: suggestedHost,
        ignoreFocusOut: true,
        validateInput: validateGitLabHost,
      });
      if (!host) { return; }

      const trimmedHost = host.trim();

      const token = await vscode.window.showInputBox({
        prompt: `Enter your GitLab Personal Access Token for ${trimmedHost}`,
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'glpat-...',
      });
      if (!token) { return; }

      await config.setGitLabToken(token, trimmedHost);
      await reinitializeProvider();
      vscode.window.showInformationMessage(
        `GitLab token for ${trimmedHost} saved`
      );
    })
  );

  // Manage GitLab Tokens (list / remove)
  context.subscriptions.push(
    vscode.commands.registerCommand('gitIssues.manageGitLabTokens', async () => {
      const hosts = await config.listGitLabTokenHosts();
      const hasLegacy = await config.hasLegacyGitLabToken();

      if (hosts.length === 0 && !hasLegacy) {
        vscode.window.showInformationMessage(
          'No GitLab tokens configured. Use "Git Issues: Configure GitLab Token" to add one.'
        );
        return;
      }

      type Item = vscode.QuickPickItem & { host: string; isLegacy: boolean };
      const items: Item[] = hosts.map((h) => ({
        label: h,
        description: 'Remove token',
        host: h,
        isLegacy: false,
      }));
      if (hasLegacy) {
        items.push({
          label: '$(history) Legacy default token',
          description: 'Pre-multi-host token — used as fallback. Remove after migrating.',
          host: '',
          isLegacy: true,
        });
      }

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a GitLab token to remove',
      });
      if (!picked) { return; }

      const target = picked.isLegacy ? 'legacy default token' : picked.host;
      const confirm = await vscode.window.showWarningMessage(
        `Remove GitLab ${picked.isLegacy ? target : `token for ${target}`}?`,
        { modal: true },
        'Remove'
      );
      if (confirm !== 'Remove') { return; }

      let configCleanupFailed = false;
      if (picked.isLegacy) {
        const result = await config.removeLegacyGitLabToken();
        configCleanupFailed = result.configCleanupFailed;
      } else {
        await config.removeGitLabToken(picked.host);
      }
      await reinitializeProvider();
      if (configCleanupFailed) {
        vscode.window.showWarningMessage(
          'GitLab legacy token was disabled, but the underlying ' +
            '"gitIssues.gitlab.token" config value could not be removed ' +
            'automatically. Please remove it manually from your settings.json.'
        );
      } else {
        vscode.window.showInformationMessage(
          `GitLab ${picked.isLegacy ? target : `token for ${target}`} removed`
        );
      }
    })
  );

}

function suggestGitLabHost(
  config: Configuration,
  activeRepo: DetectedRepository | null
): string {
  if (activeRepo?.remote.platform === 'gitlab') {
    return activeRepo.remote.host;
  }
  const raw = config.getGitLabUrl().trim();
  if (!raw) {
    return 'gitlab.com';
  }
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProtocol).host;
    return host || 'gitlab.com';
  } catch {
    return 'gitlab.com';
  }
}

function validateGitLabHost(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Host must not be empty';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return 'Enter only the host, not a full URL';
  }
  if (/\s/.test(trimmed)) {
    return 'Host must not contain whitespace';
  }
  // Use the URL parser as a single source of truth — it handles DNS hosts,
  // SSH-style underscore aliases (Node is permissive there), bracketed IPv6
  // literals and ports out of the box. Anything that survives parsing as a
  // bare host is accepted; paths, query strings, fragments and credentials
  // are explicitly rejected.
  let parsed: URL;
  try {
    parsed = new URL(`https://${trimmed.replace(/\/+$/, '')}/`);
  } catch {
    return 'Invalid host';
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return 'Enter only the host (and optional :port)';
  }
  if (parsed.username || parsed.password) {
    return 'Host must not include credentials';
  }
  if (!parsed.host) {
    return 'Invalid host';
  }
  return undefined;
}
