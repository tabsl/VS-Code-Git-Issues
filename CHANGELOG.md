# Changelog

## 1.3.1 — 2026-04-30

Security release — please update.

- Security (high): pin `gitIssues.gitlab.url` to `machine` scope. A malicious repository could otherwise ship a `.vscode/settings.json` overriding the GitLab host; after workspace trust the extension would resolve the override, fall back to a legacy single-token, and leak the PAT in the `PRIVATE-TOKEN` header on the first API call. Workspace overrides for this setting are now intentionally rejected.
- Security (low): replace `startsWith` host check in the GitLab image proxy (`fetchImage` and `MarkdownRenderer.needsProxy`) with a strict protocol+host comparison via URL parsing. Restricts upload-path matching to a single non-slash segment, rejects `..`/`%2F`, and url-encodes hash/filename when building the API URL — closes a path traversal vector that allowed an issue author to redirect the proxied request to other authenticated GitLab API endpoints.
- Security (low): use `crypto.randomBytes` instead of `Math.random` for the webview CSP nonce.

## 1.3.0 — 2026-04-30

- Add: multiple GitLab Personal Access Tokens — one per host (e.g. `gitlab.com` plus self-hosted `gitlab.example.com`). The right token is picked automatically based on the repo's git remote.
- Add: `Git Issues: Configure GitLab Token` now asks for the host first (pre-filled with the active repo's remote host) and stores the token under a host-specific secret key.
- Add: `Git Issues: Manage GitLab Tokens` command lists configured hosts and lets you remove tokens individually.
- Migration: existing single-token setups keep working as a read-only fallback until you save a host-specific token or remove the legacy entry from the manage dialog. No automatic destructive migration.
- Internal: scope-aware cleanup of legacy `gitIssues.gitlab.token` config (Global / Workspace / WorkspaceFolder) with partial-failure reporting; URL-based host validation and Punycode/IPv6 canonicalisation so save and lookup hit the same secret slot.

## 1.2.2 — 2026-04-26

- Fix: smarter default repository selection in monorepos with several nested repos. The active repo is now picked by priority: (1) previously chosen repo persisted via Quick Pick, (2) keep current selection if still valid, (3) repo containing the file in the active editor, (4) avoid worktrees as a default, (5) fallback to first detected.
- Fix: selection no longer bounces as VS Code progressively discovers nested repos — once a valid active repo exists, re-init keeps it.
- Add: when no repo is pinned via Quick Pick, the active editor's repo is automatically selected on editor switches (multi-repo workspaces only). Pinning via `Git Issues: Select Repository` disables auto-follow.

## 1.2.1 — 2026-04-26

- Fix: detect git repos nested inside workspace folders (e.g. monorepos where the workspace root is a parent folder containing several sibling repos). Uses VS Code's built-in Git extension API as the primary source so that all repos VS Code itself sees are picked up; the workspace-folder scan stays as fallback.
- Fix: re-initialize automatically when a nested repo opens or closes (`onDidOpenRepository` / `onDidCloseRepository`) so the issues view appears as soon as VS Code finishes discovering nested git roots.
- UI: more accurate "no remote" message (covers both workspace folder and nested repositories).

## 1.2.0 — 2026-04-26

- Add: multi-root workspace support — scans all workspace folders for git repos with `origin` remote instead of only the first folder
- Add: `Git Issues: Select Repository` command (Quick Pick) to switch between repos when several are detected
- Add: tree view header shows active `owner/repo` when multiple repos are present; selection is persisted per workspace
- Fix: `Create Branch from Issue` now operates on the active repository instead of always `workspaceFolders[0]`

## 1.1.3 — 2026-02-28

- Fix: display images from private GitLab repos by proxying uploads through the GitLab API
- Fix: correct GitLab upload URL resolution (add `/-/` prefix)
- Add: `data:` URI support in Content Security Policy for proxied images

## 1.1.2 — 2026-02-18

- Fix: unassigning all assignees from GitLab issues now works correctly
- Fix: use proper `uploadForReference` API instead of untyped cast for GitLab file uploads
- Fix: issue update has 30s timeout to prevent indefinite hanging
- Fix: file picker errors are now caught and reported to the webview
- Fix: edit mode exits gracefully when issue reload fails after update
- UI: Save button shows "Saving..." feedback while submitting

## 1.1.1 — 2026-02-18

- Fix: file picker dialog now defaults to "All Files" filter so all file types are selectable

## 1.1.0 — 2026-02-18

- Add: file upload support for GitLab issues (drag-and-drop, clipboard paste, file picker)
- Add: FileUploadArea component with upload progress indicator
- Info: GitHub repositories show a hint that file upload is not available via API

## 1.0.2 — 2026-02-18

- Fix: resolve relative image URLs in Markdown rendering (GitLab uploads, project-relative paths)
- Add: Makefile with full release pipeline (`make release BUMP=patch|minor|major`)

## 1.0.1 — 2026-02-16

- Fix: token configuration commands no longer fail due to unregistered config keys
- Fix: legacy token migration handles missing config keys gracefully

## 1.0.0 — 2026-02-16

Initial release.

- Browse GitHub and GitLab issues in a dedicated sidebar
- Create, edit, and comment on issues from VS Code
- Filter issues by state (open/closed/all)
- Multi-select dropdowns for labels and assignees
- Auto-assign new issues to current user
- Person icon indicator for self-assigned issues
- Open issues in browser
- Support for self-hosted GitLab instances
- Security: store GitHub/GitLab tokens in VS Code Secret Storage instead of plain settings
- Security: hardened branch creation against shell injection by using argument-based git execution
- Fix: apply configured `gitIssues.gitlab.url` override for GitLab provider base URL
- Fix: auto-refresh interval now updates dynamically when configuration changes
- Fix: issue filter now also supports selecting sort order
- Fix: improved Webview submit/error handling for comments and issue edits
