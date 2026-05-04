import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueTreeDataProvider } from '../../src/tree/IssueTreeDataProvider';
import { IssueTreeItem, IssueGroupTreeItem, MessageTreeItem } from '../../src/tree/IssueTreeItem';
import type { IssueProvider } from '../../src/providers/IssueProvider';
import type { Issue } from '../../src/types';
import { IssueCache } from '../../src/cache/IssueCache';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 1,
    title: 'Test Issue',
    state: 'open',
    author: { id: 1, login: 'user' },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    labels: [],
    assignees: [],
    commentCount: 0,
    ...overrides,
  };
}

function makeProvider(issues: Issue[] = []): IssueProvider {
  return {
    platform: 'github',
    isAuthenticated: () => true,
    listIssues: vi.fn().mockResolvedValue(issues),
    getIssue: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    listComments: vi.fn(),
    addComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    listLabels: vi.fn(),
    listMilestones: vi.fn(),
    listAssignees: vi.fn(),
    toggleIssueReaction: vi.fn(),
    toggleCommentReaction: vi.fn(),
    listLinkedPullRequests: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({ id: 1, login: 'user' }),
    getIssueUrl: vi.fn(),
    getRepositoryInfo: vi.fn().mockReturnValue({ owner: 'o', repo: 'r', platform: 'github', baseUrl: '' }),
  };
}

describe('IssueTreeDataProvider', () => {
  let tdp: IssueTreeDataProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    tdp = new IssueTreeDataProvider('open', 'created');
  });

  describe('initial state', () => {
    it('shows no-workspace message by default', () => {
      const children = tdp.getChildren();
      expect(children).toHaveLength(1);
      expect(children[0]).toBeInstanceOf(MessageTreeItem);
      expect((children[0] as MessageTreeItem).label).toBe('Open a folder to get started');
    });
  });

  describe('setState', () => {
    it('shows no-remote message', () => {
      tdp.setState('no-remote');
      const children = tdp.getChildren();
      expect(children).toHaveLength(1);
      expect((children[0] as MessageTreeItem).label).toBe(
        'No git remote "origin" found in workspace folder or any nested repository'
      );
    });

    it('shows sign-in message for GitHub', () => {
      tdp.setState('no-token', 'github');
      const children = tdp.getChildren();
      expect(children).toHaveLength(1);
      expect((children[0] as MessageTreeItem).label).toBe('Click to sign in to GitHub');
    });

    it('shows configure token message for GitLab', () => {
      tdp.setState('no-token', 'gitlab');
      const children = tdp.getChildren();
      expect(children).toHaveLength(1);
      expect((children[0] as MessageTreeItem).label).toBe('Click to configure GitLab token');
    });
  });

  describe('refresh with ready state', () => {
    it('loads and displays issues', async () => {
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const provider = makeProvider(issues);

      tdp.setState('ready', undefined, provider);
      // setState triggers refresh internally, wait for it
      await new Promise(r => setTimeout(r, 50));

      const children = tdp.getChildren();
      expect(children).toHaveLength(2);
      expect(children[0]).toBeInstanceOf(IssueTreeItem);
    });

    it('shows "No issues found" when empty', async () => {
      const provider = makeProvider([]);
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      const children = tdp.getChildren();
      expect(children).toHaveLength(1);
      expect((children[0] as MessageTreeItem).label).toBe('No issues found');
    });

    it('shows error message on API failure', async () => {
      const provider = makeProvider();
      (provider.listIssues as any).mockRejectedValue(new Error('API limit'));

      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      const children = tdp.getChildren();
      expect(children).toHaveLength(1);
      expect((children[0] as MessageTreeItem).label).toBe('Error: API limit');
    });
  });

  describe('filter state "all"', () => {
    it('groups issues into Open and Closed', async () => {
      const issues = [
        makeIssue({ number: 1, state: 'open' }),
        makeIssue({ number: 2, state: 'open' }),
        makeIssue({ number: 3, state: 'closed' }),
      ];
      const provider = makeProvider(issues);

      tdp.setFilter({ state: 'all' });
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      const children = tdp.getChildren();
      expect(children).toHaveLength(2);
      expect(children[0]).toBeInstanceOf(IssueGroupTreeItem);
      expect(children[1]).toBeInstanceOf(IssueGroupTreeItem);
    });

    it('returns issues for a group element', async () => {
      const issues = [
        makeIssue({ number: 1, state: 'open' }),
        makeIssue({ number: 2, state: 'closed' }),
      ];
      const provider = makeProvider(issues);

      tdp.setFilter({ state: 'all' });
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      const groups = tdp.getChildren();
      const openGroup = groups.find(g => g instanceof IssueGroupTreeItem && g.state === 'open') as IssueGroupTreeItem;
      const openIssues = tdp.getChildren(openGroup);
      expect(openIssues).toHaveLength(1);
      expect((openIssues[0] as IssueTreeItem).issue.number).toBe(1);
    });
  });

  describe('getFilter / setFilter', () => {
    it('returns current filter', () => {
      const filter = tdp.getFilter();
      expect(filter.state).toBe('open');
      expect(filter.sort).toBe('created');
    });

    it('merges filter updates', () => {
      tdp.setFilter({ sort: 'updated' });
      const filter = tdp.getFilter();
      expect(filter.state).toBe('open');
      expect(filter.sort).toBe('updated');
    });
  });

  describe('search', () => {
    it('filters issues by title substring (case-insensitive)', async () => {
      const issues = [
        makeIssue({ number: 1, title: 'Fix login bug' }),
        makeIssue({ number: 2, title: 'Refactor menu' }),
        makeIssue({ number: 3, title: 'LOGIN error on Safari' }),
      ];
      const provider = makeProvider(issues);
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      tdp.setSearchQuery('login');
      const children = tdp.getChildren();
      expect(children).toHaveLength(2);
      expect((children[0] as IssueTreeItem).issue.number).toBe(1);
      expect((children[1] as IssueTreeItem).issue.number).toBe(3);
    });

    it('filters by issue number', async () => {
      const issues = [
        makeIssue({ number: 1 }),
        makeIssue({ number: 42 }),
        makeIssue({ number: 100 }),
      ];
      const provider = makeProvider(issues);
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      tdp.setSearchQuery('#42');
      const children = tdp.getChildren();
      expect(children).toHaveLength(1);
      expect((children[0] as IssueTreeItem).issue.number).toBe(42);
    });

    it('filters by author, label, or assignee', async () => {
      const issues = [
        makeIssue({ number: 1, author: { id: 1, login: 'alice' } }),
        makeIssue({ number: 2, labels: [{ name: 'bug', color: '' }] }),
        makeIssue({ number: 3, assignees: [{ id: 2, login: 'bob' }] }),
      ];
      const provider = makeProvider(issues);
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      tdp.setSearchQuery('alice');
      expect(tdp.getChildren()).toHaveLength(1);

      tdp.setSearchQuery('bug');
      expect(tdp.getChildren()).toHaveLength(1);

      tdp.setSearchQuery('bob');
      expect(tdp.getChildren()).toHaveLength(1);
    });

    it('shows "no match" message when search excludes all issues', async () => {
      const issues = [makeIssue({ number: 1, title: 'something' })];
      const provider = makeProvider(issues);
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      tdp.setSearchQuery('nonexistent');
      const children = tdp.getChildren();
      expect(children).toHaveLength(1);
      expect((children[0] as MessageTreeItem).label).toMatch(/no issues match/i);
    });

    it('returns all issues again when search is cleared', async () => {
      const issues = [makeIssue({ number: 1, title: 'a' }), makeIssue({ number: 2, title: 'b' })];
      const provider = makeProvider(issues);
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      tdp.setSearchQuery('a');
      expect(tdp.getChildren()).toHaveLength(1);
      tdp.setSearchQuery('');
      expect(tdp.getChildren()).toHaveLength(2);
    });
  });

  describe('userScope', () => {
    it('"assigned" filters to issues with current user as assignee', async () => {
      const issues = [
        makeIssue({ number: 1, assignees: [{ id: 1, login: 'user' }] }),
        makeIssue({ number: 2, assignees: [{ id: 2, login: 'someone' }] }),
        makeIssue({ number: 3 }),
      ];
      const provider = makeProvider(issues);
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      tdp.setUserScope('assigned');
      const children = tdp.getChildren();
      expect(children).toHaveLength(1);
      expect((children[0] as IssueTreeItem).issue.number).toBe(1);
    });

    it('"created" filters to issues authored by current user', async () => {
      const issues = [
        makeIssue({ number: 1, author: { id: 1, login: 'user' } }),
        makeIssue({ number: 2, author: { id: 2, login: 'someone' } }),
      ];
      const provider = makeProvider(issues);
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      tdp.setUserScope('created');
      const children = tdp.getChildren();
      expect(children).toHaveLength(1);
      expect((children[0] as IssueTreeItem).issue.number).toBe(1);
    });

    it('"all" disables the user scope filter', async () => {
      const issues = [
        makeIssue({ number: 1, author: { id: 1, login: 'user' } }),
        makeIssue({ number: 2, author: { id: 2, login: 'someone' } }),
      ];
      const provider = makeProvider(issues);
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      tdp.setUserScope('created');
      expect(tdp.getChildren()).toHaveLength(1);
      tdp.setUserScope('all');
      expect(tdp.getChildren()).toHaveLength(2);
    });

    it('shows scope-specific empty message', async () => {
      const issues = [makeIssue({ number: 1, author: { id: 9, login: 'someone' } })];
      const provider = makeProvider(issues);
      tdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      tdp.setUserScope('assigned');
      expect((tdp.getChildren()[0] as MessageTreeItem).label).toBe('No issues assigned to you');

      tdp.setUserScope('created');
      expect((tdp.getChildren()[0] as MessageTreeItem).label).toBe('No issues created by you');
    });
  });

  describe('offline cache', () => {
    function memoryMemento() {
      const map = new Map<string, unknown>();
      return {
        keys: () => [...map.keys()],
        get: <T>(k: string, d?: T) => (map.has(k) ? (map.get(k) as T) : d),
        update: async (k: string, v: unknown) => {
          if (v === undefined) { map.delete(k); }
          else { map.set(k, JSON.parse(JSON.stringify(v))); }
        },
        setKeysForSync: () => {},
      } as any;
    }

    it('paints cached issues immediately and skips the loading message', async () => {
      const cache = new IssueCache(memoryMemento());
      const cached = makeIssue({ number: 42, title: 'From cache' });
      const repoInfo = { owner: 'o', repo: 'r', platform: 'github' as const, baseUrl: '' };
      await cache.write(repoInfo, { state: 'open', sort: 'created' }, [cached]);

      const cachedTdp = new IssueTreeDataProvider('open', 'created', cache);
      // Provider that delays its network response so we can observe the cache paint first.
      const fresh = makeIssue({ number: 100, title: 'From network' });
      const provider: IssueProvider = {
        ...makeProvider([fresh]),
        listIssues: vi.fn(() =>
          new Promise((resolve) => setTimeout(() => resolve([fresh]), 30))
        ) as any,
      };

      cachedTdp.setState('ready', undefined, provider);
      // Allow the cache-first paint to flush.
      await new Promise(r => setTimeout(r, 0));
      const duringLoad = cachedTdp.getChildren();
      expect(duringLoad).toHaveLength(1);
      expect((duringLoad[0] as IssueTreeItem).issue.number).toBe(42);

      // Wait for the network response to overwrite the cache.
      await new Promise(r => setTimeout(r, 60));
      const afterFetch = cachedTdp.getChildren();
      expect((afterFetch[0] as IssueTreeItem).issue.number).toBe(100);
    });

    it('keeps cached issues visible when the network fetch fails', async () => {
      const cache = new IssueCache(memoryMemento());
      const cached = makeIssue({ number: 42 });
      const repoInfo = { owner: 'o', repo: 'r', platform: 'github' as const, baseUrl: '' };
      await cache.write(repoInfo, { state: 'open', sort: 'created' }, [cached]);

      const cachedTdp = new IssueTreeDataProvider('open', 'created', cache);
      const provider = makeProvider();
      (provider.listIssues as any).mockRejectedValue(new Error('offline'));

      cachedTdp.setState('ready', undefined, provider);
      await new Promise(r => setTimeout(r, 50));

      const children = cachedTdp.getChildren();
      expect(children).toHaveLength(1);
      expect((children[0] as IssueTreeItem).issue.number).toBe(42);
    });
  });

  describe('onDidChangeTreeData', () => {
    it('fires event on refresh', async () => {
      const listener = vi.fn();
      tdp.onDidChangeTreeData(listener);

      tdp.setState('no-remote');
      expect(listener).toHaveBeenCalled();
    });
  });
});
