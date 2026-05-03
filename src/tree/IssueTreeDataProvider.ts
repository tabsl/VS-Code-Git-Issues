import * as vscode from 'vscode';
import type { IssueProvider } from '../providers/IssueProvider';
import type { Issue, ListIssuesOptions } from '../types';
import { IssueTreeItem, IssueGroupTreeItem, MessageTreeItem } from './IssueTreeItem';

type TreeItem = IssueTreeItem | IssueGroupTreeItem | MessageTreeItem;

type ViewState =
  | { kind: 'no-workspace' }
  | { kind: 'no-remote' }
  | { kind: 'no-token'; platform: 'github' | 'gitlab' }
  | { kind: 'ready'; provider: IssueProvider };

export type UserScope = 'all' | 'assigned' | 'created';

export class IssueTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private viewState: ViewState = { kind: 'no-workspace' };
  private issues: Issue[] = [];
  private filter: ListIssuesOptions = {};
  private loading = false;
  private error: string | null = null;
  private currentUserLogin: string | undefined;
  private searchQuery = '';
  private userScope: UserScope = 'all';

  constructor(
    defaultState: 'open' | 'closed' | 'all',
    defaultSort: 'created' | 'updated' | 'comments'
  ) {
    this.filter.state = defaultState;
    this.filter.sort = defaultSort;
  }

  setState(
    kind: 'no-workspace' | 'no-remote' | 'no-token' | 'ready',
    platform?: 'github' | 'gitlab',
    provider?: IssueProvider | null
  ): void {
    if (kind === 'ready' && provider) {
      this.viewState = { kind: 'ready', provider };
      this.currentUserLogin = undefined;
      this.refresh();
    } else if (kind === 'no-token' && platform) {
      this.viewState = { kind: 'no-token', platform };
      this.issues = [];
      this._onDidChangeTreeData.fire(undefined);
    } else {
      this.viewState = { kind: kind as 'no-workspace' | 'no-remote' };
      this.issues = [];
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

  async refresh(): Promise<void> {
    if (this.viewState.kind !== 'ready') {
      this.issues = [];
      this._onDidChangeTreeData.fire(undefined);
      return;
    }

    this.loading = true;
    this.error = null;
    this._onDidChangeTreeData.fire(undefined);

    try {
      if (!this.currentUserLogin) {
        this.currentUserLogin = await this.viewState.provider.getCurrentUser()
          .then((u) => u.login)
          .catch(() => undefined);
      }
      this.issues = await this.viewState.provider.listIssues(this.filter);
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.issues = [];
    } finally {
      this.loading = false;
      this._onDidChangeTreeData.fire(undefined);
    }
  }

  setFilter(filter: ListIssuesOptions): void {
    this.filter = { ...this.filter, ...filter };
    this.refresh();
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
    return this.currentUserLogin;
  }

  getIssues(): readonly Issue[] {
    return this.issues;
  }

  findTreeItemForIssue(issueNumber: number): IssueTreeItem | null {
    const issue = this.issues.find((i) => i.number === issueNumber);
    return issue ? new IssueTreeItem(issue, this.currentUserLogin) : null;
  }

  private getVisibleIssues(): Issue[] {
    let result = this.issues;

    if (this.userScope !== 'all' && this.currentUserLogin) {
      const me = this.currentUserLogin;
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
      return this.getVisibleIssues()
        .filter((i) => i.state === element.state)
        .map((i) => new IssueTreeItem(i, this.currentUserLogin));
    }

    if (element) {
      return [];
    }

    // Root level - show status-specific messages
    switch (this.viewState.kind) {
      case 'no-workspace':
        return [new MessageTreeItem('Open a folder to get started')];

      case 'no-remote': {
        const folderCount = vscode.workspace.workspaceFolders?.length ?? 0;
        const message = folderCount > 1
          ? `No git remote "origin" found in any workspace folder or nested repository (${folderCount} folders scanned)`
          : 'No git remote "origin" found in workspace folder or any nested repository';
        return [new MessageTreeItem(message)];
      }

      case 'no-token':
        return [
          new MessageTreeItem(
            `Click to configure ${this.viewState.platform === 'github' ? 'GitHub' : 'GitLab'} token`,
            {
              command: this.viewState.platform === 'github'
                ? 'gitIssues.configureGitHubToken'
                : 'gitIssues.configureGitLabToken',
              title: 'Configure Token',
            }
          ),
        ];

      case 'ready':
        break;
    }

    if (this.loading) {
      return [new MessageTreeItem('Loading issues...')];
    }

    if (this.error) {
      return [new MessageTreeItem(`Error: ${this.error}`)];
    }

    if (this.issues.length === 0) {
      return [new MessageTreeItem('No issues found')];
    }

    const visible = this.getVisibleIssues();
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
        items.push(new IssueGroupTreeItem('open', open.length));
      }
      if (closed.length > 0) {
        items.push(new IssueGroupTreeItem('closed', closed.length));
      }
      return items;
    }

    return visible.map((i) => new IssueTreeItem(i, this.currentUserLogin));
  }
}
