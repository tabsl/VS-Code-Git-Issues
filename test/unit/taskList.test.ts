import { describe, it, expect } from 'vitest';
import { toggleTaskInMarkdown } from '../../src/webview/ui/src/lib/taskList';

describe('toggleTaskInMarkdown', () => {
  it('checks an unchecked box at index 0', () => {
    const md = '- [ ] first\n- [ ] second';
    expect(toggleTaskInMarkdown(md, 0, true)).toBe('- [x] first\n- [ ] second');
  });

  it('unchecks a checked box at index 1', () => {
    const md = '- [ ] first\n- [x] second';
    expect(toggleTaskInMarkdown(md, 1, false)).toBe('- [ ] first\n- [ ] second');
  });

  it('counts nested task lines in document order', () => {
    const md = ['- [ ] outer-a', '  - [ ] inner-a', '  - [ ] inner-b', '- [ ] outer-b'].join('\n');
    expect(toggleTaskInMarkdown(md, 2, true)).toBe(
      ['- [ ] outer-a', '  - [ ] inner-a', '  - [x] inner-b', '- [ ] outer-b'].join('\n')
    );
  });

  it('skips checkboxes inside fenced code blocks', () => {
    const md = [
      '- [ ] real-zero',
      '```',
      '- [ ] code-not-counted',
      '```',
      '- [ ] real-one',
    ].join('\n');
    const out = toggleTaskInMarkdown(md, 1, true);
    expect(out).toContain('- [ ] real-zero');
    expect(out).toContain('- [ ] code-not-counted'); // unchanged
    expect(out).toContain('- [x] real-one');
  });

  it('accepts *, - and + as bullet markers', () => {
    const md = '* [ ] star\n+ [ ] plus\n- [ ] dash';
    expect(toggleTaskInMarkdown(md, 1, true)).toBe('* [ ] star\n+ [x] plus\n- [ ] dash');
  });

  it('returns the input unchanged when the index is out of range', () => {
    const md = '- [ ] only';
    expect(toggleTaskInMarkdown(md, 5, true)).toBe(md);
  });

  it('returns the input unchanged when there are no task lines', () => {
    const md = 'just some prose\nanother line';
    expect(toggleTaskInMarkdown(md, 0, true)).toBe(md);
  });
});
