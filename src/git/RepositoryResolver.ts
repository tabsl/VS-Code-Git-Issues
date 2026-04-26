import * as path from 'path';
import * as vscode from 'vscode';
import { GitRemoteDetector, type RemoteInfo } from './GitRemoteDetector';
import { getGitApi, type GitApi } from './VscodeGitApi';

export interface DetectedRepository {
  rootPath: string;
  displayName: string;
  remote: RemoteInfo;
}

export class RepositoryResolver {
  static async detectAll(): Promise<DetectedRepository[]> {
    const fromApi = await this.detectViaGitExtension();
    if (fromApi.length > 0) {
      return fromApi;
    }
    return this.detectViaWorkspaceFolders();
  }

  static async getGitApi(): Promise<GitApi | null> {
    return getGitApi();
  }

  private static async detectViaGitExtension(): Promise<DetectedRepository[]> {
    const api = await getGitApi();
    if (!api) {
      return [];
    }

    const results: DetectedRepository[] = [];
    const seen = new Set<string>();
    for (const repo of api.repositories) {
      const rootPath = repo.rootUri.fsPath;
      if (seen.has(rootPath)) {
        continue;
      }
      seen.add(rootPath);

      const origin = repo.state.remotes.find(r => r.name === 'origin');
      const url = origin?.fetchUrl ?? origin?.pushUrl;
      if (!url) {
        continue;
      }
      const remote = GitRemoteDetector.parseRemoteUrl(url);
      if (!remote) {
        continue;
      }
      results.push({
        rootPath,
        displayName: this.deriveDisplayName(rootPath),
        remote,
      });
    }
    return results;
  }

  private static async detectViaWorkspaceFolders(): Promise<DetectedRepository[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return [];
    }

    const results = await Promise.all(
      folders.map(async (folder): Promise<DetectedRepository | null> => {
        const remote = await GitRemoteDetector.detect(folder.uri.fsPath);
        if (!remote) {
          return null;
        }
        return {
          rootPath: folder.uri.fsPath,
          displayName: folder.name,
          remote,
        };
      })
    );

    return results.filter((r): r is DetectedRepository => r !== null);
  }

  private static deriveDisplayName(repoPath: string): string {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const folderPath = folder.uri.fsPath;
      if (repoPath === folderPath) {
        return folder.name;
      }
      const prefix = folderPath.endsWith(path.sep) ? folderPath : folderPath + path.sep;
      if (repoPath.startsWith(prefix)) {
        const rel = path.relative(folderPath, repoPath);
        return `${folder.name}/${rel}`;
      }
    }
    return path.basename(repoPath);
  }
}
