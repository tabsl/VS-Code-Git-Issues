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
    const issues = this.treeDataProvider.getIssues();
    const me = this.treeDataProvider.getCurrentUserLogin();
    if (issues.length === 0) {
      // Hide entirely when there's no provider / nothing to show, instead of
      // sitting in the status bar at "0".
      this.item.hide();
      return;
    }

    const open = issues.filter((i) => i.state === 'open').length;
    const assigned = me
      ? issues.filter(
          (i) =>
            i.state === 'open' && i.assignees.some((a) => a.login === me)
        ).length
      : 0;

    if (assigned > 0) {
      this.item.text = `$(issues) ${open} · $(person) ${assigned}`;
      this.item.tooltip = `Git Issues: ${open} open, ${assigned} assigned to you. Click to open the sidebar.`;
    } else {
      this.item.text = `$(issues) ${open}`;
      this.item.tooltip = `Git Issues: ${open} open. Click to open the sidebar.`;
    }
    this.item.show();
  }
}
