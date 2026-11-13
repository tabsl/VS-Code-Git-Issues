import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { IssueWebviewPanel } from '../../src/webview/IssueWebviewPanel';
import type { IssueProvider } from '../../src/providers/IssueProvider';

function createMockProvider(): IssueProvider {
  return {
    platform: 'github',
    isAuthenticated: () => true,
    listIssues: vi.fn(),
    getIssue: vi.fn().mockResolvedValue({
      number: 1, title: 'Test', state: 'open', body: 'Body',
      author: { id: 1, login: 'user' },
      createdAt: new Date(), updatedAt: new Date(),
      labels: [], assignees: [], commentCount: 0, comments: [],
    }),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    listComments: vi.fn(),
    addComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    listLabels: vi.fn().mockResolvedValue([]),
    listMilestones: vi.fn().mockResolvedValue([]),
    listAssignees: vi.fn().mockResolvedValue([]),
    toggleIssueReaction: vi.fn(),
    toggleCommentReaction: vi.fn(),
    listLinkedPullRequests: vi.fn().mockResolvedValue([]),
    getCurrentUser: vi.fn().mockResolvedValue({ id: 1, login: 'user' }),
    getIssueUrl: vi.fn().mockReturnValue('https://github.com/o/r/issues/1'),
    getRepositoryInfo: vi.fn().mockReturnValue({ owner: 'o', repo: 'r', platform: 'github', baseUrl: '' }),
  };
}

describe('IssueWebviewPanel', () => {
  let provider: IssueProvider;
  let mockPanel: any;
  let messageHandler: ((msg: any) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = createMockProvider();
    messageHandler = null;

    mockPanel = {
      webview: {
        html: '',
        postMessage: vi.fn(),
        asWebviewUri: vi.fn((uri: any) => uri),
        cspSource: 'https://test.vscode',
        onDidReceiveMessage: vi.fn((handler: any) => {
          messageHandler = handler;
          return { dispose: vi.fn() };
        }),
      },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
      title: '',
    };

    (vscode.window.createWebviewPanel as any).mockReturnValue(mockPanel);

    // Reset singleton
    (IssueWebviewPanel as any).currentPanel = undefined;
  });

  it('creates a webview panel', () => {
    IssueWebviewPanel.show(
      vscode.Uri.parse('file:///ext'),
      provider,
      1
    );

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      'gitIssueDetail',
      'Issue #1',
      expect.anything(),
      expect.objectContaining({ enableScripts: true })
    );
  });

  it('sets HTML content with CSP nonce', () => {
    IssueWebviewPanel.show(vscode.Uri.parse('file:///ext'), provider, 1);
    expect(mockPanel.webview.html).toContain('Content-Security-Policy');
    expect(mockPanel.webview.html).toContain('nonce-');
    expect(mockPanel.webview.html).toContain('<div id="app"></div>');
  });

  it('loads issue data on creation', async () => {
    IssueWebviewPanel.show(vscode.Uri.parse('file:///ext'), provider, 1);
    await new Promise(r => setTimeout(r, 50));

    expect(provider.getIssue).toHaveBeenCalledWith(1);
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'issueLoaded' })
    );
  });

  it('reuses existing panel for subsequent calls', () => {
    IssueWebviewPanel.show(vscode.Uri.parse('file:///ext'), provider, 1);
    IssueWebviewPanel.show(vscode.Uri.parse('file:///ext'), provider, 2);

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockPanel.reveal).toHaveBeenCalled();
  });

  it('drops a slow load for an earlier issue once another repo\'s issue is opened', async () => {
    let resolveA: (value: unknown) => void = () => undefined;
    const providerA = createMockProvider();
    (providerA.getIssue as any).mockReturnValue(new Promise((r) => { resolveA = r; }));
    (providerA.getRepositoryInfo as any).mockReturnValue({ owner: 'acme', repo: 'web', platform: 'github', baseUrl: '' });
    const providerB = createMockProvider();
    (providerB.getRepositoryInfo as any).mockReturnValue({ owner: 'acme', repo: 'api', platform: 'github', baseUrl: '' });
    (providerB.getIssue as any).mockResolvedValue({
      number: 2, title: 'From B', state: 'open', body: '',
      author: { id: 1, login: 'user' }, createdAt: new Date(), updatedAt: new Date(),
      labels: [], assignees: [], commentCount: 0, comments: [],
    });

    IssueWebviewPanel.show(vscode.Uri.parse('file:///ext'), providerA, 1);
    IssueWebviewPanel.show(vscode.Uri.parse('file:///ext'), providerB, 2);
    await new Promise(r => setTimeout(r, 20));
    resolveA({
      number: 1, title: 'From A', state: 'open', body: '',
      author: { id: 1, login: 'user' }, createdAt: new Date(), updatedAt: new Date(),
      labels: [], assignees: [], commentCount: 0, comments: [],
    });
    await new Promise(r => setTimeout(r, 20));

    const loaded = mockPanel.webview.postMessage.mock.calls
      .map((c: any[]) => c[0])
      .filter((m: any) => m.type === 'issueLoaded');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].issue.title).toBe('From B');
    expect(loaded[0].repositoryInfo.repo).toBe('api');
    expect(mockPanel.title).toBe('Issue #2: From B');
  });

  it('does not post a comment to the panel after it switched to another repo\'s issue', async () => {
    let resolveComment: (value: unknown) => void = () => undefined;
    (provider.addComment as any).mockReturnValue(new Promise((r) => { resolveComment = r; }));
    const providerB = createMockProvider();

    IssueWebviewPanel.show(vscode.Uri.parse('file:///ext'), provider, 1);
    const pending = messageHandler!({ type: 'addComment', body: 'late' });
    IssueWebviewPanel.show(vscode.Uri.parse('file:///ext'), providerB, 2);
    resolveComment({ id: 100, body: 'late', author: { id: 1, login: 'u' }, createdAt: new Date(), updatedAt: new Date() });
    await pending;

    const commentMessages = mockPanel.webview.postMessage.mock.calls
      .map((c: any[]) => c[0])
      .filter((m: any) => m.type === 'commentAdded');
    expect(commentMessages).toHaveLength(0);
    expect(provider.addComment).toHaveBeenCalledWith(1, 'late');
  });

  it('handles addComment message', async () => {
    (provider.addComment as any).mockResolvedValue({
      id: 100, body: 'test', author: { id: 1, login: 'u' },
      createdAt: new Date(), updatedAt: new Date(),
    });

    IssueWebviewPanel.show(vscode.Uri.parse('file:///ext'), provider, 1);
    await new Promise(r => setTimeout(r, 50));

    messageHandler!({ type: 'addComment', body: 'test comment' });
    await new Promise(r => setTimeout(r, 50));

    expect(provider.addComment).toHaveBeenCalledWith(1, 'test comment');
  });

  it('handles openInBrowser message', async () => {
    IssueWebviewPanel.show(vscode.Uri.parse('file:///ext'), provider, 1);
    await new Promise(r => setTimeout(r, 50));

    messageHandler!({ type: 'openInBrowser' });

    expect(provider.getIssueUrl).toHaveBeenCalledWith(1);
    expect(vscode.env.openExternal).toHaveBeenCalled();
  });
});
