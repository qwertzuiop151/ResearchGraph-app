# ResearchGraph — Projektbeschreibung

Selbstbeschreibung der App: Stack, Architektur, Dateistruktur, Design-Entscheidungen.
Regeln fuer die Arbeit am Projekt stehen in `CLAUDE.md`, offene Punkte in `METAPLAN.md`.

## Vision
Universelles Experiment-Organisations-Framework, customizable fuer alle Fachgebiete.
Leichtgewichtig statt feature-heavy — es wird subtraktiv entwickelt (siehe CLAUDE.md Regel 5).

## Stack
- Single-file `overview.html` (v3 seit 19.10.2026, ~1670 Zeilen Stand 11.11.2026), CSS + HTML + JS in einer Datei, keine Build-Kette, Vanilla-JS: ein `render()` baut HTML, `morph()` uebertraegt nur Unterschiede ins DOM
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
  Focus-Todos und dort hoechstens einer. Die Kopplung erzwingt `setFocus()` beim Umsetzen
  des Todo-Focus; in der Schublade eines Schritts ausserhalb des Focus-Todos steht statt
  des Stern-Knopfs nur der Hinweis.
  **Status:** Task `open | in_progress | blocked | done | failed`, Schritt `open | in_progress | done | failed`.
  **`failed` (Issue #7, Dominik 11.11.2026):** zweiter Abschluss neben `done`, fuer Tasks und
  Schritte gleich (sein Grundsatz: "ein und dieselbe Sache, nur mit Hierarchie") und immer mit
  Grund: `failedReason` (Text) + `failedAt` (Zeit), `completedAt` bleibt leer. Abgeschlossen =
  done oder failed (`closedT()`/`closedS()`); jeder andere Status entfernt Grund und Zeit wieder.
  **`dueWarnDays`** (Task und Schritt, seit 11.11.2026): Vorlauf in Tagen vor `dueDate`, ab dem
  die Faelligkeits-Marke orange wird; fehlt er, gelten 3 Tage; verschwindet mit dem Datum.
  Der MCP nimmt jeden Text als Status an (`z.string()`); die App zeichnet und zaehlt einen
  unbekannten Wert wie `open` (`tSt()`/`sSt()`), nennt ihn aber in der Zeile und in der
  Schublade (`rawSt()`/`oddSt()`) und ueberschreibt ihn erst, wenn man einen Status waehlt.
  Bis 11.11.2026 liess ein unbekannter Task-Status die ganze Tasks-Seite leer.
- **TAGS** / **STATUSES** — frei definierbar, Status mit Icon + Farbe (Icon ist der primaere
  Unterscheider, nicht die Farbe — der Nutzer hat eine Rot-Gruen-Schwaeche)

## Aufbau der Oberflaeche (v3, seit 19.10.2026)
Entworfen nach dem Anforderungs-Interview (`docs/ResearchGraph_Anforderungen-Interview_2026-10.md`): der Box-Agent schreibt fast alles, Dominik liest vor allem und hakt ab — die Oberflaeche ist zuerst eine Uebersicht, nichts wird fuer Optik versteckt.

- **Kopfzeile:** Seiten Tasks / Board / Journal / Calendar, Layout-Schalter "All projects | One project" (bei One: Projekt-Reiter), Suche (siehe "Suche ueber alles"), "Done steps hidden/shown" (`rg_hideDoneSubtasks`), "Show frozen", Zoom (`rg3_zoom`), Sync-Status, Menue (Neues Projekt, Archiv, Spaltenbreiten zuruecksetzen, GitHub, Hilfe).
- **All projects:** jedes aktive Projekt eine Spalte; Breiten per Ziehen als Anteile (`rg3_colw`, flex-grow): ein Griff verschiebt Breite nur zwischen seinen zwei offenen Nachbarn (auch ueber eingeklappte Streifen hinweg), alle anderen Spalten bleiben stehen; Doppelklick macht die beiden gleich breit, Spalten einklappbar zu Streifen (`rg3_collapsed`). **One project:** ein Projekt ueber die volle Breite, Lab | General | Ideas nebeneinander (`rg3_mode`, `rg3_one`).
- **Task einklappen (#6):** Pfeil in der Task-Zeile blendet deren Schritte aus, uebrig bleibt eine Zaehlerzeile ("▸ N steps · M done"); pro Task und Geraet in `rg3_folded` (`pid|tid`), Standard offen, Suche/geoeffneter Schritt klappen voruebergehend auf.
- **Pro Projekt:** Focus-Task oben (Stern + Rand in Projektfarbe), dann je Liste ein Abschnitt (Lab, General, eigene — siehe Listenmodell), Ideas, zuletzt **Closed** — Abschnittskoepfe als klebende Baender. Alle offenen Subtasks immer sichtbar.
- **Closed (seit 11.11.2026, Dominik; done und failed gemeinsam):** erledigte Tasks standen bis dahin nirgends in der App (80 Stueck, auch die Suche fand sie nicht). Jetzt pro Projekt ein Abschnitt am Ende: zugeklappt nur die Zeile mit der Zahl, ein Klick zeigt alle, juengste zuerst (`completedAt`), mit Datum; Klick auf den Titel oeffnet die Schublade, das Kaestchen holt die Task ueber die Status-Auswahl zurueck. Auf/zu pro Projekt und Geraet in `rg3_closed`. Unter der Suche immer offen und um archivierte Treffer ergaenzt.
- **Zeilen als festes Raster:** Status-Kaestchen | Titel (+ Blockiert-Grund bzw. Hinweis auf einen unbekannten Status) | rechts Element-Chip, ＋ (nur beim Ueberfahren: Schritt direkt unter der Task anlegen) und Prioritaet (1–3 Balken, jeder Balken ein Knopf: Klick setzt low/medium/high, seit 20.10.2026). Status-Symbole sind gezeichnete SVGs (leer / Punkt / Strich / Haken). **Status-Auswahl statt Klick-Zyklus (seit 11.11.2026, Dominik):** ein Klick auf das Kaestchen klappt direkt unter der Zeile dieselbe Auswahl auf wie in der Schublade (`stBox()`/`stPick()`, Zustand `ui.pick`, nicht gespeichert), ein zweiter Klick setzt den Status — in jede Richtung, auch "in progress" zurueck auf "open". Esc oder ein Klick daneben schliesst sie. "Blocked" oeffnet die Schublade mit dem Cursor im Wartegrund; "done" meldet per Toast, dass die Task jetzt unter Closed liegt (Strg+Z). Der fruehere Zyklus ging nur vorwaerts, liess eine Task mit einem Klick spurlos verschwinden und loeschte bei "blocked" den Wartegrund. Element an der Task: das eigene, sonst das haeufigste der Schritte ("via its steps"); an Schritten nur, wenn abweichend.
- **Schublade rechts** (Klick auf einen Titel): Status, Prioritaet, Focus, Liste, Element, Faelligkeit, Notes (Markdown, Edit/Save), Schritte. Elemente sind dort **nur lesbar**, Journal-Tage bekommen "＋ Add a section" — die pflegt der Agent.
- **Listenmodell (07.11.2026, Dominik; ersetzt `categories` vom 06.11.):** fest sind nur Lab (Schluessel `labor`, Kolben-Icon) und der Ideas-Bereich; alles andere (auch General) sind normale Listen mit Drei-Strich-Icon. Projektfeld `lists` = geordnete Kennungen (`labor` = Lab, sonst der Listenname), Reihenfolge = Anzeige, kein Icon pro Liste gespeichert. Todo-`category` = Liste, Vergleich ohne Gross/Klein (altes `general` = Liste "General", kein Todo umgeschrieben). Fehlt `lists`, wird abgeleitet: Lab + General, falls irgendein Todo (auch erledigt/archiviert) dort liegt (+ Altfeld `categories`) — App `projLists()` und MCP v53 `projLists()` mit identischer Regel. Eine Liste mit offenem Todo wird immer gezeigt. ⋯ → "New list…" (Name "Lab" holt Lab zurueck) / "Remove a list…" (nur ohne offene Tasks; erledigte/archivierte behalten ihren Listennamen, Strg+Z). Neue Projekte: `['labor','General']`. Ein-Projekt-Modus: Focus+Lab | uebrige Listen | Ideas (ohne Lab: Focus+Listen | Ideas).
- **Failed in der Oberflaeche (seit 11.11.2026):** "Failed" steht in der Status-Auswahl von Tasks und Schritten; die Wahl oeffnet einen Dialog "Why did it fail?" (wie beim Archivieren, Enter speichert, Esc aendert nichts). Form statt Farbe: gefuelltes Kaestchen mit Kreuz statt Haken. Eine failed Task verlaesst die offenen Listen und die Zahl "n open" und steht unter Closed mit Kreuz und Grund; ein failed Schritt bleibt unter seiner Task, der Grund steht in der Zeile. In der Schublade ist der Grund ein eigenes Feld ("Why it failed"), die Suche findet ihn.
- **Faelligkeits-Marke (seit 11.11.2026, Dominik; hebt "kein Datums-Chip in Zeilen" vom 05.08. auf):** jede Task und jeder Schritt mit `dueDate` traegt rechts in der Zeile eine Marke. Vier Stufen, lesbar am Text: Datum ("14 Dec", gelb) solange es weiter weg ist · "in 3 d" / "tomorrow" (orange) im Vorlauf · "today" und "2 d late" (dunkelrot, late mit "!"). Farben als Helligkeits-Treppe Gelb `#F0E442` / Orange `#E07B00` / Dunkelrot `#8F1010`: unter Deuteranopie-Simulation schlechtestes Paar dE2000 18, L* 90/65/34 (ein schlichtes Gelb/Orange/Rot kam nur auf dE 11). Vorlauf pro Eintrag in der Schublade neben dem Datum ("Turns orange": Same day / 3 days / 1 week / 1 month / eigene Zahl). Eine eingeklappte Task zeigt in ihrer Zaehlerzeile den naechsten faelligen Schritt; Abgeschlossenes traegt keine Marke.
- **Kalender (seit 11.11.2026, Dominik: "wo einem alle datumsbezogenen Sachen angezeigt werden"):** vierte Seite "Calendar", ein Monatsblatt (Mo–So) ueber alle sichtbaren Projekte, im Ein-Projekt-Modus nur dieses. Reine ANSICHT auf vorhandene Daten, kein neuer Datentyp, schreibt nichts (`calEntries()`, `renderCalendar()`, Monat in `ui.cal`, nicht gespeichert). Arten: Faelliges (Tasks und Schritte, in den drei Faelligkeits-Farben, Schritte mit ↳) · ✓ done / ✕ failed am Abschlusstag (Tasks ueber `completedAt`/`failedAt`, Schritte nur failed — erledigte Schritte tragen kein Datum) · Journal-Tag mit Abschnittszahl · Element-Aktivitaet (Log-Eintraege je Element und Tag, als fliessende Reihe kleiner Marken) · ✦ neue Idee. Projekt steht als Kuerzel im farbigen Feld (Text und Farbe, Legende im Kopf), jeder Eintrag oeffnet die Schublade. Bewusst weggelassen: "angelegt/geaendert" (Rauschen) und Archiviertes. Die Suche filtert auch hier, die Trefferzahl an "Calendar" gilt fuer den gezeigten Monat.
- **Google-Kalender im Kalender (seit 11.11.2026, Dominik: nur EINE Richtung, Google → RG):** die App spricht nie mit Google (ein Browser kann Googles iCal-Adresse nicht lesen — kein CORS-Header, gemessen; ein Google-Login liefe stuendlich ab). Der Agent auf der Box holt die "geheime Adresse im iCal-Format" und legt die Termine in den Gist: `calendar.google = {checkedAt, changedAt, from, to, events:[{id,title,allDay,start,end,location?}]}` auf oberster Ebene neben `projects` (ganztaegig: Tage `YYYY-MM-DD`, Ende inklusive; sonst ISO-UTC). Nur Titel, Zeit, Ort — keine Beschreibung, keine Teilnehmer, nie die Adresse. Die App haelt den Block in `S.calendar` (+ `rg_calendar` lokal), zeigt die Termine oben im Tag (Marke "G", ganztaegig zuerst, dann nach Uhrzeit, nur lesbar, auch im Ein-Projekt-Modus) fuer JEDEN Zeitraum, der dort liegt — der Zeitraum ist Einstellung der Box (Vorgabe 3 Monate voraus), nicht der App. Eigene Uploads der App lassen den Block bytegleich. Ist `checkedAt` aelter als 36 h, steht in der Legende "not refreshed since …". MCP ab v55: Tool `rg_calendar_sync` und ohne Agent `node index.js --calendar-sync` (cron), braucht `node-ical`; schreibt nur bei Aenderung oder einmal taeglich als Lebenszeichen.
- **Board (Elemente, nur lesbar):** je Status eine Gruppe, darin alphabetisch; jede Zeile zeigt rechts das Datum der letzten Aktivitaet (juengster Log-Eintrag) und die Zahl offener verknuepfter Tasks/Schritte (`elMeta()`, seit 11.11.2026 zum Ausprobieren). **Journal:** jeder Tag listet alle Abschnittstitel (bis 11.11.2026 nur die ersten drei — 57 Titel fehlten).
- **Suche ueber alles (seit 11.11.2026, Dominik):** vorher erreichte sie 64 % des Textes nicht und filterte nur die offene Seite. Jetzt: Tasks auch erledigt und archiviert, Ideen auch archiviert, Elemente auch ueber Aktivitaets-Log, eigene Abschnitte, Knoten und Status (unter der Suche auch aufgegebene), Journal ueber jeden Abschnitt. Neben Tasks / Board / Journal steht die Trefferzahl der jeweiligen Seite (`hitCounts()`); liegt der Treffer nicht im sichtbaren Titel, zeigt die Zeile die Fundstelle als Ausschnitt (`hitSnip()`).
- **Projekte:** Farbe bleibt; neuer Zustand **eingefroren** (`frozen`, `frozenAt` am Projekt — ausgeblendet bis "Show frozen"); archiviert = fertig. Ideen und Projekte werden nie geloescht.
- **Archiv statt Loeschen (Dominik 20.10.2026):** in der App gibt es kein Loeschen mehr. Tasks, Schritte, Ideen werden archiviert (`archived`, `archivedAt`, `archivedReason`; Status, Schritte und deren done/open-Stand bleiben unveraendert), Grund optional per Dialog. Archiviertes verschwindet aus Listen und Board; pro Projekt ⋯ → "Archived items" (Tasks mit Schritt-Stand, Schritte, Ideen, vom Agenten archivierte Elemente) mit Restore. Archivieren der Focus-Task loescht deren Focus. MCP ab v52 gleich (archive/archive_reason, delete-Tools archivieren, echtes Loeschen nur `permanent:true`).
- **Journal selbst schreiben (seit 20.10.2026, Rueckfall falls der Agent ausfaellt):** "＋ Write a journal entry" auf der Journal-Seite, "＋ Add a section to this day" im Tag. Abschnitt haengt per Datum am Tag (`jsec.add`), ein inzwischen vom Agenten angelegter Tag wird wiederverwendet. Die App bearbeitet/entfernt keine bestehenden Abschnitte (`jsec.del` nur als Strg+Z des eigenen).
- **Rueckgaengig (seit 20.10.2026, Dominiks Wunsch):** Strg+Z beliebig oft, Strg+Y / Strg+Umschalt+Z wiederholt, kein Knopf. Stapel nur im Speicher dieser Sitzung (`UNDO`/`REDO`, max. 100). Ein Eintrag haelt die Umkehr-Ops aus `diffProject(nachher, vorher)` und laeuft beim Ruecknehmen wieder durch `change()` — also auf den aktuellen Stand, Agenten-Writes dazwischen bleiben erhalten. Neue Idee/neues Projekt wird beim Ruecknehmen archiviert, nie geloescht. In Textfeldern bleibt Strg+Z das Text-Undo des Browsers.
- **Feedback-Knopf (zurueck seit 20.10.2026):** ✉ oben rechts legt ein oeffentliches Issue in `ResearchGraph-app` an (Label `feedback`), eigener fine-grained Token `Issues: write` in `rg_fb_token` (gleicher Key wie v1), "Copy text" als Rueckfall.
- **Entfernt gegenueber v1** (Dominiks Entscheid 19.10.2026): Tree-Ansicht, Export/Import, Status-Filter, Tags-/Status-Verwaltung, Idee→Task, Notiz-Zeichen (≡).
- **Dark Mode (06.11.2026):** Knopf "☾ Dark / ☀ Light" in der Kopfzeile, Wahl pro Geraet in `rg3_theme` (ohne Wahl: Systemeinstellung), gesetzt per Inline-Script im `<head>` vor dem ersten Zeichnen. Eigener CSS-Block `:root[data-theme="dark"]` am Ende — der helle Modus ist davon unberuehrt (pixelgleich gemessen). Im Dunkeln daempft `projVars()` die Projektflaechen um 30 % Richtung Papier und hellt die Marken auf (Kontrast >= 3 auf `#171C23`).
- **Farben:** Farbe = Projekt, Art = Form (seit 06.11.2026). Jede Spalte traegt nur ihre Projektfarbe: Spaltenkopf voll eingefaerbt, Abschnittskoepfe mit Projektfarb-Kante + Icon (Kolben = Lab, Liste = General, Stern = Ideas), Focus-Stern und Task-/Schritt-Status in der Projektfarbe. Status nur ueber die Form: offen = leer, in progress = Rand + Punkt, erledigt = gefuellt + Haken. CSS-Variablen pro Projekt aus `projVars(p)`: `--c` (Flaeche), `--on` (Schrift darauf), `--cm` (Markenfarbe, zu helle Farben abgedunkelt bis Kontrast 2,6 auf Weiss), `--cmon`. Ein zweites Farbsystem fuer Arten/Status wurde verworfen: unter Rot-Gruen-Simulation kollidierte es mit den Projektfarben (dE 1-3). Element-Status auf der Board-Seite behalten ihre eigenen Farben aus den Daten (Okabe-Ito-Defaults). Grundfarben-Palette fuer neue Projekte.

### Live-Sync (Variante A, `docs/ResearchGraph_Sync-Recherche_2026-10.md`)
- Die App fragt alle 10 s (nur bei sichtbarem Tab, sofort beim Zurueckkehren) `gists/{id}/commits?per_page=1` mit ETag ab — 304 kostet kein Rate-Limit. Neue Revision → laden und anzeigen, ohne Dialog.
- Eigene Aenderungen werden als Operationen gespeichert (`rg3_pending`, ueberlebt Reloads) und beim Hochladen auf den **frischen** Stand gespielt (Basis: zuletzt uebernommener Stand, wenn GitHub unveraendert ist, sonst neu geladen). Die App laedt nie ihre Gesamtkopie hoch.
- Reparatur: nach dem PATCH wird die Revisionskette geprueft; ist zwischen Lesen und Schreiben eine fremde Revision gelandet, wird sie aus der Gist-Historie geholt und die eigenen Ops erneut darauf angewendet (die Gist-API kennt kein If-Match — gemessen).
- **Die Anzeige sagt nur "Live", wenn die Abfragen gelingen (seit 11.11.2026):** zwei gescheiterte Abfragen hintereinander (Netz weg, GitHub 5xx) → "Not live · last check OK <Zeit>", erholt sich von selbst; 401 → "Sync paused" und die App fragt nicht weiter, bis man "Check now" drueckt oder neu verbindet. Die Zeit hinter "Live" ist die der letzten Datenaenderung, nicht der letzten Abfrage. Vorher verschluckte `poll()` jeden Fehler und es blieb "Live".
- **Ein Gist wird nur angelegt, wenn die Gist-Liste wirklich gelesen wurde und keines enthaelt.** `discoverGist()` gibt gefunden/nicht gefunden zurueck und WIRFT bei jedem Lesefehler (blaettert bis 1000 Gists). Vorher verschluckte es Fehler, und `connect()`/`push()` legten daraufhin aus der (leeren) lokalen Kopie ein zweites Gist an, waehrend die Box weiter ins echte schrieb. `connect()` uebernimmt den Token erst nach gelungener Suche.
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
`truncated` gesetzt ist; die App tut das in `_content()`. Ein unvollstaendiger Body wirft
dort, statt als gueltiger Zustand durchzugehen.

Die zweite Haelfte der Lehre ist wichtiger als die erste: **wo der Remote-Stand nicht gelesen
werden kann, darf nicht geschrieben werden.** In v1 verschluckte die Konfliktpruefung ihre
eigenen Fehler und fiel danach in den PATCH — ein unlesbares Gist haette den Gesamtbestand
still durch die Kopie des jeweiligen Geraets ersetzt. In v3 kann das nicht mehr passieren:
`push()` schreibt nur auf einen Stand, den `fetchDoc()` gelesen hat (oder den unveraenderten
`BASE`), bricht sonst sichtbar ab ("Upload paused") und versucht es spaeter erneut; die
eigenen Aenderungen liegen als Ops in `rg3_pending`.

### Ansicht ist keine Ablage (23.08.2026)
Was gerade auf dem Bildschirm liegt, gehoert dem Geraet, nicht dem Datenbestand. `activeProject`
stand frueher mit im Sync-Payload, deshalb aenderte schon ein **Projektwechsel** den Hash, PATCHte
den ganzen Store und erzeugte eine Gist-Revision ohne jede Datenaenderung — bei einer Box, die
Revisionen als "der Laborbestand hat sich geaendert" liest, ist das ein falsches Signal. Die
Regel dahinter: **eine Revision der Datendatei muss bedeuten, dass sich Daten geaendert haben.**

Ansichtszustand lebt daher nur in `localStorage` — Dominik nutzt die App auf genau einem
Geraet und will ausdruecklich keine Geraete-Synchronitaet. In v3 sind das die `rg3_*`-Keys
(Seite, Layout, gewaehltes Projekt, Spaltenbreiten, eingeklappte Spalten/Tasks, offene
Closed-Listen, Zoom, Theme); die App schreibt ausschliesslich Daten-Ops in den Gist, ein
`activeProject` kennt sie nicht mehr.

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

Bei ~0,95 MB Nutzdaten (23.08.2026) stand damit rund das **35-fache** an Kopffreiheit zur Verfuegung;
am 11.11.2026 hat die Datei 2,52 MB (rund 0,6 MB Zuwachs pro Monat; Element-Logs 38 %, Todos 29 %,
Journal 26 %), also noch das 13-fache.
Groesse ist seit dem `raw_url`-Fix keine Begrenzung mehr und braucht keine eigene Loesung —
weder Sharding noch ein eigener Server. Was mit der Groesse waechst, ist allein die
**Uebertragungszeit pro Save**, weil jeder Save das ganze Dokument PATCHt (~3 s bei 1 MB).
Erst wenn das spuerbar stoert, lohnt eine Aufteilung in eine Gist-Datei pro Projekt (ein
PATCH ersetzt nur die benannten Dateien) — das ist eine Kostenfrage, keine Grenzfrage.

**Die naehere Grenze ist der Browser, nicht GitHub (gemessen 11.11.2026):** `localStorage` fasst
in Chrome und Edge 5.242.876 Zeichen pro Adresse; die lokale Kopie belegt 2,29 Mio (44 %). Bei
gleichem Wachstum ist sie etwa im Fruehjahr 2027 voll — dann scheitert `writeLocal()` bei jedem
Abgleich mit einer Fehlermeldung (die App laeuft aus dem Speicher weiter). Abhilfe, noch nicht
entschieden: Element-Logs und Journal (64 % der Masse, in der App nur lesbar) nicht mehr lokal
spiegeln.

## Dateistruktur
- `overview.html` — die Anwendung (v3 seit 19.10.2026; v1 nur noch in der Git-Historie, letzter Stand vor dem Tausch: Commit `d945caf` + Promote-Entfernung)
- `tests/rg-offline-tests.js` — Offline-Tests (jsdom) gegen einen Gist-Snapshot, GitHub simuliert
- `index.html` — Redirect fuer GitHub Pages
- `.nojekyll` — GitHub Pages liefert die Dateien ohne Jekyll-Lauf aus
- `docs/ResearchGraph_Improvement-Backlog.md` — technischer Backlog; `docs/plans/ResearchGraph_Plan.md` (aktiver Plan), Interview und Sync-Recherche vom Oktober 2026 (nicht im Repo)
- `ResearchGraphMCP/` — der MCP-Server (nicht im Repo, siehe oben)
- `deploy/` — Ueberbleibsel vom Maerz 2026, nicht im Repo: eine v1-Kopie der App samt `demo_data.json` und `user_state_backup.json`. Wird von nichts benutzt.
  (Die App hat seit 05.08.2026 keine Demodaten mehr, ein leeres Projekt bleibt leer.)
