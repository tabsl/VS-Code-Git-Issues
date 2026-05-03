import { describe, it, expect, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import { IssueCache } from '../../src/cache/IssueCache';
import type { Issue, ListIssuesOptions, RepositoryInfo } from '../../src/types';

class MemoryMemento implements vscode.Memento {
  private store = new Map<string, unknown>();
  keys(): readonly string[] {
    return [...this.store.keys()];
  }
  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.store.has(key) ? (this.store.get(key) as T) : defaultValue);
  }
  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.store.delete(key);
    } else {
      this.store.set(key, JSON.parse(JSON.stringify(value)));
    }
  }
  setKeysForSync(): void {
    /* no-op */
  }
}

const repo: RepositoryInfo = {
  owner: 'acme',
  repo: 'tools',
  platform: 'github',
  baseUrl: 'https://github.com',
};

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 1,
    title: 'Cached title',
    state: 'open',
    author: { id: 1, login: 'alice' },
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-02T10:00:00.000Z'),
    labels: [{ name: 'bug', color: 'ff0000' }],
    assignees: [{ id: 2, login: 'bob' }],
    commentCount: 3,
    ...overrides,
  };
}

describe('IssueCache', () => {
  let storage: MemoryMemento;
  let cache: IssueCache;
  const filter: ListIssuesOptions = { state: 'open', sort: 'created' };

  beforeEach(() => {
    storage = new MemoryMemento();
    cache = new IssueCache(storage);
  });

  it('returns null when nothing has been cached', () => {
    expect(cache.read(repo, filter)).toBeNull();
  });

  it('round-trips issues including Date fields and metadata', async () => {
    const issues = [makeIssue({ number: 7 }), makeIssue({ number: 8, state: 'closed' })];
    await cache.write(repo, filter, issues);

    const result = cache.read(repo, filter);
    expect(result).not.toBeNull();
    expect(result!.issues).toHaveLength(2);
    expect(result!.issues[0].createdAt).toBeInstanceOf(Date);
    expect(result!.issues[0].createdAt.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect(result!.issues[1].state).toBe('closed');
    expect(result!.cachedAt).toBeInstanceOf(Date);
  });

  it('keys cache entries by repository and filter so distinct lookups stay isolated', async () => {
    await cache.write(repo, { state: 'open', sort: 'created' }, [makeIssue({ number: 1 })]);
    await cache.write(repo, { state: 'closed', sort: 'created' }, [makeIssue({ number: 2 })]);

    expect(cache.read(repo, { state: 'open', sort: 'created' })!.issues[0].number).toBe(1);
    expect(cache.read(repo, { state: 'closed', sort: 'created' })!.issues[0].number).toBe(2);

    const otherRepo: RepositoryInfo = { ...repo, repo: 'other' };
    expect(cache.read(otherRepo, { state: 'open', sort: 'created' })).toBeNull();
  });

  it('treats label sets as order-independent', async () => {
    await cache.write(repo, { ...filter, labels: ['a', 'b'] }, [makeIssue({ number: 99 })]);
    expect(cache.read(repo, { ...filter, labels: ['b', 'a'] })!.issues[0].number).toBe(99);
  });

  it('clear() empties the cache', async () => {
    await cache.write(repo, filter, [makeIssue()]);
    await cache.clear();
    expect(cache.read(repo, filter)).toBeNull();
  });
});
