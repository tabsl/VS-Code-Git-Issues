import { Gitlab } from '@gitbeaker/rest';
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
  FileUploadResult,
} from '../types';

export class GitLabProvider implements IssueProvider {
  readonly platform = 'gitlab' as const;
  private gitlab: InstanceType<typeof Gitlab>;
  private projectPath: string;

  constructor(
    private owner: string,
    private repo: string,
    private token: string,
    private baseUrl: string = 'https://gitlab.com'
  ) {
    this.projectPath = `${owner}/${repo}`;
    this.gitlab = new Gitlab({
      host: baseUrl,
      token,
    });
  }

  isAuthenticated(): boolean {
    return true;
  }

  async listIssues(options: ListIssuesOptions): Promise<Issue[]> {
    const stateMap: Record<string, string> = {
      open: 'opened',
      closed: 'closed',
      all: 'all',
    };

    const sortMap: Record<string, string> = {
      created: 'created_at',
      updated: 'updated_at',
      comments: 'popularity',
    };

    const issues = await this.gitlab.Issues.all({
      projectId: this.projectPath,
      state: stateMap[options.state || 'open'] as 'opened' | 'closed' | 'all',
      labels: options.labels?.join(',') as any,
      assigneeUsername: options.assignee ? [options.assignee] : undefined,
      orderBy: (sortMap[options.sort || 'created'] || 'created_at') as any,
      sort: options.direction || 'desc',
      page: options.page || 1,
      perPage: options.perPage || 30,
    });

    return (issues as any[]).map((issue) => this.mapIssue(issue));
  }

  async getIssue(issueNumber: number): Promise<IssueDetail> {
    const [issue, notes] = await Promise.all([
      this.gitlab.Issues.show(issueNumber, { projectId: this.projectPath }),
      this.gitlab.IssueNotes.all(this.projectPath, issueNumber, { perPage: 100 }),
    ]);

    const issueData = issue as any;
    const notesData = notes as any[];

    return {
      ...this.mapIssue(issueData),
      body: issueData.description || '',
      comments: notesData
        .filter((n) => !n.system)
        .map((n) => this.mapComment(n)),
      closedAt: issueData.closed_at ? new Date(issueData.closed_at) : undefined,
      closedBy: issueData.closed_by ? this.mapUser(issueData.closed_by) : undefined,
    };
  }

  async createIssue(data: CreateIssueData): Promise<Issue> {
    const opts: Record<string, any> = {};
    if (data.body) { opts.description = data.body; }
    if (data.labels?.length) { opts.labels = data.labels.join(','); }
    if (data.assignees?.length) {
      const members = await this.listAssignees();
      opts.assigneeIds = data.assignees
        .map((login) => members.find((m) => m.login === login)?.id)
        .filter((id): id is number => id !== undefined);
    }

    const issue = await this.gitlab.Issues.create(
      this.projectPath,
      data.title,
      opts
    );
    return this.mapIssue(issue as any);
  }

  async updateIssue(issueNumber: number, data: UpdateIssueData): Promise<Issue> {
    const updateData: any = {};
    if (data.title !== undefined) { updateData.title = data.title; }
    if (data.body !== undefined) { updateData.description = data.body; }
    if (data.labels !== undefined) { updateData.labels = data.labels.join(','); }
    if (data.state !== undefined) {
      updateData.stateEvent = data.state === 'closed' ? 'close' : 'reopen';
    }
    if (data.assignees !== undefined) {
      if (data.assignees.length === 0) {
        updateData.assigneeIds = [];
      } else {
        const members = await this.listAssignees();
        updateData.assigneeIds = data.assignees
          .map((login: string) => members.find((m) => m.login === login)?.id)
          .filter((id: number | undefined): id is number => id !== undefined);
      }
    }

    const issue = await this.gitlab.Issues.edit(this.projectPath, issueNumber, updateData);
    return this.mapIssue(issue as any);
  }

  async listComments(issueNumber: number): Promise<Comment[]> {
    const notes = await this.gitlab.IssueNotes.all(this.projectPath, issueNumber, {
      perPage: 100,
    });
    return (notes as any[])
      .filter((n) => !n.system)
      .map((n) => this.mapComment(n));
  }

  async addComment(issueNumber: number, body: string): Promise<Comment> {
    const note = await this.gitlab.IssueNotes.create(
      this.projectPath,
      issueNumber,
      body
    );
    return this.mapComment(note as any);
  }

  async listLabels(): Promise<Label[]> {
    const labels = await this.gitlab.ProjectLabels.all(this.projectPath, { perPage: 100 });
    return (labels as any[]).map((l) => ({
      name: l.name,
      color: (l.color || '').replace('#', ''),
      description: l.description || undefined,
    }));
  }

  async getCurrentUser(): Promise<User> {
    const user = await this.gitlab.Users.showCurrentUser();
    return this.mapUser(user as any);
  }

  async listAssignees(): Promise<User[]> {
    const members = await this.gitlab.ProjectMembers.all(this.projectPath, {
      perPage: 100,
    });
    return (members as any[]).map((m) => this.mapUser(m));
  }

  supportsFileUpload(): boolean {
    return true;
  }

  async uploadFile(fileName: string, fileContent: Buffer): Promise<FileUploadResult> {
    const result = await this.gitlab.Projects.uploadForReference(
      this.projectPath,
      { content: new Blob([fileContent]), filename: fileName }
    );
    return {
      markdown: result.markdown,
      url: result.url,
      alt: result.alt,
    };
  }

  async fetchImage(imageUrl: string): Promise<string> {
    let parsed: URL;
    let expected: URL;
    try {
      parsed = new URL(imageUrl);
      expected = new URL(this.baseUrl);
    } catch {
      throw new Error('Invalid image URL');
    }
    // Strict origin match — startsWith would accept e.g. "gitlab.com.attacker"
    // when the configured base URL is "https://gitlab.com".
    if (parsed.protocol !== expected.protocol || parsed.host !== expected.host) {
      throw new Error('Image URL does not match the GitLab base URL');
    }

    // Extract upload hash and filename from URL like:
    // https://host/owner/repo/-/uploads/{hash}/{filename}
    // Only allow safe hash/filename — reject path traversal and slashes via
    // URL-encoding so the resulting API URL cannot be redirected to other
    // GitLab API endpoints with the user's token.
    const uploadMatch = parsed.pathname.match(/\/-\/uploads\/([^/]+)\/([^/]+)$/);
    if (!uploadMatch) {
      throw new Error('Could not parse upload URL: ' + imageUrl);
    }

    const [, hash, filename] = uploadMatch;
    if (hash.includes('..') || filename.includes('..') || /%2f/i.test(hash) || /%2f/i.test(filename)) {
      throw new Error('Upload path contains forbidden traversal sequences');
    }

    const encodedProject = encodeURIComponent(this.projectPath);
    const safeHash = encodeURIComponent(hash);
    const safeFilename = encodeURIComponent(filename);
    const apiUrl = `${this.baseUrl}/api/v4/projects/${encodedProject}/uploads/${safeHash}/${safeFilename}`;

    const response = await fetch(apiUrl, {
      headers: { 'PRIVATE-TOKEN': this.token },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  }

  getIssueUrl(issueNumber: number): string {
    return `${this.baseUrl}/${this.owner}/${this.repo}/-/issues/${issueNumber}`;
  }

  getRepositoryInfo(): RepositoryInfo {
    return {
      owner: this.owner,
      repo: this.repo,
      platform: 'gitlab',
      baseUrl: this.baseUrl,
    };
  }

  private mapIssue(data: any): Issue {
    return {
      number: data.iid,
      title: data.title,
      state: data.state === 'opened' ? 'open' : 'closed',
      author: this.mapUser(data.author),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      labels: (data.labels || []).map((name: string) => ({
        name,
        color: '',
      })),
      assignees: (data.assignees || []).map((a: any) => this.mapUser(a)),
      commentCount: data.user_notes_count || 0,
    };
  }

  private mapComment(data: any): Comment {
    return {
      id: data.id,
      body: data.body || '',
      author: this.mapUser(data.author),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapUser(data: any): User {
    return {
      id: data?.id || 0,
      login: data?.username || data?.name || 'unknown',
      avatarUrl: data?.avatar_url,
    };
  }
}
