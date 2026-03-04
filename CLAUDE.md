# ResearchGraph
<!-- Projekt-Identität und Langzeit-Vision: siehe VISION.md -->

Bitte SO TOKENSPAREND WIE MÖGLICH SEIN

## Environment
- Editor: Cursor with integrated browser preview (top panel)
- **Chrome Integration**: Claude in Chrome extension active (enabled by default). Use browser tools to navigate, click, inspect, read console, take screenshots etc.
- After building/changing UI: use Chrome tools to verify directly, or say "check the browser preview"

## Hard rules
0. IF THERE ARE ANY UNCERTANTIES OR U NEED MORE INFO: ASK ME
1. Always update `thesis_data.json` after every change — it is the source of truth.
2. Ask before assuming experimental outcomes or relationships not explicitly stated.
3. Never delete nodes — mark them `status: "abandoned"` if dropped.
4. Output file is `overview.html` (single self-contained file, no external dependencies).
5. Kontext files (GenBank, Excel, docx) are in `Kontext/`.
6. Was du selbst machen kannst, machst du selbst — verlange nichts vom User, was du selbst erledigen könntest.
7. **Google bei 2. Fehlversuch**: Wenn ein Problem nach dem zweiten Anlauf nicht gelöst ist → WebSearch machen, bevor du weiter rätst.
8. **Metaplaner-Update**: Bei signifikantem Fortschritt (Feature fertig, Bug gefixt, Status-Änderung) → `F:\CLAUDECODE\Projects\Metaplaner\METAPLAN.md` aktualisieren (Projektstatus, erledigte TODOs abhaken, neue Erkenntnisse).

## Umgang mit großen Dateien (allgemeine Regel)
- NIEMALS `Read` ohne `offset`/`limit` auf Dateien >300 Zeilen anwenden — sprengt den Kontext und kostet unnötig Tokens.
- Vorgehen: erst `Grep` zur Lokalisierung des relevanten Blocks, dann gezieltes `Read` mit `offset`/`limit`.
- NIEMALS `Write` zum Überschreiben einer bestehenden Datei nutzen — immer `Edit` für gezielte Änderungen. `Write` auf overview.html (~1000 Zeilen) löst das 32k-Token-Limit aus.

## Metaplaner-Sync
After significant changes (new features, architecture changes, milestones), update the ResearchGraph section in:
`F:\CLAUDECODE\Projects\Metaplaner\METAPLAN.md`
Keep it current: status, recent changes, open TODOs.

## Dominiks Labor-Struktur (Backup)
- `user_state_backup.json` enthält den aktuellen Stand aus Dominiks Browser (altes Format, pre-unified).
- Bei Migration als neue Defaults: diese Datei als Referenz verwenden, abandoned Test-Goals (j, papya, etc.) weglassen.

## Umgang mit overview.html (große Datei ~1755 Zeilen)
- Bekannte Zeilen-Ranges: CSS: 6–350, HTML: 352–425, ProjectSystem: 435–490, Data+Load/Save/Migration: 492–575, StatusManager+TagManager: 600–770, buildRoadmap: 775–900, Cards+DnD: 900–960, renderDetail: 1100–1340, AddModal: 1380–1465, Export/Import: 1540–1600, GitHubSync: 1600–1710.
- Bei Änderungen immer nur den betroffenen Block lesen, nie die ganze Datei.
