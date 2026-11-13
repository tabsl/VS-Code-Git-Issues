import * as vscode from 'vscode';
import type { IssueProvider } from '../providers/IssueProvider';
import type { Issue, ListIssuesOptions } from '../types';
import type { DetectedRepository } from '../git/RepositoryResolver';
import type { RepoContext } from '../git/RepositorySelection';
import { IssueTreeItem, IssueGroupTreeItem, MessageTreeItem, RepositoryTreeItem } from './IssueTreeItem';
import type { IssueCache } from '../cache/IssueCache';
import { RepoIssueSource } from './RepoIssueSource';

type TreeItem = IssueTreeItem | IssueGroupTreeItem | MessageTreeItem | RepositoryTreeItem;

export type UserScope = 'all' | 'assigned' | 'created';

export interface RepoSnapshot {
  repoKey: string | null;
  repo: DetectedRepository | null;
  issues: readonly Issue[];
  currentUserLogin: string | undefined;
}

export class IssueTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private emptyKind: 'no-workspace' | 'no-remote' = 'no-workspace';
  private sources: RepoIssueSource[] = [];
  private grouped = false;
  private filter: ListIssuesOptions = {};
  private searchQuery = '';
  private userScope: UserScope = 'all';

  constructor(
    defaultState: 'open' | 'closed' | 'all',
    defaultSort: 'created' | 'updated' | 'comments',
    private readonly cache: IssueCache | null = null,
    private maxIssues = 100
  ) {
    this.filter.state = defaultState;
    this.filter.sort = defaultSort;
  }

  setState(
    kind: 'no-workspace' | 'no-remote' | 'no-token' | 'ready',
    platform?: 'github' | 'gitlab',
    provider?: IssueProvider | null
  ): void {
    this.grouped = false;
    if (kind === 'ready' && provider) {
      this.sources = [this.createSource(null, { kind: 'ready', provider })];
      this.refresh();
    } else if (kind === 'no-token' && platform) {
      this.sources = [this.createSource(null, { kind: 'no-token', platform })];
      this._onDidChangeTreeData.fire(undefined);
    } else {
      this.emptyKind = kind as 'no-workspace' | 'no-remote';
      this.sources = [];
      this._onDidChangeTreeData.fire(undefined);
    }
  }

  // Keep for backward compat with commands
  setProvider(provider: IssueProvider | null): void {
    if (provider) {
      this.setState('ready', undefined, provider);
    } else {
      this.setState('no-remote');
    }
  }

  setRepoContexts(contexts: RepoContext[]): void {
    this.sources = contexts.map((c) => this.createSource(c.repo, c.state));
    this.grouped = this.sources.length > 1;
    this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.sources.some((s) => s.state.kind === 'ready')) {
      this._onDidChangeTreeData.fire(undefined);
      return;
    }
    await Promise.all(
      this.sources.map((s) => s.load(this.filter, this.maxIssues))
    );
  }

  setFilter(filter: ListIssuesOptions): void {
    this.filter = { ...this.filter, ...filter };
    this.refresh();
  }

  setMaxIssues(maxIssues: number): void {
    this.maxIssues = maxIssues;
  }

  getFilter(): ListIssuesOptions {
    return { ...this.filter };
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query.trim();
    this._onDidChangeTreeData.fire(undefined);
  }

  getSearchQuery(): string {
    return this.searchQuery;
  }

  setUserScope(scope: UserScope): void {
    this.userScope = scope;
    this._onDidChangeTreeData.fire(undefined);
  }

  getUserScope(): UserScope {
    return this.userScope;
  }

  getCurrentUserLogin(): string | undefined {
    return this.sources.find((s) => s.currentUserLogin)?.currentUserLogin;
  }

  getIssues(): readonly Issue[] {
    return this.sources.flatMap((s) => s.issues);
  }

  getRepoSnapshots(): RepoSnapshot[] {
    return this.sources.map((s) => ({
      repoKey: s.repoKey,
      repo: s.repo,
      issues: s.issues,
      currentUserLogin: s.currentUserLogin,
    }));
  }

  findTreeItemForIssue(issueNumber: number): IssueTreeItem | null {
    const issue = this.getIssues().find((i) => i.number === issueNumber);
    return issue ? new IssueTreeItem(issue, this.getCurrentUserLogin()) : null;
  }

  private createSource(
    repo: DetectedRepository | null,
    state: RepoContext['state']
  ): RepoIssueSource {
    const source: RepoIssueSource = new RepoIssueSource(repo, state, this.cache, () => {
      if (this.sources.includes(source)) {
        this._onDidChangeTreeData.fire(undefined);
      }
    });
    return source;
  }

  private getVisibleIssues(source: RepoIssueSource): Issue[] {
    let result = source.issues;

    if (this.userScope !== 'all' && source.currentUserLogin) {
      const me = source.currentUserLogin;
      result = result.filter((i) => {
        if (this.userScope === 'assigned') {
          return i.assignees.some((a) => a.login === me);
        }
        if (this.userScope === 'created') {
          return i.author.login === me;
        }
        return true;
      });
    }

    if (this.searchQuery) {
      const needle = this.searchQuery.toLowerCase();
      result = result.filter((i) => {
        if (i.title.toLowerCase().includes(needle)) {
          return true;
        }
        if (`#${i.number}`.includes(needle) || String(i.number) === needle) {
          return true;
        }
        if (i.author.login.toLowerCase().includes(needle)) {
          return true;
        }
        if (i.labels.some((l) => l.name.toLowerCase().includes(needle))) {
          return true;
        }
        if (i.assignees.some((a) => a.login.toLowerCase().includes(needle))) {
          return true;
        }
        return false;
      });
    }

    return result;
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): TreeItem[] {
    if (element instanceof IssueGroupTreeItem) {
      const source = this.sources.find((s) => s.repoKey === element.repoKey);
      if (!source) {
        return [];
      }
      return this.getVisibleIssues(source)
        .filter((i) => i.state === element.state)
        .map((i) => new IssueTreeItem(i, source.currentUserLogin, source.repoKey));
    }

    if (element instanceof RepositoryTreeItem) {
      const source = this.sources.find((s) => s.repoKey === element.repoKey);
      return source ? this.getSourceChildren(source) : [];
    }

    if (element) {
      return [];
    }

    if (this.sources.length === 0) {
      if (this.emptyKind === 'no-workspace') {
        return [new MessageTreeItem('Open a folder to get started')];
      }
      const folderCount = vscode.workspace.workspaceFolders?.length ?? 0;
      const message = folderCount > 1
        ? `No git remote "origin" found in any workspace folder or nested repository (${folderCount} folders scanned)`
        : 'No git remote "origin" found in workspace folder or any nested repository';
      return [new MessageTreeItem(message)];
    }

    if (!this.grouped) {
      return this.getSourceChildren(this.sources[0]);
    }

    return this.sources.map((source) => {
      const counted = source.state.kind === 'ready'
        && !source.error
        && !(source.loading && source.issues.length === 0);
      return new RepositoryTreeItem(
        source.repo!,
        counted ? this.getVisibleIssues(source).length : null,
        source.state.kind === 'ready'
      );
    });
  }

  private getSourceChildren(source: RepoIssueSource): TreeItem[] {
    const state = source.state;
    if (state.kind === 'no-token') {
      return [
        new MessageTreeItem(
          state.platform === 'github'
            ? 'Click to sign in to GitHub'
            : 'Click to configure GitLab token',
          {
            command: state.platform === 'github'
              ? 'gitIssues.configureGitHubToken'
              : 'gitIssues.configureGitLabToken',
            title: state.platform === 'github'
              ? 'Sign in to GitHub'
              : 'Configure Token',
            arguments: state.host ? [state.host] : undefined,
          }
        ),
      ];
    }

    if (state.kind === 'error') {
      return [new MessageTreeItem(`Error: ${state.message}`)];
    }

    if (source.loading) {
      return [new MessageTreeItem('Loading issues...')];
    }

    if (source.error) {
      return [new MessageTreeItem(`Error: ${source.error}`)];
    }

    if (source.issues.length === 0) {
      return [new MessageTreeItem('No issues found')];
    }

    const visible = this.getVisibleIssues(source);
    if (visible.length === 0) {
      if (this.searchQuery) {
        return [
          new MessageTreeItem(
            `No issues match "${this.searchQuery}"`,
            { command: 'gitIssues.clearSearch', title: 'Clear search' }
          ),
        ];
      }
      if (this.userScope === 'assigned') {
        return [new MessageTreeItem('No issues assigned to you')];
      }
      if (this.userScope === 'created') {
        return [new MessageTreeItem('No issues created by you')];
      }
      return [new MessageTreeItem('No issues found')];
    }

    if (this.filter.state === 'all') {
      const open = visible.filter((i) => i.state === 'open');
      const closed = visible.filter((i) => i.state === 'closed');
      const items: TreeItem[] = [];
      if (open.length > 0) {
        items.push(new IssueGroupTreeItem('open', open.length, source.repoKey));
      }
      if (closed.length > 0) {
        items.push(new IssueGroupTreeItem('closed', closed.length, source.repoKey));
      }
      return items;
    }

    return visible.map((i) => new IssueTreeItem(i, source.currentUserLogin, source.repoKey));
  }
}
