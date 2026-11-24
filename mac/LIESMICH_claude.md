# Modellwerk

Eigenständiges Modellbildungsprogramm für den Mac. Es arbeitet wie Moebius 3: Programmschleife,
Startwerte, „Wiederhole n mal“, Arbeitsblatt mit Schaubild und Tabelle. Es liest und schreibt
dessen Dateien (`*.prg`). Der Code ist neu geschrieben; Symbole, Hilfetext und Beispiele sind eigene.

## Als normale App installieren

Einmal im Terminal ausführen (im Ordner dieser Datei):

    bash installieren_claude.command

Das Skript baut `Modellwerk.app` und legt sie in den Programme-Ordner. Danach startet man sie
über Launchpad, Spotlight oder per Doppelklick. `.prg`-Dateien lassen sich mit
Rechtsklick → „Öffnen mit“ → Modellwerk öffnen.

Ohne Installation starten: `bash start_claude.command [datei.prg]`

## Bedienung in Kürze

1. **Einfügen → Neue Simulation**: Programm und Startwerte eingeben
   (oder über „Sprachliches Modell“ bzw. „Grafisches Modell“ erzeugen lassen), OK.
2. Rechts die Größe für die **x-Achse** wählen, Größen für die **y-Achse** markieren, **Anzeigen**.
3. **Doppelklick** auf eine Kurve: Kurven-Parameter. Doppelklick auf eine Achse: Skalierung.
   Doppelklick auf das Schaubild: Eigenschaften. Rechtsklick: Kontextmenü.
4. Text-Werkzeug (T): auf das Blatt klicken und schreiben. Objekte mit der Maus verschieben.
5. **Ansicht → Darstellung**: Klassisch oder Modern.

## Was geht

- `.prg` öffnen und speichern, inklusive Arbeitsblatt (Schaubild, Achsen, Kurven, Texte, Legende, Bilder)
- mehrere Simulationen pro Datei, gemeinsame Anzeige bei gleicher x-Achse
- algorithmische, sprachliche und grafische Modellierung (Flussdiagramm-Editor), Makros
- Schaubild: Linien, Punkte, Punkt-Linien, Balken, Splines, 3-dimensional, getrennte Schaubilder,
  Achsen von Hand oder automatisch skalieren, Hilfslinien, Legende, Zahlenformat
- Animation (auch mit Bild), Tabelle mit Zahlenformat, Weiter rechnen
- Texte (Schrift, Größe, fett, kursiv, unterstrichen, hoch/tief, drehen), Grafiken einfügen
- Rückgängig, Ausschneiden/Kopieren/Einfügen, Drucken, Export als CSV (Excel) und PNG

## Unterschiede zum Original

- Dialoge öffnen sich per **Doppelklick** oder Rechtsklick auf Kurve, Achse oder Schaubild.
- Die Fenster sind neu gestaltet. Begriffe, Menüs und Abläufe entsprechen dem Original, das Aussehen ist nicht pixelgleich.
- Nur im eigenen Format `.json` gespeichert werden: Makros (in `.prg` werden sie aufgelöst)
  und Textformatierung (fett, kursiv, unterstrichen, hoch/tief).
- Noch nicht umgesetzt: logarithmische Achsen, transparente Farbe und Zuschneiden bei Grafiken,
  Formatierung einzelner Zeichen innerhalb eines Textes.
- **Nicht geprüft** ist, ob das Original Dateien fehlerfrei öffnet, die Modellwerk neu erzeugt oder
  verändert hat. Unverändert gespeicherte Dateien sind bytegleich mit dem Original.

## Dateien

- `mw_app.py`: Hauptfenster · `mw_dialogs.py`: Dialoge · `mw_draw.py`: Zeichnen · `mw_icons.py`: Symbole
- `mw_core.py`: Dateiformat und Rechenkern (ohne Oberfläche nutzbar)
- `beispiele_claude/`: drei eigene Beispielmodelle
- Die Web-Version (Browser, iPad) liegt im Ordner `web/` des Repos, siehe `README.md`.
