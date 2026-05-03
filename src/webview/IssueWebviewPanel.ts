import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import type { IssueProvider } from '../providers/IssueProvider';
import { GitOperations } from '../git/GitOperations';

function getNonce(): string {
  // CSP nonces must be unpredictable to a third party. Math.random is not
  // cryptographically secure; use the platform CSPRNG instead.
  return randomBytes(24).toString('base64');
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

  private async loadIssue(): Promise<boolean> {
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
      const me = await this.provider.getCurrentUser().catch(() => null);
      const linkedPullRequests = await this.provider
        .listLinkedPullRequests(this.issueNumber)
        .catch((err) => {
          console.warn('Failed to load linked PRs/MRs:', err);
          return [];
        });
      this.panel.title = `Issue #${issue.number}: ${issue.title}`;
      this.panel.webview.postMessage({
        type: 'issueLoaded',
        issue,
        labels,
        assignees,
        repositoryInfo: this.provider.getRepositoryInfo(),
        currentUserLogin: me?.login,
        linkedPullRequests,
      });
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to load issue: ${err instanceof Error ? err.message : err}`
      );
      return false;
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
          case 'uploadFile':
            await this.handleUploadFile(msg.fileName, msg.fileContentBase64, msg.uploadId);
            break;
          case 'pickFile':
            await this.handlePickFile();
            break;
          case 'proxyImage':
            await this.handleProxyImage(msg.requestId, msg.imageUrl);
            break;
          case 'pickSlashCommand':
            await this.handlePickSlashCommand(msg.requestId);
            break;
          case 'toggleIssueReaction':
            await this.handleToggleIssueReaction(msg.content);
            break;
          case 'toggleCommentReaction':
            await this.handleToggleCommentReaction(msg.commentId, msg.content);
            break;
          case 'updateComment':
            await this.handleUpdateComment(msg.commentId, msg.body);
            break;
          case 'deleteComment':
            await this.handleDeleteComment(msg.commentId);
            break;
          case 'openExternal':
            this.handleOpenExternal(msg.url);
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
    console.log('[Git Issues] handleUpdateIssue called with data keys:', Object.keys(data));
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out after 30s')), 30_000)
      );
      await Promise.race([
        this.provider.updateIssue(this.issueNumber, data),
        timeout,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('[Git Issues] updateIssue failed:', message);
      this.panel.webview.postMessage({
        type: 'operationFailed',
        operation: 'updateIssue',
        message,
      });
      vscode.window.showErrorMessage(
        `Failed to update issue: ${message}`
      );
      return;
    }

    console.log('[Git Issues] updateIssue succeeded, reloading...');
    vscode.window.showInformationMessage('Issue updated');
    this.panel.webview.postMessage({ type: 'editComplete' });
    await this.loadIssue();
  }

  private handleOpenInBrowser(): void {
    const url = this.provider.getIssueUrl(this.issueNumber);
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private handleOpenExternal(url: string): void {
    // Validate URL before delegating to the OS — only http/https. Anything
    // else (file://, javascript:, custom schemes) is rejected.
    let parsed: vscode.Uri;
    try {
      parsed = vscode.Uri.parse(url, true);
    } catch {
      return;
    }
    if (parsed.scheme !== 'https' && parsed.scheme !== 'http') {
      return;
    }
    vscode.env.openExternal(parsed);
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

  private async handleUploadFile(fileName: string, fileContentBase64: string, uploadId: string): Promise<void> {
    if (!this.provider.supportsFileUpload() || !this.provider.uploadFile) {
      this.panel.webview.postMessage({
        type: 'uploadNotSupported',
        platform: this.provider.platform,
      });
      return;
    }

    try {
      this.panel.webview.postMessage({
        type: 'uploadProgress',
        uploadId,
        status: 'uploading',
      });

      const fileContent = Buffer.from(fileContentBase64, 'base64');
      const result = await this.provider.uploadFile(fileName, fileContent);

      this.panel.webview.postMessage({
        type: 'uploadProgress',
        uploadId,
        status: 'completed',
        markdown: result.markdown,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.panel.webview.postMessage({
        type: 'uploadProgress',
        uploadId,
        status: 'failed',
        message,
      });
    }
  }

  private async handlePickFile(): Promise<void> {
    if (!this.provider.supportsFileUpload()) {
      this.panel.webview.postMessage({
        type: 'uploadNotSupported',
        platform: this.provider.platform,
      });
      return;
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      filters: {
        'All Files': ['*'],
        'Images': ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'],
        'Documents': ['pdf', 'doc', 'docx', 'txt', 'md', 'csv'],
      },
    });

    if (!uris || uris.length === 0) { return; }

    try {
      const files = await Promise.all(
        uris.map(async (uri) => {
          const content = await vscode.workspace.fs.readFile(uri);
          const fileName = uri.path.split('/').pop() || 'file';
          return {
            fileName,
            fileContentBase64: Buffer.from(content).toString('base64'),
          };
        })
      );

      this.panel.webview.postMessage({ type: 'filesPicked', files });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.panel.webview.postMessage({
        type: 'operationFailed',
        operation: 'uploadFile',
        message: `Failed to read file: ${message}`,
      });
    }
  }

  private async handlePickSlashCommand(requestId: string): Promise<void> {
    const platform = this.provider.platform;
    const groups: Array<{ label: string; commands: Array<{ label: string; snippet: string; description?: string }> }> = [
      {
        label: 'Status',
        commands: [
          { label: '/close', snippet: '/close', description: 'Close this issue when the comment is posted' },
          { label: '/reopen', snippet: '/reopen', description: 'Reopen this issue when the comment is posted' },
        ],
      },
      {
        label: 'People',
        commands: [
          { label: '/assign', snippet: '/assign @username', description: 'Assign someone (replace @username)' },
          { label: '/unassign', snippet: '/unassign @username', description: 'Remove an assignee' },
          { label: '/cc', snippet: '/cc @username', description: 'Mention without assigning (GitLab)' },
        ],
      },
      {
        label: 'Labels & Milestone',
        commands: [
          { label: '/label', snippet: '/label ~labelname', description: 'Add a label' },
          { label: '/unlabel', snippet: '/unlabel ~labelname', description: 'Remove a label' },
          { label: '/milestone', snippet: '/milestone %milestonename', description: 'Set the milestone' },
        ],
      },
      {
        label: 'Other',
        commands: [
          { label: '/due', snippet: '/due 2026-12-31', description: 'Set a due date (GitLab)' },
          { label: '/estimate', snippet: '/estimate 1d 2h', description: 'Set time estimate (GitLab)' },
          { label: '/spend', snippet: '/spend 30m', description: 'Add spent time (GitLab)' },
          { label: '/lock', snippet: '/lock', description: 'Lock the issue (GitLab)' },
        ],
      },
    ];

    type Item = vscode.QuickPickItem & { snippet?: string };
    const items: Item[] = [];
    for (const g of groups) {
      items.push({ label: g.label, kind: vscode.QuickPickItemKind.Separator });
      for (const c of g.commands) {
        items.push({ label: c.label, description: c.description, snippet: c.snippet });
      }
    }

    const placeHolder = platform === 'gitlab'
      ? 'Pick a slash command — GitLab parses these on submit'
      : 'Pick a slash command — note: GitHub does NOT execute these natively';

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder,
      matchOnDescription: true,
    });
    if (!picked || !picked.snippet) {
      return;
    }
    this.panel.webview.postMessage({
      type: 'slashCommandPicked',
      requestId,
      snippet: picked.snippet,
    });
  }

  private async handleUpdateComment(commentId: number, body: string): Promise<void> {
    try {
      await this.provider.updateComment(commentId, body);
      await this.loadIssue();
      vscode.window.showInformationMessage('Comment updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.panel.webview.postMessage({
        type: 'operationFailed',
        operation: 'updateComment',
        message,
      });
      vscode.window.showErrorMessage(`Failed to update comment: ${message}`);
    }
  }

  private async handleDeleteComment(commentId: number): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Delete this comment? This cannot be undone.',
      { modal: true },
      'Delete'
    );
    if (confirm !== 'Delete') {
      return;
    }
    try {
      await this.provider.deleteComment(commentId);
      await this.loadIssue();
      vscode.window.showInformationMessage('Comment deleted');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.panel.webview.postMessage({
        type: 'operationFailed',
        operation: 'deleteComment',
        message,
      });
      vscode.window.showErrorMessage(`Failed to delete comment: ${message}`);
    }
  }

  private async handleToggleIssueReaction(content: string): Promise<void> {
    try {
      await this.provider.toggleIssueReaction(this.issueNumber, content as never);
      await this.loadIssue();
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to toggle reaction: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  private async handleToggleCommentReaction(commentId: number, content: string): Promise<void> {
    try {
      await this.provider.toggleCommentReaction(commentId, content as never);
      await this.loadIssue();
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to toggle reaction: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  private async handleProxyImage(requestId: string, imageUrl: string): Promise<void> {
    if (!this.provider.fetchImage) {
      this.panel.webview.postMessage({ type: 'imageProxyFailed', requestId, imageUrl });
      return;
    }

    try {
      const dataUri = await this.provider.fetchImage(imageUrl);
      this.panel.webview.postMessage({ type: 'imageProxied', requestId, dataUri });
    } catch (err) {
      console.warn('[Git Issues] Image proxy failed:', imageUrl, err);
      this.panel.webview.postMessage({ type: 'imageProxyFailed', requestId, imageUrl });
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
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: http: data:;">
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
