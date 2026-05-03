import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubProvider } from '../../src/providers/GitHubProvider';

// Mock @octokit/rest
vi.mock('@octokit/rest', () => {
  const mockOctokit = {
    rest: {
      issues: {
        listForRepo: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        listComments: vi.fn(),
        createComment: vi.fn(),
        updateComment: vi.fn(),
        deleteComment: vi.fn(),
        listLabelsForRepo: vi.fn(),
        listAssignees: vi.fn(),
        listMilestones: vi.fn().mockResolvedValue({ data: [] }),
      },
      reactions: {
        listForIssue: vi.fn().mockResolvedValue({ data: [] }),
        listForIssueComment: vi.fn().mockResolvedValue({ data: [] }),
        createForIssue: vi.fn(),
        createForIssueComment: vi.fn(),
        deleteForIssue: vi.fn(),
        deleteForIssueComment: vi.fn(),
      },
      search: {
        issuesAndPullRequests: vi.fn().mockResolvedValue({ data: { items: [] } }),
      },
      users: {
        getAuthenticated: vi.fn(),
      },
    },
  };
  return { Octokit: vi.fn(() => mockOctokit) };
});

import { Octokit } from '@octokit/rest';

function getOctokitMock() {
  return (new Octokit() as any).rest;
}

function makeGitHubIssue(overrides: Record<string, any> = {}) {
  return {
    number: 1,
    title: 'Test Issue',
    state: 'open',
    user: { id: 10, login: 'octocat', avatar_url: 'https://example.com/avatar.png' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    labels: [{ name: 'bug', color: 'ff0000', description: 'A bug' }],
    assignees: [],
    comments: 2,
    ...overrides,
  };
}

describe('GitHubProvider', () => {
  let provider: GitHubProvider;
  let mock: ReturnType<typeof getOctokitMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GitHubProvider('octocat', 'hello-world', 'fake-token');
    mock = getOctokitMock();
  });

  it('has platform "github"', () => {
    expect(provider.platform).toBe('github');
  });

  it('isAuthenticated returns true', () => {
    expect(provider.isAuthenticated()).toBe(true);
  });

  describe('listIssues', () => {
    it('fetches issues and filters out pull requests', async () => {
      mock.issues.listForRepo.mockResolvedValue({
        data: [
          makeGitHubIssue({ number: 1 }),
          makeGitHubIssue({ number: 2, pull_request: { url: 'https://...' } }),
          makeGitHubIssue({ number: 3 }),
        ],
      });

      const issues = await provider.listIssues({ state: 'open' });
      expect(issues).toHaveLength(2);
      expect(issues[0].number).toBe(1);
      expect(issues[1].number).toBe(3);
    });

    it('maps issue data correctly', async () => {
      mock.issues.listForRepo.mockResolvedValue({
        data: [makeGitHubIssue()],
      });

      const issues = await provider.listIssues({ state: 'open' });
      expect(issues[0]).toEqual({
        number: 1,
        title: 'Test Issue',
        state: 'open',
        author: { id: 10, login: 'octocat', avatarUrl: 'https://example.com/avatar.png' },
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z'),
        labels: [{ name: 'bug', color: 'ff0000', description: 'A bug' }],
        assignees: [],
        commentCount: 2,
      });
    });

    it('passes filter options to the API', async () => {
      mock.issues.listForRepo.mockResolvedValue({ data: [] });

      await provider.listIssues({ state: 'closed', sort: 'updated', direction: 'asc', page: 2, perPage: 10 });

      expect(mock.issues.listForRepo).toHaveBeenCalledWith(expect.objectContaining({
        owner: 'octocat',
        repo: 'hello-world',
        state: 'closed',
        sort: 'updated',
        direction: 'asc',
        page: 2,
        per_page: 10,
      }));
    });
  });

  describe('getIssue', () => {
    it('loads issue with comments in parallel', async () => {
      mock.issues.get.mockResolvedValue({
        data: {
          ...makeGitHubIssue(),
          body: 'Issue body text',
          closed_at: null,
          closed_by: null,
        },
      });
      mock.issues.listComments.mockResolvedValue({
        data: [{
          id: 100,
          body: 'A comment',
          user: { id: 20, login: 'commenter', avatar_url: null },
          created_at: '2024-01-03T00:00:00Z',
          updated_at: '2024-01-03T00:00:00Z',
        }],
      });

      const detail = await provider.getIssue(1);
      expect(detail.body).toBe('Issue body text');
      expect(detail.comments).toHaveLength(1);
      expect(detail.comments[0].body).toBe('A comment');
      expect(detail.closedAt).toBeUndefined();
    });
  });

  describe('createIssue', () => {
    it('creates an issue and returns mapped data', async () => {
      mock.issues.create.mockResolvedValue({
        data: makeGitHubIssue({ number: 42, title: 'New Issue' }),
      });

      const issue = await provider.createIssue({ title: 'New Issue', body: 'Description' });
      expect(issue.number).toBe(42);
      expect(issue.title).toBe('New Issue');
      expect(mock.issues.create).toHaveBeenCalledWith(expect.objectContaining({
        title: 'New Issue',
        body: 'Description',
      }));
    });
  });

  describe('updateIssue', () => {
    it('updates issue state', async () => {
      mock.issues.update.mockResolvedValue({
        data: makeGitHubIssue({ state: 'closed' }),
      });

      const issue = await provider.updateIssue(1, { state: 'closed' });
      expect(issue.state).toBe('closed');
      expect(mock.issues.update).toHaveBeenCalledWith(expect.objectContaining({
        issue_number: 1,
        state: 'closed',
      }));
    });
  });

  describe('addComment', () => {
    it('adds a comment and returns it', async () => {
      mock.issues.createComment.mockResolvedValue({
        data: {
          id: 200,
          body: 'New comment',
          user: { id: 10, login: 'octocat', avatar_url: null },
          created_at: '2024-01-05T00:00:00Z',
          updated_at: '2024-01-05T00:00:00Z',
        },
      });

      const comment = await provider.addComment(1, 'New comment');
      expect(comment.id).toBe(200);
      expect(comment.body).toBe('New comment');
    });
  });

  describe('listLabels', () => {
    it('returns mapped labels', async () => {
      mock.issues.listLabelsForRepo.mockResolvedValue({
        data: [{ name: 'bug', color: 'ff0000', description: 'A bug' }],
      });

      const labels = await provider.listLabels();
      expect(labels).toEqual([{ name: 'bug', color: 'ff0000', description: 'A bug' }]);
    });
  });

  describe('getCurrentUser', () => {
    it('returns the authenticated user', async () => {
      mock.users.getAuthenticated.mockResolvedValue({
        data: { id: 10, login: 'octocat', avatar_url: 'https://example.com/avatar.png' },
      });

      const user = await provider.getCurrentUser();
      expect(user.login).toBe('octocat');
    });
  });

  describe('listAssignees', () => {
    it('returns assignable users', async () => {
      mock.issues.listAssignees.mockResolvedValue({
        data: [
          { id: 10, login: 'octocat', avatar_url: null },
          { id: 20, login: 'contributor', avatar_url: null },
        ],
      });

      const users = await provider.listAssignees();
      expect(users).toHaveLength(2);
      expect(users[0].login).toBe('octocat');
    });
  });

  describe('getIssueUrl', () => {
    it('returns correct GitHub URL', () => {
      expect(provider.getIssueUrl(42)).toBe('https://github.com/octocat/hello-world/issues/42');
    });
  });

  describe('getRepositoryInfo', () => {
    it('returns repository metadata', () => {
      expect(provider.getRepositoryInfo()).toEqual({
        owner: 'octocat',
        repo: 'hello-world',
        platform: 'github',
        baseUrl: 'https://github.com',
      });
    });
  });
});
