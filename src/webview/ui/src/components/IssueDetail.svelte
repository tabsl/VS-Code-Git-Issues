<script lang="ts">
  import type { IssueDetail, RepositoryInfo } from '../types';
  import { postMessage } from '../stores/vscodeApi';
  import CommentThread from './CommentThread.svelte';
  import CommentForm from './CommentForm.svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';

  let { issue, repositoryInfo, onedit }: { issue: IssueDetail; repositoryInfo: RepositoryInfo | null; onedit: () => void } = $props();

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getInitials(login: string): string {
    return login.slice(0, 2).toUpperCase();
  }

  function openInBrowser() {
    postMessage({ type: 'openInBrowser' });
  }

  function toggleState() {
    postMessage({
      type: 'updateIssue',
      data: { state: issue.state === 'open' ? 'closed' : 'open' },
    });
  }

  function createBranch() {
    postMessage({ type: 'createBranch' });
  }
</script>

<article>
  <header>
    {#if repositoryInfo}
      <div class="repo-name">{repositoryInfo.owner}/{repositoryInfo.repo}</div>
    {/if}
    <div class="title-row">
      <h1>{issue.title} <span class="number">#{issue.number}</span></h1>
    </div>

    <div class="meta">
      <span class="badge" class:open={issue.state === 'open'} class:closed={issue.state !== 'open'}>
        {issue.state}
      </span>
      <span class="avatar avatar-sm" title={issue.author.login}>{getInitials(issue.author.login)}</span>
      <span class="author">{issue.author.login}</span>
      <span class="separator">·</span>
      <span class="date">opened {formatDate(issue.createdAt)}</span>
    </div>

    <div class="actions">
      <button class="btn btn-primary" onclick={onedit}>Edit</button>
      <button class="btn btn-secondary" onclick={createBranch}>Create Branch</button>
      <button class="btn btn-secondary" onclick={openInBrowser}>Open in Browser</button>
      <button
        class="btn"
        class:btn-danger={issue.state === 'open'}
        class:btn-success={issue.state !== 'open'}
        onclick={toggleState}
      >
        {issue.state === 'open' ? 'Close Issue' : 'Reopen Issue'}
      </button>
    </div>
  </header>

  <div class="content-grid">
    <section class="body">
      {#if issue.body}
        <MarkdownRenderer content={issue.body} />
      {:else}
        <p class="empty">No description provided.</p>
      {/if}
    </section>

    <aside class="sidebar">
      <div class="sidebar-section">
        <h3>Labels</h3>
        {#if issue.labels.length > 0}
          <div class="label-list">
            {#each issue.labels as label}
              <span class="label" style:background-color={label.color ? `#${label.color}` : 'var(--vscode-badge-background)'}>
                {label.name}
              </span>
            {/each}
          </div>
        {:else}
          <span class="empty">None</span>
        {/if}
      </div>

      <div class="sidebar-section">
        <h3>Assignees</h3>
        {#if issue.assignees.length > 0}
          <ul class="assignee-list">
            {#each issue.assignees as assignee}
              <li>
                <span class="avatar avatar-xs" title={assignee.login}>{getInitials(assignee.login)}</span>
                <span>{assignee.login}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <span class="empty">No one assigned</span>
        {/if}
      </div>
    </aside>
  </div>

  <section class="comments-section">
    <h2>Comments ({issue.commentCount})</h2>
    <CommentThread comments={issue.comments} />
    <CommentForm />
  </section>
</article>

<style>
  article {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .repo-name {
    font-size: 0.82em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 2px;
    letter-spacing: 0.02em;
  }

  .title-row h1 {
    margin: 0;
    font-size: 1.4em;
    font-weight: 600;
    line-height: 1.3;
  }

  .number {
    color: var(--vscode-descriptionForeground);
    font-weight: 400;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 0.9em;
    color: var(--vscode-descriptionForeground);
  }

  .separator {
    opacity: 0.5;
  }

  .badge {
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 0.8em;
    font-weight: 600;
    text-transform: capitalize;
  }

  .badge.open {
    background: var(--vscode-testing-iconPassed, #28a745);
    color: #fff;
  }

  .badge.closed {
    background: var(--vscode-testing-iconFailed, #6f42c1);
    color: #fff;
  }

  /* Avatar */
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-weight: 600;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    flex-shrink: 0;
    user-select: none;
  }

  .avatar-sm {
    width: 22px;
    height: 22px;
    font-size: 0.65em;
  }

  .avatar-xs {
    width: 20px;
    height: 20px;
    font-size: 0.6em;
  }

  /* Buttons */
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }

  .btn {
    border: none;
    padding: 5px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    font-weight: 500;
    transition: background 0.15s, opacity 0.15s;
  }

  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .btn-primary:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .btn-secondary {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border);
  }

  .btn-secondary:hover {
    background: var(--vscode-editor-hoverHighlightBackground);
  }

  .btn-danger {
    background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
    color: var(--vscode-errorForeground, #f48771);
    border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
  }

  .btn-danger:hover {
    opacity: 0.85;
  }

  .btn-success {
    background: var(--vscode-testing-iconPassed, #28a745);
    color: #fff;
  }

  .btn-success:hover {
    opacity: 0.85;
  }

  /* Content grid */
  .content-grid {
    display: grid;
    grid-template-columns: 1fr 220px;
    gap: 20px;
  }

  .body {
    padding: 14px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.6;
  }

  /* Sidebar */
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sidebar-section {
    padding: 10px 0;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .sidebar-section:first-child {
    padding-top: 0;
  }

  .sidebar-section:last-child {
    border-bottom: none;
  }

  .sidebar-section h3 {
    margin: 0 0 8px;
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--vscode-descriptionForeground);
  }

  .label-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .label {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.8em;
    font-weight: 600;
    color: #fff;
  }

  .assignee-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .assignee-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9em;
  }

  .empty {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 0.85em;
  }

  .comments-section h2 {
    font-size: 1.05em;
    margin: 8px 0;
    border-top: 1px solid var(--vscode-panel-border);
    padding-top: 14px;
  }

  @media (max-width: 600px) {
    .content-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
