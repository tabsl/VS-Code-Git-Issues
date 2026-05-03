<script lang="ts">
  import type { LinkedPullRequest } from '../types';
  import { postMessage } from '../stores/vscodeApi';

  let {
    items = [],
    platform = 'github',
  }: {
    items?: LinkedPullRequest[];
    platform?: 'github' | 'gitlab';
  } = $props();

  const HEADING = $derived(platform === 'gitlab' ? 'Linked Merge Requests' : 'Linked Pull Requests');
  const PR_PREFIX = $derived(platform === 'gitlab' ? '!' : '#');

  function open(url: string) {
    postMessage({ type: 'openExternal', url });
  }

  function stateLabel(state: LinkedPullRequest['state']): string {
    switch (state) {
      case 'merged': return 'Merged';
      case 'closed': return 'Closed';
      case 'draft': return 'Draft';
      default: return 'Open';
    }
  }
</script>

{#if items.length > 0}
  <section class="linked">
    <h2>{HEADING} ({items.length})</h2>
    <ul>
      {#each items as pr (pr.number)}
        <li>
          <span class="state state-{pr.state}">{stateLabel(pr.state)}</span>
          <button type="button" class="link" onclick={() => open(pr.url)}>
            <span class="ref">{PR_PREFIX}{pr.number}</span>
            <span class="title">{pr.title}</span>
          </button>
          <span class="author">by {pr.author.login}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .linked {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 10px 14px;
    background: var(--vscode-editor-background);
  }

  h2 {
    font-size: 0.92em;
    font-weight: 600;
    margin: 0 0 8px;
    color: var(--vscode-foreground);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.88em;
    line-height: 1.5;
    flex-wrap: wrap;
  }

  .state {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.78em;
    font-weight: 600;
    color: #fff;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .state-open {
    background: var(--vscode-testing-iconPassed, #1f883d);
  }

  .state-draft {
    background: var(--vscode-descriptionForeground, #6a737d);
  }

  .state-merged {
    background: var(--vscode-testing-iconFailed, #6f42c1);
  }

  .state-closed {
    background: var(--vscode-statusBarItem-errorBackground, #d35454);
  }

  .link {
    background: transparent;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    padding: 0;
    text-align: left;
    flex: 1 1 auto;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: inherit;
  }

  .link:hover {
    text-decoration: underline;
  }

  .ref {
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .author {
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
    flex-shrink: 0;
  }
</style>
