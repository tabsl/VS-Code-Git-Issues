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

export class IssueTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private viewState: ViewState = { kind: 'no-workspace' };
  private issues: Issue[] = [];
  private filter: ListIssuesOptions = {};
  private loading = false;
  private error: string | null = null;
  private currentUserLogin: string | undefined;

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

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): TreeItem[] {
    if (element instanceof IssueGroupTreeItem) {
      return this.issues
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

      case 'no-remote':
        return [new MessageTreeItem('No git remote "origin" found')];

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

    if (this.filter.state === 'all') {
      const open = this.issues.filter((i) => i.state === 'open');
      const closed = this.issues.filter((i) => i.state === 'closed');
      const items: TreeItem[] = [];
      if (open.length > 0) {
        items.push(new IssueGroupTreeItem('open', open.length));
      }
      if (closed.length > 0) {
        items.push(new IssueGroupTreeItem('closed', closed.length));
      }
      return items;
    }

    return this.issues.map((i) => new IssueTreeItem(i, this.currentUserLogin));
  }
}
