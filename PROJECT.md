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
  `notes` = Langform. Subtask: `{id,text,notes,status,focus,dueDate,elementId}`.
  `focus` ist PRO PROJEKT exklusiv (hoechstens ein Todo je Projekt, nicht projektuebergreifend) und orthogonal zur Prioritaet.
  Ein Subtask kann seit 11.08.2026 ebenfalls `focus` tragen — aber nur INNERHALB des
  Focus-Todos und dort hoechstens einer. Die Kopplung erzwingen `_normalizeTodos` beim
  Laden und `_clearOrphanSubFocus()` beim Umsetzen des Todo-Focus; der Stern-Knopf
  erscheint gar nicht erst in Subtasks eines nicht-fokussierten Todos.
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

In der Lab-Liste bilden Todo + Subtasks eine Gruppe (`.lab-todo-group`). Die Ebenen sind
ueber die FORM getrennt, nicht ueber Groesse/Farbe: Subtasks haengen an einem gezeichneten
Baum-Konnektor (senkrechte Leitlinie + Abzweig als `::before`/`::after`, ausgerichtet unter
der Todo-Checkbox) und tragen eine RUNDE Checkbox, waehrend Todos eine eckige haben.

Im Header sitzt neben dem GitHub-Knopf ein **Feedback**-Knopf (`openFeedback`), der per
GitHub-REST-API direkt ein Issue in `qwertzuiop151/ResearchGraph-app` anlegt (Label `feedback`).
Angehaengt werden automatisch Projekt, Ansicht, aktuelle Auswahl und User-Agent — im Dialog
sichtbar, damit nichts unbemerkt mitgeschickt wird. Der Token steht **nie** in `overview.html`
(die Datei ist public): Dominik fuegt einmalig einen fine-grained PAT mit `Issues: write` NUR
auf diesem Repo ein, gespeichert unter `rg_fb_token` in localStorage und erst nach einem
erfolgreichen POST persistiert. Faellt der Weg aus (kein Token, kein Netz, Fehler), kopiert
`⧉ Copy` den fertigen Bericht in die Zwischenablage — ein Report geht nie verloren.

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
- `overview.html` — die Anwendung
- `index.html` — Redirect fuer GitHub Pages
- `deploy/` — Deployment-Artefakte
- `docs/ResearchGraph_Improvement-Backlog.md` — technischer Backlog
- `user_state_backup.json`, `demo_data_v1_backup.json` — Backups
  (`demo_data.json` und der Loader dafuer sind am 05.08.2026 entfernt worden — die App hat keine
  Demodaten mehr, ein leeres Projekt bleibt leer. Nur noch in der Git-Historie.)
