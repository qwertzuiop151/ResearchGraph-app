# Project Vision — ResearchGraph

## Was dieses Tool ist
Ein **universelles Experiment-Organisations-Framework** für Forscher aller Fachgebiete.
Nicht Dokumentation (→ LabFolder), sondern **Überblick & Organisation**.
Komplett customizable — die Grundstruktur (Goals → Gruppen → Elemente → Experimente)
ist in jedem Fachgebiet dieselbe.

## Kernproblem das es löst
Labfolder und ähnliche Tools sind zu schwerfällig: tiefe Ordnerstrukturen, zu viel
Overhead für schnelle Einträge, kein sofortiger Überblick über den Gesamtstatus.
Dieses Tool soll das Gegenteil sein — auf einen Blick sehen wo man steht,
in Sekunden eintragen, nichts suchen müssen.

## Design-Prinzipien
- **Schnell:** Eintrag in unter 10 Sekunden, keine Navigation durch Menüs
- **Visuell:** Status und Abhängigkeiten auf einen Blick erkennbar
- **Kollabierbar:** Volle Kontrolle über Detailtiefe — von Vogelperspektive bis Einzelschritt
- **Portabel:** Läuft als einzelne HTML-Datei, kein Server nötig
- **Backed up:** GitHub als Datenspeicher — kein proprietäres Format, kein Lock-in

## Aktuelle Instanz
Master's Thesis: *Nuclear-Mediated Mitochondrial Transformation via RepA*
Max-Planck-Institut für Pflanzenzüchtungsforschung, Köln
Student: Dominik Cichos, 2025–2026

Datenlage: ~15 Plasmid-Konstrukte, 4 Experimente, 4 Strategien, offene Fragen zur
Import-Effizienz und Integrations-Nachweis.

## Langfristige Vision
Das Tool ist so gebaut, dass es mit dem Nutzer wächst. Die nächste geplante Instanz
ist eine Doktorarbeit am selben Institut (Interviewphase läuft, Stand März 2026).

Ein PhD-Projekt bedeutet: 3–5 Jahre Laufzeit, mehrere parallele Teilprojekte,
hunderte Experimente, wechselnde Prioritäten. Genau der Kontext für den dieses
Tool entworfen wurde — nicht als starres System, sondern als lebendige Übersicht
die mit der Forschung mitwächst.

**Geplante Erweiterungen für PhD-Kontext:**
- Multi-Projekt-Unterstützung (mehrere parallele Teilprojekte gleichzeitig)
- GitHub-Sync: Daten liegen im eigenen GitHub-Account, nicht im HTML eingebettet
- Web-Deployment: von überall erreichbar, nicht nur lokal
- Aufgaben-Layer: To-dos pro Experiment, Deadlines, offene Punkte
- Kollaborations-Ansicht (read-only share mit Betreuern)

## Was dieses Tool nicht ist
- Kein Ersatz für Labfolder (offizielle Dokumentation bleibt dort)
- Kein Notizbuch für Rohdaten
- Kein Paper-Management (→ PaperSummary ist ein separates Tool)
- Keine Analyse-Plattform
