# Changelog

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
