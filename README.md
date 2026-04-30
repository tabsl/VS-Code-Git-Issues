# Git Issues for VS Code

Manage GitHub and GitLab issues directly from VS Code. Browse, create, edit, and comment on issues without leaving your editor.

## Features

- **Sidebar Issue List** — View all issues in a dedicated sidebar with open/closed state icons
- **GitHub & GitLab Support** — Works with GitHub.com, GitLab.com, and self-hosted GitLab instances
- **Create Issues** — Create new issues directly from VS Code (auto-assigned to you)
- **Edit Issues** — Update title, description, labels, and assignees via dropdown selectors
- **Comment** — Add comments to issues without switching to the browser
- **Filter & Sort** — Filter by state (open/closed/all) and sort by created, updated, or comments
- **Open in Browser** — Quickly jump to the issue in your browser
- **Assignment Indicator** — Issues assigned to you are marked with a person icon in the sidebar
- **File Upload (GitLab)** — Drag-and-drop, paste images from the clipboard, or pick a file when commenting on or editing GitLab issues
- **Multi-Repo Workspaces** — Detects all git repos in your workspace, including nested ones (monorepos with sibling repos like `app/`, `api/`, `site/`). The active repo follows your editor; pin a specific one via `Git Issues: Select Repository`.
- **Multiple GitLab Instances** — Configure separate Personal Access Tokens per host (e.g. `gitlab.com` and your self-hosted `gitlab.example.com`). The right token is picked automatically based on each repo's git remote.

## Getting Started

1. Install the extension
2. Open a project with a GitHub or GitLab remote
3. Configure your token via the command palette:
   - `Git Issues: Configure GitHub Token` — for GitHub repos
   - `Git Issues: Configure GitLab Token` — for GitLab repos (you'll be asked which host the token belongs to; the active repo's host is pre-filled)
4. Your issues appear in the **Git Issues** sidebar

Tokens configured via commands are stored securely in VS Code Secret Storage. GitLab tokens are stored per host, so you can have separate tokens for `gitlab.com`, `gitlab.example.com` and any other instance.

### Managing Multiple GitLab Tokens

- Run `Git Issues: Configure GitLab Token` once per host. The extension stores tokens under a host-specific key (`gitIssues.gitlab.token:<host>`).
- When opening a repo, the extension matches the token to the host of the git `origin` remote — no need to switch tokens manually.
- Use `Git Issues: Manage GitLab Tokens` to list configured hosts and remove tokens you no longer need.
- Existing single-token setups keep working as a read-only fallback until you save a host-specific token or remove the legacy entry from the manage dialog.

### Token Permissions

- **GitHub**: Create a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope
- **GitLab**: Create a [Personal Access Token](https://gitlab.com/-/user_settings/personal_access_tokens) with `api` scope

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `gitIssues.gitlab.url` | `https://gitlab.com` | GitLab instance URL (for self-hosted) |
| `gitIssues.defaultState` | `open` | Default issue filter: `open`, `closed`, or `all` |
| `gitIssues.defaultSort` | `created` | Sort order: `created`, `updated`, or `comments` |
| `gitIssues.autoRefreshInterval` | `0` | Auto-refresh in seconds (0 = disabled) |

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **Git Issues: Refresh Issues** — Reload the issue list
- **Git Issues: Create Issue** — Create a new issue
- **Git Issues: Filter Issues** — Change the state filter
- **Git Issues: Select Repository** — In multi-repo workspaces, pick which repo's issues to show (also available as a 📁 icon in the view title bar when more than one repo is detected). Once picked, the choice is persisted per workspace and disables auto-follow.
- **Git Issues: Create Branch from Issue** — Create and switch to a new branch named after an issue (right-click an issue in the sidebar)
- **Git Issues: Open in Browser** — Open the selected issue in your default browser (also available as a 🌐 icon next to issues in the sidebar)
- **Git Issues: Configure GitHub Token** — Set your GitHub PAT
- **Git Issues: Configure GitLab Token** — Set a GitLab PAT for a specific host (supports multiple GitLab instances)
- **Git Issues: Manage GitLab Tokens** — List and remove configured GitLab tokens per host

## Multi-Repo Workspaces

If your workspace contains multiple git repositories (e.g. a parent folder with `app/`, `api/`, `site/` siblings, each with their own `origin`), the extension picks the active repo automatically:

1. The repo you previously pinned via `Git Issues: Select Repository` (persisted per workspace)
2. The repo containing the file in the active editor (auto-follows when you switch editors)
3. A non-worktree repo as a sane default

The Quick Pick (`Git Issues: Select Repository`, or the repo icon in the view's title bar) lets you override this at any time.

## License

[MIT](LICENSE)
