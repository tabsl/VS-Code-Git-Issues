# Changelog

## 2.1.0 — 2026-05-04

- Add: tokenless GitHub sign-in via VS Code's built-in GitHub account. `Git Issues: Sign in to GitHub / Configure Token` (formerly `Configure GitHub Token`) now opens a picker — choose **Sign in with GitHub** to authenticate via VS Code (requests `repo` and `read:org` scopes) or **Enter Personal Access Token** for GitHub Enterprise / custom scopes. Existing PATs keep working unchanged and take precedence. The view reacts to sign-in/out from the Accounts menu without a reload.
- Fix: clear any previously stored GitHub PAT when switching to **Sign in with GitHub**, so the new VS Code session is actually used instead of falling back to the stale PAT (which surfaced as "Bad credentials").
- UI: assignee marker in the sidebar now reads `@you` instead of a generic person icon — clearer at a glance and consistent across themes.
- Docs: add product screenshot to the README.

## 2.0.0 — 2026-05-03

Major release: deeper issue interactions (task lists, reactions, comment editing, linked PR/MR panel) and a split-view layout. No breaking config changes; existing 1.4.x settings keep working.

- Add: offline cache for the issue list. The sidebar paints the last known issues instantly on startup or repo switch and refreshes them in the background, so VS Code reloads no longer wait on a GitHub/GitLab round-trip. Cached issues also remain visible when a refresh fails (e.g. offline or rate-limited) instead of clearing the view to an error message. Toggle via `gitIssues.offlineCache.enabled` (default on); the cache lives in `globalState`, is scoped per repository and active filter, and is capped at 20 most-recent entries.

- Security (defense-in-depth): allowlist `content` in `toggleIssueReaction` / `toggleCommentReaction` handlers and the fields accepted by `handleUpdateIssue` so a compromised webview can never widen the surface beyond what the UI legitimately sends. GitHub/GitLab APIs already enforced this server-side; this adds a second client-side gate.
- Security (defense-in-depth): `openExternal` now requires the URL host to match the configured provider base URL (github.com / gitlab.* / self-hosted GitLab) on top of the existing `http(s)` scheme check.
- Internal: replace post-sanitize regex on rendered markdown with a DOM-based `disabled`-strip for interactive task-list checkboxes — keeps DOMPurify the single source of truth for rendered HTML.

- Add: interactive task-list checkboxes in the issue body. Clicking `- [ ]` flips the source marker and persists via `updateIssue`; checkboxes inside fenced code blocks stay read-only.
- Add: emoji reactions on issues and comments (👍 👎 😄 🎉 😕 ❤️ 🚀 👀). Click an existing reaction chip to toggle yours, or use the "😊+" picker for new ones. Works for GitHub (native) and GitLab (with emoji-slug translation between `+1` ↔ `thumbsup` etc.).
- Add: edit and delete your own comments. Each comment authored by the current user gets `Edit` / `Delete` actions in the header. Edit reuses the same Markdown editor (with attach / slash-command / preview tabs); delete asks for confirmation. Task-list checkboxes inside comments you own are now also clickable.
- Add: linked Pull Requests / Merge Requests panel between the issue body and the comment thread. GitHub uses `is:pr in:title,body #N` search; GitLab uses the dedicated `allRelatedMergeRequests` endpoint. Each entry shows status (Open / Draft / Merged / Closed), reference (`#N` / `!N`), title and author, and opens externally on click.
- Add: split-view support — `Git Issues: Open Issue to the Side` (also as inline action in the sidebar) opens the issue panel in a new editor column next to your code. Set `gitIssues.issuePanel.location` to `beside` to make this the default for every open. Click-resize works as before via VS Code's native editor splits.

## 1.4.0 — 2026-05-03

- Add: full-text search in the sidebar — `Git Issues: Search Issues` (or the magnifier icon in the view title) filters loaded issues by title, `#number`, author login, label, or assignee. Active query is shown in the view description; clear via `Git Issues: Clear Search` or the title-bar icon.
- Add: "My Issues" quick filter — click the person icon in the view title to limit the list to issues assigned to you (icon switches to filled when active). The full filter dialog (`Git Issues: Filter Issues`) gains an "Everyone / Assigned to me / Created by me" step.
- Add: label and milestone filters — `Git Issues: Filter by Labels` opens a multi-select Quick Pick of all repository labels, `Git Issues: Filter by Milestone` filters by a single milestone (with a "Clear" entry). Both are server-side filters and refresh the list. Works for GitHub and GitLab.
- Add: issue templates — `Git Issues: Create Issue` reads `.github/ISSUE_TEMPLATE/*.md` (GitHub) or `.gitlab/issue_templates/*.md` (GitLab) from the active repo and lets you pick one. Frontmatter `title:`, `labels:` and `body` are pre-filled. Repos without templates keep the previous blank flow.
- Add: slash-command insert helper in the comment editor and issue edit form. A "/ Slash command" toolbar button opens a Quick Pick of common GitLab quick actions (`/close`, `/assign`, `/label`, `/milestone`, `/due`, `/spend`, …). Selected snippet is inserted at the cursor. GitLab parses these on submit; for GitHub the picker shows a heads-up that the actions are not parsed natively.
- Add: Write / Preview tab in the comment editor and issue edit form. Switch to "Preview" to see the rendered Markdown (with the same image proxy and relative-URL resolution the issue body uses). Disabled when the editor is empty.
- Add: branch ↔ issue auto-link. Switching to a branch whose name encodes an issue number (`123-fix-login`, `feature/issue-123-…`, `gh-1234-…`, `fix-#42`, …) shows a notification with an "Open Issue" action. Toggle via the new `gitIssues.autoLinkBranchToIssue` setting (default on); the prompt also offers a one-click "Don't ask again".
- Add: `Git Issues: Reference in Commit` command. Picks an open issue (or accepts a manual number, with the current branch's issue pre-suggested), then a reference style (`#42`, `Closes #42`, `Fixes #42`, `Refs #42`, plus `!42` / `Closes !42` for GitLab merge requests) and inserts it into the active repo's SCM input box.
- Add: status-bar counter showing `📋 N open` (and `· 👤 N` when issues are assigned to you in the active repo). Click the item to focus the Git Issues sidebar. Hidden when the provider has no issues to show or when `gitIssues.statusBar.enabled` is set to false.
- Add: unread badge on the Git Issues view container. Tracks the most recently seen `updatedAt` timestamp per repo (in `globalState`) and shows the number of issues you author or are assigned to that have changed since you last opened the sidebar. Auto-clears when the view becomes visible; manual reset via `Git Issues: Mark Issues as Read`. Toggle via `gitIssues.notifications.enabled` (default on).

## 1.3.3 — 2026-05-02

- UI: redesigned issue detail header — single title row with `#id` first, then title, then state badge; action buttons aligned on the right. Meta line shows repo, author, date and comment count; labels and assignees moved into an inline chips row. Sidebar removed for full body width.
- UI: unified action buttons — `Edit` as primary (theme colour), `Branch`/`Browser` as ghost outlines, `Close` filled red, `Reopen` filled green.
- UI: comment submit button restyled as filled green button for clearer call-to-action.
- UI: label chips use a neutral pill background with the label colour shown as a small leading dot — less visually loud and plays nicer with VS Code themes. Assignee chips share the same neutral pill style.
- UI: images in issue body and comments are now capped at 360px height. Click opens the full-size lightbox.

## 1.3.2 — 2026-05-02

- Add: click an image in an issue body or comment to open it full-size in a lightbox overlay. Close with the `×` button, by clicking the backdrop, or with `Esc`.

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
