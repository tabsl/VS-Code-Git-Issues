import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { IssueStatusBarItem } from '../../src/ui/StatusBarItem';
import type { IssueTreeDataProvider } from '../../src/tree/IssueTreeDataProvider';
import type { Issue } from '../../src/types';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 1,
    title: 'Test',
    state: 'open',
    author: { id: 1, login: 'someone' },
    createdAt: new Date(),
    updatedAt: new Date(),
    labels: [],
    assignees: [],
    commentCount: 0,
    ...overrides,
  };
}

function makeTdp(issues: Issue[], me?: string): IssueTreeDataProvider {
  const listeners: Array<() => void> = [];
  return {
    getIssues: vi.fn(() => issues),
    getCurrentUserLogin: vi.fn(() => me),
    onDidChangeTreeData: vi.fn((listener) => {
      listeners.push(listener);
      return { dispose: vi.fn() };
    }),
    __fire: () => listeners.forEach((l) => l()),
  } as unknown as IssueTreeDataProvider;
}

describe('IssueStatusBarItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode as any).__resetConfigStores?.();
  });

  it('shows total open count when no user is known', () => {
    const tdp = makeTdp([
      makeIssue({ state: 'open' }),
      makeIssue({ state: 'open' }),
      makeIssue({ state: 'closed' }),
    ]);
    const sb = new IssueStatusBarItem(tdp);

    const created = (vscode.window.createStatusBarItem as any).mock.results[0].value;
    expect(created.text).toBe('$(issues) 2');
    expect(created.show).toHaveBeenCalled();

    sb.dispose();
  });

  it('appends "assigned to me" count when user matches', () => {
    const tdp = makeTdp(
      [
        makeIssue({ number: 1, state: 'open', assignees: [{ id: 1, login: 'me' }] }),
        makeIssue({ number: 2, state: 'open' }),
        makeIssue({ number: 3, state: 'closed', assignees: [{ id: 1, login: 'me' }] }),
      ],
      'me'
    );
    const sb = new IssueStatusBarItem(tdp);
    const created = (vscode.window.createStatusBarItem as any).mock.results[0].value;
    // 2 open total, 1 assigned to me — closed assigned issue does not count.
    expect(created.text).toBe('$(issues) 2 · $(person) 1');
    sb.dispose();
  });

  it('hides the item when there is no provider signal at all (no issues, no user)', () => {
    const tdp = makeTdp([]);
    const sb = new IssueStatusBarItem(tdp);
    const created = (vscode.window.createStatusBarItem as any).mock.results[0].value;
    expect(created.hide).toHaveBeenCalled();
    sb.dispose();
  });

  it('keeps the item visible at "0 open" once the provider is authenticated', () => {
    const tdp = makeTdp([], 'me');
    const sb = new IssueStatusBarItem(tdp);
    const created = (vscode.window.createStatusBarItem as any).mock.results[0].value;
    expect(created.text).toBe('$(issues) 0');
    expect(created.show).toHaveBeenCalled();
    sb.dispose();
  });

  it('hides the item when statusBar.enabled is false', async () => {
    const cfg = vscode.workspace.getConfiguration('gitIssues');
    await cfg.update('statusBar.enabled', false);

    const tdp = makeTdp([makeIssue({ state: 'open' })]);
    const sb = new IssueStatusBarItem(tdp);
    const created = (vscode.window.createStatusBarItem as any).mock.results[0].value;
    expect(created.hide).toHaveBeenCalled();
    sb.dispose();
  });
});
