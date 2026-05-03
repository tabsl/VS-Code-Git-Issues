<script lang="ts">
  import type { Reaction, ReactionContent } from '../types';

  let {
    reactions = [],
    onToggle,
  }: {
    reactions?: Reaction[];
    onToggle: (content: ReactionContent) => void;
  } = $props();

  const ALL: ReactionContent[] = ['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'];

  const EMOJI: Record<ReactionContent, string> = {
    '+1': '👍',
    '-1': '👎',
    laugh: '😄',
    hooray: '🎉',
    confused: '😕',
    heart: '❤️',
    rocket: '🚀',
    eyes: '👀',
  };

  let pickerOpen = $state(false);

  function existing(content: ReactionContent): Reaction | undefined {
    return reactions.find((r) => r.content === content);
  }
</script>

<div class="reaction-bar">
  {#each reactions as r}
    <button
      type="button"
      class="reaction-chip"
      class:active={r.meReacted}
      onclick={() => onToggle(r.content)}
      title={r.meReacted ? 'Click to remove your reaction' : 'Click to react'}
    >
      <span class="reaction-emoji">{EMOJI[r.content]}</span>
      <span class="reaction-count">{r.count}</span>
    </button>
  {/each}

  <div class="picker-wrap">
    <button
      type="button"
      class="reaction-add"
      onclick={() => (pickerOpen = !pickerOpen)}
      onfocusout={(e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (!related?.closest('.picker-wrap')) {
          pickerOpen = false;
        }
      }}
      title="Add reaction"
      aria-haspopup="true"
      aria-expanded={pickerOpen}
    >
      😊+
    </button>
    {#if pickerOpen}
      <div class="picker">
        {#each ALL as c}
          {@const r = existing(c)}
          <button
            type="button"
            class="picker-item"
            class:active={r?.meReacted}
            onclick={() => {
              pickerOpen = false;
              onToggle(c);
            }}
            title={c}
          >
            {EMOJI[c]}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .reaction-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
  }

  .reaction-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editor-inactiveSelectionBackground, rgba(127, 127, 127, 0.1));
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 0.85em;
    line-height: 1.5;
    transition: background 0.12s, border-color 0.12s;
  }

  .reaction-chip:hover {
    background: var(--vscode-toolbar-hoverBackground, color-mix(in srgb, var(--vscode-foreground) 8%, transparent));
  }

  .reaction-chip.active {
    border-color: var(--vscode-focusBorder);
    background: color-mix(in srgb, var(--vscode-focusBorder) 18%, transparent);
  }

  .reaction-emoji {
    font-size: 1em;
    line-height: 1;
  }

  .reaction-count {
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;
  }

  .picker-wrap {
    position: relative;
  }

  .reaction-add {
    padding: 1px 9px 2px;
    border-radius: 999px;
    border: 1px dashed var(--vscode-panel-border);
    background: transparent;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    font-size: 0.85em;
    line-height: 1.5;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .reaction-add:hover {
    background: var(--vscode-toolbar-hoverBackground, color-mix(in srgb, var(--vscode-foreground) 8%, transparent));
    color: var(--vscode-foreground);
  }

  .picker {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    display: flex;
    gap: 2px;
    padding: 4px 6px;
    border: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editor-background);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    z-index: 10;
  }

  .picker-item {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1.05em;
    line-height: 1;
    transition: background 0.1s;
  }

  .picker-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .picker-item.active {
    background: color-mix(in srgb, var(--vscode-focusBorder) 24%, transparent);
  }
</style>
