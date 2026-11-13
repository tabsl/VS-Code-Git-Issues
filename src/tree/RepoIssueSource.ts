import type { IssueCache } from '../cache/IssueCache';
import type { DetectedRepository } from '../git/RepositoryResolver';
import type { SourceState } from '../git/RepositorySelection';
import type { Issue, ListIssuesOptions } from '../types';

export class RepoIssueSource {
  issues: Issue[] = [];
  loading = false;
  error: string | null = null;
  currentUserLogin: string | undefined;

  constructor(
    readonly repo: DetectedRepository | null,
    readonly state: SourceState,
    private readonly cache: IssueCache | null,
    private readonly onChange: () => void
  ) {}

  get repoKey(): string | null {
    return this.repo?.rootPath ?? null;
  }

  async load(filter: ListIssuesOptions, limit: number): Promise<void> {
    if (this.state.kind !== 'ready') {
      return;
    }
    const provider = this.state.provider;

    let paintedFromCache = false;
    if (this.cache) {
      const cached = this.cache.read(provider.getRepositoryInfo(), filter);
      if (cached && cached.issues.length > 0) {
        this.issues = cached.issues;
        this.error = null;
        this.loading = false;
        paintedFromCache = true;
        this.onChange();
      }
    }

    if (!paintedFromCache) {
      this.loading = true;
      this.error = null;
      this.onChange();
    }

    try {
      if (!this.currentUserLogin) {
        this.currentUserLogin = await provider.getCurrentUser()
          .then((u) => u.login)
          .catch(() => undefined);
      }
      const fresh = await provider.listIssues({ ...filter, limit });
      this.issues = fresh;
      this.error = null;
      if (this.cache) {
        await this.cache
          .write(provider.getRepositoryInfo(), filter, fresh)
          .catch(() => undefined);
      }
    } catch (err) {
      // Keep cached issues visible on transient network errors so the user
      // is never left staring at an empty sidebar after a flaky refresh.
      if (!paintedFromCache) {
        this.error = err instanceof Error ? err.message : String(err);
        this.issues = [];
      }
    } finally {
      this.loading = false;
      this.onChange();
    }
  }
}
