import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import {
  buildIssuePrompt,
  buildCliCommandLine,
  quoteShellArg,
  resolvePromptLanguage,
  startClaudeSession,
} from '../../src/ai/ClaudeSession';
import type { Issue } from '../../src/types';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 187,
    title: 'Titelbild und Links im Export einfügen',
    state: 'open',
    author: { id: 1, login: 'tabsl' },
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-02'),
    labels: [],
    assignees: [],
    commentCount: 0,
    ...overrides,
  };
}

describe('buildIssuePrompt', () => {
  it('includes number, title and url', () => {
    const prompt = buildIssuePrompt(makeIssue(), 'https://github.com/o/r/issues/187');
    expect(prompt).toBe(
      'Work on issue #187 "Titelbild und Links im Export einfügen": https://github.com/o/r/issues/187'
    );
  });

  it('strips control characters and collapses whitespace in the title', () => {
    const prompt = buildIssuePrompt(
      makeIssue({ title: 'Broken\n\u001b[31mtitle   here' }),
      'https://example.test/1'
    );
    expect(prompt).toBe('Work on issue #187 "Broken [31mtitle here": https://example.test/1');
    expect(prompt).not.toMatch(/[\u0000-\u001f]/);
  });
});

describe('resolvePromptLanguage', () => {
  it('follows the editor language by default', () => {
    expect(resolvePromptLanguage('auto', 'de')).toBe('German');
    expect(resolvePromptLanguage('auto', 'fr-CA')).toBe('French');
    expect(resolvePromptLanguage('auto', 'pt-br')).toBe('Portuguese');
  });

  it('adds no instruction for english or an unknown editor language', () => {
    expect(resolvePromptLanguage('auto', 'en')).toBeUndefined();
    expect(resolvePromptLanguage('auto', 'en-US')).toBeUndefined();
    expect(resolvePromptLanguage('auto', '')).toBeUndefined();
    expect(resolvePromptLanguage('auto', 'qqq')).toBeUndefined();
  });

  it('honours an explicit language and the off switch', () => {
    expect(resolvePromptLanguage('it', 'de')).toBe('Italian');
    expect(resolvePromptLanguage('off', 'de')).toBeUndefined();
    expect(resolvePromptLanguage('en', 'de')).toBeUndefined();
  });
});

describe('buildIssuePrompt with language', () => {
  it('asks Claude to respond in that language', () => {
    const prompt = buildIssuePrompt(makeIssue(), 'https://example.test/187', 'German');
    expect(prompt).toBe(
      'Work on issue #187 "Titelbild und Links im Export einfügen": https://example.test/187. Respond in German.'
    );
  });
});

describe('quoteShellArg', () => {
  it('neutralises shell metacharacters on posix', () => {
    expect(quoteShellArg('; rm -rf ~', 'darwin')).toBe("'; rm -rf ~'");
    expect(quoteShellArg('$(whoami)', 'linux')).toBe("'$(whoami)'");
  });

  it('escapes embedded single quotes on posix', () => {
    expect(quoteShellArg("it's '; evil", 'darwin')).toBe("'it'\\''s '\\''; evil'");
  });

  it('doubles single quotes on windows', () => {
    expect(quoteShellArg("it's", 'win32')).toBe("'it''s'");
  });
});

describe('buildCliCommandLine', () => {
  it('appends the prompt after the configured args', () => {
    const line = buildCliCommandLine(
      { command: 'claude', args: ['--model', 'opus'] },
      'Work on issue #1',
      'darwin'
    );
    expect(line).toBe("claude '--model' 'opus' 'Work on issue #1'");
  });

  it('keeps an injected prompt inside the quotes', () => {
    const line = buildCliCommandLine(
      { command: 'claude', args: [] },
      'Work on issue #1 "`id`; curl evil.test"',
      'darwin'
    );
    expect(line).toBe('claude \'Work on issue #1 "`id`; curl evil.test"\'');
  });
});

describe('startClaudeSession', () => {
  const options = {
    cwd: '/repo',
    terminalName: 'Claude #187',
    cli: { command: 'claude', args: [] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers the Claude Code editor panel', async () => {
    (vscode.commands.getCommands as any).mockResolvedValue([
      'claude-vscode.editor.open',
      'claude-vscode.terminal.open',
    ]);

    const launch = await startClaudeSession('prompt', options);

    expect(launch).toBe('claude-editor');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'claude-vscode.editor.open',
      undefined,
      'prompt',
      vscode.ViewColumn.Beside
    );
    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
  });

  it('falls back to the Claude Code terminal when the panel command fails', async () => {
    (vscode.commands.getCommands as any).mockResolvedValue([
      'claude-vscode.editor.open',
      'claude-vscode.terminal.open',
    ]);
    (vscode.commands.executeCommand as any).mockRejectedValueOnce(new Error('nope'));

    const launch = await startClaudeSession('prompt', options);

    expect(launch).toBe('claude-terminal');
    expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith(
      'claude-vscode.terminal.open',
      'prompt',
      [],
      'bottom'
    );
  });

  it('falls back to a terminal running the configured CLI', async () => {
    (vscode.commands.getCommands as any).mockResolvedValue([]);
    const terminal = { show: vi.fn(), sendText: vi.fn() };
    (vscode.window.createTerminal as any).mockReturnValue(terminal);

    const launch = await startClaudeSession('Work on issue #187', options);

    expect(launch).toBe('cli-terminal');
    expect(vscode.window.createTerminal).toHaveBeenCalledWith({
      name: 'Claude #187',
      cwd: '/repo',
    });
    expect(terminal.show).toHaveBeenCalled();
    expect(terminal.sendText).toHaveBeenCalledWith(
      expect.stringContaining("claude 'Work on issue #187'")
    );
  });
});
