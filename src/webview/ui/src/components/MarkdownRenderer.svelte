<script lang="ts">
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import type { RepositoryInfo, MessageToWebview } from '../types';
  import { postMessage } from '../stores/vscodeApi';

  let {
    content,
    repositoryInfo = null,
    onTaskToggle = null,
  }: {
    content: string;
    repositoryInfo?: RepositoryInfo | null;
    onTaskToggle?: ((index: number, checked: boolean) => void) | null;
  } = $props();

  let container: HTMLDivElement;
  const pendingProxies = new Map<string, HTMLImageElement>();

  let lightboxSrc = $state<string | null>(null);
  let lightboxAlt = $state<string>('');

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
    const linked = addLinkTargets(resolveLinkUrls(resolveImageUrls(sanitized)));
    // marked emits task-list checkboxes with the `disabled` attribute. When
    // the owner has plugged in an onTaskToggle handler, drop `disabled` so
    // the click handler in handleContainerClick actually fires.
    if (onTaskToggle) {
      return linked.replace(
        /<input\s+([^>]*?)class="task-list-item-checkbox"([^>]*?)>/g,
        (_match, before, after) => {
          const stripped = `${before}${after}`.replace(/\s*\bdisabled(?:="[^"]*")?/g, '');
          return `<input ${stripped.trim()} class="task-list-item-checkbox interactive">`;
        }
      );
    }
    return linked;
  }

  function needsProxy(src: string): boolean {
    if (!repositoryInfo || repositoryInfo.platform !== 'gitlab') return false;
    if (src.startsWith('data:')) return false;
    // Strict origin match — startsWith would accept e.g. "gitlab.com.attacker"
    // when the configured base URL is "https://gitlab.com".
    let parsed: URL;
    let expected: URL;
    try {
      parsed = new URL(src);
      expected = new URL(repositoryInfo.baseUrl);
    } catch {
      return false;
    }
    if (parsed.protocol !== expected.protocol || parsed.host !== expected.host) {
      return false;
    }
    return parsed.pathname.includes('/uploads/');
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

  function handleContainerClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // Task-list checkbox click: bubble to the parent via onTaskToggle so the
    // owner can edit the source markdown and persist the change. We map the
    // clicked checkbox to its document-order index by counting all task-list
    // checkboxes inside the container.
    if (
      target.tagName === 'INPUT' &&
      (target as HTMLInputElement).type === 'checkbox' &&
      target.classList.contains('task-list-item-checkbox')
    ) {
      if (!onTaskToggle) {
        // Read-only mode — let the browser keep the box disabled.
        event.preventDefault();
        return;
      }
      const cb = target as HTMLInputElement;
      const all = container.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox');
      const index = Array.prototype.indexOf.call(all, cb);
      if (index === -1) return;
      // Optimistically reflect the new state in the DOM until the next render.
      cb.checked = !cb.checked;
      onTaskToggle(index, cb.checked);
      event.preventDefault();
      return;
    }

    if (target.tagName !== 'IMG') return;
    const img = target as HTMLImageElement;
    // Skip checkbox-style or other icon-only images without a real source
    const src = img.currentSrc || img.src;
    if (!src) return;
    event.preventDefault();
    lightboxSrc = src;
    lightboxAlt = img.alt || '';
  }

  function closeLightbox() {
    lightboxSrc = null;
    lightboxAlt = '';
  }

  $effect(() => {
    if (!lightboxSrc) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLightbox();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

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

<div class="markdown-body" bind:this={container} onclick={handleContainerClick} role="presentation">
  {@html render(content)}
</div>

{#if lightboxSrc}
  <button
    class="lightbox-overlay"
    type="button"
    aria-label="Close image preview"
    onclick={closeLightbox}
  >
    <img src={lightboxSrc} alt={lightboxAlt} class="lightbox-image" />
    <span class="lightbox-close" aria-hidden="true">×</span>
  </button>
{/if}

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

  .markdown-body :global(input.task-list-item-checkbox.interactive) {
    cursor: pointer;
  }

  .markdown-body :global(li:has(> input.task-list-item-checkbox)) {
    list-style: none;
    margin-left: -1.2em;
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
    max-height: 360px;
    object-fit: contain;
    border-radius: 4px;
    cursor: zoom-in;
    background: var(--vscode-editor-inactiveSelectionBackground);
  }

  .lightbox-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 32px;
    cursor: zoom-out;
    border: none;
    width: 100vw;
    height: 100vh;
    font: inherit;
    color: inherit;
  }

  .lightbox-overlay:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: -4px;
  }

  .lightbox-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .lightbox-close {
    position: absolute;
    top: 12px;
    right: 16px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 24px;
    line-height: 36px;
    text-align: center;
    pointer-events: none;
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
