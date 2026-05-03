// Toggles the n-th GitHub-flavoured task-list checkbox in a Markdown source
// string. Indexing is 0-based and matches the order produced by `marked`'s
// GFM task-list rendering — which is "every `- [ ]` / `- [x]` line in document
// order, regardless of nesting level".
//
// The function returns a new string with the n-th checkbox flipped to
// `checked`. If `index` is out of range, the input is returned unchanged.
//
// We deliberately do NOT touch checkboxes inside fenced code blocks (``` …
// ```) — they're shown as code in the rendered output and can't be clicked,
// so we must keep their indices in sync with what the renderer surfaces.

const TASK_LINE_RE = /^(\s*[-*+]\s+)\[([ xX])\](\s)/gm;
const FENCE_RE = /(^|\n)```[\s\S]*?\n```/g;

export function toggleTaskInMarkdown(
  source: string,
  index: number,
  checked: boolean
): string {
  if (index < 0) {
    return source;
  }

  // Mask out fenced code blocks so checkboxes inside them don't get counted.
  // We replace each fence with a same-length placeholder of non-newline,
  // non-bracket characters so positions remain stable.
  const masks: Array<{ start: number; end: number }> = [];
  source.replace(FENCE_RE, (m, _lead, offset) => {
    masks.push({ start: offset as number, end: (offset as number) + m.length });
    return m;
  });
  const isMasked = (pos: number) =>
    masks.some((m) => pos >= m.start && pos < m.end);

  let counter = 0;
  let touched = false;
  const result = source.replace(TASK_LINE_RE, (match, prefix, _state, trailing, offset) => {
    if (isMasked(offset as number)) {
      return match;
    }
    if (counter === index) {
      counter++;
      touched = true;
      return `${prefix}[${checked ? 'x' : ' '}]${trailing}`;
    }
    counter++;
    return match;
  });
  return touched ? result : source;
}
