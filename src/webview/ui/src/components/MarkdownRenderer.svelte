<script lang="ts">
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import type { RepositoryInfo, MessageToWebview } from '../types';
  import { postMessage } from '../stores/vscodeApi';

  let { content, repositoryInfo = null }: { content: string; repositoryInfo?: RepositoryInfo | null } = $props();

  let container: HTMLDivElement;
  const pendingProxies = new Map<string, HTMLImageElement>();

  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  function resolveImageUrl(src: string, repoInfo: RepositoryInfo): string {
    if (!src) return src;
    if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return src;
    if (src.startsWith('/')) {
      // GitLab uploads are project-relative and need /-/ prefix
      if (src.startsWith('/uploads/')) {
        const prefix = repoInfo.platform === 'gitlab' ? '/-' : '';
        return `${repoInfo.baseUrl}/${repoInfo.owner}/${repoInfo.repo}${prefix}${src}`;
      }
      // Other root-relative URLs (e.g. Gitea /attachments/)
      return `${repoInfo.baseUrl}${src}`;
    }
    // Other relative URLs
    return `${repoInfo.baseUrl}/${repoInfo.owner}/${repoInfo.repo}/raw/branch/main/${src}`;
  }

  function resolveLinkUrl(href: string, repoInfo: RepositoryInfo): string {
    if (!href) return href;
    if (/^(https?:)?\/\//.test(href) || href.startsWith('mailto:') || href.startsWith('#')) return href;
    if (href.startsWith('/')) {
      if (href.startsWith('/uploads/')) {
        const prefix = repoInfo.platform === 'gitlab' ? '/-' : '';
        return `${repoInfo.baseUrl}/${repoInfo.owner}/${repoInfo.repo}${prefix}${href}`;
      }
      return `${repoInfo.baseUrl}${href}`;
    }
    return href;
  }

  function resolveImageUrls(html: string): string {
    if (!repositoryInfo) return html;
    return html.replace(/<img\s+([^>]*?)src=["']([^"']+)["']/gi, (_match, prefix, src) => {
      const resolved = resolveImageUrl(src, repositoryInfo);
      return `<img ${prefix}src="${resolved}"`;
    });
  }

  function resolveLinkUrls(html: string): string {
    if (!repositoryInfo) return html;
    return html.replace(/<a\s+([^>]*?)href=["']([^"']+)["']/gi, (_match, prefix, href) => {
      const resolved = resolveLinkUrl(href, repositoryInfo);
      return `<a ${prefix}href="${resolved}"`;
    });
  }

  function addLinkTargets(html: string): string {
    return html.replace(/<a\s+([^>]*?)>/gi, (_match, attrs) => {
      let updated = attrs.trim();
      if (!/target\s*=/.test(updated)) {
        updated += ' target="_blank"';
      }
      if (!/rel\s*=/.test(updated)) {
        updated += ' rel="noopener noreferrer"';
      }
      return `<a ${updated}>`;
    });
  }

  function render(md: string): string {
    const raw = marked.parse(md) as string;
    const sanitized = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'code', 'pre', 'a', 'img',
        'strong', 'em', 'del', 'blockquote', 'hr',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'input', 'span', 'div',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'type', 'checked', 'disabled', 'target', 'rel'],
    });
    return addLinkTargets(resolveLinkUrls(resolveImageUrls(sanitized)));
  }

  function needsProxy(src: string): boolean {
    if (!repositoryInfo || repositoryInfo.platform !== 'gitlab') return false;
    if (src.startsWith('data:')) return false;
    return src.startsWith(repositoryInfo.baseUrl) && src.includes('/uploads/');
  }

  function proxyImages(): void {
    if (!container) return;
    const images = container.querySelectorAll<HTMLImageElement>('img');
    for (const img of images) {
      const src = img.getAttribute('src') || '';
      if (needsProxy(src) && !img.dataset.proxyRequested) {
        const requestId = crypto.randomUUID();
        img.dataset.proxyRequested = requestId;
        img.style.opacity = '0.3';
        pendingProxies.set(requestId, img);
        postMessage({ type: 'proxyImage', requestId, imageUrl: src });
      }
    }
  }

  onMount(() => {
    const handleMessage = (event: MessageEvent<MessageToWebview>) => {
      const msg = event.data;
      if (msg.type === 'imageProxied') {
        const img = pendingProxies.get(msg.requestId);
        if (img) {
          img.src = msg.dataUri;
          img.style.opacity = '';
          pendingProxies.delete(msg.requestId);
        }
      } else if (msg.type === 'imageProxyFailed') {
        const img = pendingProxies.get(msg.requestId);
        if (img) {
          img.style.opacity = '';
          pendingProxies.delete(msg.requestId);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      pendingProxies.clear();
    };
  });

  $effect(() => {
    void content;
    void repositoryInfo;
    proxyImages();
  });
</script>

<div class="markdown-body" bind:this={container}>
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
