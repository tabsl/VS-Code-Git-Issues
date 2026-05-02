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
    <div class="title-row">
      <span class="number">#{issue.number}</span>
      <h1>{issue.title}</h1>
      <span class="state-badge" class:open={issue.state === 'open'} class:closed={issue.state !== 'open'}>
        {issue.state}
      </span>
      <div class="actions">
        <button class="btn btn-primary" onclick={onedit} title="Edit issue">Edit</button>
        <button class="btn btn-ghost" onclick={createBranch} title="Create branch from issue">Branch</button>
        <button class="btn btn-ghost" onclick={openInBrowser} title="Open in browser">Browser</button>
        <button
          class="btn"
          class:btn-state-close={issue.state === 'open'}
          class:btn-state-reopen={issue.state !== 'open'}
          onclick={toggleState}
          title={issue.state === 'open' ? 'Close issue' : 'Reopen issue'}
        >
          {issue.state === 'open' ? 'Close' : 'Reopen'}
        </button>
      </div>
    </div>

    <div class="meta-line">
      {#if repositoryInfo}
        <span class="repo">{repositoryInfo.owner}/{repositoryInfo.repo}</span>
        <span class="dot">·</span>
      {/if}
      <span class="avatar avatar-xs" title={issue.author.login}>{getInitials(issue.author.login)}</span>
      <span>{issue.author.login}</span>
      <span class="dot">·</span>
      <span>opened {formatDate(issue.createdAt)}</span>
      <span class="dot">·</span>
      <span>{issue.commentCount} {issue.commentCount === 1 ? 'comment' : 'comments'}</span>
    </div>

    {#if issue.labels.length > 0 || issue.assignees.length > 0}
      <div class="chips">
        {#each issue.labels as label}
          <span class="label-chip">
            <span class="label-dot" style:background-color={label.color ? `#${label.color}` : 'var(--vscode-descriptionForeground)'}></span>
            {label.name}
          </span>
        {/each}
        {#if issue.assignees.length > 0}
          <span class="chips-divider"></span>
          <span class="assignees-label">Assignees:</span>
          {#each issue.assignees as assignee}
            <span class="assignee-chip" title={assignee.login}>
              <span class="avatar avatar-xs">{getInitials(assignee.login)}</span>
              <span>{assignee.login}</span>
            </span>
          {/each}
        {/if}
      </div>
    {/if}
  </header>

  <section class="body">
    {#if issue.body}
      <MarkdownRenderer content={issue.body} {repositoryInfo} />
    {:else}
      <p class="empty">No description provided.</p>
    {/if}
  </section>

  <section class="comments-section">
    <h2>Comments ({issue.commentCount})</h2>
    <CommentThread comments={issue.comments} {repositoryInfo} />
    <CommentForm platform={repositoryInfo?.platform || 'github'} {repositoryInfo} />
  </section>
</article>

<style>
  article {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 980px;
  }

  /* Header */
  header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .title-row h1 {
    margin: 0;
    min-width: 0;
    font-size: 1.3em;
    font-weight: 600;
    line-height: 1.3;
    word-break: break-word;
  }

  .number {
    color: var(--vscode-descriptionForeground);
    font-weight: 500;
    font-size: 1.15em;
    flex-shrink: 0;
  }

  .state-badge {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 0.72em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .state-badge.open {
    background: var(--vscode-testing-iconPassed, #28a745);
    color: #fff;
  }

  .state-badge.closed {
    background: var(--vscode-testing-iconFailed, #6f42c1);
    color: #fff;
  }

  .meta-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }

  .meta-line .repo {
    font-weight: 500;
    color: var(--vscode-foreground);
    opacity: 0.85;
  }

  .dot {
    opacity: 0.5;
  }

  /* Chips row */
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .label-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--vscode-editor-inactiveSelectionBackground, rgba(127, 127, 127, 0.12));
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
    font-size: 0.78em;
    font-weight: 500;
    line-height: 1.5;
  }

  .label-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .chips-divider {
    width: 1px;
    height: 14px;
    background: var(--vscode-panel-border);
    margin: 0 4px;
  }

  .assignees-label {
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .assignee-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 10px 2px 3px;
    border-radius: 999px;
    background: var(--vscode-editor-inactiveSelectionBackground, rgba(127, 127, 127, 0.12));
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
    font-size: 0.78em;
  }

  /* Avatar */
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-weight: 600;
    background: var(--vscode-button-secondaryBackground, var(--vscode-input-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    flex-shrink: 0;
    user-select: none;
  }

  .avatar-xs {
    width: 18px;
    height: 18px;
    font-size: 0.62em;
  }

  /* Buttons — unified style */
  .actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .btn {
    border: 1px solid transparent;
    background: transparent;
    color: var(--vscode-foreground);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.82em;
    font-weight: 500;
    line-height: 1.4;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }

  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .btn-primary:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .btn-ghost {
    border-color: var(--vscode-input-border, var(--vscode-panel-border));
    color: var(--vscode-foreground);
    opacity: 0.85;
  }

  .btn-ghost:hover {
    background: var(--vscode-toolbar-hoverBackground, color-mix(in srgb, var(--vscode-foreground) 8%, transparent));
    opacity: 1;
  }

  .btn-state-close {
    background: var(--vscode-statusBarItem-errorBackground, #d35454);
    color: var(--vscode-statusBarItem-errorForeground, #fff);
    border-color: transparent;
  }

  .btn-state-close:hover {
    filter: brightness(1.08);
  }

  .btn-state-reopen {
    background: var(--vscode-testing-iconPassed, #2da44e);
    color: #fff;
    border-color: transparent;
  }

  .btn-state-reopen:hover {
    filter: brightness(1.08);
  }

  /* Body */
  .body {
    padding: 14px 16px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    background: var(--vscode-editor-background);
    line-height: 1.6;
    word-wrap: break-word;
  }

  .empty {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 0.9em;
    margin: 0;
  }

  .comments-section h2 {
    font-size: 1.02em;
    font-weight: 600;
    margin: 4px 0 12px;
    padding-top: 8px;
    border-top: 1px solid var(--vscode-panel-border);
  }

  @media (max-width: 720px) {
    .actions {
      width: 100%;
      flex-wrap: wrap;
    }
  }
</style>
