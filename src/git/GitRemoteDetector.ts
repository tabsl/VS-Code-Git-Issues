import { execSync } from 'child_process';

export interface RemoteInfo {
  platform: 'github' | 'gitlab';
  owner: string;
  repo: string;
  host: string;
}

export class GitRemoteDetector {
  static async detect(workspaceRoot: string): Promise<RemoteInfo | null> {
    try {
      const url = execSync('git remote get-url origin', {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!url) {
        return null;
      }

      return this.parseRemoteUrl(url);
    } catch {
      return null;
    }
  }

  static parseRemoteUrl(url: string): RemoteInfo | null {
    // HTTPS: https://host/owner/repo.git or https://host/group/subgroup/repo.git
    const httpsMatch = url.match(
      /^https?:\/\/([^/]+)\/(.+?)\/([^/]+?)(?:\.git)?\/?$/
    );
    if (httpsMatch) {
      return {
        platform: this.detectPlatform(httpsMatch[1]),
        owner: httpsMatch[2],
        repo: httpsMatch[3],
        host: httpsMatch[1],
      };
    }

    // SSH: git@host:owner/repo.git or git@host:group/subgroup/repo.git
    const sshMatch = url.match(
      /^git@([^:]+):(.+?)\/([^/]+?)(?:\.git)?\/?$/
    );
    if (sshMatch) {
      return {
        platform: this.detectPlatform(sshMatch[1]),
        owner: sshMatch[2],
        repo: sshMatch[3],
        host: sshMatch[1],
      };
    }

    // SSH with ssh:// prefix: ssh://git@host/owner/repo.git
    const sshPrefixMatch = url.match(
      /^ssh:\/\/git@([^/]+)\/(.+?)\/([^/]+?)(?:\.git)?\/?$/
    );
    if (sshPrefixMatch) {
      return {
        platform: this.detectPlatform(sshPrefixMatch[1]),
        owner: sshPrefixMatch[2],
        repo: sshPrefixMatch[3],
        host: sshPrefixMatch[1],
      };
    }

    return null;
  }

  private static detectPlatform(host: string): 'github' | 'gitlab' {
    if (host === 'github.com' || host.includes('github')) {
      return 'github';
    }
    return 'gitlab';
  }
}
