import * as path from 'path';
import * as vscode from 'vscode';
import { Configuration } from './config/Configuration';
import { ProviderFactory } from './providers/ProviderFactory';
import { RepositoryResolver, type DetectedRepository } from './git/RepositoryResolver';
import { IssueTreeDataProvider } from './tree/IssueTreeDataProvider';
import { registerCommands } from './commands';
import type { IssueProvider } from './providers/IssueProvider';
import { extractIssueNumberFromBranch } from './git/BranchIssueLinker';
import { IssueStatusBarItem } from './ui/StatusBarItem';
import { NotificationTracker } from './ui/NotificationTracker';
import { IssueCache } from './cache/IssueCache';

const ACTIVE_REPO_KEY = 'gitIssues.activeRepositoryPath';

let currentProvider: IssueProvider | null = null;
let activeRepository: DetectedRepository | null = null;
let detectedRepositories: DetectedRepository[] = [];
let treeView: vscode.TreeView<unknown> | null = null;
let notificationTrackerRef: NotificationTracker | null = null;
const log = vscode.window.createOutputChannel('Git Issues');

export async function activate(context: vscode.ExtensionContext) {
  log.appendLine('Git Issues extension activating...');
  const config = new Configuration(context);

  // TreeView
  const issueCache = config.isOfflineCacheEnabled()
    ? new IssueCache(context.globalState)
    : null;
  const treeDataProvider = new IssueTreeDataProvider(
    config.getDefaultState(),
    config.getDefaultSort(),
    issueCache
  );
  treeView = vscode.window.createTreeView('gitIssues', {
    treeDataProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  const statusBarItem = new IssueStatusBarItem(treeDataProvider);
  context.subscriptions.push(statusBarItem);

  const notificationTracker = new NotificationTracker(context, treeView, treeDataProvider);
  notificationTrackerRef = notificationTracker;
  context.subscriptions.push(notificationTracker);

  // Commands
  registerCommands(
    context,
    config,
    treeDataProvider,
    () => currentProvider,
    () => activeRepository,
    async (folderPath?: string) => {
      if (folderPath !== undefined) {
        await context.workspaceState.update(ACTIVE_REPO_KEY, folderPath);
      }
      ProviderFactory.clear();
      await initProvider(context, config, treeDataProvider);
    }
  );

  // Initialize provider
  await initProvider(context, config, treeDataProvider);

  const reinit = (cause: string) => {
    ProviderFactory.clear();
    initProvider(context, config, treeDataProvider).catch(err => {
      log.appendLine(`Re-initialization (${cause}) error: ${err instanceof Error ? err.message : String(err)}`);
    });
  };

  // React to workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => reinit('workspace-folders'))
  );

  // Follow the active editor to switch repos automatically — but only while
  // the user hasn't pinned a repo via the Quick Pick (which sets ACTIVE_REPO_KEY).
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (context.workspaceState.get<string>(ACTIVE_REPO_KEY)) {
        return;
      }
      const file = editor?.document.uri.fsPath;
      if (!file || detectedRepositories.length < 2) {
        return;
      }
      const match = detectedRepositories
        .filter(d => isInside(file, d.rootPath))
        .sort((a, b) => b.rootPath.length - a.rootPath.length)[0];
      if (match && match.rootPath !== activeRepository?.rootPath) {
        log.appendLine(`Active editor switched — following repo to ${match.displayName} (${match.remote.owner}/${match.remote.repo})`);
        reinit('active-editor');
      }
    })
  );

  // React to nested git repos opening / closing (e.g. monorepos where the
  // workspace root is the parent and actual git repos live in subfolders).
  const gitApi = await RepositoryResolver.getGitApi();
  if (gitApi) {
    context.subscriptions.push(
      gitApi.onDidOpenRepository(() => reinit('repo-opened')),
      gitApi.onDidCloseRepository(() => reinit('repo-closed'))
    );
    if (gitApi.state === 'uninitialized') {
      context.subscriptions.push(
        gitApi.onDidChangeState(state => {
          if (state === 'initialized') {
            reinit('git-api-initialized');
          }
        })
      );
    }

    // Watch each repo's HEAD for branch switches and offer to open the
    // matching issue (`123-…`, `feature/issue-123-…`, …).
    const lastBranchByRepo = new Map<string, string>();
    const wireBranchWatcher = (repo: typeof gitApi.repositories[number]) => {
      const repoKey = repo.rootUri.fsPath;
      lastBranchByRepo.set(repoKey, repo.state.HEAD?.name ?? '');
      context.subscriptions.push(
        repo.state.onDidChange(() => {
          const newBranch = repo.state.HEAD?.name ?? '';
          const previous = lastBranchByRepo.get(repoKey) ?? '';
          if (newBranch === previous) {
            return;
          }
          lastBranchByRepo.set(repoKey, newBranch);
          handleBranchSwitch(newBranch, repoKey);
        })
      );
    };
    for (const repo of gitApi.repositories) {
      wireBranchWatcher(repo);
    }
    context.subscriptions.push(
      gitApi.onDidOpenRepository((repo) => wireBranchWatcher(repo))
    );
  } else {
    log.appendLine('VSCode git extension not available — falling back to workspace-folder scan only');
  }

  function handleBranchSwitch(branchName: string, repoKey: string): void {
    const cfg = vscode.workspace.getConfiguration('gitIssues');
    if (!cfg.get<boolean>('autoLinkBranchToIssue', true)) {
      return;
    }
    const issueNumber = extractIssueNumberFromBranch(branchName);
    if (!issueNumber) {
      return;
    }
    if (activeRepository && activeRepository.rootPath !== repoKey) {
      return;
    }
    log.appendLine(`Branch "${branchName}" → issue #${issueNumber}`);
    vscode.window
      .showInformationMessage(
        `Branch "${branchName}" looks linked to issue #${issueNumber}.`,
        'Open Issue',
        'Don’t ask again'
      )
      .then((choice) => {
        if (choice === 'Open Issue') {
          vscode.commands.executeCommand('gitIssues.openIssue', issueNumber);
        } else if (choice === 'Don’t ask again') {
          cfg.update('autoLinkBranchToIssue', false, vscode.ConfigurationTarget.Global);
        }
      });
  }

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
      initProvider(context, config, treeDataProvider).catch(err => {
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
  context: vscode.ExtensionContext,
  config: Configuration,
  treeDataProvider: IssueTreeDataProvider
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    log.appendLine('No workspace folder found');
    currentProvider = null;
    activeRepository = null;
    detectedRepositories = [];
    updateTreeViewDescription();
    await updateMultiRepoContext();
    treeDataProvider.setState('no-workspace');
    return;
  }

  log.appendLine(
    `Workspace folders: ${folders.map(f => f.uri.fsPath).join(', ')}`
  );

  detectedRepositories = await RepositoryResolver.detectAll();
  await updateMultiRepoContext();

  if (detectedRepositories.length === 0) {
    log.appendLine('No git remote "origin" found in any workspace folder');
    currentProvider = null;
    activeRepository = null;
    notificationTrackerRef?.setActiveRepo(null);
    updateTreeViewDescription();
    treeDataProvider.setState('no-remote');
    return;
  }

  const storedPath = context.workspaceState.get<string>(ACTIVE_REPO_KEY);
  const selected = pickInitialRepository(detectedRepositories, storedPath, activeRepository);
  activeRepository = selected;
  notificationTrackerRef?.setActiveRepo(selected.rootPath);

  if (detectedRepositories.length > 1) {
    log.appendLine(
      `Multiple repositories detected (${detectedRepositories.length}). Active: ${selected.displayName} (${selected.remote.owner}/${selected.remote.repo})`
    );
  }

  updateTreeViewDescription();

  try {
    const result = await ProviderFactory.create(selected.rootPath, {
      githubToken: await config.getGitHubToken(),
      getGitLabToken: (host) => config.getGitLabToken(host),
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

function pickInitialRepository(
  repos: DetectedRepository[],
  storedPath: string | undefined,
  current: DetectedRepository | null
): DetectedRepository {
  // 1. Stored choice from a previous Quick Pick wins.
  if (storedPath) {
    const stored = repos.find(d => d.rootPath === storedPath);
    if (stored) {
      return stored;
    }
  }

  // 2. If we already have an active repo and it's still in the list, keep it
  //    so the selection doesn't bounce as new nested repos are discovered.
  if (current) {
    const stillThere = repos.find(d => d.rootPath === current.rootPath);
    if (stillThere) {
      return stillThere;
    }
  }

  // 3. Prefer the repo containing the file in the active editor.
  const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (activeFile) {
    const matching = repos
      .filter(d => isInside(activeFile, d.rootPath))
      .sort((a, b) => b.rootPath.length - a.rootPath.length); // deepest first
    if (matching.length > 0) {
      return matching[0];
    }
  }

  // 4. Avoid worktrees as default — they share an origin with the main repo
  //    and are rarely the user's intended target.
  const nonWorktree = repos.filter(d => !isWorktreePath(d.rootPath));
  if (nonWorktree.length > 0) {
    return nonWorktree[0];
  }

  return repos[0];
}

function isInside(filePath: string, rootPath: string): boolean {
  if (filePath === rootPath) {
    return true;
  }
  const prefix = rootPath.endsWith(path.sep) ? rootPath : rootPath + path.sep;
  return filePath.startsWith(prefix);
}

function isWorktreePath(p: string): boolean {
  return p.split(path.sep).includes('worktrees');
}

function updateTreeViewDescription(): void {
  if (!treeView) {
    return;
  }
  const parts: string[] = [];
  if (detectedRepositories.length > 1 && activeRepository) {
    parts.push(`${activeRepository.remote.owner}/${activeRepository.remote.repo}`);
  }
  if (currentSearchQuery) {
    parts.push(`🔍 ${currentSearchQuery}`);
  }
  treeView.description = parts.length > 0 ? parts.join(' · ') : undefined;
}

let currentSearchQuery = '';

export function setSearchDescription(query: string): void {
  currentSearchQuery = query;
  updateTreeViewDescription();
}

async function updateMultiRepoContext(): Promise<void> {
  await vscode.commands.executeCommand(
    'setContext',
    'gitIssues.multipleRepositories',
    detectedRepositories.length > 1
  );
}

export function deactivate() {
  ProviderFactory.clear();
}
