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

export interface Comment {
  id: number;
  body: string;
  author: User;
  createdAt: string;
  updatedAt: string;
}

export interface IssueDetail {
  number: number;
  title: string;
  state: 'open' | 'closed';
  body: string;
  author: User;
  createdAt: string;
  updatedAt: string;
  labels: Label[];
  assignees: User[];
  commentCount: number;
  comments: Comment[];
  closedAt?: string;
  closedBy?: User;
}

export interface RepositoryInfo {
  owner: string;
  repo: string;
  platform: 'github' | 'gitlab';
  baseUrl: string;
}

export type MessageToWebview =
  | { type: 'issueLoaded'; issue: IssueDetail; labels: Label[]; assignees: User[]; repositoryInfo: RepositoryInfo }
  | { type: 'commentAdded'; comment: Comment }
  | { type: 'issueUpdated'; issue: IssueDetail }
  | {
    type: 'operationFailed';
    operation: 'addComment' | 'updateIssue' | 'createBranch';
    message: string;
  };

export type MessageToExtension =
  | { type: 'addComment'; body: string }
  | { type: 'updateIssue'; data: { title?: string; body?: string; state?: string; labels?: string[]; assignees?: string[] } }
  | { type: 'openInBrowser' }
  | { type: 'createBranch' }
  | { type: 'refresh' };

export interface VsCodeApi {
  postMessage(message: MessageToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
}
