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
  | { type: 'editComplete' }
  | {
    type: 'operationFailed';
    operation: 'addComment' | 'updateIssue' | 'createBranch' | 'uploadFile';
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
  | { type: 'pickSlashCommand'; requestId: string };

export interface VsCodeApi {
  postMessage(message: MessageToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
}
