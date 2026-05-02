# Feature-Ideen

Stand: 2026-05-02 — basierend auf v1.3.2.

## Quick Wins (kleiner Aufwand, viel Nutzen)

- **Volltext-Suche im Sidebar** — Such-Input über der Issue-Liste (lokales Filtern + Server-Side `search`-Param bei GitHub/GitLab). Aktuell gibt es nur State/Sort-Filter.
- **„Meine Issues" Quick-Filter** — Toggle für `assignee:me` / `author:me` / `mention:me`. Heute zeigt nur das 👤-Icon Self-Assignment, filtern lässt sich darauf nicht.
- **Label- & Milestone-Filter** — Multi-Select im Sidebar (die API-Anbindung existiert bereits durchs Editing).
- **Issue-Templates** — GitHub `.github/ISSUE_TEMPLATE/*.md` und GitLab `.gitlab/issue_templates/*.md` einlesen und beim „Create Issue" als Auswahl anbieten.
- **Slash-Commands im Comment-Editor** — `/assign @user`, `/label ~bug`, `/close`, `/milestone` (GitLab nativ; für GitHub als Übersetzung in API-Calls).
- **Markdown-Vorschau-Tab beim Edit/Comment** — Edit/Preview-Toggle wie auf GitHub.

## Workflow-Integration

- **Branch ↔ Issue Auto-Link** — Beim Wechsel auf einen Branch automatisch das verknüpfte Issue im Sidebar fokussieren (via `123-`-Prefix oder `feature/issue-123-…`). Komplement zu `Create Branch from Issue`.
- **Commit-Message Helper** — „Reference Issue in Commit"-Command, der `#123` / `Closes #123` / `Closes !123` (GitLab) in die SCM-Input-Box einfügt.
- **Status-Bar Item** — „📋 3 open · 1 assigned to you" mit Click → Sidebar fokussieren.
- **Notifications/Mentions Polling** — Optional: ungelesene Mentions/Comments seit letztem Öffnen anzeigen (Badge auf Activity-Bar-Icon).
- **TODO-Scanner → Issue** — `// TODO:` / `// FIXME:` im Editor per Quick-Action in ein Issue umwandeln (mit Datei-Permalink).

## Issue-Editor Verbesserungen

- **Tasklist-Checkboxen interaktiv** — `- [ ]` im Body anklickbar machen (wie GitHub Web). Update via API.
- **Reactions** — 👍 👎 🎉 etc. auf Issues und Comments (beide Provider unterstützen das).
- **Comment editieren / löschen** — Aktuell nur „Add Comment".
- **Linked MRs / PRs anzeigen** — Liste verknüpfter Pull/Merge Requests im Issue-View.
- **Drag-Resize / Split-View** — Issue rechts neben dem Code öffnen statt full-width.

## Unter der Haube

- **Offline-Cache** — Issues lokal cachen (z. B. `globalState`), bei Start sofort anzeigen, dann Hintergrund-Refresh. Reduziert Token-Calls und macht den Start schnell.
- **Rate-Limit-Anzeige** — GitHub `X-RateLimit-Remaining` im Status-Bar / als Warnung.
- **Bitbucket-Support** — Naheliegende dritte Plattform.
- **Gitea / Forgejo** — Self-hosted Open-Source-Forks mit wachsender Nutzerbasis.

## Top-3 Empfehlung

1. **Suche + Label/Assignee-Filter** im Sidebar — häufigste vermisste Funktion in vergleichbaren Extensions; Datenstrukturen sind bereits vorhanden.
2. **Branch ↔ Issue Auto-Link** + **Status-Bar mit „open/assigned"-Counter** — verbindet Editor-Kontext mit Issue-Kontext und nutzt vorhandenen Code.
3. **Issue-Templates** beim Create-Flow — niedrige Implementierungs-Hürde, sichtbarer UX-Gewinn für Teams mit Konventionen.
