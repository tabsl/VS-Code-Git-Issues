<script lang="ts">
  import { onMount } from 'svelte';
  import type { MessageToWebview, RepositoryInfo } from '../types';
  import { postMessage } from '../stores/vscodeApi';
  import FileUploadArea from './FileUploadArea.svelte';

  let {
    platform = 'github',
    repositoryInfo = null,
  }: { platform?: 'github' | 'gitlab'; repositoryInfo?: RepositoryInfo | null } = $props();

  let body = $state('');
  let submitting = $state(false);
  let errorMessage = $state('');
  let uploadsInProgress = $state(0);

  onMount(() => {
    const handleMessage = (event: MessageEvent<MessageToWebview>) => {
      const msg = event.data;
      if (msg.type === 'commentAdded' && submitting) {
        body = '';
        submitting = false;
        errorMessage = '';
        return;
      }

      if (msg.type === 'operationFailed' && msg.operation === 'addComment') {
        submitting = false;
        errorMessage = msg.message;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  });

  function submit() {
    if (!body.trim() || submitting) return;
    submitting = true;
    errorMessage = '';
    postMessage({ type: 'addComment', body: body.trim() });
  }
</script>

<div class="comment-form">
  <FileUploadArea bind:value={body} bind:uploading={uploadsInProgress} placeholder="Write a comment..." rows={3} {platform} {repositoryInfo} />
  <button class="btn-primary" onclick={submit} disabled={!body.trim() || submitting || uploadsInProgress > 0}>
    Comment
  </button>
  {#if uploadsInProgress > 0}
    <div class="hint">Please wait for file uploads to finish before commenting.</div>
  {/if}
  {#if errorMessage}
    <div class="error">{errorMessage}</div>
  {/if}
</div>

<style>
  .comment-form {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .btn-primary {
    align-self: flex-end;
    background: var(--vscode-testing-iconPassed, #2da44e);
    color: #fff;
    border: none;
    padding: 6px 18px;
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

  .error {
    color: var(--vscode-errorForeground);
    font-size: 0.85em;
  }

  .hint {
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
  }
</style>
