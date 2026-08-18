import * as path from 'path';
import * as vscode from 'vscode';
import { GitRemoteDetector, type RemoteInfo } from './GitRemoteDetector';
import { getGitApi, type GitApi } from './VscodeGitApi';

export interface DetectedRepository {
  rootUri: vscode.Uri;
  rootPath: string;
  displayName: string;
  remote: RemoteInfo;
  isVirtual: boolean;
}

export class RepositoryResolver {
  static async detectAll(): Promise<DetectedRepository[]> {
    const fromApi = await this.detectViaGitExtension();
    const local = fromApi.length > 0
      ? fromApi
      : await this.detectViaWorkspaceFolders();
    return this.dedupe([...local, ...this.detectVirtualFolders()]);
  }

  static async getGitApi(): Promise<GitApi | null> {
    return getGitApi();
  }

  // Identity key for caching and persistence. File-system repos keep their
  // plain path so stored selections from earlier versions still resolve.
  static keyFor(uri: vscode.Uri): string {
    return uri.scheme === 'file' ? uri.fsPath : uri.toString();
  }

  // Working-copy path for the operations that shell out to git. Virtual
  // repositories have no checkout, and falling back to some unrelated local
  // folder would run git against the wrong repo — so they resolve to null.
  static localCheckout(repo?: DetectedRepository | null): string | null {
    if (repo) {
      return repo.isVirtual ? null : repo.rootPath;
    }
    const folder = (vscode.workspace.workspaceFolders ?? []).find(
      f => f.uri.scheme === 'file'
    );
    return folder?.uri.fsPath ?? null;
  }

  static contains(repo: DetectedRepository, fileUri: vscode.Uri): boolean {
    // Editors backed by the Git extension carry their own scheme (`git:`,
    // `gitlens:`, …) while keeping the on-disk path, so file-system repos are
    // matched on the path alone. Virtual repos have no meaningful fsPath and
    // are matched on scheme, authority and path instead.
    if (!repo.isVirtual) {
      return this.isBelow(fileUri.fsPath, repo.rootUri.fsPath, path.sep);
    }
    if (
      fileUri.scheme !== repo.rootUri.scheme ||
      fileUri.authority !== repo.rootUri.authority
    ) {
      return false;
    }
    return this.isBelow(fileUri.path, repo.rootUri.path, '/');
  }

  private static isBelow(child: string, parent: string, separator: string): boolean {
    if (child === parent) {
      return true;
    }
    const prefix = parent.endsWith(separator) ? parent : parent + separator;
    return child.startsWith(prefix);
  }

  private static async detectViaGitExtension(): Promise<DetectedRepository[]> {
    const api = await getGitApi();
    if (!api) {
      return [];
    }

    const results: DetectedRepository[] = [];
    for (const repo of api.repositories) {
      const origin = repo.state.remotes.find(r => r.name === 'origin');
      const url = origin?.fetchUrl ?? origin?.pushUrl;
      if (!url) {
        continue;
      }
      const remote = GitRemoteDetector.parseRemoteUrl(url);
      if (!remote) {
        continue;
      }
      results.push(this.toDetected(repo.rootUri, remote));
    }
    return this.dedupe(results);
  }

  private static async detectViaWorkspaceFolders(): Promise<DetectedRepository[]> {
    const folders = (vscode.workspace.workspaceFolders ?? [])
      .filter(folder => folder.uri.scheme === 'file');

    const results = await Promise.all(
      folders.map(async (folder): Promise<DetectedRepository | null> => {
        const remote = await GitRemoteDetector.detect(folder.uri.fsPath);
        if (!remote) {
          return null;
        }
        return this.toDetected(folder.uri, remote, folder.name);
      })
    );

    return results.filter((r): r is DetectedRepository => r !== null);
  }

  // The Git extension never surfaces virtual repositories — Remote Repositories
  // serves them through its own SCM provider — so they are always resolved from
  // the workspace folder URI, regardless of what the Git API reported.
  private static detectVirtualFolders(): DetectedRepository[] {
    const results: DetectedRepository[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (folder.uri.scheme === 'file') {
        continue;
      }
      const remote = GitRemoteDetector.parseVirtualUri(folder.uri.toString());
      if (!remote) {
        continue;
      }
      results.push(this.toDetected(folder.uri, remote, folder.name));
    }
    return results;
  }

  private static toDetected(
    rootUri: vscode.Uri,
    remote: RemoteInfo,
    displayName?: string
  ): DetectedRepository {
    return {
      rootUri,
      rootPath: this.keyFor(rootUri),
      displayName: displayName ?? this.deriveDisplayName(rootUri),
      remote,
      isVirtual: rootUri.scheme !== 'file',
    };
  }

  private static dedupe(repos: DetectedRepository[]): DetectedRepository[] {
    const seen = new Set<string>();
    return repos.filter(repo => {
      if (seen.has(repo.rootPath)) {
        return false;
      }
      seen.add(repo.rootPath);
      return true;
    });
  }

  private static deriveDisplayName(rootUri: vscode.Uri): string {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      if (folder.uri.scheme !== rootUri.scheme) {
        continue;
      }
      if (rootUri.toString() === folder.uri.toString()) {
        return folder.name;
      }
      if (rootUri.scheme !== 'file') {
        continue;
      }
      const folderPath = folder.uri.fsPath;
      const prefix = folderPath.endsWith(path.sep) ? folderPath : folderPath + path.sep;
      if (rootUri.fsPath.startsWith(prefix)) {
        return `${folder.name}/${path.relative(folderPath, rootUri.fsPath)}`;
      }
    }
    return rootUri.scheme === 'file'
      ? path.basename(rootUri.fsPath)
      : rootUri.path.replace(/^\//, '');
  }
}
