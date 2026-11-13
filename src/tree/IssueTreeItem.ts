import * as vscode from 'vscode';
import type { Issue } from '../types';
import type { DetectedRepository } from '../git/RepositoryResolver';

export class IssueTreeItem extends vscode.TreeItem {
  constructor(
    public readonly issue: Issue,
    currentUserLogin?: string,
    public readonly repoKey: string | null = null
  ) {
    super(`#${issue.number} ${issue.title}`, vscode.TreeItemCollapsibleState.None);

    const isAssignedToMe = currentUserLogin
      ? issue.assignees.some((a) => a.login === currentUserLogin)
      : false;
    this.description = isAssignedToMe ? '@you' : '';
    this.tooltip = this.buildTooltip(isAssignedToMe);
    this.iconPath = new vscode.ThemeIcon(
      issue.state === 'open' ? 'issue-opened' : 'issue-closed',
      issue.state === 'open'
        ? new vscode.ThemeColor('charts.green')
        : new vscode.ThemeColor('charts.purple')
    );
    this.contextValue = `issue-${issue.state}`;
    this.command = {
      command: 'gitIssues.openIssue',
      title: 'Open Issue',
      arguments: repoKey ? [issue.number, repoKey] : [issue.number],
    };
  }

  private buildTooltip(isAssignedToMe: boolean): string {
    const lines = [
      `#${this.issue.number}: ${this.issue.title}`,
      `Status: ${this.issue.state}`,
      `Author: ${this.issue.author.login}`,
      `Created: ${this.issue.createdAt.toLocaleDateString()}`,
    ];
    if (isAssignedToMe) {
      lines.push('Assigned to you');
    }
    if (this.issue.labels.length > 0) {
      lines.push(`Labels: ${this.issue.labels.map((l) => l.name).join(', ')}`);
    }
    if (this.issue.assignees.length > 0) {
      lines.push(`Assignees: ${this.issue.assignees.map((a) => a.login).join(', ')}`);
    }
    if (this.issue.commentCount > 0) {
      lines.push(`Comments: ${this.issue.commentCount}`);
    }
    return lines.join('\n');
  }
}

export class IssueGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly state: 'open' | 'closed',
    count: number,
    public readonly repoKey: string | null = null
  ) {
    super(
      `${state === 'open' ? 'Open' : 'Closed'} (${count})`,
      state === 'open'
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    );
    this.contextValue = 'issue-group';
    this.iconPath = new vscode.ThemeIcon(
      state === 'open' ? 'issue-opened' : 'issue-closed'
    );
  }
}

export class RepositoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repo: DetectedRepository,
    count: number | null,
    ready: boolean
  ) {
    const name = `${repo.remote.owner}/${repo.remote.repo}`;
    super(
      count === null ? name : `${name} (${count})`,
      vscode.TreeItemCollapsibleState.Expanded
    );
    this.id = `repo:${repo.rootPath}`;
    this.description = repo.displayName;
    this.tooltip = `${repo.remote.platform} · ${repo.remote.host}/${name}\n${repo.rootPath}`;
    this.iconPath = new vscode.ThemeIcon('repo');
    this.contextValue = ready ? 'repository-ready' : 'repository';
  }

  get repoKey(): string {
    return this.repo.rootPath;
  }
}

export class MessageTreeItem extends vscode.TreeItem {
  constructor(message: string, command?: vscode.Command) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'message';
    if (command) {
      this.command = command;
    }
  }
}
