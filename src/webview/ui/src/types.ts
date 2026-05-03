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

export interface LinkedPullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged' | 'draft';
  url: string;
  author: User;
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
  reactions?: Reaction[];
}

export interface RepositoryInfo {
  owner: string;
  repo: string;
  platform: 'github' | 'gitlab';
  baseUrl: string;
}

export type MessageToWebview =
  | { type: 'issueLoaded'; issue: IssueDetail; labels: Label[]; assignees: User[]; repositoryInfo: RepositoryInfo; currentUserLogin?: string; linkedPullRequests?: LinkedPullRequest[] }
  | { type: 'commentAdded'; comment: Comment }
  | { type: 'issueUpdated'; issue: IssueDetail }
  | { type: 'editComplete' }
  | {
    type: 'operationFailed';
    operation: 'addComment' | 'updateIssue' | 'createBranch' | 'uploadFile' | 'updateComment' | 'deleteComment';
    message: string;
  }
  | { type: 'uploadProgress'; uploadId: string; status: 'uploading' | 'completed' | 'failed'; markdown?: string; message?: string }
  | { type: 'filesPicked'; files: Array<{ fileName: string; fileContentBase64: string }> }
  | { type: 'uploadNotSupported'; platform: string }
  | { type: 'imageProxied'; requestId: string; dataUri: string }
  | { type: 'imageProxyFailed'; requestId: string; imageUrl: string }
  | { type: 'slashCommandPicked'; requestId: string; snippet: string };

export type MessageToExtension =
  | { type: 'addComment'; body: string }
  | { type: 'updateIssue'; data: { title?: string; body?: string; state?: string; labels?: string[]; assignees?: string[] } }
  | { type: 'openInBrowser' }
  | { type: 'createBranch' }
  | { type: 'refresh' }
  | { type: 'uploadFile'; fileName: string; fileContentBase64: string; uploadId: string }
  | { type: 'pickFile' }
  | { type: 'proxyImage'; requestId: string; imageUrl: string }
  | { type: 'pickSlashCommand'; requestId: string }
  | { type: 'toggleIssueReaction'; content: ReactionContent }
  | { type: 'toggleCommentReaction'; commentId: number; content: ReactionContent }
  | { type: 'updateComment'; commentId: number; body: string }
  | { type: 'deleteComment'; commentId: number }
  | { type: 'openExternal'; url: string };

export interface VsCodeApi {
  postMessage(message: MessageToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
}
