import * as vscode from 'vscode';
import type { IssueTreeDataProvider, RepoSnapshot } from '../tree/IssueTreeDataProvider';
import type { Issue } from '../types';

const LAST_SEEN_KEY_PREFIX = 'gitIssues.lastSeen:';

export class NotificationTracker implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
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

  private trackedSnapshots(): Array<RepoSnapshot & { repoKey: string }> {
    return this.treeDataProvider
      .getRepoSnapshots()
      .filter((s): s is RepoSnapshot & { repoKey: string } => s.repoKey !== null);
  }

  private getLastSeen(repoKey: string): number {
    return this.context.globalState.get<number>(`${LAST_SEEN_KEY_PREFIX}${repoKey}`, 0);
  }

  private async setLastSeen(repoKey: string, value: number): Promise<void> {
    await this.context.globalState.update(`${LAST_SEEN_KEY_PREFIX}${repoKey}`, value);
  }

  private markAllRead(): void {
    for (const snapshot of this.trackedSnapshots()) {
      void this.setLastSeen(snapshot.repoKey, newestUpdate(snapshot.issues));
    }
    this.treeView.badge = undefined;
  }

  private refresh(): void {
    const snapshots = this.trackedSnapshots();
    if (!this.enabled || snapshots.length === 0) {
      this.treeView.badge = undefined;
      return;
    }

    const unread: Array<{ issue: Issue; me: string | undefined; snapshot: RepoSnapshot }> = [];
    for (const snapshot of snapshots) {
      const { repoKey, issues, currentUserLogin: me } = snapshot;
      if (issues.length === 0) {
        continue;
      }

      // Avoid badging on first ever load — without a baseline, every issue
      // looks "new". Seed the timestamp instead.
      const lastSeen = this.getLastSeen(repoKey);
      if (lastSeen === 0) {
        void this.setLastSeen(repoKey, newestUpdate(issues));
        continue;
      }

      // If the view is already focused, mark seen immediately rather than
      // showing a badge the user is staring straight at.
      if (this.treeView.visible) {
        void this.setLastSeen(repoKey, newestUpdate(issues));
        continue;
      }

      for (const issue of relevantToUser(issues, me)) {
        if (issue.updatedAt.getTime() > lastSeen) {
          unread.push({ issue, me, snapshot });
        }
      }
    }

    if (unread.length === 0) {
      this.treeView.badge = undefined;
      return;
    }
    this.treeView.badge = {
      value: unread.length,
      tooltip: tooltipFor(unread, snapshots.length > 1),
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

function tooltipFor(
  unread: Array<{ issue: Issue; me: string | undefined; snapshot: RepoSnapshot }>,
  multipleRepos: boolean
): string {
  if (unread.length === 1) {
    const { issue: i, me, snapshot } = unread[0];
    const role = me && i.author.login === me ? 'authored' : 'assigned';
    const remote = snapshot.repo?.remote;
    const ref = multipleRepos && remote ? `${remote.owner}/${remote.repo}#${i.number}` : `#${i.number}`;
    return `Git Issues: 1 update on an issue ${role} by you (${ref} ${i.title})`;
  }
  return `Git Issues: ${unread.length} updates on issues you author or are assigned to`;
}
