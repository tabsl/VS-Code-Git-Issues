// Extracts an issue number from a branch name. Handles the common conventions:
//   123-fix-login                 → 123
//   feature/123-fix-login         → 123
//   feature/issue-123-fix-login   → 123
//   bugfix/issue/123              → 123
//   hotfix/123                    → 123
//   fix-login-#123                → 123
//   user/foo/123-thing            → 123
//
// Rejects:
//   release/1.2.3                 → null   (looks like a version)
//   v2.0.0                        → null
//   main / master / develop       → null   (no digits)
//
// Strategy: scan the branch name for digit groups. Prefer a group that follows
// "issue", "issues", "#" or starts a path segment; otherwise take the first
// digit group as long as the surrounding characters look like an ID, not a
// version number.

const ISSUE_KEYWORD_PATTERN = /\b(?:issues?|gh|gl|ticket)[/\-_]?#?(\d+)/i;
const HASH_PATTERN = /#(\d+)/;
const SEGMENT_LEADING_PATTERN = /(?:^|[/\-_])(\d+)(?=[\-_/]|$)/;
const VERSION_PATTERN = /\b\d+\.\d+(?:\.\d+)?\b/;

export function extractIssueNumberFromBranch(branchName: string): number | null {
  if (!branchName) {
    return null;
  }

  const trimmed = branchName.trim();
  if (!trimmed) {
    return null;
  }

  // Skip release-style branches that contain dotted version numbers — the
  // numeric components there are versions, not issue IDs.
  if (VERSION_PATTERN.test(trimmed)) {
    return null;
  }

  const keywordMatch = trimmed.match(ISSUE_KEYWORD_PATTERN);
  if (keywordMatch) {
    return toIssueNumber(keywordMatch[1]);
  }

  const hashMatch = trimmed.match(HASH_PATTERN);
  if (hashMatch) {
    return toIssueNumber(hashMatch[1]);
  }

  const segmentMatch = trimmed.match(SEGMENT_LEADING_PATTERN);
  if (segmentMatch) {
    return toIssueNumber(segmentMatch[1]);
  }

  return null;
}

function toIssueNumber(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    return null;
  }
  // Cap at something sane — 6 digits is already higher than the largest
  // public GitHub issue numbers people typically work with, and it filters
  // out long timestamps or git short SHAs that happen to be all-numeric.
  if (n > 999999) {
    return null;
  }
  return n;
}
