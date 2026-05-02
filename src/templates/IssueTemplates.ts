import * as path from 'path';
import { promises as fs } from 'fs';

export interface IssueTemplate {
  // The display name in the picker. Falls back to the file name without
  // extension if no `name:` field is set in the frontmatter.
  name: string;
  // Optional one-liner shown as description in the picker.
  about?: string;
  // Default title — frontmatter `title:` if present.
  title: string;
  // Body without frontmatter, ready to be inserted into the issue.
  body: string;
  // Frontmatter `labels:` (comma-separated string or YAML list).
  labels: string[];
  // Absolute path of the source file, exposed for diagnostics/tests.
  filePath: string;
}

const GITHUB_TEMPLATE_DIR = path.join('.github', 'ISSUE_TEMPLATE');
const GITLAB_TEMPLATE_DIR = path.join('.gitlab', 'issue_templates');

export async function loadIssueTemplates(
  repoRoot: string,
  platform: 'github' | 'gitlab'
): Promise<IssueTemplate[]> {
  const dir = platform === 'github'
    ? path.join(repoRoot, GITHUB_TEMPLATE_DIR)
    : path.join(repoRoot, GITLAB_TEMPLATE_DIR);

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const templates: IssueTemplate[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md') && !entry.endsWith('.markdown')) {
      continue;
    }
    const fullPath = path.join(dir, entry);
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      templates.push(parseTemplate(content, fullPath));
    } catch {
      // Skip unreadable files instead of failing the whole picker.
    }
  }

  // Stable, predictable ordering by file name.
  templates.sort((a, b) => a.filePath.localeCompare(b.filePath));
  return templates;
}

export function parseTemplate(rawContent: string, filePath: string): IssueTemplate {
  const baseName = path.basename(filePath).replace(/\.(md|markdown)$/i, '');

  const fmMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return {
      name: baseName,
      title: '',
      body: rawContent.trim(),
      labels: [],
      filePath,
    };
  }

  const frontmatter = parseSimpleYaml(fmMatch[1]);
  const body = fmMatch[2].replace(/^\s+/, '');

  return {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : baseName,
    about: typeof frontmatter.about === 'string' ? frontmatter.about : undefined,
    title: typeof frontmatter.title === 'string' ? frontmatter.title : '',
    body,
    labels: parseLabels(frontmatter.labels),
    filePath,
  };
}

// Minimal YAML-ish parser for the small subset GitHub/GitLab templates use:
// flat `key: value` pairs, with values that are bare strings, quoted strings,
// inline `[a, b]` lists, or quoted lists. Anything more exotic is ignored
// (we don't want to pull in a YAML dependency for a feature that touches at
// most a handful of fields).
function parseSimpleYaml(input: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) {
      continue;
    }
    const sep = line.indexOf(':');
    if (sep === -1) {
      continue;
    }
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (!key) {
      continue;
    }
    result[key] = unwrapValue(value);
  }
  return result;
}

function unwrapValue(value: string): unknown {
  if (!value) {
    return '';
  }
  // Inline list: [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => stripQuotes(item.trim()))
      .filter((item) => item.length > 0);
  }
  return stripQuotes(value);
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function parseLabels(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v)).filter((v) => v.length > 0);
  }
  if (typeof raw === 'string') {
    return raw.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
  }
  return [];
}
