<script lang="ts">
  import { onMount } from 'svelte';
  import type { Comment, RepositoryInfo, ReactionContent, MessageToWebview } from '../types';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import ReactionBar from './ReactionBar.svelte';
  import FileUploadArea from './FileUploadArea.svelte';
  import { postMessage } from '../stores/vscodeApi';
  import { toggleTaskInMarkdown } from '../lib/taskList';

  let {
    comments,
    repositoryInfo = null,
    currentUserLogin,
  }: {
    comments: Comment[];
    repositoryInfo?: RepositoryInfo | null;
    currentUserLogin?: string;
  } = $props();

  // Comment id currently in edit mode (-1 means none).
  let editingId = $state<number | null>(null);
  let draftBody = $state('');
  let saving = $state(false);
  let uploadsInProgress = $state(0);
  let editError = $state('');

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

  function canEdit(comment: Comment): boolean {
    return Boolean(currentUserLogin && comment.author.login === currentUserLogin);
  }

  function startEdit(comment: Comment) {
    editingId = comment.id;
    draftBody = comment.body;
    editError = '';
    saving = false;
  }

  function cancelEdit() {
    editingId = null;
    draftBody = '';
    editError = '';
    saving = false;
  }

  function saveEdit(comment: Comment) {
    if (!draftBody.trim() || saving || uploadsInProgress > 0) return;
    saving = true;
    editError = '';
    postMessage({ type: 'updateComment', commentId: comment.id, body: draftBody });
  }

  function deleteComment(comment: Comment) {
    postMessage({ type: 'deleteComment', commentId: comment.id });
  }

  function toggleCommentReaction(commentId: number, content: ReactionContent) {
    postMessage({ type: 'toggleCommentReaction', commentId, content });
  }

  function handleCommentTaskToggle(comment: Comment) {
    return (index: number, checked: boolean) => {
      if (!canEdit(comment)) {
        // We can't edit somebody else's comment — ignore.
        return;
      }
      const next = toggleTaskInMarkdown(comment.body ?? '', index, checked);
      if (next === comment.body) {
        return;
      }
      postMessage({ type: 'updateComment', commentId: comment.id, body: next });
    };
  }

  onMount(() => {
    const handler = (event: MessageEvent<MessageToWebview>) => {
      const msg = event.data;
      if (msg.type === 'operationFailed') {
        if (msg.operation === 'updateComment') {
          saving = false;
          editError = msg.message;
        }
      } else if (msg.type === 'issueLoaded') {
        // After a successful update or delete the panel reloads the issue —
        // exit edit mode so the user sees the persisted version.
        if (saving || editingId !== null) {
          cancelEdit();
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  });
</script>

<div class="thread">
  {#each comments as comment (comment.id)}
    <div class="comment">
      <div class="comment-header">
        <div class="comment-author">
          <span class="avatar" title={comment.author.login}>{getInitials(comment.author.login)}</span>
          <strong>{comment.author.login}</strong>
        </div>
        <div class="comment-actions">
          <span class="date">{formatDate(comment.createdAt)}</span>
          {#if canEdit(comment) && editingId !== comment.id}
            <button type="button" class="action-btn" onclick={() => startEdit(comment)} title="Edit comment">Edit</button>
            <button type="button" class="action-btn danger" onclick={() => deleteComment(comment)} title="Delete comment">Delete</button>
          {/if}
        </div>
      </div>
      {#if editingId === comment.id}
        <div class="comment-body comment-edit">
          <FileUploadArea
            bind:value={draftBody}
            bind:uploading={uploadsInProgress}
            placeholder="Edit comment…"
            rows={6}
            platform={repositoryInfo?.platform || 'github'}
            {repositoryInfo}
          />
          <div class="edit-actions">
            <button
              type="button"
              class="btn-primary"
              disabled={!draftBody.trim() || saving || uploadsInProgress > 0}
              onclick={() => saveEdit(comment)}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" class="btn-ghost" onclick={cancelEdit}>Cancel</button>
          </div>
          {#if editError}
            <div class="edit-error">{editError}</div>
          {/if}
        </div>
      {:else}
        <div class="comment-body">
          <MarkdownRenderer
            content={comment.body}
            {repositoryInfo}
            onTaskToggle={canEdit(comment) ? handleCommentTaskToggle(comment) : null}
          />
          <ReactionBar
            reactions={comment.reactions ?? []}
            onToggle={(c) => toggleCommentReaction(comment.id, c)}
          />
        </div>
      {/if}
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
    gap: 8px;
  }

  .comment-author {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .comment-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
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

  .action-btn {
    background: transparent;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    padding: 1px 4px;
    font-size: 0.85em;
    border-radius: 3px;
    transition: background 0.12s, color 0.12s;
  }

  .action-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, color-mix(in srgb, var(--vscode-foreground) 8%, transparent));
  }

  .action-btn.danger {
    color: var(--vscode-errorForeground);
  }

  .comment-body {
    padding: 10px 12px;
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.55;
  }

  .comment-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
    white-space: normal;
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .btn-primary {
    background: var(--vscode-testing-iconPassed, #2da44e);
    color: #fff;
    border: none;
    padding: 4px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    font-weight: 600;
    transition: filter 0.15s, opacity 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .btn-primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-ghost {
    background: transparent;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    color: var(--vscode-foreground);
    padding: 4px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
  }

  .btn-ghost:hover {
    background: var(--vscode-toolbar-hoverBackground, color-mix(in srgb, var(--vscode-foreground) 8%, transparent));
  }

  .edit-error {
    color: var(--vscode-errorForeground);
    font-size: 0.85em;
  }

  .empty {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 0.9em;
  }
</style>
