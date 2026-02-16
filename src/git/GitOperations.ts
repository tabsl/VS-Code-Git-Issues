import { execFileSync } from 'child_process';

export class GitOperations {
  static sanitizeBranchName(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }

  static generateBranchName(issueNumber: number, title: string): string {
    const sanitized = this.sanitizeBranchName(title);
    return sanitized
      ? `issue-${issueNumber}-${sanitized}`
      : `issue-${issueNumber}`;
  }

  static createBranch(workspaceRoot: string, branchName: string): void {
    const normalizedBranchName = branchName.trim();
    if (!normalizedBranchName) {
      throw new Error('Branch name cannot be empty');
    }

    this.assertValidBranchName(workspaceRoot, normalizedBranchName);

    execFileSync('git', ['checkout', '-b', normalizedBranchName], {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  private static assertValidBranchName(workspaceRoot: string, branchName: string): void {
    execFileSync('git', ['check-ref-format', '--branch', branchName], {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
}
