import * as vscode from 'vscode';
import type { IssueProvider } from '../providers/IssueProvider';
import type { DetectedRepository } from '../git/RepositoryResolver';
import type { RepoContext } from '../git/RepositorySelection';
import type { Label, Milestone } from '../types';

export interface RepoTarget {
  provider: IssueProvider;
  repository: DetectedRepository | null;
}

export interface RepoTargetSources {
  getProvider: () => IssueProvider | null;
  getActiveRepository: () => DetectedRepository | null;
  getRepoContexts: () => RepoContext[];
}

export function readyRepoTargets(sources: RepoTargetSources): RepoTarget[] {
  const contexts = sources.getRepoContexts();
  if (contexts.length > 0) {
    return contexts.flatMap((c) =>
      c.state.kind === 'ready' ? [{ provider: c.state.provider, repository: c.repo }] : []
    );
  }
  const provider = sources.getProvider();
  return provider ? [{ provider, repository: sources.getActiveRepository() }] : [];
}

// An issue action must act on the repository the issue was listed under. A
// missing repoKey (command palette, older callers) means the primary repo; an
// unknown one is an error rather than a silent fallback to another repo.
export function resolveIssueTarget(
  sources: RepoTargetSources,
  repoKey: string | null | undefined
): RepoTarget | null {
  if (repoKey) {
    const context = sources.getRepoContexts().find((c) => c.repo.rootPath === repoKey);
    if (!context || context.state.kind !== 'ready') {
      vscode.window.showErrorMessage('Git Issues: Repository not loaded');
      return null;
    }
    return { provider: context.state.provider, repository: context.repo };
  }

  const provider = sources.getProvider();
  if (!provider) {
    vscode.window.showErrorMessage('Git Issues: No provider available');
    return null;
  }
  return { provider, repository: sources.getActiveRepository() };
}

export async function pickRepoTarget(
  sources: RepoTargetSources,
  placeHolder: string
): Promise<RepoTarget | null> {
  const targets = readyRepoTargets(sources);
  if (targets.length === 0) {
    vscode.window.showErrorMessage('Git Issues: No provider available');
    return null;
  }
  if (targets.length === 1) {
    return targets[0];
  }

  const picked = await vscode.window.showQuickPick(
    targets.map((target) => {
      const info = target.provider.getRepositoryInfo();
      return {
        label: `${info.owner}/${info.repo}`,
        description: target.repository?.displayName,
        target,
      };
    }),
    { placeHolder }
  );
  return picked?.target ?? null;
}

export async function collectLabels(targets: RepoTarget[]): Promise<Label[]> {
  const lists = await Promise.all(
    targets.map((t) => t.provider.listLabels().catch(() => [] as Label[]))
  );
  const byName = new Map<string, Label>();
  for (const label of lists.flat()) {
    if (!byName.has(label.name)) {
      byName.set(label.name, label);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function collectMilestones(
  targets: RepoTarget[]
): Promise<Array<{ milestone: Milestone; repoCount: number }>> {
  const lists = await Promise.all(
    targets.map((t) => t.provider.listMilestones().catch(() => [] as Milestone[]))
  );
  const byTitle = new Map<string, { milestone: Milestone; repoCount: number }>();
  for (const list of lists) {
    for (const title of new Set(list.map((m) => m.title))) {
      const entry = byTitle.get(title);
      if (entry) {
        entry.repoCount += 1;
      } else {
        byTitle.set(title, { milestone: list.find((m) => m.title === title)!, repoCount: 1 });
      }
    }
  }
  return [...byTitle.values()].sort((a, b) => a.milestone.title.localeCompare(b.milestone.title));
}
