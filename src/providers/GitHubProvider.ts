import { Octokit } from '@octokit/rest';
import type { IssueProvider } from './IssueProvider';
import type {
  Issue,
  IssueDetail,
  Comment,
  Label,
  Milestone,
  User,
  CreateIssueData,
  UpdateIssueData,
  ListIssuesOptions,
  RepositoryInfo,
  Reaction,
  ReactionContent,
} from '../types';

const REACTION_CONTENTS: ReactionContent[] = [
  '+1',
  '-1',
  'laugh',
  'hooray',
  'confused',
  'heart',
  'rocket',
  'eyes',
];

export class GitHubProvider implements IssueProvider {
  readonly platform = 'github' as const;
  private octokit: Octokit;

  constructor(
    private owner: string,
    private repo: string,
    token: string
  ) {
    this.octokit = new Octokit({ auth: token });
  }

  isAuthenticated(): boolean {
    return true;
  }

  async listIssues(options: ListIssuesOptions): Promise<Issue[]> {
    const response = await this.octokit.rest.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: options.state === 'all' ? 'all' : options.state === 'closed' ? 'closed' : 'open',
      labels: options.labels?.join(','),
      // GitHub accepts the milestone title or its number; the title is stable
      // across instances so it is the only value the UI ever passes here.
      milestone: options.milestone,
      assignee: options.assignee,
      sort: options.sort || 'created',
      direction: options.direction || 'desc',
      page: options.page,
      per_page: options.perPage || 30,
    });

    // Filter out pull requests (GitHub returns PRs in the issues endpoint)
    return response.data
      .filter((item) => !item.pull_request)
      .map((item) => this.mapIssue(item));
  }

  async getIssue(issueNumber: number): Promise<IssueDetail> {
    const me = await this.getCurrentUser().catch(() => null);
    const meLogin = me?.login;

    const [issueResponse, commentsResponse, issueReactions] = await Promise.all([
      this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
      }),
      this.octokit.rest.issues.listComments({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
      }),
      this.octokit.rest.reactions.listForIssue({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        per_page: 100,
      }).catch(() => ({ data: [] as Array<{ content: string; user: { login: string } | null }> })),
    ]);

    const issue = issueResponse.data;
    const rawComments = commentsResponse.data;

    const commentReactions = await Promise.all(
      rawComments.map((c) =>
        this.octokit.rest.reactions
          .listForIssueComment({
            owner: this.owner,
            repo: this.repo,
            comment_id: c.id,
            per_page: 100,
          })
          .then((r) => r.data)
          .catch(() => [] as Array<{ content: string; user: { login: string } | null }>)
      )
    );

    return {
      ...this.mapIssue(issue),
      body: issue.body || '',
      reactions: aggregateReactions(issueReactions.data, meLogin),
      comments: rawComments.map((c, i) => ({
        ...this.mapComment(c),
        reactions: aggregateReactions(commentReactions[i], meLogin),
      })),
      closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
      closedBy: issue.closed_by ? this.mapUser(issue.closed_by) : undefined,
    };
  }

  async toggleIssueReaction(issueNumber: number, content: ReactionContent): Promise<void> {
    const me = await this.getCurrentUser();
    const all = await this.octokit.rest.reactions.listForIssue({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      per_page: 100,
    });
    const mine = all.data.find((r) => r.user?.login === me.login && r.content === content);
    if (mine) {
      await this.octokit.rest.reactions.deleteForIssue({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        reaction_id: mine.id,
      });
    } else {
      await this.octokit.rest.reactions.createForIssue({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        content,
      });
    }
  }

  async toggleCommentReaction(commentId: number, content: ReactionContent): Promise<void> {
    const me = await this.getCurrentUser();
    const all = await this.octokit.rest.reactions.listForIssueComment({
      owner: this.owner,
      repo: this.repo,
      comment_id: commentId,
      per_page: 100,
    });
    const mine = all.data.find((r) => r.user?.login === me.login && r.content === content);
    if (mine) {
      await this.octokit.rest.reactions.deleteForIssueComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: commentId,
        reaction_id: mine.id,
      });
    } else {
      await this.octokit.rest.reactions.createForIssueComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: commentId,
        content,
      });
    }
  }

  async createIssue(data: CreateIssueData): Promise<Issue> {
    const response = await this.octokit.rest.issues.create({
      owner: this.owner,
      repo: this.repo,
      title: data.title,
      body: data.body,
      labels: data.labels,
      assignees: data.assignees,
    });
    return this.mapIssue(response.data);
  }

  async updateIssue(issueNumber: number, data: UpdateIssueData): Promise<Issue> {
    const response = await this.octokit.rest.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      title: data.title,
      body: data.body,
      state: data.state === 'open' ? 'open' : data.state === 'closed' ? 'closed' : undefined,
      labels: data.labels,
      assignees: data.assignees,
    });
    return this.mapIssue(response.data);
  }

  async listComments(issueNumber: number): Promise<Comment[]> {
    const response = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return response.data.map((c) => this.mapComment(c));
  }

  async addComment(issueNumber: number, body: string): Promise<Comment> {
    const response = await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
    return this.mapComment(response.data);
  }

  async updateComment(commentId: number, body: string): Promise<Comment> {
    const response = await this.octokit.rest.issues.updateComment({
      owner: this.owner,
      repo: this.repo,
      comment_id: commentId,
      body,
    });
    return this.mapComment(response.data);
  }

  async deleteComment(commentId: number): Promise<void> {
    await this.octokit.rest.issues.deleteComment({
      owner: this.owner,
      repo: this.repo,
      comment_id: commentId,
    });
  }

  async listLabels(): Promise<Label[]> {
    const response = await this.octokit.rest.issues.listLabelsForRepo({
      owner: this.owner,
      repo: this.repo,
      per_page: 100,
    });
    return response.data.map((l) => ({
      name: l.name,
      color: l.color || '',
      description: l.description || undefined,
    }));
  }

  async listMilestones(): Promise<Milestone[]> {
    const response = await this.octokit.rest.issues.listMilestones({
      owner: this.owner,
      repo: this.repo,
      state: 'all',
      per_page: 100,
    });
    return response.data.map((m) => ({
      title: m.title,
      state: m.state === 'open' ? 'open' : 'closed',
      dueOn: m.due_on ? new Date(m.due_on) : undefined,
    }));
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.octokit.rest.users.getAuthenticated();
    return this.mapUser(response.data);
  }

  async listAssignees(): Promise<User[]> {
    const response = await this.octokit.rest.issues.listAssignees({
      owner: this.owner,
      repo: this.repo,
      per_page: 100,
    });
    return response.data.map((u) => this.mapUser(u));
  }

  supportsFileUpload(): boolean {
    return false;
  }

  getIssueUrl(issueNumber: number): string {
    return `https://github.com/${this.owner}/${this.repo}/issues/${issueNumber}`;
  }

  getRepositoryInfo(): RepositoryInfo {
    return {
      owner: this.owner,
      repo: this.repo,
      platform: 'github',
      baseUrl: 'https://github.com',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapIssue(data: any): Issue {
    return {
      number: data.number,
      title: data.title,
      state: data.state === 'open' ? 'open' : 'closed',
      author: this.mapUser(data.user),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      labels: (data.labels || []).map((l: any) =>
        typeof l === 'string'
          ? { name: l, color: '' }
          : { name: l.name || '', color: l.color || '', description: l.description || undefined }
      ),
      assignees: (data.assignees || []).map((u: any) => this.mapUser(u)),
      commentCount: data.comments || 0,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapComment(data: any): Comment {
    return {
      id: data.id,
      body: data.body || '',
      author: this.mapUser(data.user),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapUser(data: any): User {
    return {
      id: data?.id || 0,
      login: data?.login || 'unknown',
      avatarUrl: data?.avatar_url,
    };
  }
}

interface RawReaction {
  content: string;
  user: { login: string } | null;
}

function aggregateReactions(raw: RawReaction[], meLogin: string | undefined): Reaction[] {
  const counters = new Map<ReactionContent, { count: number; mine: boolean }>(
    REACTION_CONTENTS.map((c) => [c, { count: 0, mine: false }])
  );
  for (const r of raw) {
    const slot = counters.get(r.content as ReactionContent);
    if (!slot) {
      continue;
    }
    slot.count++;
    if (meLogin && r.user?.login === meLogin) {
      slot.mine = true;
    }
  }
  const out: Reaction[] = [];
  for (const c of REACTION_CONTENTS) {
    const slot = counters.get(c)!;
    if (slot.count > 0) {
      out.push({ content: c, count: slot.count, meReacted: slot.mine });
    }
  }
  return out;
}
