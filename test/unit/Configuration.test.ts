import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Configuration } from '../../src/config/Configuration';
import * as vscode from 'vscode';

function createMockContext() {
  const secrets = new Map<string, string>();
  return {
    secrets: {
      get: vi.fn(async (key: string) => secrets.get(key)),
      store: vi.fn(async (key: string, value: string) => { secrets.set(key, value); }),
      delete: vi.fn(async (key: string) => { secrets.delete(key); }),
    },
    subscriptions: [],
    _secrets: secrets,
  } as unknown as vscode.ExtensionContext;
}

describe('Configuration', () => {
  let config: Configuration;
  let ctx: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    config = new Configuration(ctx);
  });

  describe('getDefaultState', () => {
    it('returns "open" by default', () => {
      expect(config.getDefaultState()).toBe('open');
    });
  });

  describe('getDefaultSort', () => {
    it('returns "created" by default', () => {
      expect(config.getDefaultSort()).toBe('created');
    });
  });

  describe('getAutoRefreshInterval', () => {
    it('returns 0 by default', () => {
      expect(config.getAutoRefreshInterval()).toBe(0);
    });
  });

  describe('getGitLabUrl', () => {
    it('returns default gitlab.com URL', () => {
      expect(config.getGitLabUrl()).toBe('https://gitlab.com');
    });
  });

  describe('token management', () => {
    it('returns empty string when no GitHub token is set', async () => {
      const token = await config.getGitHubToken();
      expect(token).toBe('');
    });

    it('stores and retrieves GitHub token from secrets', async () => {
      await config.setGitHubToken('ghp_test123');
      const token = await config.getGitHubToken();
      expect(token).toBe('ghp_test123');
    });

    it('returns empty string when no GitLab token is set', async () => {
      const token = await config.getGitLabToken();
      expect(token).toBe('');
    });

    it('stores and retrieves GitLab token from secrets', async () => {
      await config.setGitLabToken('glpat-test456');
      const token = await config.getGitLabToken();
      expect(token).toBe('glpat-test456');
    });
  });

  describe('onDidChange', () => {
    it('returns a disposable', () => {
      const disposable = config.onDidChange(() => {});
      expect(disposable).toBeDefined();
      expect(disposable.dispose).toBeDefined();
    });
  });
});
