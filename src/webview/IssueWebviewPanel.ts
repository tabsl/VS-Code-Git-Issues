import * as vscode from 'vscode';
import type { IssueProvider } from '../providers/IssueProvider';
import { GitOperations } from '../git/GitOperations';

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

export class IssueWebviewPanel {
  private static currentPanel: IssueWebviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri,
    private provider: IssueProvider,
    private issueNumber: number
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.html = this.getHtml();
    this.setupMessageHandling();
    this.loadIssue();
  }

  static show(
    extensionUri: vscode.Uri,
    provider: IssueProvider,
    issueNumber: number
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (IssueWebviewPanel.currentPanel) {
      IssueWebviewPanel.currentPanel.provider = provider;
      IssueWebviewPanel.currentPanel.issueNumber = issueNumber;
      IssueWebviewPanel.currentPanel.panel.reveal(column);
      IssueWebviewPanel.currentPanel.panel.webview.html =
        IssueWebviewPanel.currentPanel.getHtml();
      IssueWebviewPanel.currentPanel.loadIssue();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitIssueDetail',
      `Issue #${issueNumber}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
        ],
        retainContextWhenHidden: true,
      }
    );

    IssueWebviewPanel.currentPanel = new IssueWebviewPanel(
      panel,
      extensionUri,
      provider,
      issueNumber
    );
  }

  private async loadIssue(): Promise<void> {
    try {
      const issue = await this.provider.getIssue(this.issueNumber);
      const labels = await this.provider.listLabels().catch((err) => {
        console.warn('Failed to load labels:', err);
        return [];
      });
      const assignees = await this.provider.listAssignees().catch((err) => {
        console.warn('Failed to load assignees:', err);
        return [];
      });
      this.panel.title = `Issue #${issue.number}: ${issue.title}`;
      this.panel.webview.postMessage({
        type: 'issueLoaded',
        issue,
        labels,
        assignees,
        repositoryInfo: this.provider.getRepositoryInfo(),
      });
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to load issue: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  private setupMessageHandling(): void {
    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.type) {
          case 'addComment':
            await this.handleAddComment(msg.body);
            break;
          case 'updateIssue':
            await this.handleUpdateIssue(msg.data);
            break;
          case 'openInBrowser':
            this.handleOpenInBrowser();
            break;
          case 'createBranch':
            await this.handleCreateBranch();
            break;
          case 'refresh':
            await this.loadIssue();
            break;
        }
      },
      null,
      this.disposables
    );
  }

  private async handleAddComment(body: string): Promise<void> {
    try {
      const comment = await this.provider.addComment(this.issueNumber, body);
      this.panel.webview.postMessage({ type: 'commentAdded', comment });
      vscode.window.showInformationMessage('Comment added');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.panel.webview.postMessage({
        type: 'operationFailed',
        operation: 'addComment',
        message,
      });
      vscode.window.showErrorMessage(
        `Failed to add comment: ${message}`
      );
    }
  }

  private async handleUpdateIssue(data: any): Promise<void> {
    try {
      await this.provider.updateIssue(this.issueNumber, data);
      vscode.window.showInformationMessage('Issue updated');
      await this.loadIssue();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.panel.webview.postMessage({
        type: 'operationFailed',
        operation: 'updateIssue',
        message,
      });
      vscode.window.showErrorMessage(
        `Failed to update issue: ${message}`
      );
    }
  }

  private handleOpenInBrowser(): void {
    const url = this.provider.getIssueUrl(this.issueNumber);
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private async handleCreateBranch(): Promise<void> {
    try {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        throw new Error('No workspace folder found');
      }

      const issue = await this.provider.getIssue(this.issueNumber);
      const defaultName = GitOperations.generateBranchName(issue.number, issue.title);

      const branchName = await vscode.window.showInputBox({
        prompt: 'Branch name',
        value: defaultName,
        ignoreFocusOut: true,
      });
      if (!branchName) {
        return;
      }

      GitOperations.createBranch(folder.uri.fsPath, branchName);
      vscode.window.showInformationMessage(`Switched to new branch: ${branchName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.panel.webview.postMessage({
        type: 'operationFailed',
        operation: 'createBranch',
        message,
      });
      vscode.window.showErrorMessage(
        `Failed to create branch: ${message}`
      );
    }
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'index.js')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:;">
  <title>Issue #${this.issueNumber}</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    IssueWebviewPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
