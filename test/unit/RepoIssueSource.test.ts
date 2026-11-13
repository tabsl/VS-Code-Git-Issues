import { describe, it, expect, vi } from 'vitest';
import { RepoIssueSource } from '../../src/tree/RepoIssueSource';
import type { IssueProvider } from '../../src/providers/IssueProvider';
import type { IssueCache } from '../../src/cache/IssueCache';
import type { Issue } from '../../src/types';

function issue(number: number): Issue {
  return {
    number, title: `Issue ${number}`, state: 'open', author: { id: 1, login: 'u' },
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    labels: [], assignees: [], commentCount: 0,
  };
}

function provider(listIssues: () => Promise<Issue[]>): IssueProvider {
  return {
    listIssues: vi.fn(listIssues),
    getCurrentUser: vi.fn().mockResolvedValue({ id: 1, login: 'alice' }),
    getRepositoryInfo: () => ({ owner: 'o', repo: 'r', platform: 'github', baseUrl: '' }),
  } as unknown as IssueProvider;
}

function cache(issues: Issue[] | null): IssueCache {
  return {
    read: vi.fn(() => (issues ? { issues } : null)),
    write: vi.fn().mockResolvedValue(undefined),
  } as unknown as IssueCache;
}

describe('RepoIssueSource', () => {
  it('paints cached issues first, then replaces them with fresh ones', async () => {
    let resolve: (v: Issue[]) => void = () => undefined;
    const p = provider(() => new Promise((r) => { resolve = r; }));
    const source = new RepoIssueSource(null, { kind: 'ready', provider: p }, cache([issue(1)]), vi.fn());

    const loading = source.load({ state: 'open' }, 100);
    await new Promise((r) => setTimeout(r, 0));
    expect(source.issues.map((i) => i.number)).toEqual([1]);
    expect(source.loading).toBe(false);

    resolve([issue(2)]);
    await loading;
    expect(source.issues.map((i) => i.number)).toEqual([2]);
  });

  it('keeps cached issues when the fresh load fails', async () => {
    const p = provider(() => Promise.reject(new Error('offline')));
    const source = new RepoIssueSource(null, { kind: 'ready', provider: p }, cache([issue(1)]), vi.fn());
    await source.load({}, 100);
    expect(source.issues.map((i) => i.number)).toEqual([1]);
    expect(source.error).toBeNull();
  });

  it('asks for the current user only once per provider', async () => {
    const p = provider(() => Promise.resolve([]));
    const source = new RepoIssueSource(null, { kind: 'ready', provider: p }, null, vi.fn());
    await source.load({}, 100);
    await source.load({}, 100);
    expect(p.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(source.currentUserLogin).toBe('alice');
  });

  it('does not load without a ready provider', async () => {
    const onChange = vi.fn();
    const source = new RepoIssueSource(null, { kind: 'no-token', platform: 'github' }, null, onChange);
    await source.load({}, 100);
    expect(onChange).not.toHaveBeenCalled();
  });
});
