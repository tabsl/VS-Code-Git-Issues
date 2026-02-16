import * as vscode from 'vscode';
import { Configuration } from './config/Configuration';
import { ProviderFactory } from './providers/ProviderFactory';
import { IssueTreeDataProvider } from './tree/IssueTreeDataProvider';
import { registerCommands } from './commands';
import type { IssueProvider } from './providers/IssueProvider';

let currentProvider: IssueProvider | null = null;
const log = vscode.window.createOutputChannel('Git Issues');

export async function activate(context: vscode.ExtensionContext) {
  log.appendLine('Git Issues extension activating...');
  const config = new Configuration(context);

  // TreeView
  const treeDataProvider = new IssueTreeDataProvider(
    config.getDefaultState(),
    config.getDefaultSort()
  );
  const treeView = vscode.window.createTreeView('gitIssues', {
    treeDataProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Commands
  registerCommands(
    context,
    config,
    treeDataProvider,
    () => currentProvider,
    async () => {
      ProviderFactory.clear();
      await initProvider(config, treeDataProvider);
    }
  );

  // Initialize provider
  await initProvider(config, treeDataProvider);

  // React to workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      ProviderFactory.clear();
      initProvider(config, treeDataProvider).catch(err => {
        log.appendLine(`Re-initialization error: ${err instanceof Error ? err.message : String(err)}`);
      });
    })
  );

  let autoRefreshTimer: ReturnType<typeof setInterval> | undefined;
  const configureAutoRefresh = () => {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = undefined;
    }

    const interval = config.getAutoRefreshInterval();
    if (interval > 0) {
      autoRefreshTimer = setInterval(() => {
        treeDataProvider.refresh().catch(err => {
          log.appendLine(`Auto-refresh error: ${err instanceof Error ? err.message : String(err)}`);
        });
      }, interval * 1000);
    }
  };

  // React to config changes
  context.subscriptions.push(
    config.onDidChange(() => {
      log.appendLine('Configuration changed, re-initializing...');
      treeDataProvider.setFilter({
        state: config.getDefaultState(),
        sort: config.getDefaultSort(),
      });
      configureAutoRefresh();
      ProviderFactory.clear();
      initProvider(config, treeDataProvider).catch(err => {
        log.appendLine(`Re-initialization error: ${err instanceof Error ? err.message : String(err)}`);
      });
    })
  );

  // Auto-refresh
  configureAutoRefresh();
  context.subscriptions.push(
    new vscode.Disposable(() => {
      if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
      }
    })
  );

  log.appendLine('Git Issues extension activated');
}

async function initProvider(
  config: Configuration,
  treeDataProvider: IssueTreeDataProvider
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    log.appendLine('No workspace folder found');
    currentProvider = null;
    treeDataProvider.setState('no-workspace');
    return;
  }

  log.appendLine(`Workspace: ${folder.uri.fsPath}`);

  try {
    const result = await ProviderFactory.create(folder.uri.fsPath, {
      githubToken: await config.getGitHubToken(),
      gitlabToken: await config.getGitLabToken(),
      gitlabUrl: config.getGitLabUrl(),
    });

    currentProvider = result.provider;

    if (result.reason === 'no-remote') {
      log.appendLine('No git remote "origin" found');
      treeDataProvider.setState('no-remote');
    } else if (result.reason === 'no-token') {
      const platform = result.remote!.platform;
      log.appendLine(`Detected ${platform} repo (${result.remote!.host}/${result.remote!.owner}/${result.remote!.repo}) but no token configured`);
      treeDataProvider.setState('no-token', platform);
    } else {
      const info = result.provider!.getRepositoryInfo();
      log.appendLine(`Connected to ${info.platform}: ${info.owner}/${info.repo} (${info.baseUrl})`);
      treeDataProvider.setState('ready', undefined, result.provider);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.appendLine(`Error: ${msg}`);
    currentProvider = null;
    treeDataProvider.setState('no-remote');
    vscode.window.showErrorMessage(`Git Issues: ${msg}`);
  }
}

export function deactivate() {
  ProviderFactory.clear();
}
