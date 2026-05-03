import { describe, it, expect } from 'vitest';
import { extractIssueNumberFromBranch } from '../../src/git/BranchIssueLinker';

describe('extractIssueNumberFromBranch', () => {
  it.each([
    ['123-fix-login', 123],
    ['feature/123-fix-login', 123],
    ['feature/issue-123-fix-login', 123],
    ['feature/issue/123', 123],
    ['bugfix/issue-42', 42],
    ['hotfix/789', 789],
    ['fix-login-#456', 456],
    ['user/foo/321-thing', 321],
    ['gh-1234-something', 1234],
    ['ticket/9001-something', 9001],
  ])('parses issue number from %s', (branch, expected) => {
    expect(extractIssueNumberFromBranch(branch)).toBe(expected);
  });

  it.each([
    'main',
    'master',
    'develop',
    'release/1.2.3',
    'v2.0.0',
    'feature/no-digits-here',
    '',
    '   ',
  ])('returns null for %s', (branch) => {
    expect(extractIssueNumberFromBranch(branch)).toBeNull();
  });

  it('rejects extremely large numbers (likely SHAs or timestamps)', () => {
    expect(extractIssueNumberFromBranch('1700000000-thing')).toBeNull();
  });

  it('keyword form wins over a leading number', () => {
    // Realistic case: someone names a branch "issue-42-fix-7-bugs"; the
    // intended issue is 42, not 7.
    expect(extractIssueNumberFromBranch('issue-42-fix-7-bugs')).toBe(42);
  });
});
