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

export interface IssueProvider {
  readonly platform: 'github' | 'gitlab';

  isAuthenticated(): boolean;

  // Issues
  listIssues(options: ListIssuesOptions): Promise<Issue[]>;
  getIssue(issueNumber: number): Promise<IssueDetail>;
  createIssue(data: CreateIssueData): Promise<Issue>;
  updateIssue(issueNumber: number, data: UpdateIssueData): Promise<Issue>;

  // Comments
  listComments(issueNumber: number): Promise<Comment[]>;
  addComment(issueNumber: number, body: string): Promise<Comment>;

  // Labels
  listLabels(): Promise<Label[]>;

  // Assignees
  listAssignees(): Promise<User[]>;

  // User
  getCurrentUser(): Promise<User>;

  // Utility
  getIssueUrl(issueNumber: number): string;
  getRepositoryInfo(): RepositoryInfo;
}
