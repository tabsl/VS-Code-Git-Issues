import { Octokit } from '@octokit/rest';
import type { IssueProvider } from './IssueProvider';
import type {
  Issue,
  IssueDetail,
  Comment,
  Label,
  User,
  CreateIssueData,
  UpdateIssueData,
  ListIssuesOptions,
  RepositoryInfo,
} from '../types';

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
    const [issueResponse, commentsResponse] = await Promise.all([
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
    ]);

    const issue = issueResponse.data;
    return {
      ...this.mapIssue(issue),
      body: issue.body || '',
      comments: commentsResponse.data.map((c) => this.mapComment(c)),
      closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
      closedBy: issue.closed_by ? this.mapUser(issue.closed_by) : undefined,
    };
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
