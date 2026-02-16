import { describe, it, expect } from 'vitest';
import { GitOperations } from '../../src/git/GitOperations';

describe('GitOperations', () => {
  describe('sanitizeBranchName', () => {
    it('normalizes title text for branch usage', () => {
      expect(
        GitOperations.sanitizeBranchName('Fix Login: Handle OAuth + SSO!!!')
      ).toBe('fix-login-handle-oauth-sso');
    });

    it('limits branch slug length', () => {
      const title = 'a'.repeat(100);
      expect(GitOperations.sanitizeBranchName(title)).toHaveLength(50);
    });
  });

  describe('generateBranchName', () => {
    it('includes issue number and sanitized title', () => {
      expect(GitOperations.generateBranchName(42, 'Add dark mode toggle')).toBe(
        'issue-42-add-dark-mode-toggle'
      );
    });

    it('falls back to issue-only name when title sanitizes to empty', () => {
      expect(GitOperations.generateBranchName(17, '!!!@@@')).toBe('issue-17');
    });
  });
});
