#!/bin/bash
#claude
# Baut aus dem Quelltext eine normale Mac-App (Modellwerk.app) und legt sie in den Programme-Ordner.
# Aufruf im Terminal:  bash installieren_claude.command
# Dauert beim ersten Mal einige Minuten und braucht Internet (laedt Qt/PySide6 und PyInstaller).
cd "$(dirname "$0")" || exit 1
QUELLE="$(pwd)"
BAU="$QUELLE/.bau_claude"

PY=""
for kandidat in /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
  if command -v "$kandidat" >/dev/null 2>&1 && "$kandidat" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
    PY="$kandidat"; break
  fi
done
if [ -z "$PY" ]; then
  echo "Es wurde kein Python 3.9 oder neuer gefunden. Bitte installieren mit:  brew install python"
  exit 1
fi
echo "Benutze $($PY --version) ($PY)"

if [ -w /Applications ]; then ZIEL="/Applications"; else ZIEL="$HOME/Applications"; mkdir -p "$ZIEL"; fi

echo "1/3  Richte Bau-Umgebung ein ..."
[ -x "$BAU/venv/bin/python" ] || "$PY" -m venv "$BAU/venv" || { echo "Konnte keine Python-Umgebung anlegen."; exit 1; }
"$BAU/venv/bin/pip" install --quiet --upgrade pip
"$BAU/venv/bin/pip" install --quiet PySide6 pyinstaller || { echo "Installation von PySide6/PyInstaller fehlgeschlagen (Internet?)."; exit 1; }

echo "2/3  Baue Modellwerk.app (das dauert ein paar Minuten) ..."
rm -rf "$BAU/dist" "$BAU/build"
if "$BAU/venv/bin/python" -m PyInstaller --noconfirm --log-level WARN --distpath "$BAU/dist" --workpath "$BAU/build" Modellwerk_claude.spec \
   && [ -d "$BAU/dist/Modellwerk.app" ]; then
  echo "     Bau erfolgreich."
else
  echo "     Der Bau mit PyInstaller hat nicht geklappt. Erzeuge stattdessen eine einfache Start-App."
  APP="$BAU/dist/Modellwerk.app"
  rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
  cp Modellwerk_claude.icns "$APP/Contents/Resources/Modellwerk.icns"
  cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Modellwerk</string>
  <key>CFBundleDisplayName</key><string>Modellwerk</string>
  <key>CFBundleIdentifier</key><string>de.modellwerk.claude</string>
  <key>CFBundleExecutable</key><string>Modellwerk</string>
  <key>CFBundleIconFile</key><string>Modellwerk</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>2.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
  cat > "$APP/Contents/MacOS/Modellwerk" <<START
#!/bin/bash
exec "$BAU/venv/bin/python" "$QUELLE/mw_app.py" "\$@"
START
  chmod +x "$APP/Contents/MacOS/Modellwerk"
  echo "     Hinweis: Diese Start-App braucht weiterhin den Ordner $QUELLE."
fi

echo "3/3  Kopiere nach $ZIEL ..."
rm -rf "$ZIEL/Modellwerk.app"
ditto "$BAU/dist/Modellwerk.app" "$ZIEL/Modellwerk.app" || { echo "Kopieren fehlgeschlagen."; exit 1; }
xattr -cr "$ZIEL/Modellwerk.app" 2>/dev/null
rm -rf "$BAU/build"

echo
echo "Fertig. Modellwerk liegt jetzt in $ZIEL und laesst sich wie jede andere App starten"
echo "(Launchpad, Spotlight oder Doppelklick). Die App wird jetzt geoeffnet."
open "$ZIEL/Modellwerk.app"
