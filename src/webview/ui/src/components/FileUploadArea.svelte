<script lang="ts">
  import { onMount } from 'svelte';
  import type { MessageToWebview } from '../types';
  import { postMessage } from '../stores/vscodeApi';

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  let {
    value = $bindable(''),
    placeholder = '',
    rows = 3,
    platform = 'github',
  }: {
    value: string;
    placeholder?: string;
    rows?: number;
    platform?: 'github' | 'gitlab';
  } = $props();

  let textareaEl: HTMLTextAreaElement;
  let dragging = $state(false);
  let uploading = $state(0);
  let errorMsg = $state('');

  const supportsUpload = $derived(platform === 'gitlab');

  function generateUploadId(): string {
    return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function insertAtCursor(text: string): void {
    if (!textareaEl) return;
    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const needsNewline = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    value = before + needsNewline + text + after;
    requestAnimationFrame(() => {
      const pos = start + needsNewline.length + text.length;
      textareaEl.selectionStart = textareaEl.selectionEnd = pos;
      textareaEl.focus();
    });
  }

  function uploadFile(fileName: string, base64: string): void {
    const uploadId = generateUploadId();
    uploading++;
    insertAtCursor(`![Uploading ${fileName}...]()\n`);
    postMessage({ type: 'uploadFile', fileName, fileContentBase64: base64, uploadId });
  }

  function processFiles(files: FileList): void {
    if (!supportsUpload) {
      errorMsg = 'File upload is only available for GitLab repositories.';
      return;
    }
    errorMsg = '';

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        errorMsg = `${file.name} exceeds 10 MB limit.`;
        continue;
      }
      const reader = new FileReader();
      const fileName = file.name;
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        uploadFile(fileName, base64);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    dragging = true;
  }

  function handleDragLeave(): void {
    dragging = false;
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    dragging = false;
    if (!e.dataTransfer?.files.length) return;
    processFiles(e.dataTransfer.files);
  }

  function handlePaste(e: ClipboardEvent): void {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      for (const f of imageFiles) dt.items.add(f);
      processFiles(dt.files);
    }
  }

  function pickFile(): void {
    postMessage({ type: 'pickFile' });
  }

  onMount(() => {
    const handler = (event: MessageEvent<MessageToWebview>) => {
      const msg = event.data;

      if (msg.type === 'uploadProgress') {
        if (msg.status === 'completed' && msg.markdown) {
          value = value.replace(/!\[Uploading [^\]]*?\.\.\.\]\(\)\n?/, msg.markdown + '\n');
          uploading = Math.max(0, uploading - 1);
        } else if (msg.status === 'failed') {
          value = value.replace(/!\[Uploading [^\]]*?\.\.\.\]\(\)\n?/, '');
          uploading = Math.max(0, uploading - 1);
          errorMsg = msg.message || 'Upload failed';
        }
      }

      if (msg.type === 'filesPicked') {
        for (const file of msg.files) {
          uploadFile(file.fileName, file.fileContentBase64);
        }
      }

      if (msg.type === 'uploadNotSupported') {
        errorMsg = 'File upload is only available for GitLab repositories.';
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  });
</script>

<div class="upload-area" class:dragging>
  {#if supportsUpload}
    <div class="toolbar">
      <button type="button" class="attach-btn" onclick={pickFile} title="Attach a file">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.317 7.157l4.949-4.95a2.5 2.5 0 1 1 3.536 3.536l-6.364 6.364a1 1 0 0 1-1.414-1.414l6.364-6.364a.5.5 0 0 0-.708-.708l-4.95 4.95a2 2 0 1 0 2.829 2.828l6.364-6.364a3.5 3.5 0 0 0-4.95-4.95L4.318 5.744a3 3 0 1 0 4.243 4.243l4.95-4.95.706.708-4.95 4.95a4 4 0 1 1-5.656-5.657l.707-.707z"/>
        </svg>
        Attach file
      </button>
      {#if uploading > 0}
        <span class="upload-status">
          <span class="spinner"></span>
          Uploading...
        </span>
      {/if}
    </div>
  {/if}

  <div class="textarea-wrap">
    <textarea
      bind:this={textareaEl}
      bind:value
      {placeholder}
      {rows}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
      onpaste={handlePaste}
    ></textarea>

    {#if dragging}
      <div class="drop-overlay">
        <span>{supportsUpload ? 'Drop files to upload' : 'File upload not supported for GitHub'}</span>
      </div>
    {/if}
  </div>

  {#if errorMsg}
    <div class="upload-error">{errorMsg}</div>
  {/if}
</div>

<style>
  .upload-area {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .attach-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    font-size: 0.8em;
    padding: 2px 4px;
    border-radius: 3px;
    transition: background 0.15s;
  }

  .attach-btn:hover {
    background: var(--vscode-editor-hoverHighlightBackground);
  }

  .attach-btn svg {
    opacity: 0.8;
  }

  .upload-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
  }

  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--vscode-descriptionForeground);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .textarea-wrap {
    position: relative;
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

  .upload-area.dragging textarea {
    border-color: var(--vscode-focusBorder);
    border-style: dashed;
  }

  .drop-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--vscode-editor-background);
    opacity: 0.9;
    border: 2px dashed var(--vscode-focusBorder);
    border-radius: 4px;
    pointer-events: none;
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }

  .upload-error {
    color: var(--vscode-errorForeground);
    font-size: 0.8em;
    margin-top: 4px;
  }
</style>
