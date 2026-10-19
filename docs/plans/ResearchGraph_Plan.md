Aktiver Plan des rg-agent: Revision von UI, UX und Codebase der ResearchGraph-App (angelegt 19.10.2026, Stand: Vorschlag, Freigabe durch Dominik offen).

# ResearchGraph — Revision UI/UX/Codebase

## Anlass
Dominik (19.10.2026): Die App wurde mit Opus 4.6 gebaut; er will eine komplette Revision von UI, UX und Codebase und hat erwogen, sie als neues Projekt von Grund auf neu zu bauen. Ausloeser: lauter kleine Bedienfehler, die "absolut scheisse" sind.

Konkret gemeldet (Fakt, nicht nachtesten):
- Projektfarbe waehlen: Man sieht nicht verlaesslich, welche Farbe ausgewaehlt ist, es gibt keinen Bestaetigen-Knopf, uebernommen wird nur per Enter — das hat er nur durch Zufall herausgefunden.
- Viele weitere kleine Interaktionen dieser Art, noch nicht aufgelistet.
- Am selben Tag schon behoben: Pastell-Statusfarben (fuer ihn ununterscheidbar), Projektpalette (Designer-Toene mit dE 3-9 unter Rot-Gruen-Simulation), "Reset Project" (Datenverlust).

## Vorschlag (vom rg-agent, Entscheidung Dominik)
Kein Neubau auf leerem Blatt, sondern Neubau der Oberflaeche gegen einen festen Datenvertrag, im selben Repo.

Begruendung: Das Wertvolle und Schwer-Erkaempfte ist die Datenschicht — das Gist-JSON-Schema ist der Vertrag mit dem MCP, der Box und allen Labordaten, und der Sync traegt Fixes, die jeweils einen echten Datenverlust gekostet haben (Write-Storm/Hash-Guard, raw_url bei Truncation, Konfliktpruefung die nicht mehr still ueberschreibt, Ansicht nicht im Datenspeicher). Ein Neubau von Null muesste all das neu lernen. Schwach ist die Oberflaeche — und die laesst sich View fuer View ersetzen, waehrend Dominik die App taeglich weiter benutzt.

## Ablauf
1. **Inventur** (erste Session nach dem Clear): jede Ansicht und jede Interaktion auflisten (Klick, Doppelklick, Enter, Drag, versteckte Kuerzel), dazu Datenfluss und Code-Struktur von `overview.html` (~3900 Zeilen, ~300 Funktionen). Ergebnis: `docs/ResearchGraph_UI-UX-Audit_2026-10.md` mit priorisierten Befunden pro Ansicht, jeder Befund mit Fundstelle.
2. **Durchsicht mit Dominik**: pro Funktion behalten / streichen / neu machen (Regel 5, subtraktiv — Kandidaten zum Streichen waren schon Tree-View und Replicates). Seine Screenshots sind die Grundwahrheit fuer UX-Befunde.
3. **Architektur-Entscheidung**: bleibt es Vanilla-JS in einer Datei, oder Quellcode in Modulen mit Build-Schritt, der weiterhin genau eine `overview.html` ausgibt (Hard Rule 1 betrifft die Ausgabe). Entscheidung nach der Inventur, nicht vorher.
4. **Neubau View fuer View** gegen den unveraenderten Datenvertrag; jede fertige Ansicht geht live, Dominik testet am Institut-PC, erst dann die naechste.

## Feste Randbedingungen
- Gist-Schema nicht brechen (MCP v50 und Box lesen/schreiben es); Schema-Aenderungen nur mit gleichzeitigem MCP-Update.
- Rot-Gruen-Schwaeche: keine Pastelltoene, jede Farbunterscheidung unter Simulation messen, Icons/Form als primaerer Unterscheider.
- Ideen und Projekte werden nie geloescht, nur archiviert.
- Keine Browser-Automation zum Testen; Dominik testet selbst in Opera.
- UI englisch, Code-Kommentare deutsch.
