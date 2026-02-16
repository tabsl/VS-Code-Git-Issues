import { describe, it, expect } from 'vitest';
import { GitRemoteDetector } from '../../src/git/GitRemoteDetector';

describe('GitRemoteDetector', () => {
  describe('parseRemoteUrl', () => {
    it('should detect GitHub HTTPS', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'https://github.com/octocat/hello-world.git'
      );
      expect(result).toEqual({
        platform: 'github',
        owner: 'octocat',
        repo: 'hello-world',
        host: 'github.com',
      });
    });

    it('should detect GitHub HTTPS without .git', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'https://github.com/octocat/hello-world'
      );
      expect(result).toEqual({
        platform: 'github',
        owner: 'octocat',
        repo: 'hello-world',
        host: 'github.com',
      });
    });

    it('should detect GitHub SSH', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'git@github.com:octocat/hello-world.git'
      );
      expect(result).toEqual({
        platform: 'github',
        owner: 'octocat',
        repo: 'hello-world',
        host: 'github.com',
      });
    });

    it('should detect GitLab HTTPS', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'https://gitlab.com/mygroup/myproject.git'
      );
      expect(result).toEqual({
        platform: 'gitlab',
        owner: 'mygroup',
        repo: 'myproject',
        host: 'gitlab.com',
      });
    });

    it('should detect GitLab SSH', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'git@gitlab.com:mygroup/myproject.git'
      );
      expect(result).toEqual({
        platform: 'gitlab',
        owner: 'mygroup',
        repo: 'myproject',
        host: 'gitlab.com',
      });
    });

    it('should detect self-hosted GitLab HTTPS', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'https://gitlab.company.de/team/project.git'
      );
      expect(result).toEqual({
        platform: 'gitlab',
        owner: 'team',
        repo: 'project',
        host: 'gitlab.company.de',
      });
    });

    it('should detect self-hosted GitLab SSH', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'git@gitlab.company.de:team/project.git'
      );
      expect(result).toEqual({
        platform: 'gitlab',
        owner: 'team',
        repo: 'project',
        host: 'gitlab.company.de',
      });
    });

    it('should detect non-standard host as GitLab', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'https://git.internal.io/dev/app.git'
      );
      expect(result).toEqual({
        platform: 'gitlab',
        owner: 'dev',
        repo: 'app',
        host: 'git.internal.io',
      });
    });

    it('should detect GitLab subgroup HTTPS', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'https://gitlab.company.de/group/subgroup/project.git'
      );
      expect(result).toEqual({
        platform: 'gitlab',
        owner: 'group/subgroup',
        repo: 'project',
        host: 'gitlab.company.de',
      });
    });

    it('should detect GitLab subgroup SSH', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'git@gitlab.company.de:group/subgroup/project.git'
      );
      expect(result).toEqual({
        platform: 'gitlab',
        owner: 'group/subgroup',
        repo: 'project',
        host: 'gitlab.company.de',
      });
    });

    it('should detect ssh:// prefix URLs', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'ssh://git@gitlab.company.de/team/project.git'
      );
      expect(result).toEqual({
        platform: 'gitlab',
        owner: 'team',
        repo: 'project',
        host: 'gitlab.company.de',
      });
    });

    it('should handle repo names with dots', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'git@gitlab.proudsourcing.de:likoerfactory/likoerfactory.de-oxid6.git'
      );
      expect(result).toEqual({
        platform: 'gitlab',
        owner: 'likoerfactory',
        repo: 'likoerfactory.de-oxid6',
        host: 'gitlab.proudsourcing.de',
      });
    });

    it('should handle repo names with dots via HTTPS', () => {
      const result = GitRemoteDetector.parseRemoteUrl(
        'https://gitlab.proudsourcing.de/likoerfactory/likoerfactory.de-oxid6.git'
      );
      expect(result).toEqual({
        platform: 'gitlab',
        owner: 'likoerfactory',
        repo: 'likoerfactory.de-oxid6',
        host: 'gitlab.proudsourcing.de',
      });
    });

    it('should return null for invalid URLs', () => {
      expect(GitRemoteDetector.parseRemoteUrl('not-a-url')).toBeNull();
      expect(GitRemoteDetector.parseRemoteUrl('')).toBeNull();
    });
  });
});
