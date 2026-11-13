import * as vscode from 'vscode';
import type { IssueTreeDataProvider } from '../tree/IssueTreeDataProvider';

const COMMAND = 'gitIssues.focusView';

export class IssueStatusBarItem implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private enabled = true;

  constructor(private readonly treeDataProvider: IssueTreeDataProvider) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      90
    );
    this.item.command = COMMAND;
    this.disposables.push(this.item);

    this.disposables.push(
      vscode.commands.registerCommand(COMMAND, () => {
        // The view container id is "git-issues" (see package.json
        // viewsContainers.activitybar). The matching focus command is
        // "git-issues.focus" — but VS Code also exposes per-view focus via
        // "<viewId>.focus", which is what we want for the actual issue list.
        vscode.commands.executeCommand('gitIssues.focus');
      })
    );

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('gitIssues.statusBar.enabled')) {
          this.applyEnabledFromConfig();
        }
      })
    );

    this.disposables.push(
      treeDataProvider.onDidChangeTreeData(() => this.refresh())
    );

    this.applyEnabledFromConfig();
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
      .get<boolean>('statusBar.enabled', true);
    if (!this.enabled) {
      this.item.hide();
    } else {
      this.refresh();
    }
  }

  private refresh(): void {
    if (!this.enabled) {
      return;
    }
    const snapshots = this.treeDataProvider.getRepoSnapshots();

    // Hide only while we have no signal at all that a provider is wired up.
    // Once we know the current user, keep the item visible — even at zero
    // issues — so the user can always click through to the sidebar and see
    // that the extension is alive.
    if (snapshots.every((s) => s.issues.length === 0 && !s.currentUserLogin)) {
      this.item.hide();
      return;
    }

    let open = 0;
    let assigned = 0;
    for (const { issues, currentUserLogin: me } of snapshots) {
      const openIssues = issues.filter((i) => i.state === 'open');
      open += openIssues.length;
      if (me) {
        assigned += openIssues.filter((i) => i.assignees.some((a) => a.login === me)).length;
      }
    }

    if (assigned > 0) {
      this.item.text = `$(issues) ${open} · $(person) ${assigned}`;
      this.item.tooltip = `Git Issues: ${open} open, ${assigned} assigned to you. Click to open the sidebar.`;
    } else {
      this.item.text = `$(issues) ${open}`;
      this.item.tooltip = open === 0
        ? 'Git Issues: no open issues. Click to open the sidebar.'
        : `Git Issues: ${open} open. Click to open the sidebar.`;
    }
    this.item.show();
  }
}
