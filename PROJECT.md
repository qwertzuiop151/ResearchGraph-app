# ResearchGraph — Projektbeschreibung

Selbstbeschreibung der App: Stack, Architektur, Dateistruktur, Design-Entscheidungen.
Regeln fuer die Arbeit am Projekt stehen in `CLAUDE.md`, offene Punkte in `METAPLAN.md`.

## Vision
Universelles Experiment-Organisations-Framework, customizable fuer alle Fachgebiete.
Leichtgewichtig statt feature-heavy — es wird subtraktiv entwickelt (siehe CLAUDE.md Regel 4).

## Stack
- Single-file `overview.html` (~3600 Zeilen), CSS + HTML + JS in einer Datei, keine Build-Kette
- localStorage als Source of Truth im Browser, mit Multi-Projekt-Support (Keys `rg_{projectId}_*`)
- GitHub-Gist-Sync ueber einen **Personal Access Token** (scope `gist`) im localStorage —
  kein OAuth Device Flow. Modul `GistSync`: local-first, 5s-Debounce, Content-Hash-Guard
  gegen Write-Storms, Backoff bei 403/429
- Deployment: GitHub Pages aus dem Repo `qwertzuiop151/ResearchGraph-app`

## Datenmodell (Unified Node Architecture)
- **NODES** — flacher Baum via `parentId`: `{id,label,parentId,order,icon,desc,custom[]}`.
  Kein Status auf Nodes, nur aggregierte Chips aus den Elementen darunter.
- **ELEMENTS** — die eigentlichen Objekte: `{id,label,nodeId,status,order,tags,desc,custom,log}`
- **TODOS** — `{id,text,notes,status,category,priority,focus,order,subtasks[],dueDate,
  elementId,blockedBy,completedAt,createdAt,modifiedAt}`. `text` = kurzer Header,
  `notes` = Langform. **Subtasks tragen seit 29.07.2026 eigene `notes`.**
  `focus` ist global exklusiv (genau ein Todo) und orthogonal zur Prioritaet.
- **TAGS** / **STATUSES** — frei definierbar, Status mit Icon + Farbe (Icon ist der primaere
  Unterscheider, nicht die Farbe — der Nutzer hat eine Rot-Gruen-Schwaeche)

## Aufbau der Oberflaeche
Zwei Spalten in `#main`: links der Ansichtsbereich (`#goal-list`), rechts das Detail-Panel
(`#panel`), dazwischen eine ziehbare Kante (`#drag-divider`), die den Einklapp-Knopf traegt.

Vier Ansichten (`setView`, persistiert in `rg_view`): **Tree** (Node-Hierarchie),
**Board** (Elemente nach Status), **Lab** (Tasks + Journal), **Ideas**.

Das Detail-Panel ist ansichts-uebergreifend und kennt vier Auswahltypen (`selType`/`selId`,
gerendert von `renderDetail()`): `node`, `element`, `todo`, `subtask`. Auswahl per
`select(type,id)`; Subtasks werden ueber den zusammengesetzten Schluessel `todoId.subId`
adressiert. Alles Langformige lebt im Panel — Listenzeilen bleiben kurze, scannbare Header
und zeigen nur ein `≡`, wenn Notizen vorhanden sind. Umbenennen laeuft ausschliesslich ueber
einen expliziten ✎-Knopf, weil der einfache Klick das Panel oeffnet.

## Clients auf denselben Daten
Das Gist ist die gemeinsame Wahrheit; App, `ResearchGraphMCP/` (Node.js, 40 Tools) und Agenten
sind gleichberechtigte Clients. Schreibzugriffe sind read-modify-write auf **eine**
Gist-Datei — nie parallel schreiben. Aenderungen am MCP wirken erst nach `/mcp`-Reload, und der
MCP existiert in zwei Kopien (lokal + Contabo-Box), die auseinanderdriften koennen.

Der MCP-Ordner liegt seit 31.07.2026 **im** Projektordner (vorher `Projects/ResearchGraphMCP` —
dort gehoeren nur Agenten hin). Er steht in `.gitignore` und darf dort nicht heraus: `index.js`
hat die Gist-ID hartcodiert, dieses Repo ist public, und ein secret Gist ist mit der URL fuer
jeden lesbar. Der registrierte Pfad steht in `~/.claude.json` unter `mcpServers.researchgraph`.

## Dateistruktur
- `overview.html` — die Anwendung
- `index.html` — Redirect fuer GitHub Pages
- `deploy/` — Deployment-Artefakte
- `docs/ResearchGraph_Improvement-Backlog.md` — technischer Backlog
- `user_state_backup.json`, `demo_data_v1_backup.json` — Backups
  (`demo_data.json` ist auf der Platte geloescht, existiert nur noch in der Git-Historie)
