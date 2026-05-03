import type * as vscode from 'vscode';
import type { Issue, ListIssuesOptions, RepositoryInfo } from '../types';

const STORAGE_KEY = 'gitIssues.issueCache.v1';
const MAX_ENTRIES = 20;

interface SerializedIssue
  extends Omit<Issue, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt: string;
}

interface CacheEntry {
  issues: SerializedIssue[];
  cachedAt: number;
}

type CacheStore = Record<string, CacheEntry>;

export interface CachedIssues {
  issues: Issue[];
  cachedAt: Date;
}

export class IssueCache {
  constructor(private readonly storage: vscode.Memento) {}

  read(repo: RepositoryInfo, filter: ListIssuesOptions): CachedIssues | null {
    const store = this.storage.get<CacheStore>(STORAGE_KEY, {});
    const entry = store[this.makeKey(repo, filter)];
    if (!entry) {
      return null;
    }
    return {
      issues: entry.issues.map(reviveIssue),
      cachedAt: new Date(entry.cachedAt),
    };
  }

  async write(
    repo: RepositoryInfo,
    filter: ListIssuesOptions,
    issues: Issue[]
  ): Promise<void> {
    const store = this.storage.get<CacheStore>(STORAGE_KEY, {});
    store[this.makeKey(repo, filter)] = {
      issues: issues.map(serializeIssue),
      cachedAt: Date.now(),
    };
    await this.storage.update(STORAGE_KEY, this.trim(store));
  }

  async clear(): Promise<void> {
    await this.storage.update(STORAGE_KEY, undefined);
  }

  private trim(store: CacheStore): CacheStore {
    const entries = Object.entries(store);
    if (entries.length <= MAX_ENTRIES) {
      return store;
    }
    const sorted = entries.sort((a, b) => b[1].cachedAt - a[1].cachedAt);
    const trimmed: CacheStore = {};
    for (const [key, value] of sorted.slice(0, MAX_ENTRIES)) {
      trimmed[key] = value;
    }
    return trimmed;
  }

  private makeKey(repo: RepositoryInfo, filter: ListIssuesOptions): string {
    const labels = (filter.labels ?? []).slice().sort().join(',');
    const filterParts = [
      filter.state ?? 'open',
      filter.sort ?? 'created',
      filter.direction ?? '',
      labels,
      filter.milestone ?? '',
      filter.assignee ?? '',
    ].join('|');
    const baseUrl = repo.baseUrl.replace(/\/+$/, '');
    return `${repo.platform}:${baseUrl}/${repo.owner}/${repo.repo}#${filterParts}`;
  }
}

function serializeIssue(issue: Issue): SerializedIssue {
  return {
    ...issue,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
  };
}

function reviveIssue(issue: SerializedIssue): Issue {
  return {
    ...issue,
    createdAt: new Date(issue.createdAt),
    updatedAt: new Date(issue.updatedAt),
  };
}
