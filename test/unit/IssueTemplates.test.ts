import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { loadIssueTemplates, parseTemplate } from '../../src/templates/IssueTemplates';

describe('parseTemplate', () => {
  it('returns content as body when no frontmatter is present', () => {
    const t = parseTemplate('Just a body.\n\nWith two lines.', '/tmp/bug.md');
    expect(t.name).toBe('bug');
    expect(t.title).toBe('');
    expect(t.body).toBe('Just a body.\n\nWith two lines.');
    expect(t.labels).toEqual([]);
  });

  it('parses simple frontmatter fields', () => {
    const raw = [
      '---',
      'name: Bug report',
      'about: Report a reproducible defect',
      'title: "[Bug] "',
      'labels: bug, needs-triage',
      '---',
      '',
      '## Steps',
      '1. Do X',
    ].join('\n');
    const t = parseTemplate(raw, '/tmp/bug.md');
    expect(t.name).toBe('Bug report');
    expect(t.about).toBe('Report a reproducible defect');
    expect(t.title).toBe('[Bug] ');
    expect(t.labels).toEqual(['bug', 'needs-triage']);
    expect(t.body).toBe('## Steps\n1. Do X');
  });

  it('accepts inline YAML lists for labels', () => {
    const raw = [
      '---',
      'name: Feature',
      'labels: ["enhancement", \'frontend\']',
      '---',
      'Body',
    ].join('\n');
    const t = parseTemplate(raw, '/tmp/feature.md');
    expect(t.labels).toEqual(['enhancement', 'frontend']);
  });

  it('falls back to filename when name field is missing', () => {
    const raw = '---\nabout: foo\n---\nBody';
    const t = parseTemplate(raw, '/tmp/refactor-request.md');
    expect(t.name).toBe('refactor-request');
  });

  it('handles CRLF line endings', () => {
    const raw = '---\r\nname: Win\r\n---\r\nBody';
    const t = parseTemplate(raw, '/tmp/win.md');
    expect(t.name).toBe('Win');
    expect(t.body).toBe('Body');
  });
});

describe('loadIssueTemplates', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'git-issues-templates-'));
    const ghDir = path.join(root, '.github', 'ISSUE_TEMPLATE');
    const glDir = path.join(root, '.gitlab', 'issue_templates');
    await mkdir(ghDir, { recursive: true });
    await mkdir(glDir, { recursive: true });
    await writeFile(path.join(ghDir, 'bug.md'), '---\nname: Bug\n---\nBug body');
    await writeFile(path.join(ghDir, 'feature.md'), '---\nname: Feature\n---\nFeature body');
    await writeFile(path.join(ghDir, 'config.yml'), 'blank_issues_enabled: false');
    await writeFile(path.join(glDir, 'incident.md'), '---\nname: Incident\n---\nIncident body');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns empty array when template directory is missing', async () => {
    const result = await loadIssueTemplates('/nonexistent/path-xyz', 'github');
    expect(result).toEqual([]);
  });

  it('reads markdown templates from the GitHub directory and skips non-markdown files', async () => {
    const result = await loadIssueTemplates(root, 'github');
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.name).sort()).toEqual(['Bug', 'Feature']);
  });

  it('reads markdown templates from the GitLab directory', async () => {
    const result = await loadIssueTemplates(root, 'gitlab');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Incident');
  });
});
