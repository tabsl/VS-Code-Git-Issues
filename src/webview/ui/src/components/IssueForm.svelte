<script lang="ts">
  import { onMount } from 'svelte';
  import type { IssueDetail, Label, User, RepositoryInfo, MessageToWebview } from '../types';
  import { postMessage } from '../stores/vscodeApi';

  let {
    issue,
    labels: allLabels,
    assignees: allAssignees,
    repositoryInfo,
    oncancel,
  }: {
    issue: IssueDetail;
    labels: Label[];
    assignees: User[];
    repositoryInfo: RepositoryInfo | null;
    oncancel: () => void;
  } = $props();

  let title = $state('');
  let body = $state('');
  let selectedLabels = $state<string[]>([]);
  let selectedAssignees = $state<string[]>([]);
  let submitting = $state(false);
  let errorMessage = $state('');
  let initializedForIssue = $state<number | null>(null);

  $effect(() => {
    if (initializedForIssue === issue.number) {
      return;
    }

    title = issue.title;
    body = issue.body;
    selectedLabels = issue.labels.map((l) => l.name);
    selectedAssignees = issue.assignees.map((a) => a.login);
    submitting = false;
    errorMessage = '';
    initializedForIssue = issue.number;
  });

  onMount(() => {
    const handleMessage = (event: MessageEvent<MessageToWebview>) => {
      const msg = event.data;
      if (msg.type === 'operationFailed' && msg.operation === 'updateIssue') {
        submitting = false;
        errorMessage = msg.message;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  });

  function toggleLabel(name: string) {
    if (selectedLabels.includes(name)) {
      selectedLabels = selectedLabels.filter((l) => l !== name);
    } else {
      selectedLabels = [...selectedLabels, name];
    }
  }

  let labelDropdownOpen = $state(false);
  let assigneeDropdownOpen = $state(false);

  function toggleAssignee(login: string) {
    if (selectedAssignees.includes(login)) {
      selectedAssignees = selectedAssignees.filter((a) => a !== login);
    } else {
      selectedAssignees = [...selectedAssignees, login];
    }
  }

  function handleDropdownBlur(dropdown: 'label' | 'assignee') {
    return (event: FocusEvent) => {
      const related = event.relatedTarget as HTMLElement | null;
      if (!related?.closest('.dropdown-container')) {
        if (dropdown === 'label') labelDropdownOpen = false;
        else assigneeDropdownOpen = false;
      }
    };
  }

  function save() {
    if (!title.trim() || submitting) return;
    submitting = true;
    errorMessage = '';
    postMessage({
      type: 'updateIssue',
      data: {
        title: title.trim(),
        body,
        labels: selectedLabels,
        assignees: selectedAssignees,
      },
    });
  }
</script>

<div class="form-card">
  {#if repositoryInfo}
    <div class="repo-name">{repositoryInfo.owner}/{repositoryInfo.repo}</div>
  {/if}
  <h2>Edit Issue #{issue.number}</h2>

  <div class="field">
    <label for="title">Title</label>
    <input id="title" type="text" bind:value={title} />
  </div>

  <div class="field">
    <label for="body">Description</label>
    <textarea id="body" bind:value={body} rows="10"></textarea>
  </div>

  <div class="field">
    <span class="field-label">Labels</span>
    {#if allLabels.length > 0}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="dropdown-container" onfocusout={handleDropdownBlur('label')}>
        <button
          type="button"
          class="dropdown-trigger"
          onclick={() => labelDropdownOpen = !labelDropdownOpen}
        >
          {#if selectedLabels.length > 0}
            <span class="selected-tags">
              {#each selectedLabels as name}
                {@const labelObj = allLabels.find(l => l.name === name)}
                <span class="tag" style:background-color={labelObj?.color ? `#${labelObj.color}` : 'var(--vscode-button-background)'}>
                  {name}
                  <span
                    class="tag-remove"
                    role="button"
                    tabindex="-1"
                    onmousedown={(e) => { e.preventDefault(); toggleLabel(name); }}
                  >&times;</span>
                </span>
              {/each}
            </span>
          {:else}
            <span class="placeholder">Select labels...</span>
          {/if}
          <span class="dropdown-arrow">{labelDropdownOpen ? '▲' : '▼'}</span>
        </button>
        {#if labelDropdownOpen}
          <div class="dropdown-list">
            {#each allLabels as label}
              <button
                type="button"
                class="dropdown-item"
                class:selected={selectedLabels.includes(label.name)}
                onclick={() => toggleLabel(label.name)}
              >
                <span class="checkbox">{selectedLabels.includes(label.name) ? '☑' : '☐'}</span>
                {#if label.color}
                  <span class="color-dot" style:background-color={`#${label.color}`}></span>
                {/if}
                {label.name}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <span class="empty-hint">No labels available</span>
    {/if}
  </div>

  <div class="field">
    <span class="field-label">Assignees</span>
    {#if allAssignees.length > 0}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="dropdown-container" onfocusout={handleDropdownBlur('assignee')}>
        <button
          type="button"
          class="dropdown-trigger"
          onclick={() => assigneeDropdownOpen = !assigneeDropdownOpen}
        >
          {#if selectedAssignees.length > 0}
            <span class="selected-tags">
              {#each selectedAssignees as login}
                <span class="tag">
                  {login}
                  <span
                    class="tag-remove"
                    role="button"
                    tabindex="-1"
                    onmousedown={(e) => { e.preventDefault(); toggleAssignee(login); }}
                  >&times;</span>
                </span>
              {/each}
            </span>
          {:else}
            <span class="placeholder">Select assignees...</span>
          {/if}
          <span class="dropdown-arrow">{assigneeDropdownOpen ? '▲' : '▼'}</span>
        </button>
        {#if assigneeDropdownOpen}
          <div class="dropdown-list">
            {#each allAssignees as assignee}
              <button
                type="button"
                class="dropdown-item"
                class:selected={selectedAssignees.includes(assignee.login)}
                onclick={() => toggleAssignee(assignee.login)}
              >
                <span class="checkbox">{selectedAssignees.includes(assignee.login) ? '☑' : '☐'}</span>
                {assignee.login}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <span class="empty-hint">No assignees available</span>
    {/if}
  </div>

  <div class="actions">
    <button class="btn-primary" onclick={save} disabled={!title.trim() || submitting}>
      Save
    </button>
    <button class="btn-secondary" onclick={oncancel}>Cancel</button>
  </div>
  {#if errorMessage}
    <div class="error">{errorMessage}</div>
  {/if}
</div>

<style>
  .form-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    background: var(--vscode-editor-background);
  }

  .repo-name {
    font-size: 0.82em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: -8px;
    letter-spacing: 0.02em;
  }

  h2 {
    margin: 0;
    font-size: 1.2em;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field label, .field .field-label {
    font-weight: 600;
    font-size: 0.75em;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  input, textarea {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border-radius: 4px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    box-sizing: border-box;
  }

  input:focus, textarea:focus {
    outline: 1px solid var(--vscode-focusBorder);
  }

  textarea {
    resize: vertical;
  }

  .empty-hint {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 0.85em;
  }

  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 20px;
    border-radius: 4px;
    cursor: pointer;
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

  .btn-secondary {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 6px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.15s;
  }

  .btn-secondary:hover {
    background: var(--vscode-editor-hoverHighlightBackground);
  }

  /* Dropdown */
  .dropdown-container {
    position: relative;
  }

  .dropdown-trigger {
    width: 100%;
    min-height: 34px;
    padding: 4px 30px 4px 8px;
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    text-align: left;
    position: relative;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .dropdown-trigger:hover {
    border-color: var(--vscode-focusBorder);
  }

  .dropdown-trigger:focus {
    outline: 1px solid var(--vscode-focusBorder);
  }

  .dropdown-arrow {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.7em;
    color: var(--vscode-descriptionForeground);
    pointer-events: none;
  }

  .placeholder {
    color: var(--vscode-input-placeholderForeground);
    font-size: 0.9em;
  }

  .selected-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 10px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-size: 0.82em;
  }

  .tag-remove {
    cursor: pointer;
    font-size: 1.1em;
    line-height: 1;
    opacity: 0.7;
    transition: opacity 0.1s;
  }

  .tag-remove:hover {
    opacity: 1;
  }

  .dropdown-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 2px;
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    border-radius: 4px;
    max-height: 180px;
    overflow-y: auto;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .dropdown-item {
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9em;
    text-align: left;
    transition: background 0.1s;
  }

  .dropdown-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .dropdown-item.selected {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .checkbox {
    font-size: 1em;
    flex-shrink: 0;
  }

  .error {
    color: var(--vscode-errorForeground);
    font-size: 0.85em;
  }
</style>
