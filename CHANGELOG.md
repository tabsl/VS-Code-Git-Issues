# Changelog

## Unreleased

- Security: store GitHub/GitLab tokens in VS Code Secret Storage instead of plain settings
- Security: hardened branch creation against shell injection by using argument-based git execution
- Fix: apply configured `gitIssues.gitlab.url` override for GitLab provider base URL
- Fix: auto-refresh interval now updates dynamically when configuration changes
- Fix: issue filter now also supports selecting sort order
- Fix: improved Webview submit/error handling for comments and issue edits

## 1.0.1 — 2026-02-16

- Fix: token configuration commands no longer fail due to unregistered config keys
- Fix: legacy token migration handles missing config keys gracefully

## 0.1.0 — 2026-02-16

Initial release.

- Browse GitHub and GitLab issues in a dedicated sidebar
- Create, edit, and comment on issues from VS Code
- Filter issues by state (open/closed/all)
- Multi-select dropdowns for labels and assignees
- Auto-assign new issues to current user
- Person icon indicator for self-assigned issues
- Open issues in browser
- Support for self-hosted GitLab instances
