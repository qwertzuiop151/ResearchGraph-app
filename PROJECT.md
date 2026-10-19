# ResearchGraph — Projektbeschreibung

Selbstbeschreibung der App: Stack, Architektur, Dateistruktur, Design-Entscheidungen.
Regeln fuer die Arbeit am Projekt stehen in `CLAUDE.md`, offene Punkte in `METAPLAN.md`.

## Vision
Universelles Experiment-Organisations-Framework, customizable fuer alle Fachgebiete.
Leichtgewichtig statt feature-heavy — es wird subtraktiv entwickelt (siehe CLAUDE.md Regel 4).

## Stack
- Single-file `overview.html` (v3 seit 19.10.2026, ~1000 Zeilen), CSS + HTML + JS in einer Datei, keine Build-Kette, Vanilla-JS: ein `render()` baut HTML, `morph()` uebertraegt nur Unterschiede ins DOM
- localStorage ist nur noch lokale Kopie (Keys `rg_projects`, `rg_{projectId}_*` wie bisher); Wahrheit ist der Gist
- GitHub-Gist-Sync ueber einen **Personal Access Token** (scope `gist`) im localStorage
- Deployment: GitHub Pages (legacy, Branch `master`, Root) aus `qwertzuiop151/ResearchGraph-app` — ein Push ist sofort live
- Tests: `tests/rg-offline-tests.js <gist-snapshot.json>` (jsdom@24; simuliertes GitHub mit Revisionen/Historie/ETag und einem gleichzeitig schreibenden "Agenten"; Snapshot nie ins Repo)

## Datenmodell (Unified Node Architecture)
- **NODES** — flacher Baum via `parentId`: `{id,label,parentId,order,icon,desc,custom[]}`.
  Kein Status auf Nodes, nur aggregierte Chips aus den Elementen darunter.
- **ELEMENTS** — die eigentlichen Objekte: `{id,label,nodeId,status,order,tags,desc,custom,log}`
- **TODOS** — `{id,text,notes,status,category,priority,focus,order,subtasks[],dueDate,
  elementId,blockedBy,completedAt,createdAt,modifiedAt}`. `text` = kurzer Header,
  `notes` = Langform. Subtask: `{id,text,notes,status,focus,dueDate,elementId}`.
  `focus` ist PRO PROJEKT exklusiv (hoechstens ein Todo je Projekt, nicht projektuebergreifend) und orthogonal zur Prioritaet.
  Ein Subtask kann seit 11.08.2026 ebenfalls `focus` tragen — aber nur INNERHALB des
  Focus-Todos und dort hoechstens einer. Die Kopplung erzwingen `_normalizeTodos` beim
  Laden und `_clearOrphanSubFocus()` beim Umsetzen des Todo-Focus; der Stern-Knopf
  erscheint gar nicht erst in Subtasks eines nicht-fokussierten Todos.
- **TAGS** / **STATUSES** — frei definierbar, Status mit Icon + Farbe (Icon ist der primaere
  Unterscheider, nicht die Farbe — der Nutzer hat eine Rot-Gruen-Schwaeche)

## Aufbau der Oberflaeche (v3, seit 19.10.2026)
Entworfen nach dem Anforderungs-Interview (`docs/ResearchGraph_Anforderungen-Interview_2026-10.md`): der Box-Agent schreibt fast alles, Dominik liest vor allem und hakt ab — die Oberflaeche ist zuerst eine Uebersicht, nichts wird fuer Optik versteckt.

- **Kopfzeile:** Seiten Tasks / Board / Journal, Layout-Schalter "All projects | One project" (bei One: Projekt-Reiter), Suche, "Done steps hidden/shown" (`rg_hideDoneSubtasks`), "Show frozen", Zoom (`rg3_zoom`), Sync-Status, Menue (Neues Projekt, Archiv, Spaltenbreiten zuruecksetzen, GitHub, Hilfe).
- **All projects:** jedes aktive Projekt eine Spalte; Breiten per Ziehen (`rg3_widths`), Spalten einklappbar zu Streifen (`rg3_collapsed`). **One project:** ein Projekt ueber die volle Breite, Lab | General | Ideas nebeneinander (`rg3_mode`, `rg3_one`).
- **Pro Projekt:** Focus-Task oben (Stern + Rand in Projektfarbe), dann Abschnitte Lab, General (`category` `labor`/`general`), Ideas — Abschnittskoepfe als klebende Baender. Alle offenen Subtasks immer sichtbar, erledigte Tasks nie.
- **Zeilen als festes Raster:** Status-Kaestchen | Titel (+ Statuszeile "in progress" / Blockiert-Grund) | rechts Element-Chip und Prioritaet (1–3 Balken). Status-Symbole sind gezeichnete SVGs (leer / Punkt / Strich / Haken), Klick zykelt open → in progress → done → open. Element an der Task: das eigene, sonst das haeufigste der Schritte ("via its steps"); an Schritten nur, wenn abweichend.
- **Schublade rechts** (Klick auf einen Titel): Status, Prioritaet, Focus, Liste, Element, Faelligkeit, Notes (Markdown, Edit/Save), Schritte. Elemente und Journal sind dort **nur lesbar** — die pflegt der Agent.
- **Projekte:** Farbe bleibt; neuer Zustand **eingefroren** (`frozen`, `frozenAt` am Projekt — ausgeblendet bis "Show frozen"); archiviert = fertig. Ideen und Projekte werden nie geloescht.
- **Entfernt gegenueber v1** (Dominiks Entscheid 19.10.2026): Tree-Ansicht, Undo, Export/Import, Feedback-Knopf, Status-Filter, Tags-/Status-Verwaltung, Idee→Task, Notiz-Zeichen (≡).
- **Farben:** Okabe-Ito-Statusfarben, Grundfarben fuer Projekte, alte Pastell-Defaults werden nur in der Anzeige ersetzt. Bedeutung traegt immer die Form.

### Live-Sync (Variante A, `docs/ResearchGraph_Sync-Recherche_2026-10.md`)
- Die App fragt alle 10 s (nur bei sichtbarem Tab, sofort beim Zurueckkehren) `gists/{id}/commits?per_page=1` mit ETag ab — 304 kostet kein Rate-Limit. Neue Revision → laden und anzeigen, ohne Dialog.
- Eigene Aenderungen werden als Operationen gespeichert (`rg3_pending`, ueberlebt Reloads) und beim Hochladen auf den **frischen** Stand gespielt (Basis: zuletzt uebernommener Stand, wenn GitHub unveraendert ist, sonst neu geladen). Die App laedt nie ihre Gesamtkopie hoch.
- Reparatur: nach dem PATCH wird die Revisionskette geprueft; ist zwischen Lesen und Schreiben eine fremde Revision gelandet, wird sie aus der Gist-Historie geholt und die eigenen Ops erneut darauf angewendet (die Gist-API kennt kein If-Match — gemessen).
- Bremsen (Write-Storm 06.07.2026): hoechstens 60 Anfragen/min, 8 Schreibvorgaenge/min, 150/h; viele Aenderungen hintereinander werden gesammelt; 403/429 → Pause bis Retry-After.

## Clients auf denselben Daten
Das Gist ist die gemeinsame Wahrheit; App, `ResearchGraphMCP/` (Node.js, 44 Tools) und Agenten
sind gleichberechtigte Clients. Schreibzugriffe sind read-modify-write auf **eine**
Gist-Datei — nie parallel schreiben. Aenderungen am MCP wirken erst nach `/mcp`-Reload, und der
MCP existiert in zwei Kopien (lokal + Contabo-Box), die auseinanderdriften koennen.

### Batch-Schreiben statt Schreibketten (v45, 20.08.2026)
Weil jeder Write ein voller read-modify-write auf dieselbe Datei ist, war "sequenziell" bisher das
einzig korrekte Muster — parallele Writes nehmen je einen eigenen Snapshot, der letzte gewinnt
(Datenverlust gemessen 04.07. und 04.08.2026). `rg_batch` loest beides auf einmal: eine Liste
heterogener Ops, ein Snapshot, ein Write. Die Ops sehen einander (ein `ref:"x"` auf einer
erzeugenden Op macht das neue Objekt spaeter als `"$x"` adressierbar), `atomic:true` (Default)
verwirft bei jedem Fehler alles, und jede Op bekommt eine eigene Zeile im Ergebnis.

Damit Einzel- und Batch-Pfad nicht auseinanderdriften, liegt **jede** Mutation in einer reinen
Funktion ueber dem Dokument (`applyElementOps`, `applyTodoOps`, `applySubtaskOps`, `createTodoOp`,
`createSubtaskOp`, `createElementOp`, `createIdeaOp`, `applyIdeaOps`, `writeJournalOp`,
`editJournalSectionOp`, `setTagOp`, `setStatusOp`) — das Einzel-Tool ist nur noch der
Lade/Speicher-Mantel darum. Neue Mutationen gehoeren in diese Funktionen, nie in einen Handler.
`rg_batch` kennt **keine Deletes**: Loeschungen sind aus der Gist-Historie praktisch nicht
zurueckzuholen, und ein Batch macht das versehentliche Ausloesen billig.

Der MCP-Ordner liegt seit 31.07.2026 **im** Projektordner (vorher `Projects/ResearchGraphMCP` —
dort gehoeren nur Agenten hin). Er steht in `.gitignore` und darf dort nicht heraus: `index.js`
hat die Gist-ID hartcodiert, dieses Repo ist public, und ein secret Gist ist mit der URL fuer
jeden lesbar. Der registrierte Pfad steht in `~/.claude.json` unter `mcpServers.researchgraph`.

### Lesen laeuft ueber `raw_url`, nicht ueber `.content` (23.08.2026)
Die Gist-API schneidet `files[..].content` bei ~1 MB ab und setzt `truncated:true` — die
RG-Nutzdaten haben diese Grenze im August 2026 ueberschritten (947 KB), womit jedes `JSON.parse`
auf dem API-Feld mitten im String abbrach. Beide Clients holen den Inhalt deshalb ueber
`files[..].raw_url` (revisionsfest, CORS `*`, fuer ein secret Gist ohne Token lesbar), sobald
`truncated` gesetzt ist; die App tut das in `_ghGistContent()`. Ein unvollstaendiger Body wirft
dort, statt als gueltiger Zustand durchzugehen.

Die zweite Haelfte der Lehre ist wichtiger als die erste: **wo der Remote-Stand nicht gelesen
werden kann, darf nicht geschrieben werden.** Die Konfliktpruefung in `ghSave` verschluckte
ihre eigenen Fehler (`catch(e){}`) und fiel danach in den PATCH — ein unlesbares Gist haette
den Gesamtbestand still durch die Kopie des jeweiligen Geraets ersetzt. Sie bricht den Save
jetzt ab und meldet ihn sichtbar; die Daten liegen ohnehin lokal, der naechste Edit schiebt
den Flush erneut an.

### Ansicht ist keine Ablage (23.08.2026)
Was gerade auf dem Bildschirm liegt, gehoert dem Geraet, nicht dem Datenbestand. `activeProject`
stand frueher mit im Sync-Payload, deshalb aenderte schon ein **Projektwechsel** den Hash, PATCHte
den ganzen Store und erzeugte eine Gist-Revision ohne jede Datenaenderung — bei einer Box, die
Revisionen als "der Laborbestand hat sich geaendert" liest, ist das ein falsches Signal. Die
Regel dahinter: **eine Revision der Datendatei muss bedeuten, dass sich Daten geaendert haben.**

Ansichtszustand lebt daher in `localStorage` (`rg_active_project`) — Dominik nutzt die App auf
genau einem Geraet und will ausdruecklich keine Geraete-Synchronitaet, also braucht es dafuer
keine Server-Seite. `ghLoad` liest die lokale Wahl zuerst und greift auf ein `activeProject` im
Store nur noch zurueck, wenn die lokale Wahl fehlt oder auf ein geloeschtes Projekt zeigt (Alt-
bestand). Eine Migration entfaellt: der naechste echte Save schreibt das Feld einfach nicht mehr.

**Folge fuer den MCP:** `activate` an `rg_update_project` ist entfallen. Es schrieb genau dieses
Feld, und ein Agent kann den Browser-Speicher nicht setzen — die Faehigkeit ist damit nicht
verlagert, sondern weg. Das ist beabsichtigt: welches Projekt Dominik ansieht, entscheidet er.

### Die tatsaechlichen Groessen-Decken (gemessen 23.08.2026, Wegwerf-Gist)
Die 900-KiB-Marke ist **keine** Groessengrenze des Speichers, sondern nur die des API-Feldes
`content` — sie kappt bei exakt 921.600 Bytes und bleibt dort konstant, egal wie gross die
Datei ist. Alles darueber ist unbeeintraechtigt:

| geprueft | Ergebnis |
|---|---|
| PATCH 1 / 2 / 4 / 8 / 16 / 33,5 MB | **alle ok** (33,5 MB in 23 s) |
| PATCH 67 MB | scheitert, HTTP 422 |
| Lesen per `raw_url` bis 33,5 MB | HTTP 200, vollstaendig |
| `JSON.stringify`+Hash bei 6,2 MB (6,5-fache Nutzlast) | 25 ms — irrelevant |

Bei ~0,95 MB Nutzdaten steht damit rund das **35-fache** an Kopffreiheit zur Verfuegung.
Groesse ist seit dem `raw_url`-Fix keine Begrenzung mehr und braucht keine eigene Loesung —
weder Sharding noch ein eigener Server. Was mit der Groesse waechst, ist allein die
**Uebertragungszeit pro Save**, weil jeder Save das ganze Dokument PATCHt (~3 s bei 1 MB).
Erst wenn das spuerbar stoert, lohnt eine Aufteilung in eine Gist-Datei pro Projekt (ein
PATCH ersetzt nur die benannten Dateien) — das ist eine Kostenfrage, keine Grenzfrage.

## Dateistruktur
- `overview.html` — die Anwendung (v3 seit 19.10.2026; v1 nur noch in der Git-Historie, letzter Stand vor dem Tausch: Commit `d945caf` + Promote-Entfernung)
- `tests/rg-offline-tests.js` — Offline-Tests (jsdom) gegen einen Gist-Snapshot, GitHub simuliert
- `index.html` — Redirect fuer GitHub Pages
- `deploy/` — Deployment-Artefakte
- `docs/ResearchGraph_Improvement-Backlog.md` — technischer Backlog
- `user_state_backup.json`, `demo_data_v1_backup.json` — Backups
  (`demo_data.json` und der Loader dafuer sind am 05.08.2026 entfernt worden — die App hat keine
  Demodaten mehr, ein leeres Projekt bleibt leer. Nur noch in der Git-Historie.)
