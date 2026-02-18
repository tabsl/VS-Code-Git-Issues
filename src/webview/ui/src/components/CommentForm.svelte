<script lang="ts">
  import { onMount } from 'svelte';
  import type { MessageToWebview } from '../types';
  import { postMessage } from '../stores/vscodeApi';
  import FileUploadArea from './FileUploadArea.svelte';

  let { platform = 'github' }: { platform?: 'github' | 'gitlab' } = $props();

  let body = $state('');
  let submitting = $state(false);
  let errorMessage = $state('');

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
  <FileUploadArea bind:value={body} placeholder="Write a comment..." rows={3} {platform} />
  <button class="btn-primary" onclick={submit} disabled={!body.trim() || submitting}>
    Comment
  </button>
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
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    font-weight: 500;
    transition: background 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error {
    color: var(--vscode-errorForeground);
    font-size: 0.85em;
  }
</style>
