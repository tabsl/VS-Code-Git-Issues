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
  FileUploadResult,
  ReactionContent,
  LinkedPullRequest,
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
  updateComment(commentId: number, body: string): Promise<Comment>;
  deleteComment(commentId: number): Promise<void>;

  // Labels
  listLabels(): Promise<Label[]>;

  // Milestones
  listMilestones(): Promise<Milestone[]>;

  // Assignees
  listAssignees(): Promise<User[]>;

  // User
  getCurrentUser(): Promise<User>;

  // Reactions
  toggleIssueReaction(issueNumber: number, content: ReactionContent): Promise<void>;
  toggleCommentReaction(commentId: number, content: ReactionContent): Promise<void>;

  // Linked merge / pull requests
  listLinkedPullRequests(issueNumber: number): Promise<LinkedPullRequest[]>;

  // File upload
  supportsFileUpload(): boolean;
  uploadFile?(fileName: string, fileContent: Buffer): Promise<FileUploadResult>;

  // Image proxy
  fetchImage?(imageUrl: string): Promise<string>;

  // Utility
  getIssueUrl(issueNumber: number): string;
  getRepositoryInfo(): RepositoryInfo;
}
