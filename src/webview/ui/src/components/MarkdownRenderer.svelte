<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  let { content }: { content: string } = $props();

  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  function render(md: string): string {
    const raw = marked.parse(md) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'code', 'pre', 'a', 'img',
        'strong', 'em', 'del', 'blockquote', 'hr',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'input', 'span', 'div',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'type', 'checked', 'disabled', 'target', 'rel'],
    });
  }
</script>

<div class="markdown-body">
  {@html render(content)}
</div>

<style>
  .markdown-body {
    line-height: 1.6;
    word-wrap: break-word;
  }

  .markdown-body :global(h1),
  .markdown-body :global(h2),
  .markdown-body :global(h3),
  .markdown-body :global(h4) {
    margin-top: 1em;
    margin-bottom: 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }

  .markdown-body :global(h1) { font-size: 1.4em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.3em; }
  .markdown-body :global(h2) { font-size: 1.2em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.3em; }
  .markdown-body :global(h3) { font-size: 1.05em; }
  .markdown-body :global(h4) { font-size: 1em; }

  .markdown-body :global(p) {
    margin: 0.5em 0;
  }

  .markdown-body :global(a) {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
  }

  .markdown-body :global(a:hover) {
    text-decoration: underline;
  }

  .markdown-body :global(code) {
    padding: 0.15em 0.4em;
    font-size: 0.9em;
    background: var(--vscode-textCodeBlock-background);
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .markdown-body :global(pre) {
    padding: 12px;
    overflow-x: auto;
    background: var(--vscode-textCodeBlock-background);
    border-radius: 6px;
    margin: 0.5em 0;
  }

  .markdown-body :global(pre code) {
    padding: 0;
    background: none;
    font-size: 0.85em;
    line-height: 1.5;
  }

  .markdown-body :global(blockquote) {
    margin: 0.5em 0;
    padding: 0.25em 1em;
    border-left: 3px solid var(--vscode-textBlockQuote-border, var(--vscode-panel-border));
    color: var(--vscode-descriptionForeground);
  }

  .markdown-body :global(blockquote p) {
    margin: 0.25em 0;
  }

  .markdown-body :global(ul),
  .markdown-body :global(ol) {
    padding-left: 1.5em;
    margin: 0.5em 0;
  }

  .markdown-body :global(li) {
    margin: 0.2em 0;
  }

  .markdown-body :global(hr) {
    border: none;
    border-top: 1px solid var(--vscode-panel-border);
    margin: 1em 0;
  }

  .markdown-body :global(img) {
    max-width: 100%;
    border-radius: 4px;
  }

  .markdown-body :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5em 0;
  }

  .markdown-body :global(th),
  .markdown-body :global(td) {
    padding: 6px 10px;
    border: 1px solid var(--vscode-panel-border);
    text-align: left;
  }

  .markdown-body :global(th) {
    font-weight: 600;
    background: var(--vscode-editor-inactiveSelectionBackground);
  }

  .markdown-body :global(del) {
    text-decoration: line-through;
    opacity: 0.7;
  }

  .markdown-body :global(input[type="checkbox"]) {
    margin-right: 0.4em;
    pointer-events: none;
  }
</style>
