export interface User {
  id: number;
  login: string;
  avatarUrl?: string;
}

export interface Label {
  name: string;
  color: string;
  description?: string;
}

export interface Milestone {
  // GitHub uses numeric IDs, GitLab uses iid + title; the title is the only
  // value that survives both APIs as a filter input.
  title: string;
  state: 'open' | 'closed';
  dueOn?: Date;
}

export interface Comment {
  id: number;
  body: string;
  author: User;
  createdAt: Date;
  updatedAt: Date;
  reactions?: Reaction[];
}

export type ReactionContent =
  | '+1'
  | '-1'
  | 'laugh'
  | 'hooray'
  | 'confused'
  | 'heart'
  | 'rocket'
  | 'eyes';

export interface Reaction {
  content: ReactionContent;
  count: number;
  meReacted: boolean;
}

export interface Issue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  author: User;
  createdAt: Date;
  updatedAt: Date;
  labels: Label[];
  assignees: User[];
  commentCount: number;
}

export interface IssueDetail extends Issue {
  body: string;
  comments: Comment[];
  closedAt?: Date;
  closedBy?: User;
  reactions?: Reaction[];
}

export interface CreateIssueData {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
}

export interface UpdateIssueData {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
  assignees?: string[];
}

export interface ListIssuesOptions {
  state?: 'open' | 'closed' | 'all';
  labels?: string[];
  milestone?: string;
  assignee?: string;
  sort?: 'created' | 'updated' | 'comments';
  direction?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
}

export interface RepositoryInfo {
  owner: string;
  repo: string;
  platform: 'github' | 'gitlab';
  baseUrl: string;
}

export interface FileUploadResult {
  markdown: string;
  url: string;
  alt: string;
}

export interface LinkedPullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged' | 'draft';
  url: string;
  author: User;
}
