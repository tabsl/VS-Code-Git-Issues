import * as vscode from 'vscode';
import type { IssueTreeDataProvider } from '../tree/IssueTreeDataProvider';
import type { Issue } from '../types';

const LAST_SEEN_KEY_PREFIX = 'gitIssues.lastSeen:';

export class NotificationTracker implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private repoKey: string | null = null;
  private enabled = true;
  // Snapshot of issues from the last `mark all as read` action, used to keep
  // the badge stable until the user explicitly opens the sidebar again.
  private wasFocusedSinceLastFire = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly treeView: vscode.TreeView<unknown>,
    private readonly treeDataProvider: IssueTreeDataProvider
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('gitIssues.notifications.enabled')) {
          this.applyEnabledFromConfig();
        }
      })
    );

    this.disposables.push(
      treeDataProvider.onDidChangeTreeData(() => this.refresh())
    );

    // When the user focuses the view, treat the current state as "seen".
    this.disposables.push(
      treeView.onDidChangeVisibility((e) => {
        if (e.visible) {
          this.markAllRead();
        }
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('gitIssues.markIssuesRead', () => {
        this.markAllRead();
      })
    );

    this.applyEnabledFromConfig();
  }

  setActiveRepo(repoKey: string | null): void {
    this.repoKey = repoKey;
    this.refresh();
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private applyEnabledFromConfig(): void {
    this.enabled = vscode.workspace
      .getConfiguration('gitIssues')
      .get<boolean>('notifications.enabled', true);
    if (!this.enabled) {
      this.treeView.badge = undefined;
    } else {
      this.refresh();
    }
  }

  private getLastSeen(): number {
    if (!this.repoKey) {
      return 0;
    }
    return this.context.globalState.get<number>(this.lastSeenKey(), 0);
  }

  private async setLastSeen(value: number): Promise<void> {
    if (!this.repoKey) {
      return;
    }
    await this.context.globalState.update(this.lastSeenKey(), value);
  }

  private lastSeenKey(): string {
    return `${LAST_SEEN_KEY_PREFIX}${this.repoKey}`;
  }

  private markAllRead(): void {
    if (!this.repoKey) {
      return;
    }
    const issues = this.treeDataProvider.getIssues();
    const newest = newestUpdate(issues);
    void this.setLastSeen(newest);
    this.treeView.badge = undefined;
  }

  private refresh(): void {
    if (!this.enabled || !this.repoKey) {
      this.treeView.badge = undefined;
      return;
    }
    const me = this.treeDataProvider.getCurrentUserLogin();
    const issues = this.treeDataProvider.getIssues();
    if (issues.length === 0) {
      this.treeView.badge = undefined;
      return;
    }

    // Avoid badging on first ever load — without a baseline, every issue
    // looks "new". Seed the timestamp instead.
    const lastSeen = this.getLastSeen();
    if (lastSeen === 0) {
      void this.setLastSeen(newestUpdate(issues));
      this.treeView.badge = undefined;
      return;
    }

    const candidates = relevantToUser(issues, me);
    const unread = candidates.filter((i) => i.updatedAt.getTime() > lastSeen);

    // If the view is already focused, mark seen immediately rather than
    // showing a badge the user is staring straight at.
    if (this.treeView.visible) {
      void this.setLastSeen(newestUpdate(issues));
      this.treeView.badge = undefined;
      return;
    }

    if (unread.length === 0) {
      this.treeView.badge = undefined;
      return;
    }
    this.treeView.badge = {
      value: unread.length,
      tooltip: tooltipFor(unread, me),
    };
    this.wasFocusedSinceLastFire = false;
  }
}

function newestUpdate(issues: readonly Issue[]): number {
  let max = 0;
  for (const i of issues) {
    const t = i.updatedAt.getTime();
    if (t > max) {
      max = t;
    }
  }
  return max;
}

function relevantToUser(issues: readonly Issue[], me: string | undefined): Issue[] {
  if (!me) {
    // No identity yet — surface assigned/authored after we do, until then
    // count nothing rather than spamming a badge.
    return [];
  }
  return issues.filter((i) =>
    i.author.login === me || i.assignees.some((a) => a.login === me)
  );
}

function tooltipFor(unread: Issue[], me: string | undefined): string {
  if (unread.length === 1) {
    const i = unread[0];
    const role = me && i.author.login === me ? 'authored' : 'assigned';
    return `Git Issues: 1 update on an issue ${role} by you (#${i.number} ${i.title})`;
  }
  return `Git Issues: ${unread.length} updates on issues you author or are assigned to`;
}
