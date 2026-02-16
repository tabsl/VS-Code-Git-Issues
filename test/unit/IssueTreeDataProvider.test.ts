import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueTreeDataProvider } from '../../src/tree/IssueTreeDataProvider';
import { IssueTreeItem, IssueGroupTreeItem, MessageTreeItem } from '../../src/tree/IssueTreeItem';
import type { IssueProvider } from '../../src/providers/IssueProvider';
import type { Issue } from '../../src/types';

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
    listLabels: vi.fn(),
    listAssignees: vi.fn(),
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
      expect((children[0] as MessageTreeItem).label).toBe('No git remote "origin" found');
    });

    it('shows configure token message for GitHub', () => {
      tdp.setState('no-token', 'github');
      const children = tdp.getChildren();
      expect(children).toHaveLength(1);
      expect((children[0] as MessageTreeItem).label).toBe('Click to configure GitHub token');
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

  describe('onDidChangeTreeData', () => {
    it('fires event on refresh', async () => {
      const listener = vi.fn();
      tdp.onDidChangeTreeData(listener);

      tdp.setState('no-remote');
      expect(listener).toHaveBeenCalled();
    });
  });
});
