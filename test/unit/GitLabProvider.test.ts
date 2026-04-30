import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitLabProvider } from '../../src/providers/GitLabProvider';

// Mock @gitbeaker/rest
const mockGitlab = {
  Issues: {
    all: vi.fn(),
    show: vi.fn(),
    create: vi.fn(),
    edit: vi.fn(),
  },
  IssueNotes: {
    all: vi.fn(),
    create: vi.fn(),
  },
  ProjectLabels: {
    all: vi.fn(),
  },
  Users: {
    showCurrentUser: vi.fn(),
  },
  ProjectMembers: {
    all: vi.fn(),
  },
};

vi.mock('@gitbeaker/rest', () => ({
  Gitlab: vi.fn(() => mockGitlab),
}));

function makeGitLabIssue(overrides: Record<string, any> = {}) {
  return {
    iid: 1,
    title: 'Test Issue',
    state: 'opened',
    author: { id: 10, username: 'gitlab-user', avatar_url: 'https://example.com/avatar.png' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    labels: ['bug', 'urgent'],
    assignees: [],
    user_notes_count: 3,
    ...overrides,
  };
}

describe('GitLabProvider', () => {
  let provider: GitLabProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GitLabProvider('mygroup', 'myproject', 'glpat-fake', 'https://gitlab.com');
  });

  it('has platform "gitlab"', () => {
    expect(provider.platform).toBe('gitlab');
  });

  it('isAuthenticated returns true', () => {
    expect(provider.isAuthenticated()).toBe(true);
  });

  describe('listIssues', () => {
    it('maps GitLab state to internal state', async () => {
      mockGitlab.Issues.all.mockResolvedValue([
        makeGitLabIssue({ state: 'opened' }),
        makeGitLabIssue({ iid: 2, state: 'closed' }),
      ]);

      const issues = await provider.listIssues({ state: 'all' });
      expect(issues[0].state).toBe('open');
      expect(issues[1].state).toBe('closed');
    });

    it('maps labels as string array to Label objects', async () => {
      mockGitlab.Issues.all.mockResolvedValue([makeGitLabIssue()]);

      const issues = await provider.listIssues({ state: 'open' });
      expect(issues[0].labels).toEqual([
        { name: 'bug', color: '' },
        { name: 'urgent', color: '' },
      ]);
    });

    it('uses iid as issue number', async () => {
      mockGitlab.Issues.all.mockResolvedValue([makeGitLabIssue({ iid: 99 })]);

      const issues = await provider.listIssues({ state: 'open' });
      expect(issues[0].number).toBe(99);
    });

    it('maps user_notes_count to commentCount', async () => {
      mockGitlab.Issues.all.mockResolvedValue([makeGitLabIssue({ user_notes_count: 7 })]);

      const issues = await provider.listIssues({ state: 'open' });
      expect(issues[0].commentCount).toBe(7);
    });
  });

  describe('getIssue', () => {
    it('loads issue detail with comments', async () => {
      mockGitlab.Issues.show.mockResolvedValue({
        ...makeGitLabIssue(),
        description: 'Issue body',
        closed_at: null,
        closed_by: null,
      });
      mockGitlab.IssueNotes.all.mockResolvedValue([
        {
          id: 100, body: 'User comment', system: false,
          author: { id: 20, username: 'commenter', avatar_url: null },
          created_at: '2024-01-03T00:00:00Z', updated_at: '2024-01-03T00:00:00Z',
        },
        { id: 101, body: 'System note', system: true,
          author: { id: 1, username: 'system', avatar_url: null },
          created_at: '2024-01-03T00:00:00Z', updated_at: '2024-01-03T00:00:00Z',
        },
      ]);

      const detail = await provider.getIssue(1);
      expect(detail.body).toBe('Issue body');
      expect(detail.comments).toHaveLength(1);
      expect(detail.comments[0].body).toBe('User comment');
    });
  });

  describe('createIssue', () => {
    it('creates an issue', async () => {
      mockGitlab.Issues.create.mockResolvedValue(
        makeGitLabIssue({ iid: 42, title: 'New Issue' })
      );

      const issue = await provider.createIssue({ title: 'New Issue', body: 'Desc' });
      expect(issue.number).toBe(42);
      expect(issue.title).toBe('New Issue');
    });

    it('resolves assignee IDs from member list', async () => {
      mockGitlab.ProjectMembers.all.mockResolvedValue([
        { id: 10, username: 'dev1', avatar_url: null },
        { id: 20, username: 'dev2', avatar_url: null },
      ]);
      mockGitlab.Issues.create.mockResolvedValue(makeGitLabIssue());

      await provider.createIssue({ title: 'Test', body: '', assignees: ['dev1'] });

      expect(mockGitlab.Issues.create).toHaveBeenCalledWith(
        'mygroup/myproject',
        'Test',
        expect.objectContaining({ assigneeIds: [10] })
      );
    });
  });

  describe('updateIssue', () => {
    it('maps state to stateEvent', async () => {
      mockGitlab.Issues.edit.mockResolvedValue(makeGitLabIssue({ state: 'closed' }));

      await provider.updateIssue(1, { state: 'closed' });
      expect(mockGitlab.Issues.edit).toHaveBeenCalledWith(
        'mygroup/myproject', 1,
        expect.objectContaining({ stateEvent: 'close' })
      );
    });

    it('maps reopen state', async () => {
      mockGitlab.Issues.edit.mockResolvedValue(makeGitLabIssue({ state: 'opened' }));

      await provider.updateIssue(1, { state: 'open' });
      expect(mockGitlab.Issues.edit).toHaveBeenCalledWith(
        'mygroup/myproject', 1,
        expect.objectContaining({ stateEvent: 'reopen' })
      );
    });
  });

  describe('addComment', () => {
    it('creates a note and returns mapped comment', async () => {
      mockGitlab.IssueNotes.create.mockResolvedValue({
        id: 200, body: 'My comment',
        author: { id: 10, username: 'gitlab-user', avatar_url: null },
        created_at: '2024-01-05T00:00:00Z', updated_at: '2024-01-05T00:00:00Z',
      });

      const comment = await provider.addComment(1, 'My comment');
      expect(comment.id).toBe(200);
      expect(comment.body).toBe('My comment');
    });
  });

  describe('listLabels', () => {
    it('strips # from label color', async () => {
      mockGitlab.ProjectLabels.all.mockResolvedValue([
        { name: 'bug', color: '#ff0000', description: 'A bug' },
      ]);

      const labels = await provider.listLabels();
      expect(labels[0].color).toBe('ff0000');
    });
  });

  describe('getCurrentUser', () => {
    it('returns current user', async () => {
      mockGitlab.Users.showCurrentUser.mockResolvedValue({
        id: 10, username: 'gitlab-user', avatar_url: 'https://example.com/a.png',
      });

      const user = await provider.getCurrentUser();
      expect(user.login).toBe('gitlab-user');
    });
  });

  describe('getIssueUrl', () => {
    it('returns correct GitLab URL', () => {
      expect(provider.getIssueUrl(42)).toBe('https://gitlab.com/mygroup/myproject/-/issues/42');
    });
  });

  describe('getRepositoryInfo', () => {
    it('returns repository metadata', () => {
      expect(provider.getRepositoryInfo()).toEqual({
        owner: 'mygroup',
        repo: 'myproject',
        platform: 'gitlab',
        baseUrl: 'https://gitlab.com',
      });
    });
  });

  describe('fetchImage', () => {
    let provider: GitLabProvider;
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      provider = new GitLabProvider('mygroup', 'myproject', 'glpat-x', 'https://gitlab.com');
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    function mockFetchOnce(body: ArrayBuffer, contentType = 'image/png') {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => contentType },
        arrayBuffer: async () => body,
      }) as any;
    }

    it('rejects URLs from look-alike hosts (startsWith bypass)', async () => {
      await expect(
        provider.fetchImage('https://gitlab.com.attacker.example/-/uploads/h/f.png')
      ).rejects.toThrow('Image URL does not match the GitLab base URL');
    });

    it('rejects URLs with a different protocol', async () => {
      await expect(
        provider.fetchImage('http://gitlab.com/-/uploads/h/f.png')
      ).rejects.toThrow('Image URL does not match the GitLab base URL');
    });

    it('rejects upload paths with traversal sequences', async () => {
      await expect(
        provider.fetchImage('https://gitlab.com/-/uploads/abc/..%2Fnotifications')
      ).rejects.toThrow();
    });

    it('rejects URLs that are not valid /-/uploads/{hash}/{file} paths', async () => {
      await expect(
        provider.fetchImage('https://gitlab.com/some/random/path')
      ).rejects.toThrow('Could not parse upload URL');
    });

    it('proxies a valid upload URL to the GitLab API with the token', async () => {
      mockFetchOnce(new TextEncoder().encode('PNGDATA').buffer);

      const result = await provider.fetchImage(
        'https://gitlab.com/mygroup/myproject/-/uploads/abc123/screenshot.png'
      );

      expect(result.startsWith('data:image/png;base64,')).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toBe(
        'https://gitlab.com/api/v4/projects/mygroup%2Fmyproject/uploads/abc123/screenshot.png'
      );
      const calledOpts = (globalThis.fetch as any).mock.calls[0][1];
      expect(calledOpts.headers['PRIVATE-TOKEN']).toBe('glpat-x');
    });
  });
});
