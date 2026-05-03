<script lang="ts">
  import type { Comment, RepositoryInfo, ReactionContent } from '../types';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import ReactionBar from './ReactionBar.svelte';
  import { postMessage } from '../stores/vscodeApi';

  let { comments, repositoryInfo = null }: { comments: Comment[]; repositoryInfo?: RepositoryInfo | null } = $props();

  function toggleCommentReaction(commentId: number, content: ReactionContent) {
    postMessage({ type: 'toggleCommentReaction', commentId, content });
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getInitials(login: string): string {
    return login.slice(0, 2).toUpperCase();
  }
</script>

<div class="thread">
  {#each comments as comment (comment.id)}
    <div class="comment">
      <div class="comment-header">
        <div class="comment-author">
          <span class="avatar" title={comment.author.login}>{getInitials(comment.author.login)}</span>
          <strong>{comment.author.login}</strong>
        </div>
        <span class="date">{formatDate(comment.createdAt)}</span>
      </div>
      <div class="comment-body">
        <MarkdownRenderer content={comment.body} {repositoryInfo} />
        <ReactionBar
          reactions={comment.reactions ?? []}
          onToggle={(c) => toggleCommentReaction(comment.id, c)}
        />
      </div>
    </div>
  {/each}

  {#if comments.length === 0}
    <p class="empty">No comments yet.</p>
  {/if}
</div>

<style>
  .thread {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .comment {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .comment:hover {
    border-color: var(--vscode-focusBorder);
  }

  .comment-header {
    padding: 8px 12px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    font-size: 0.85em;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .comment-author {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-size: 0.65em;
    font-weight: 600;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    flex-shrink: 0;
    user-select: none;
  }

  .date {
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
  }

  .comment-body {
    padding: 10px 12px;
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.55;
  }

  .empty {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 0.9em;
  }
</style>
