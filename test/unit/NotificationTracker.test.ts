import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { NotificationTracker } from '../../src/ui/NotificationTracker';
import type { IssueTreeDataProvider } from '../../src/tree/IssueTreeDataProvider';
import type { Issue } from '../../src/types';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 1,
    title: 'Test',
    state: 'open',
    author: { id: 1, login: 'someone' },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    labels: [],
    assignees: [],
    commentCount: 0,
    ...overrides,
  };
}

function makeContext() {
  const store = new Map<string, unknown>();
  return {
    globalState: {
      get: <T>(k: string, def: T) => (store.has(k) ? (store.get(k) as T) : def),
      update: vi.fn(async (k: string, v: unknown) => {
        store.set(k, v);
      }),
    },
  } as unknown as vscode.ExtensionContext;
}

function makeTree(visible = false) {
  const visibilityListeners: Array<(e: { visible: boolean }) => void> = [];
  const tree = {
    dispose: vi.fn(),
    badge: undefined as unknown,
    visible,
    onDidChangeVisibility: vi.fn((listener: (e: { visible: boolean }) => void) => {
      visibilityListeners.push(listener);
      return { dispose: vi.fn() };
    }),
    __setVisible: (v: boolean) => {
      tree.visible = v;
      visibilityListeners.forEach((l) => l({ visible: v }));
    },
  };
  return tree as unknown as vscode.TreeView<unknown> & { __setVisible: (v: boolean) => void };
}

function makeTdp(issues: Issue[], me?: string) {
  return makeMultiTdp([{ repoKey: '/repo/a', issues, me }]);
}

function makeMultiTdp(repos: Array<{ repoKey: string; issues: Issue[]; me?: string; name?: string }>) {
  const dataListeners: Array<() => void> = [];
  return {
    getRepoSnapshots: vi.fn(() =>
      repos.map((r) => ({
        repoKey: r.repoKey,
        repo: r.name
          ? { remote: { owner: r.name.split('/')[0], repo: r.name.split('/')[1] } }
          : null,
        issues: r.issues,
        currentUserLogin: r.me,
      }))
    ),
    onDidChangeTreeData: vi.fn((listener: () => void) => {
      dataListeners.push(listener);
      return { dispose: vi.fn() };
    }),
    __fire: () => dataListeners.forEach((l) => l()),
  } as unknown as IssueTreeDataProvider & { __fire: () => void };
}

describe('NotificationTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode as any).__resetConfigStores?.();
  });

  it('does not badge on the very first load (no baseline)', () => {
    const ctx = makeContext();
    const tree = makeTree(false);
    const tdp = makeTdp(
      [makeIssue({ updatedAt: new Date('2026-04-01'), assignees: [{ id: 1, login: 'me' }] })],
      'me'
    );
    const tracker = new NotificationTracker(ctx, tree, tdp);
    expect(tree.badge).toBeUndefined();
    tracker.dispose();
  });

  it('badges when an assigned issue updates after the last seen timestamp', () => {
    const ctx = makeContext();
    // Seed last-seen so it's not the "first ever load" path.
    (ctx.globalState as any).update('gitIssues.lastSeen:/repo/a', new Date('2026-04-01').getTime());

    const tree = makeTree(false);
    const tdp = makeTdp(
      [
        makeIssue({
          number: 7,
          updatedAt: new Date('2026-05-02'),
          assignees: [{ id: 1, login: 'me' }],
        }),
        makeIssue({ number: 8, updatedAt: new Date('2026-05-02') }),
      ],
      'me'
    );
    const tracker = new NotificationTracker(ctx, tree, tdp);

    expect(tree.badge).toEqual({
      value: 1,
      tooltip: expect.stringContaining('#7'),
    });
    tracker.dispose();
  });

  it('does not show a badge when the view is currently visible', () => {
    const ctx = makeContext();
    (ctx.globalState as any).update('gitIssues.lastSeen:/repo/a', new Date('2026-04-01').getTime());

    const tree = makeTree(true); // visible from the start
    const tdp = makeTdp(
      [
        makeIssue({
          updatedAt: new Date('2026-05-02'),
          assignees: [{ id: 1, login: 'me' }],
        }),
      ],
      'me'
    );
    const tracker = new NotificationTracker(ctx, tree, tdp);

    expect(tree.badge).toBeUndefined();
    tracker.dispose();
  });

  it('clears the badge when the view becomes visible', () => {
    const ctx = makeContext();
    (ctx.globalState as any).update('gitIssues.lastSeen:/repo/a', new Date('2026-04-01').getTime());

    const tree = makeTree(false);
    const tdp = makeTdp(
      [
        makeIssue({
          updatedAt: new Date('2026-05-02'),
          assignees: [{ id: 1, login: 'me' }],
        }),
      ],
      'me'
    );
    const tracker = new NotificationTracker(ctx, tree, tdp);
    expect(tree.badge).toBeDefined();

    (tree as any).__setVisible(true);
    expect(tree.badge).toBeUndefined();
    tracker.dispose();
  });

  it('ignores updates on issues the user is not involved in', () => {
    const ctx = makeContext();
    (ctx.globalState as any).update('gitIssues.lastSeen:/repo/a', new Date('2026-04-01').getTime());

    const tree = makeTree(false);
    const tdp = makeTdp(
      [makeIssue({ updatedAt: new Date('2026-05-02') })], // no me involvement
      'me'
    );
    const tracker = new NotificationTracker(ctx, tree, tdp);
    expect(tree.badge).toBeUndefined();
    tracker.dispose();
  });

  it('hides the badge when notifications.enabled is false', async () => {
    const cfg = vscode.workspace.getConfiguration('gitIssues');
    await cfg.update('notifications.enabled', false);

    const ctx = makeContext();
    (ctx.globalState as any).update('gitIssues.lastSeen:/repo/a', new Date('2026-04-01').getTime());

    const tree = makeTree(false);
    const tdp = makeTdp(
      [
        makeIssue({
          updatedAt: new Date('2026-05-02'),
          assignees: [{ id: 1, login: 'me' }],
        }),
      ],
      'me'
    );
    const tracker = new NotificationTracker(ctx, tree, tdp);
    expect(tree.badge).toBeUndefined();
    tracker.dispose();
  });

  it('counts unread issues per repo with that repo\'s login and baseline', () => {
    const ctx = makeContext();
    (ctx.globalState as any).update('gitIssues.lastSeen:/repo/a', new Date('2026-04-01').getTime());
    (ctx.globalState as any).update('gitIssues.lastSeen:/repo/b', new Date('2026-04-01').getTime());

    const tree = makeTree(false);
    const tdp = makeMultiTdp([
      {
        repoKey: '/repo/a',
        name: 'acme/web',
        me: 'alice',
        issues: [makeIssue({ number: 7, updatedAt: new Date('2026-05-02'), assignees: [{ id: 1, login: 'alice' }] })],
      },
      {
        repoKey: '/repo/b',
        name: 'acme/api',
        me: 'bob',
        issues: [
          makeIssue({ number: 9, updatedAt: new Date('2026-05-02'), author: { id: 2, login: 'bob' } }),
          makeIssue({ number: 10, updatedAt: new Date('2026-05-02'), assignees: [{ id: 1, login: 'alice' }] }),
        ],
      },
    ]);
    const tracker = new NotificationTracker(ctx, tree, tdp);
    expect(tree.badge).toEqual({ value: 2, tooltip: expect.stringContaining('2 updates') });
    tracker.dispose();
  });

  it('names the repo in the tooltip when several repos are shown', () => {
    const ctx = makeContext();
    (ctx.globalState as any).update('gitIssues.lastSeen:/repo/a', new Date('2026-04-01').getTime());
    (ctx.globalState as any).update('gitIssues.lastSeen:/repo/b', new Date('2026-06-01').getTime());

    const tree = makeTree(false);
    const tdp = makeMultiTdp([
      {
        repoKey: '/repo/a',
        name: 'acme/web',
        me: 'me',
        issues: [makeIssue({ number: 7, updatedAt: new Date('2026-05-02'), assignees: [{ id: 1, login: 'me' }] })],
      },
      {
        repoKey: '/repo/b',
        name: 'acme/api',
        me: 'me',
        issues: [makeIssue({ number: 8, updatedAt: new Date('2026-05-02'), assignees: [{ id: 1, login: 'me' }] })],
      },
    ]);
    const tracker = new NotificationTracker(ctx, tree, tdp);
    expect(tree.badge).toEqual({ value: 1, tooltip: expect.stringContaining('acme/web#7') });
    tracker.dispose();
  });

  it('marks every shown repo as read when the view becomes visible', () => {
    const ctx = makeContext();
    (ctx.globalState as any).update('gitIssues.lastSeen:/repo/a', new Date('2026-04-01').getTime());
    (ctx.globalState as any).update('gitIssues.lastSeen:/repo/b', new Date('2026-04-01').getTime());

    const tree = makeTree(false);
    const tdp = makeMultiTdp([
      { repoKey: '/repo/a', me: 'me', issues: [makeIssue({ updatedAt: new Date('2026-05-02') })] },
      { repoKey: '/repo/b', me: 'me', issues: [makeIssue({ updatedAt: new Date('2026-05-03') })] },
    ]);
    const tracker = new NotificationTracker(ctx, tree, tdp);
    (tree as any).__setVisible(true);

    const get = (k: string) => (ctx.globalState as any).get(k, 0);
    expect(get('gitIssues.lastSeen:/repo/a')).toBe(new Date('2026-05-02').getTime());
    expect(get('gitIssues.lastSeen:/repo/b')).toBe(new Date('2026-05-03').getTime());
    tracker.dispose();
  });
});
