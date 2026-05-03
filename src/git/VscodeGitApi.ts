import * as vscode from 'vscode';

export interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: vscode.Event<boolean>;
  getAPI(version: 1): GitApi;
}

export interface GitApi {
  readonly state: 'uninitialized' | 'initialized';
  readonly onDidChangeState: vscode.Event<'uninitialized' | 'initialized'>;
  readonly repositories: GitRepository[];
  readonly onDidOpenRepository: vscode.Event<GitRepository>;
  readonly onDidCloseRepository: vscode.Event<GitRepository>;
}

export interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: GitRepositoryState;
  readonly inputBox: GitInputBox;
}

export interface GitRepositoryState {
  readonly remotes: GitRemote[];
  readonly HEAD?: GitBranch;
  readonly onDidChange: vscode.Event<void>;
}

export interface GitBranch {
  readonly name?: string;
  readonly commit?: string;
  readonly type?: number;
}

export interface GitInputBox {
  value: string;
}

export interface GitRemote {
  readonly name: string;
  readonly fetchUrl?: string;
  readonly pushUrl?: string;
  readonly isReadOnly: boolean;
}

export async function getGitApi(): Promise<GitApi | null> {
  try {
    const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!ext) {
      return null;
    }
    const exports = ext.isActive ? ext.exports : await ext.activate();
    if (!exports?.enabled) {
      return null;
    }
    return exports.getAPI(1);
  } catch {
    return null;
  }
}
