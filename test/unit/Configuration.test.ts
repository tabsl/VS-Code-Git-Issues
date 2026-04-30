import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Configuration } from '../../src/config/Configuration';
import * as vscode from 'vscode';
import { __resetConfigStores } from './__mocks__/vscode';

function createMockContext() {
  const secrets = new Map<string, string>();
  const state = new Map<string, unknown>();
  return {
    secrets: {
      get: vi.fn(async (key: string) => secrets.get(key)),
      store: vi.fn(async (key: string, value: string) => { secrets.set(key, value); }),
      delete: vi.fn(async (key: string) => { secrets.delete(key); }),
    },
    globalState: {
      get: vi.fn(<T>(key: string, defaultValue: T): T => (state.has(key) ? (state.get(key) as T) : defaultValue)),
      update: vi.fn(async (key: string, value: unknown) => {
        if (value === undefined) { state.delete(key); } else { state.set(key, value); }
      }),
    },
    subscriptions: [],
    _secrets: secrets,
    _state: state,
  } as unknown as vscode.ExtensionContext;
}

describe('Configuration', () => {
  let config: Configuration;
  let ctx: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetConfigStores();
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

    it('stores tokens per host independently', async () => {
      await config.setGitLabToken('glpat-com', 'gitlab.com');
      await config.setGitLabToken('glpat-self', 'gitlab.example.com');

      expect(await config.getGitLabToken('gitlab.com')).toBe('glpat-com');
      expect(await config.getGitLabToken('gitlab.example.com')).toBe('glpat-self');
    });

    it('lists configured GitLab hosts', async () => {
      await config.setGitLabToken('a', 'gitlab.com');
      await config.setGitLabToken('b', 'gitlab.example.com');

      const hosts = await config.listGitLabTokenHosts();
      expect(hosts).toEqual(['gitlab.com', 'gitlab.example.com']);
    });

    it('removes a GitLab token by host', async () => {
      await config.setGitLabToken('a', 'gitlab.com');
      await config.setGitLabToken('b', 'gitlab.example.com');

      await config.removeGitLabToken('gitlab.example.com');

      expect(await config.listGitLabTokenHosts()).toEqual(['gitlab.com']);
      expect(await config.getGitLabToken('gitlab.example.com')).toBe('');
    });

    it('returns the legacy single-token as fallback for any host without destructive migration', async () => {
      await ctx.secrets.store('gitIssues.gitlab.token', 'glpat-legacy');

      // Same legacy token is returned regardless of which host is queried,
      // until the user explicitly stores a host-specific token.
      expect(await config.getGitLabToken('gitlab.com')).toBe('glpat-legacy');
      expect(await config.getGitLabToken('gitlab.example.com')).toBe('glpat-legacy');

      // Crucially the legacy entry is preserved — it is NOT silently moved
      // into a host-keyed slot the user never picked.
      expect(await ctx.secrets.get('gitIssues.gitlab.token')).toBe('glpat-legacy');
      expect(await config.listGitLabTokenHosts()).toEqual([]);
      expect(await config.hasLegacyGitLabToken()).toBe(true);
    });

    it('host-specific token wins over legacy fallback', async () => {
      await ctx.secrets.store('gitIssues.gitlab.token', 'glpat-legacy');
      await config.setGitLabToken('glpat-com', 'gitlab.com');

      expect(await config.getGitLabToken('gitlab.com')).toBe('glpat-com');
      // Other hosts still see the legacy fallback
      expect(await config.getGitLabToken('gitlab.example.com')).toBe('glpat-legacy');
    });

    it('removes the legacy token on demand', async () => {
      await ctx.secrets.store('gitIssues.gitlab.token', 'glpat-legacy');

      expect(await config.hasLegacyGitLabToken()).toBe(true);
      const result = await config.removeLegacyGitLabToken();
      expect(result.configCleanupFailed).toBe(false);
      expect(await config.hasLegacyGitLabToken()).toBe(false);
      expect(await config.getGitLabToken('gitlab.com')).toBe('');
    });

    it('reports configCleanupFailed when removing the legacy config key throws', async () => {
      // Simulate VS Code rejecting unregistered key updates (real behaviour
      // for keys that are no longer declared in package.json) by replacing
      // workspace.getConfiguration() with a stub whose update() always throws.
      const original = vscode.workspace.getConfiguration;
      (vscode.workspace.getConfiguration as any) = vi.fn(() => ({
        get: vi.fn(<T>(key: string, defaultValue: T): T =>
          key === 'gitlab.token' ? ('glpat-from-config' as any) : defaultValue
        ),
        update: vi.fn(async () => {
          throw new Error('unregistered configuration key');
        }),
        inspect: vi.fn((key: string) => ({
          key: `gitIssues.${key}`,
          globalValue: key === 'gitlab.token' ? 'glpat-from-config' : undefined,
          workspaceValue: undefined,
          workspaceFolderValue: undefined,
        })),
      }));

      try {
        const result = await config.removeLegacyGitLabToken();

        expect(result.configCleanupFailed).toBe(true);
        // Tombstone still takes effect even if cleanup failed
        expect(await config.hasLegacyGitLabToken()).toBe(false);
      } finally {
        (vscode.workspace.getConfiguration as any) = original;
      }
    });

    it('detects surviving values on workspace/folder scope as configCleanupFailed', async () => {
      // The config store mock supports per-scope writes; here we plant a value
      // on Workspace scope but configure the stub to "succeed" on update yet
      // leave the workspace-scope value behind.
      const original = vscode.workspace.getConfiguration;
      (vscode.workspace.getConfiguration as any) = vi.fn(() => ({
        get: vi.fn(),
        update: vi.fn(async () => undefined), // pretends to succeed
        inspect: vi.fn(() => ({
          key: 'gitIssues.gitlab.token',
          globalValue: undefined,
          workspaceValue: 'glpat-leftover',
          workspaceFolderValue: undefined,
        })),
      }));

      try {
        const result = await config.removeLegacyGitLabToken();
        expect(result.configCleanupFailed).toBe(true);
      } finally {
        (vscode.workspace.getConfiguration as any) = original;
      }
    });

    it('legacy tombstone disables config-based legacy tokens that secrets.delete cannot reach', async () => {
      // Simulate the case where the legacy token lived in workspace config
      // (not SecretStorage) — common for users upgrading from very old versions.
      // Since the legacy config key isn't registered any more, set() will
      // typically throw; the tombstone must still take effect.
      const cfg = vscode.workspace.getConfiguration('gitIssues');
      await cfg.update('gitlab.token', 'glpat-from-config');

      expect(await config.hasLegacyGitLabToken()).toBe(true);
      expect(await config.getGitLabToken('gitlab.com')).toBe('glpat-from-config');

      await config.removeLegacyGitLabToken();

      expect(await config.hasLegacyGitLabToken()).toBe(false);
      expect(await config.getGitLabToken('gitlab.com')).toBe('');
    });

    it('normalises host casing and trailing slashes', async () => {
      await config.setGitLabToken('glpat-norm', 'GitLab.Example.com/');

      expect(await config.getGitLabToken('gitlab.example.com')).toBe('glpat-norm');
      expect(await config.listGitLabTokenHosts()).toEqual(['gitlab.example.com']);
    });

    it('canonicalises IDN hosts to Punycode so save/lookup match', async () => {
      // User types Unicode, lookup uses Punycode (because URL parsing canonicalises).
      // Both must point to the same secret slot.
      await config.setGitLabToken('glpat-idn', 'münich.example');

      expect(await config.getGitLabToken('xn--mnich-kva.example')).toBe('glpat-idn');
      expect(await config.getGitLabToken('münich.example')).toBe('glpat-idn');
      expect(await config.listGitLabTokenHosts()).toEqual(['xn--mnich-kva.example']);
    });

    it('preserves bracketed IPv6 hosts with port', async () => {
      await config.setGitLabToken('glpat-v6', '[2001:DB8::1]:8443');

      expect(await config.getGitLabToken('[2001:db8::1]:8443')).toBe('glpat-v6');
      expect(await config.listGitLabTokenHosts()).toEqual(['[2001:db8::1]:8443']);
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
