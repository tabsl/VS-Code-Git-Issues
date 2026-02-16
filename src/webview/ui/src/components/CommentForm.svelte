<script lang="ts">
  import { onMount } from 'svelte';
  import type { MessageToWebview } from '../types';
  import { postMessage } from '../stores/vscodeApi';

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
  <textarea
    bind:value={body}
    placeholder="Write a comment..."
    rows="3"
  ></textarea>
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

  textarea {
    width: 100%;
    resize: vertical;
    padding: 8px 10px;
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border-radius: 4px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  textarea:hover {
    border-color: var(--vscode-focusBorder);
  }

  textarea:focus {
    outline: 1px solid var(--vscode-focusBorder);
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
