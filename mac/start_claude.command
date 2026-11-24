#!/bin/bash
#claude
# Startet Modellwerk direkt aus dem Quelltext (ohne Installation als App).
# Aufruf:  bash start_claude.command [datei.prg]
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then
  echo "Erste Einrichtung: lege Python-Umgebung an ..."
  python3 -m venv .venv || { echo "python3 fehlt - bitte mit 'brew install python' installieren."; exit 1; }
fi
if ! .venv/bin/python -c "import PySide6" 2>/dev/null; then
  echo "Installiere PySide6 (Qt) ..."
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet PySide6 || { echo "Installation fehlgeschlagen."; exit 1; }
fi
exec .venv/bin/python mw_app.py "$@"
