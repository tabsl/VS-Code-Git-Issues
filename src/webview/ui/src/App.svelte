<script lang="ts">
  import type { IssueDetail, Comment, Label, User, RepositoryInfo, MessageToWebview } from './types';
  import IssueView from './components/IssueDetail.svelte';
  import IssueForm from './components/IssueForm.svelte';

  let issue: IssueDetail | null = $state(null);
  let allLabels: Label[] = $state([]);
  let allAssignees: User[] = $state([]);
  let repoInfo: RepositoryInfo | null = $state(null);
  let editing = $state(false);

  window.addEventListener('message', (event: MessageEvent<MessageToWebview>) => {
    const msg = event.data;
    switch (msg.type) {
      case 'issueLoaded':
        issue = msg.issue;
        allLabels = msg.labels;
        allAssignees = msg.assignees;
        repoInfo = msg.repositoryInfo;
        editing = false;
        break;
      case 'commentAdded':
        if (issue) {
          issue = {
            ...issue,
            comments: [...issue.comments, msg.comment],
            commentCount: issue.commentCount + 1,
          };
        }
        break;
      case 'issueUpdated':
        issue = msg.issue;
        editing = false;
        break;
    }
  });

  function handleEdit() {
    editing = true;
  }

  function handleCancel() {
    editing = false;
  }
</script>

<main>
  {#if issue}
    {#if editing}
      <IssueForm {issue} labels={allLabels} assignees={allAssignees} repositoryInfo={repoInfo} oncancel={handleCancel} />
    {:else}
      <IssueView {issue} repositoryInfo={repoInfo} onedit={handleEdit} />
    {/if}
  {:else}
    <div class="loading">Loading issue...</div>
  {/if}
</main>

<style>
  main {
    padding: 16px 20px;
    max-width: 960px;
    margin: 0 auto;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: var(--vscode-descriptionForeground);
  }
</style>
