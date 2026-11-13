import * as vscode from 'vscode';
import { Configuration } from './config/Configuration';
import { ProviderFactory } from './providers/ProviderFactory';
import { RepositoryResolver, type DetectedRepository } from './git/RepositoryResolver';
import { RepositorySelection, type RepoContext } from './git/RepositorySelection';
import { IssueTreeDataProvider } from './tree/IssueTreeDataProvider';
import { registerCommands } from './commands';
import type { IssueProvider } from './providers/IssueProvider';
import { extractIssueNumberFromBranch } from './git/BranchIssueLinker';
import { IssueStatusBarItem } from './ui/StatusBarItem';
import { NotificationTracker } from './ui/NotificationTracker';
import { IssueCache } from './cache/IssueCache';

let currentProvider: IssueProvider | null = null;
let activeRepository: DetectedRepository | null = null;
let detectedRepositories: DetectedRepository[] = [];
let repoContexts: RepoContext[] = [];
let initGeneration = 0;
let treeView: vscode.TreeView<unknown> | null = null;
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
    issueCache,
    config.getMaxIssues()
  );
  treeView = vscode.window.createTreeView('gitIssues', {
    treeDataProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  const statusBarItem = new IssueStatusBarItem(treeDataProvider);
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(new NotificationTracker(context, treeView, treeDataProvider));

  // Commands
  registerCommands(
    context,
    config,
    treeDataProvider,
    () => currentProvider,
    () => activeRepository,
    async () => {
      ProviderFactory.clear();
      await initProvider(context, config, treeDataProvider);
    },
    () => repoContexts
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
  // the user hasn't picked repos via the Quick Pick.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (RepositorySelection.isPinned(context.workspaceState)) {
        return;
      }
      const file = editor?.document.uri;
      if (!file || detectedRepositories.length < 2) {
        return;
      }
      const match = detectedRepositories
        .filter(d => RepositoryResolver.contains(d, file))
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
      const repoKey = RepositoryResolver.keyFor(repo.rootUri);
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
    if (!repoContexts.some(c => c.repo.rootPath === repoKey)) {
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
          vscode.commands.executeCommand('gitIssues.openIssue', issueNumber, repoKey);
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

  // React to GitHub sign-in/out via the VSCode account so we can switch between
  // "no-token" and "ready" without requiring a manual reload.
  context.subscriptions.push(
    config.onDidChangeGitHubSession(() => reinit('github-session-changed'))
  );

  // React to config changes
  context.subscriptions.push(
    config.onDidChange(() => {
      log.appendLine('Configuration changed, re-initializing...');
      treeDataProvider.setMaxIssues(config.getMaxIssues());
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
  // Overlapping runs (repo detection, selection, config change) must not let a
  // slower, older run overwrite the state of the newer one.
  const generation = ++initGeneration;
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    log.appendLine('No workspace folder found');
    currentProvider = null;
    activeRepository = null;
    detectedRepositories = [];
    repoContexts = [];
    updateTreeViewDescription();
    await updateMultiRepoContext();
    if (generation !== initGeneration) {
      return;
    }
    treeDataProvider.setState('no-workspace');
    return;
  }

  log.appendLine(
    `Workspace folders: ${folders.map(f => f.uri.toString()).join(', ')}`
  );

  const detected = await RepositoryResolver.detectAll();
  if (generation !== initGeneration) {
    return;
  }
  detectedRepositories = detected;
  await updateMultiRepoContext();
  if (generation !== initGeneration) {
    return;
  }

  if (detectedRepositories.length === 0) {
    log.appendLine('No git remote "origin" found in any workspace folder');
    currentProvider = null;
    activeRepository = null;
    repoContexts = [];
    updateTreeViewDescription();
    treeDataProvider.setState('no-remote');
    return;
  }

  const selected = RepositorySelection.effective(
    RepositorySelection.readStored(context.workspaceState),
    detectedRepositories
  );
  const shown = selected.length > 0
    ? selected
    : [RepositorySelection.autoPick(
        detectedRepositories,
        activeRepository,
        vscode.window.activeTextEditor?.document.uri
      )];

  if (detectedRepositories.length > 1) {
    log.appendLine(
      `Multiple repositories detected (${detectedRepositories.length}). Shown: ${shown.map(r => `${r.displayName} (${r.remote.owner}/${r.remote.repo})`).join(', ')}`
    );
  }

  const contexts = await RepositorySelection.buildContexts(shown, {
    githubToken: await config.getGitHubAuthToken(),
    getGitLabToken: (host) => config.getGitLabToken(host),
    gitlabUrl: config.getGitLabUrl(),
  });
  if (generation !== initGeneration) {
    return;
  }
  activeRepository = shown[0];
  repoContexts = contexts;

  for (const { repo, state } of repoContexts) {
    const name = `${repo.remote.host}/${repo.remote.owner}/${repo.remote.repo}`;
    if (state.kind === 'ready') {
      const info = state.provider.getRepositoryInfo();
      log.appendLine(`Connected to ${info.platform}: ${info.owner}/${info.repo} (${info.baseUrl})`);
    } else if (state.kind === 'no-token') {
      log.appendLine(`Detected ${state.platform} repo (${name}) but no token configured`);
    } else {
      log.appendLine(`Error for ${name}: ${state.message}`);
    }
  }

  const primary = repoContexts[0].state;
  currentProvider = primary.kind === 'ready' ? primary.provider : null;
  if (repoContexts.length === 1 && primary.kind === 'error') {
    vscode.window.showErrorMessage(`Git Issues: ${primary.message}`);
  }

  updateTreeViewDescription();
  treeDataProvider.setRepoContexts(repoContexts);
}

function updateTreeViewDescription(): void {
  if (!treeView) {
    return;
  }
  const parts: string[] = [];
  if (repoContexts.length > 1) {
    parts.push(`${repoContexts.length} repositories`);
  } else if (detectedRepositories.length > 1 && activeRepository) {
    parts.push(`${activeRepository.remote.owner}/${activeRepository.remote.repo}`);
  }
  if (currentLabelFilter.length > 0) {
    parts.push(`Labels: ${currentLabelFilter.join(', ')}`);
  }
  if (currentMilestoneFilter) {
    parts.push(`Milestone: ${currentMilestoneFilter}`);
  }
  if (currentSearchQuery) {
    parts.push(`🔍 ${currentSearchQuery}`);
  }
  treeView.description = parts.length > 0 ? parts.join(' · ') : undefined;
}

let currentSearchQuery = '';
let currentLabelFilter: string[] = [];
let currentMilestoneFilter: string | undefined;

export function setSearchDescription(query: string): void {
  currentSearchQuery = query;
  updateTreeViewDescription();
}

export function setLabelFilterDescription(labels: string[]): void {
  currentLabelFilter = labels;
  updateTreeViewDescription();
}

export function setMilestoneFilterDescription(milestone: string | undefined): void {
  currentMilestoneFilter = milestone;
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
