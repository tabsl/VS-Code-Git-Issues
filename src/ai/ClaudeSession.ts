import * as vscode from 'vscode';
import type { Issue } from '../types';

// Commands contributed by the Claude Code extension (anthropic.claude-code).
// Both accept the initial prompt as an argument, so the session starts with the
// issue reference already in place — in VSCode and Cursor alike.
const CLAUDE_EDITOR_COMMAND = 'claude-vscode.editor.open';
const CLAUDE_TERMINAL_COMMAND = 'claude-vscode.terminal.open';

export type SessionLaunch = 'claude-editor' | 'claude-terminal' | 'cli-terminal';

export interface ClaudeCliConfig {
  command: string;
  args: string[];
}

export interface StartSessionOptions {
  cwd?: string;
  terminalName: string;
  cli: ClaudeCliConfig;
}

export function buildIssuePrompt(issue: Issue, url: string, language?: string): string {
  const reference = `Work on issue #${issue.number} "${sanitize(issue.title)}": ${url}`;
  return language ? `${reference}. Respond in ${language}.` : reference;
}

/**
 * Turns a language tag into an English language name Claude can act on
 * ("de-DE" -> "German"). Returns undefined for English and for `off`, so the
 * prompt stays as-is where no instruction is needed.
 */
export function resolvePromptLanguage(
  setting: string,
  ideLanguage: string
): string | undefined {
  const configured = setting.trim().toLowerCase();
  if (configured === 'off') {
    return undefined;
  }

  const tag = configured && configured !== 'auto' ? configured : ideLanguage;
  const base = tag.split(/[-_]/)[0].toLowerCase();
  if (!base || base === 'en') {
    return undefined;
  }

  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(base);
    return name && name !== base ? sanitize(name) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Issue titles are attacker-controlled on public repositories and end up in a
 * terminal command line. Strip control characters (ANSI escapes, newlines) so
 * they can neither drive the terminal emulator nor split the command.
 */
function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function quoteShellArg(value: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * The configured command is used verbatim — it is machine-scoped user input, and
 * quoting it would turn it into a string literal in PowerShell. Everything after
 * it is quoted, because it carries issue data.
 */
export function buildCliCommandLine(
  cli: ClaudeCliConfig,
  prompt: string,
  platform: NodeJS.Platform
): string {
  const args = [...cli.args, prompt].map((arg) => quoteShellArg(arg, platform));
  return `${cli.command} ${args.join(' ')}`;
}

export async function startClaudeSession(
  prompt: string,
  options: StartSessionOptions
): Promise<SessionLaunch> {
  const available = new Set(await vscode.commands.getCommands(true));

  if (available.has(CLAUDE_EDITOR_COMMAND)) {
    try {
      // (sessionId, prompt, viewColumn) — no session id starts a fresh conversation.
      await vscode.commands.executeCommand(
        CLAUDE_EDITOR_COMMAND,
        undefined,
        prompt,
        vscode.ViewColumn.Beside
      );
      return 'claude-editor';
    } catch {
      // Extension present but refused the call — try the next launcher.
    }
  }

  if (available.has(CLAUDE_TERMINAL_COMMAND)) {
    try {
      await vscode.commands.executeCommand(CLAUDE_TERMINAL_COMMAND, prompt, [], 'bottom');
      return 'claude-terminal';
    } catch {
      // Fall through to the plain terminal below.
    }
  }

  const terminal = vscode.window.createTerminal({
    name: options.terminalName,
    cwd: options.cwd,
  });
  terminal.show();
  terminal.sendText(buildCliCommandLine(options.cli, prompt, process.platform));
  return 'cli-terminal';
}
