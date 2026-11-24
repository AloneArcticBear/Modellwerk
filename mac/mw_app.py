#claude
"""
Modellwerk - eigenstaendiges Modellbildungsprogramm (Programmschleifen, Arbeitsblatt mit Schaubildern).
Liest und schreibt Dateien im Format MOEBIUS30 (*.prg). Zwei Darstellungen: Klassisch und Modern.

Start:  python3 mw_app.py [datei.prg]
"""
import copy
import json
import math
import os
import re
import sys

from PySide6.QtCore import QAbstractTableModel, QEvent, QModelIndex, QPointF, QRectF, QSettings, QSizeF, Qt, QTimer, QUrl
from PySide6.QtGui import (QAction, QActionGroup, QColor, QFont, QFontDatabase, QGuiApplication, QIcon, QImage, QKeySequence,
                           QPageLayout, QPainter, QPalette, QPen, QTextDocument)
from PySide6.QtPrintSupport import QPageSetupDialog, QPrintDialog, QPrinter
from PySide6.QtWidgets import (QAbstractItemView, QApplication, QCheckBox, QComboBox, QFileDialog, QFontDialog,
                               QInputDialog, QLabel, QLineEdit, QListWidget, QMainWindow, QMenu, QMessageBox,
                               QProgressDialog, QPushButton, QScrollArea, QSplitter, QStyleFactory, QTableView,
                               QToolBar, QVBoxLayout, QWidget)

import mw_core as core
import mw_draw as draw
from mw_dialogs import (APP, AchseDialog, AlgoDialog, BildDialog, DruckenDialog, HilfeDialog, KurvenDialog,
                        SchaubildDialog, SonderzeichenDialog, WinkelDialog, ZahlenformatDialog, bild_aus_hex,
                        image_bytes, male_fluss)
from mw_icons import icon

HIER = os.path.dirname(os.path.abspath(__file__))
PX_CM = 37.8
SEITE = (21.0, 13.0)

THEMES = {
    "klassisch": {"style": "Windows", "bg": "#d4d0c8", "base": "#ffffff", "text": "#000000", "accent": "#0a246a",
                  "font": ("Arial", 12), "icon": "#000000", "qss": ""},
    "modern": {"style": "Fusion", "bg": "#f3f4f7", "base": "#ffffff", "text": "#1d2330", "accent": "#3b6fe0",
               "font": ("Helvetica Neue", 13), "icon": "#39404f", "qss": """
        QMainWindow, QDialog, QWidget { background: #f3f4f7; color: #1d2330; }
        QToolBar { background: #ffffff; border: none; border-bottom: 1px solid #dfe2ea; padding: 4px; spacing: 3px; }
        QToolButton { padding: 4px; border-radius: 6px; border: 1px solid transparent; }
        QToolButton:hover { background: #e9eefb; } QToolButton:checked { background: #d6e2fb; border-color: #a9c0f5; }
        QPushButton { background: #3b6fe0; color: white; border: none; border-radius: 6px; padding: 6px 14px; }
        QPushButton:hover { background: #2f5cc0; } QPushButton:disabled { background: #b9c2d6; }
        QPlainTextEdit, QTableView, QTableWidget, QListWidget, QTextBrowser, QLineEdit { background: #ffffff; border: 1px solid #cfd4e0; border-radius: 6px; }
        QScrollArea { border: 1px solid #dfe2ea; }
        QGroupBox { border: 1px solid #dfe2ea; border-radius: 8px; margin-top: 10px; padding-top: 8px; }
        QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 4px; color: #55607a; }
        QHeaderView::section { background: #f3f4f7; border: none; border-bottom: 1px solid #dfe2ea; padding: 4px; }
        QComboBox, QSpinBox { background: #ffffff; border: 1px solid #cfd4e0; border-radius: 6px; padding: 3px 6px; }
        QMenuBar { background: #ffffff; } QMenu { background: #ffffff; border: 1px solid #dfe2ea; }
        QMenu::item:selected, QMenuBar::item:selected { background: #e9eefb; color: #1d2330; }
        QStatusBar { background: #ffffff; border-top: 1px solid #dfe2ea; }"""},
}


def spec_neu():
    return {"pc": [10, 10, 80, 80], "farbe": (192, 192, 192), "legende": True, "timer": 50,
            "xa": core.achse_neu(), "ya": core.achse_neu(), "za": core.achse_neu(), "fenster": (255, 255, 255),
            "nach": None, "norm": False, "achsentitel": True}


# ------------------------------------------------------------------ Achsentitel und Einheiten

def achsen_titel(sims, paare):
    """Achsentitel aus Namen und Einheiten, z. B. "t in s", "v, w in m/s" oder "s in m, v in m/s"."""
    namen, einheiten = [], {}
    for si, n in paare:
        if not (0 <= si < len(sims)) or not n: continue
        v = next((w for w in sims[si]["variablen"] if w["name"].upper() == str(n).upper()), None)
        name = v["name"] if v else str(n); key = name.upper()
        if key not in einheiten: namen.append(name); einheiten[key] = ""
        e = str(v.get("einheit") or "").strip() if v else ""
        if e and not einheiten[key]: einheiten[key] = e
    if not namen: return ""
    ein = [einheiten[n.upper()] for n in namen]
    if ein[0] and all(e == ein[0] for e in ein): return ", ".join(namen) + " in " + ein[0]
    return ", ".join(f"{n} in {e}" if e else n for n, e in zip(namen, ein))


_IST_ZAHL = re.compile(r"^[-+]?[\d.,\s\u00b7]+$")


def einheiten_aus_titeln(sheet, sims):
    """.prg kennt keine Einheiten: aus den Achsentiteln eines exportierten Schaubilds zurueckholen."""
    ch = next((o for o in sheet["objekte"] if o["k"] == "chart"), None)
    if ch is None: return
    for a in ch["kids"]:
        if a["k"] != "achse": continue
        for t in a["kids"]:
            if t["k"] != "text": continue
            titel = core.text_of(t).strip()
            if not titel or _IST_ZAHL.match(titel): continue
            teile = []
            for x in re.split(r",\s*", titel):
                m = re.match(r"^(.+?) in (.+)$", x.strip())
                teile.append((m.group(1).strip(), m.group(2).strip()) if m else (x.strip(), ""))
            gemeinsam = teile[-1][1] if len(teile) > 1 and all(not e for _, e in teile[:-1]) else ""
            for n, e0 in teile:
                e = e0 or gemeinsam
                if not n or not e: continue
                for s in sims:
                    for v in s["variablen"]:
                        if v["name"].upper() == n.upper() and not v.get("einheit"): v["einheit"] = e


def achsentitel_standard(sheet):
    """Automatische Achsentitel? Ja - ausser der Autor hat die Achsen schon mit freien Texten beschriftet
    (Texte an der Spitze der y-Achse oder am Ende der x-Achse, wie in den Moebius-Beispielen "t", "Zeit", "Hasen")."""
    ch = next((o for o in sheet["objekte"] if o["k"] == "chart"), None)
    if ch is None: return True
    if any(a["k"] == "achse" and any(t["k"] == "text" and not _IST_ZAHL.match(core.text_of(t).strip()) for t in a["kids"]) for a in ch["kids"]):
        return True
    cx, cy, cw, chh = ch["g"]; pr = core.chart_plot_rect(ch)
    links, unten = cx + pr[0], cy + pr[1] + pr[3]
    zone_x = (links + pr[2] * 0.6, unten - 1.5, cx + cw + 2.0, cy + chh + 1.5)
    zone_y = (cx - 2.0, cy - 1.5, links + pr[2] * 0.4, cy + pr[1] + 1.5)
    drin = lambda z, x, y: z[0] <= x <= z[2] and z[1] <= y <= z[3]
    for o in sheet["objekte"]:
        if o["k"] != "text" or not core.text_of(o).strip(): continue
        mx, my = o["g"][0] + o["g"][2] / 2, o["g"][1] + o["g"][3] / 2
        if drin(zone_x, mx, my) or drin(zone_y, mx, my): return False
    return True


# ------------------------------------------------------------------ Tabelle

class WerteModel(QAbstractTableModel):
    def __init__(self):
        super().__init__()
        self.vars = []

    def set(self, variablen):
        self.beginResetModel(); self.vars = variablen; self.endResetModel()

    def rowCount(self, parent=QModelIndex()):
        return max((len(v["werte"]) for v in self.vars), default=0)

    def columnCount(self, parent=QModelIndex()):
        return len(self.vars)

    def data(self, index, role=Qt.DisplayRole):
        if role == Qt.DisplayRole:
            v = self.vars[index.column()]
            if index.row() < len(v["werte"]):
                return core.tabellen_text(v["werte"][index.row()], v["_attr4"][1])
        elif role == Qt.TextAlignmentRole:
            return int(Qt.AlignRight | Qt.AlignVCenter)
        return None

    def headerData(self, section, orientation, role=Qt.DisplayRole):
        if role == Qt.DisplayRole:
            if orientation != Qt.Horizontal: return str(section + 1)
            v = self.vars[section]
            return v["name"] + (" in " + v["einheit"] if v.get("einheit") else "")
        return None


# ------------------------------------------------------------------ Arbeitsblatt

class Sheet(QWidget):
    def __init__(self, main):
        super().__init__()
        self.m = main
        self.zoom = 1.4; self.auto_zoom = True
        self.sel = None; self.mode = "pfeil"; self.drag = None
        self.edit = None; self.edit_obj = None; self.edit_pos = None
        self.anim = None
        self.setMouseTracking(True); self.setFocusPolicy(Qt.StrongFocus)

    @property
    def s(self):
        return PX_CM * self.zoom

    @property
    def objs(self):
        return self.m.sheet["objekte"]

    def groesse(self):
        w, h = SEITE
        for o in self.objs:
            b = draw.bounds(o); w = max(w, b[0] + b[2] + 1.0); h = max(h, b[1] + b[3] + 1.0)
        return w, h

    def anpassen(self):
        w, h = self.groesse()
        self.setFixedSize(int(w * self.s), int(h * self.s)); self.update()

    def set_zoom(self, z, auto=False):
        self.zoom = max(0.6, min(4.0, z)); self.auto_zoom = auto; self.anpassen()

    # --- Zeichnen
    def paintEvent(self, _):
        p = QPainter(self); p.setRenderHint(QPainter.Antialiasing); p.setRenderHint(QPainter.TextAntialiasing)
        p.fillRect(self.rect(), QColor(*self.m.spec["fenster"]))
        self.male(p, self.s, self.anim)
        if self.sel is not None and self.sel < len(self.objs) and self.anim is None:
            draw.draw(p, {"k": "nix", "g": draw.bounds(self.objs[self.sel])}, self.s, markiert=True)

    def male(self, p, s, anim=None):
        chart_nr = 0
        for o in self.objs:
            if o is self.edit_obj: continue
            if o["k"] == "chart" and anim is not None and chart_nr == 0:
                kb, marker = self.m.anim_zustand(o, anim)
                draw.draw(p, o, s, kurven_bis=kb)
                for (x, y, img, farbe) in marker:
                    if img is not None:
                        w = img.width() / PX_CM * 0.75; h = img.height() / PX_CM * 0.75
                        p.drawImage(QRectF((x - w / 2) * s, (y - h / 2) * s, w * s, h * s), img)
                    else:
                        p.setPen(QPen(QColor(0, 0, 0), 1)); p.setBrush(QColor(*farbe)); p.drawEllipse(QPointF(x * s, y * s), 5, 5)
            else:
                draw.draw(p, o, s)
            if o["k"] == "chart": chart_nr += 1

    # --- Maus
    def _cm(self, e):
        return e.position().x() / self.s, e.position().y() / self.s

    def mousePressEvent(self, e):
        self.setFocus(); self.commit_edit()
        x, y = self._cm(e)
        i, teil = draw.hit(self.objs, x, y)
        if e.button() == Qt.RightButton:
            self.sel = i; self.update(); self.m.kontext(i, teil, e.globalPosition().toPoint()); return
        if self.mode == "text":
            if i is not None and self.objs[i]["k"] == "text": self.start_edit(self.objs[i])
            else: self.start_edit(None, (x, y))
            return
        self.sel = i
        if i is not None:
            b = draw.bounds(self.objs[i]); o = self.objs[i]
            griff = abs(x - b[0] - b[2]) < 0.25 and abs(y - b[1] - b[3]) < 0.25 and o["k"] in ("chart", "bild")
            self.drag = {"i": i, "x": x, "y": y, "g": list(o["g"]), "resize": griff, "moved": False}
        self.m.auswahl_geaendert(); self.update()

    def mouseMoveEvent(self, e):
        if not self.drag: return
        x, y = self._cm(e); d = self.drag; o = self.objs[d["i"]]
        dx, dy = x - d["x"], y - d["y"]
        if not d["moved"]:
            if math.hypot(dx, dy) < 0.08: return
            d["moved"] = True; self.m.merke()
        if d["resize"]:
            o["g"][2] = max(1.0, d["g"][2] + dx); o["g"][3] = max(1.0, d["g"][3] + dy)
        else:
            o["g"][0] = max(0.0, d["g"][0] + dx); o["g"][1] = max(0.0, d["g"][1] + dy)
        self.update()

    def mouseReleaseEvent(self, e):
        d, self.drag = self.drag, None
        if d and d["moved"]:
            self.m.objekt_bewegt(d["i"], d["resize"]); self.anpassen()

    def mouseDoubleClickEvent(self, e):
        x, y = self._cm(e); i, teil = draw.hit(self.objs, x, y)
        if i is not None: self.m.objekt_dialog(i, teil)

    def keyPressEvent(self, e):
        if e.key() in (Qt.Key_Delete, Qt.Key_Backspace) and self.sel is not None: self.m.loeschen()
        elif e.key() == Qt.Key_Escape: self.sel = None; self.update()
        else: super().keyPressEvent(e)

    # --- Text schreiben
    def start_edit(self, obj, pos=None):
        self.commit_edit()
        self.edit_obj = obj; self.edit_pos = pos
        ed = QLineEdit(self)
        font, size = (obj["font"], obj["size"]) if obj else (self.m.font_name.currentText(), float(self.m.font_size.currentText()))
        ed.setFont(draw.qfont(font, size, self.s))
        if obj:
            ed.setText(core.text_of(obj)); x, y = obj["g"][0], obj["g"][1]
        else:
            x, y = pos
        ed.setFrame(False); ed.setStyleSheet("background: #ffffe0; color: black; border: 1px dashed #0050dc;")
        ed.move(int(x * self.s) - 2, int(y * self.s) - 2); ed.setMinimumWidth(160); ed.adjustSize(); ed.resize(max(ed.width(), 220), ed.height())
        ed.show(); ed.setFocus()
        ed.returnPressed.connect(self.commit_edit)
        self.edit = ed; self.update()

    def commit_edit(self):
        if self.edit is None: return
        ed, obj, pos = self.edit, self.edit_obj, self.edit_pos
        self.edit = None; self.edit_obj = None; self.edit_pos = None
        text = ed.text(); ed.hide(); ed.deleteLater()
        self.m.text_fertig(obj, pos, text)
        self.update()


# ------------------------------------------------------------------ Hauptfenster

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.settings = QSettings("claude", APP)
        self.printer = None; self.clip = None; self.undo = []; self.runner = None; self.runner_sim = None
        self.kurven_info = []; self.dirty = False; self.path = None; self.sonder = None
        self.anim_timer = QTimer(self); self.anim_timer.timeout.connect(self._anim_tick); self.anim_t = 0
        self.sheet = core.new_sheet(); self.sims = []; self.aktiv = 0; self.makros = {}; self.spec = spec_neu()
        self.theme = "klassisch"
        self._build_ui(); self._build_menu()
        self.apply_theme(self.settings.value("darstellung", "klassisch"))
        self.neu(frage=False)
        self.resize(1240, 800)

    # ================================================= Aufbau
    def _build_ui(self):
        self.blatt = Sheet(self)
        self.scroll = QScrollArea(); self.scroll.setWidget(self.blatt); self.scroll.setAlignment(Qt.AlignLeft | Qt.AlignTop)
        self.scroll.viewport().installEventFilter(self)
        self.model = WerteModel()
        self.tabelle = QTableView(); self.tabelle.setModel(self.model); self.tabelle.hide()
        self.tabelle.setContextMenuPolicy(Qt.CustomContextMenu); self.tabelle.customContextMenuRequested.connect(self._tabmenu)
        self.tabelle.verticalHeader().setDefaultSectionSize(22)
        left = QSplitter(Qt.Vertical); left.addWidget(self.scroll); left.addWidget(self.tabelle)
        left.setStretchFactor(0, 3); left.setStretchFactor(1, 1); left.setChildrenCollapsible(False)
        self.scroll.setMinimumHeight(160); self.tabelle.setMinimumHeight(120); self.left = left

        panel = QWidget(); panel.setFixedWidth(200); v = QVBoxLayout(panel)
        v.addWidget(QLabel("Name der Simulation:"))
        self.sim_box = QComboBox(); self.sim_box.setToolTip("Zu bearbeitende Simulation auswählen"); self.sim_box.activated.connect(self._sim_gewaehlt)
        v.addWidget(self.sim_box)
        self.dreid = QCheckBox("3-dimensional"); self.dreid.toggled.connect(self._achsen_ui); v.addWidget(self.dreid)
        self.getrennt = QCheckBox("getrennte Schaubilder"); v.addWidget(self.getrennt)
        v.addWidget(QLabel("x-Achse:"))
        self.x_box = QComboBox(); self.x_box.setToolTip("Variable für die Rechtsachse wählen"); v.addWidget(self.x_box)
        self.y_label = QLabel("y-Achse:"); v.addWidget(self.y_label)
        self.y_box = QComboBox(); self.y_box.setToolTip("Variable für die y-Achse wählen"); v.addWidget(self.y_box)
        self.z_label = QLabel("z-Achse:"); v.addWidget(self.z_label)
        self.y_list = QListWidget(); self.y_list.setSelectionMode(QAbstractItemView.MultiSelection)
        self.y_list.setToolTip("Variablen für die Hochachse markieren"); v.addWidget(self.y_list, 1)
        b = QPushButton("Anzeigen"); b.setToolTip("Die gewählten Variablen werden angezeigt."); b.clicked.connect(self.anzeigen); v.addWidget(b)
        self.weiter_btn = QPushButton("Weiter rechnen..."); self.weiter_btn.clicked.connect(self.weiter_rechnen); v.addWidget(self.weiter_btn)

        split = QSplitter(); split.addWidget(left); split.addWidget(panel); split.setStretchFactor(0, 1); split.setCollapsible(1, False)
        self.setCentralWidget(split)
        self.statusBar().showMessage("Bereit")
        self._achsen_ui()

    def _act(self, text, slot, key=None, ic=None, checkable=False, tip=None):
        a = QAction(text, self)
        if key: a.setShortcut(QKeySequence(key))
        a.setCheckable(checkable); a.triggered.connect(slot)
        if tip: a.setToolTip(tip); a.setStatusTip(tip)
        a.setData(ic)
        return a

    def _build_menu(self):
        A = self._act; mb = self.menuBar(); self.acts = {}
        def reg(key, a):
            self.acts[key] = a; return a
        m = mb.addMenu("&Datei")
        m.addAction(reg("neu", A("&Neu", self.neu, "Ctrl+N")))
        m.addAction(reg("open", A("Ö&ffnen...", self.oeffnen, "Ctrl+O", "open", tip="Öffnen")))
        m.addAction(A("&Beispiel öffnen...", self.beispiel))
        m.addAction(reg("save", A("&Speichern", self.speichern, "Ctrl+S", "save", tip="Speichern")))
        m.addAction(A("Speichern &unter...", self.speichern_unter, "Ctrl+Shift+S"))
        m.addSeparator()
        m.addAction(reg("print", A("&Drucken...", self.drucken, "Ctrl+P", "print", tip="Drucken")))
        m.addAction(A("Drucker&einrichtung...", self.druckereinrichtung))
        m.addAction(A("Tabelle nach Excel exportieren (CSV)...", self.export_csv))
        m.addAction(A("Arbeitsblatt als Bild speichern...", self.export_bild))
        self.recent_menu = m.addMenu("Zuletzt geöffnet"); self._recent()
        m.addSeparator(); m.addAction(A("B&eenden", self.close, "Ctrl+Q"))

        m = mb.addMenu("&Bearbeiten")
        m.addAction(A("&Rückgängig", self.rueckgaengig, "Ctrl+Z"))
        m.addSeparator()
        m.addAction(A("&Ausschneiden", self.ausschneiden, "Ctrl+X")); m.addAction(A("&Kopieren", self.kopieren, "Ctrl+C"))
        m.addAction(A("&Einfügen", self.einfuegen, "Ctrl+V")); m.addAction(A("&Löschen", self.loeschen))
        m.addAction(A("&Drehen...", self.drehen))
        m.addSeparator()
        grp = QActionGroup(self)
        self.a_pfeil = reg("pfeil", A("&Objekte bearbeiten", lambda: self.set_mode("pfeil"), ic="arrow", checkable=True, tip="Objekte bearbeiten"))
        self.a_text = reg("text", A("&Text schreiben", lambda: self.set_mode("text"), ic="text", checkable=True, tip="Text schreiben"))
        for a in (self.a_pfeil, self.a_text): grp.addAction(a); m.addAction(a)
        self.a_pfeil.setChecked(True)
        m.addSeparator()
        m.addAction(reg("editsim", A("&Simulation bearbeiten", self.sim_bearbeiten, "F2", "editsim", tip="Simulation bearbeiten")))
        m.addAction(A("Simulation l&öschen", self.sim_loeschen))

        m = mb.addMenu("&Ansicht")
        self.a_tab = reg("tab", A("&Tabelle", self._toggle_tabelle, ic="table", checkable=True, tip="Tabelle"))
        self.a_sb = reg("sb", A("&Schaubild", self._toggle_schaubild, ic="chart", checkable=True, tip="Schaubild"))
        self.a_sb.setChecked(True)
        m.addActions([self.a_tab, self.a_sb]); m.addAction(A("S&onderzeichen", self.sonderzeichen))
        m.addSeparator()
        m.addAction(reg("play", A("Animation sta&rten", self.anim_start, ic="play", tip="Animation starten")))
        m.addAction(reg("pause", A("Animation an&halten", self.anim_pause, ic="pause", tip="Animation anhalten")))
        m.addAction(reg("stop", A("Animation &beenden", self.anim_stop, ic="stop", tip="Animation beenden")))
        m.addSeparator()
        self.a_sofort = A("sofort &anzeigen", lambda: None, checkable=True); self.a_sofort.setChecked(True)
        self.a_auto = A("a&utomatisch skalieren", lambda: None, checkable=True); self.a_auto.setChecked(True)
        m.addActions([self.a_sofort, self.a_auto])
        m.addSeparator()
        sub = m.addMenu("Darstellung"); g2 = QActionGroup(self); self.theme_actions = {}
        for key, label in (("klassisch", "Klassisch"), ("modern", "Modern")):
            a = A(label, lambda _=False, k=key: self.apply_theme(k), checkable=True); g2.addAction(a); sub.addAction(a); self.theme_actions[key] = a
        m.addAction(A("Vergrößern", lambda: self.blatt.set_zoom(self.blatt.zoom * 1.2), "Ctrl++"))
        m.addAction(A("Verkleinern", lambda: self.blatt.set_zoom(self.blatt.zoom / 1.2), "Ctrl+-"))
        m.addAction(A("An Fensterbreite anpassen", self._fit, "Ctrl+0"))

        m = mb.addMenu("&Einfügen")
        m.addAction(A("&Grafik...", self.grafik_einfuegen))
        m.addAction(A("&Bild aus Zwischenablage einfügen", self.bild_aus_zwischenablage))
        m.addSeparator()
        m.addAction(reg("newsim", A("&Neue Simulation", self.sim_neu, ic="newsim", tip="Neue Simulation")))
        m.addAction(reg("copysim", A("&Kopie der Simulation", self.sim_kopie, ic="copysim", tip="Kopie der Simulation")))

        m = mb.addMenu("&Format")
        m.addAction(A("&Text...", self.format_text)); m.addAction(A("&Grafik...", self.format_grafik))
        m.addAction(A("&Zahlen an Achsen...", self.format_achszahlen))
        self.a_leg = A("&Legende", self._toggle_legende, checkable=True); m.addAction(self.a_leg)
        m.addAction(A("&Schaubild...", self.format_schaubild)); m.addAction(A("Zahlen in Ta&belle...", self.format_tabelle))

        m = mb.addMenu("&Hilfe")
        m.addAction(A("&Bedienung", lambda: HilfeDialog(self).exec(), "F1")); m.addAction(A("&Info über...", self.info))

        tb = QToolBar("Werkzeuge"); tb.setMovable(False); self.addToolBar(tb); self.tb = tb
        for k in ("open", "save", "print", None, "newsim", "copysim", "editsim", None, "sb", "tab", None, "play", "stop", "pause", None, "pfeil", "text", None):
            tb.addSeparator() if k is None else tb.addAction(self.acts[k])
        self.stil_acts = {}
        for key, ic, tip in (("fett", "bold", "fett"), ("kursiv", "italic", "kursiv"), ("unter", "underline", "unterstrichen"),
                             ("hoch", "super", "hochgestellt"), ("tief", "sub", "tiefgestellt")):
            a = A(tip, lambda _=False, k=key: self._stil(k), ic=ic, checkable=True, tip=tip); self.stil_acts[key] = a; self.acts[key] = a; tb.addAction(a)
        self.font_size = QComboBox(); self.font_size.addItems(["8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "36"])
        self.font_size.setCurrentText("12"); self.font_size.setEditable(True); self.font_size.setFixedWidth(64)
        self.font_size.setToolTip("Schriftgröße"); self.font_size.textActivated.connect(self._font_geaendert)
        self.font_name = QComboBox(); self.font_name.setFixedWidth(170); self.font_name.setToolTip("Schriftart")
        fam = QFontDatabase.families(); self.font_name.addItems(fam if "Arial" in fam else ["Arial"] + list(fam))
        self.font_name.setCurrentText("Arial"); self.font_name.textActivated.connect(self._font_geaendert)
        tb.addWidget(self.font_size); tb.addWidget(self.font_name)

    def apply_theme(self, key):
        key = key if key in THEMES else "klassisch"
        self.theme = key; th = THEMES[key]; app = QApplication.instance()
        app.setStyle(QStyleFactory.create(th["style"]) or QStyleFactory.create("Fusion"))
        pal = QPalette()
        for role, col in ((QPalette.Window, "bg"), (QPalette.Button, "bg"), (QPalette.Base, "base"), (QPalette.WindowText, "text"),
                          (QPalette.Text, "text"), (QPalette.ButtonText, "text"), (QPalette.Highlight, "accent"),
                          (QPalette.ToolTipBase, "base"), (QPalette.ToolTipText, "text")):
            pal.setColor(role, QColor(th[col]))
        pal.setColor(QPalette.HighlightedText, QColor("#ffffff"))
        app.setPalette(pal); app.setStyleSheet(th["qss"]); app.setFont(QFont(*th["font"]))
        for a in self.acts.values():
            if a.data(): a.setIcon(icon(a.data(), th["icon"]))
        self.theme_actions[key].setChecked(True); self.settings.setValue("darstellung", key)

    def eventFilter(self, obj, ev):
        if obj is self.scroll.viewport() and ev.type() == QEvent.Resize and self.blatt.auto_zoom:
            QTimer.singleShot(0, self._fit)
        return super().eventFilter(obj, ev)

    def _fit(self):
        w = self.scroll.viewport().width()
        self.blatt.set_zoom(max(1.0, min(2.6, (w - 4) / (SEITE[0] * PX_CM))), auto=True)

    # ================================================= Dokument
    @property
    def sim(self):
        return self.sims[self.aktiv] if self.sims else None

    def merke(self):
        """Zustand fuer 'Rueckgaengig' festhalten."""
        self.undo.append((copy.deepcopy(self.sheet["objekte"]), copy.deepcopy(self.sims), self.aktiv,
                          copy.deepcopy(self.spec), copy.deepcopy(self.makros), list(self.kurven_info)))
        del self.undo[:-25]
        self.dirty = True; self._titel()

    def rueckgaengig(self):
        if not self.undo:
            self.statusBar().showMessage("Nichts rückgängig zu machen.", 3000); return
        self.sheet["objekte"], self.sims, self.aktiv, self.spec, self.makros, self.kurven_info = self.undo.pop()
        self.runner = None; self.blatt.sel = None; self._refresh()

    def _frage_speichern(self):
        if not self.dirty: return True
        r = QMessageBox.question(self, APP, "Sollen die Änderungen gespeichert werden?",
                                 QMessageBox.Yes | QMessageBox.No | QMessageBox.Cancel)
        if r == QMessageBox.Cancel: return False
        if r == QMessageBox.Yes: return self.speichern()
        return True

    def closeEvent(self, e):
        e.accept() if self._frage_speichern() else e.ignore()

    def neu(self, _=False, frage=True):
        if frage and not self._frage_speichern(): return
        self.anim_stop()
        self.sheet = core.new_sheet(); self.sims = []; self.aktiv = 0; self.makros = {}; self.spec = spec_neu()
        self.path = None; self.undo = []; self.runner = None; self.kurven_info = []; self.dirty = False
        self.blatt.sel = None; self._refresh()

    def oeffnen(self):
        if not self._frage_speichern(): return
        fn, _ = QFileDialog.getOpenFileName(self, "Öffnen", self.settings.value("ordner", ""), "Modelle (*.prg *.PRG *.json);;Alle Dateien (*)")
        if fn: self.open_file(fn)

    def beispiel(self):
        if not self._frage_speichern(): return
        ordner = os.path.join(HIER, "beispiele_claude")
        fn, _ = QFileDialog.getOpenFileName(self, "Beispiel öffnen", ordner if os.path.isdir(ordner) else HIER, "Modelle (*.prg *.PRG *.json)")
        if fn: self.open_file(fn)

    def open_file(self, fn):
        try:
            if fn.lower().endswith(".json"):
                d = core.from_json(json.load(open(fn, encoding="utf-8")))
                sheet, sims, aktiv = d["sheet"], d["simulationen"], d.get("aktive_simulation", 0)
                makros = d.get("makros", {}); spec = dict(spec_neu(), **d.get("spec", {}))
                if "achsentitel" not in d.get("spec", {}): spec["achsentitel"] = achsentitel_standard(sheet)
                for k in ("farbe", "fenster"): spec[k] = tuple(spec[k])
                for k in ("xa", "ya", "za"): spec[k]["hfarbe"] = tuple(spec[k]["hfarbe"])
            else:
                d = core.parse(fn); sheet = core.parse_sheet(d["_prefix"]); sims = d["simulationen"]
                aktiv = d["aktive_simulation"]; makros = {}; spec = self._spec_aus_blatt(sheet)
                einheiten_aus_titeln(sheet, sims)
            core.exponenten(sheet["objekte"])
        except Exception as e:
            QMessageBox.warning(self, APP, f"Die Datei konnte nicht gelesen werden:\n{e}"); return
        self.anim_stop()
        self.sheet, self.sims, self.makros, self.spec = sheet, sims, makros, spec
        self.aktiv = max(0, min(aktiv, len(sims) - 1)); self.path = fn; self.undo = []; self.runner = None; self.dirty = False
        self.blatt.sel = None
        self.kurven_info = self._kurven_aus_flags()
        ch = self._chart()
        if ch is not None and len(self.kurven_info) != sum(1 for k in ch["kids"] if k["k"] == "kurve"): self.kurven_info = []
        self.settings.setValue("ordner", os.path.dirname(fn)); self._merke_recent(fn)
        self._refresh()
        self.statusBar().showMessage(f"{os.path.basename(fn)} geöffnet", 4000)

    def _spec_aus_blatt(self, sheet):
        spec = spec_neu()
        ch = next((o for o in sheet["objekte"] if o["k"] == "chart"), None)
        if ch is not None:
            spec.update(pc=list(ch["pc"]), farbe=core.rgb(ch["farbe"]), legende=bool(ch["b2"]), timer=max(1, ch["timer"]))
            achsen = [ch["kids"][i] for i in ch["idx"] if i < len(ch["kids"]) and ch["kids"][i]["k"] == "achse"]
            for key, a in zip(("xa", "ya", "za"), achsen):
                ag = core.achse_get(a["tr"])
                if ag["bis"] > ag["von"] and ag["abstand"] > 0: spec[key] = ag
            spec["dreid_geladen"] = bool(ch["dreid"])
        spec["achsentitel"] = achsentitel_standard(sheet)
        return spec

    def speichern(self):
        if not self.path: return self.speichern_unter()
        return self._write(self.path)

    def speichern_unter(self):
        start = self.path or os.path.join(self.settings.value("ordner", ""), "modell_claude.prg")
        fn, filt = QFileDialog.getSaveFileName(self, "Speichern unter", start, "Moebius-Datei (*.prg);;Modellwerk-Datei (*.json)")
        if not fn: return False
        if "." not in os.path.basename(fn): fn += ".json" if "json" in filt else ".prg"
        return self._write(fn)

    def _write(self, fn):
        try:
            self._fix_sim_namen()
            if fn.lower().endswith(".json"):
                d = {"format": "modellwerk-2", "sheet": self.sheet, "simulationen": self.sims, "aktive_simulation": self.aktiv,
                     "makros": self.makros, "spec": self.spec}
                with open(fn, "w", encoding="utf-8") as fh: json.dump(core.to_json(d), fh, ensure_ascii=False)
            else:
                zuviel = any(s["wiederhole"] > core.MAX_ORIGINAL or any(len(v["werte"]) > core.MAX_ORIGINAL for v in s["variablen"]) for s in self.sims)
                if zuviel and not getattr(self, "_hinweis_original", False):
                    self._hinweis_original = True
                    QMessageBox.information(self, APP, f"Hinweis: Diese Datei enthält mehr als {core.MAX_ORIGINAL} Durchläufe.\n"
                                            "Modellwerk kann sie wieder öffnen, das Original-Moebius vermutlich nicht.")
                sims = [dict(s, programm=core.expand_makros(s["programm"], self.makros)) for s in self.sims] or [core.new_simulation("Simulation")]
                data = core.dump({"_prefix": core.dump_sheet(self.sheet), "simulationen": sims, "aktive_simulation": self.aktiv})
                with open(fn, "wb") as fh: fh.write(data)
        except Exception as e:
            QMessageBox.warning(self, APP, f"Speichern fehlgeschlagen:\n{e}"); return False
        self.path = fn; self.dirty = False; self._titel(); self._merke_recent(fn)
        self.statusBar().showMessage("Gespeichert", 3000)
        return True

    def _merke_recent(self, fn):
        r = [x for x in (self.settings.value("zuletzt", []) or []) if x != fn]
        if isinstance(r, str): r = [r]
        self.settings.setValue("zuletzt", [fn] + r[:5]); self._recent()

    def _recent(self):
        self.recent_menu.clear()
        r = self.settings.value("zuletzt", []) or []
        if isinstance(r, str): r = [r]
        for fn in r:
            if os.path.exists(fn):
                self.recent_menu.addAction(os.path.basename(fn), lambda f=fn: self._frage_speichern() and self.open_file(f))

    def _titel(self):
        self.setWindowTitle(f"{os.path.basename(self.path) if self.path else 'Unbenannt'}{' *' if self.dirty else ''} - {APP}")

    def _refresh(self):
        """Alles nach dem aktuellen Dokument neu aufbauen."""
        self.sim_box.blockSignals(True); self.sim_box.clear(); self.sim_box.addItems([s["name"] for s in self.sims])
        if self.sims: self.sim_box.setCurrentIndex(self.aktiv)
        self.sim_box.blockSignals(False)
        self.a_leg.setChecked(bool(self.spec["legende"]))
        self.dreid.blockSignals(True); self.dreid.setChecked(bool(self.spec.pop("dreid_geladen", self.dreid.isChecked() and bool(self.sims)))); self.dreid.blockSignals(False)
        self._listen(); self._tabelle(); self._titel(); self.blatt.anpassen()

    def _listen(self):
        s = self.sim
        namen = [v["name"] for v in s["variablen"]] if s else []
        self.x_box.clear(); self.x_box.addItems(namen); self.y_box.clear(); self.y_box.addItems(namen); self.y_list.clear(); self.y_list.addItems(namen)
        if s:
            def finde(n):
                return next((i for i, x in enumerate(namen) if x.upper() == n.upper()), -1)
            ix = finde(s["x_achse"])
            if ix < 0: ix = next((i for i, x in enumerate(namen) if x.upper() in ("ZEIT", "T")), 0)
            if namen: self.x_box.setCurrentIndex(ix)
            iy = finde(s["y_achse"])
            if iy >= 0: self.y_box.setCurrentIndex(iy)
            for i, v in enumerate(s["variablen"]):
                if v["flag_a"]: self.y_list.item(i).setSelected(True)
        self._achsen_ui()
        self.weiter_btn.setEnabled(bool(s))

    def _achsen_ui(self):
        d3 = self.dreid.isChecked()
        self.y_box.setVisible(d3); self.z_label.setVisible(d3); self.y_label.setVisible(True)
        self.getrennt.setEnabled(not d3)

    def _tabelle(self):
        s = self.sim
        if not s: self.model.set([]); return
        x = s["x_achse"].upper()
        vs = [v for v in s["variablen"] if v["werte"]]
        vs.sort(key=lambda v: 0 if v["name"].upper() == x else 1)
        self.model.set(vs)
        for i, v in enumerate(vs): self.tabelle.setColumnWidth(i, max(64, min(200, v["_attr4"][2] + 30)))

    def _fix_sim_namen(self):
        mehrere = len(self.sims) > 1
        for s in self.sims:
            for v in s["variablen"]: v["simulation"] = s["name"] if mehrere else ""

    # ================================================= Simulationen
    def _sim_gewaehlt(self, i):
        if 0 <= i < len(self.sims):
            self.aktiv = i; self.runner = None; self._listen(); self._tabelle()

    def sim_neu(self):
        s = core.new_simulation(f"Simulation {len(self.sims) + 1}")
        self._sim_dialog(s, neu=True)

    def sim_kopie(self):
        if not self.sim: return self.sim_neu()
        s = copy.deepcopy(self.sim); s["name"] += " (Kopie)"
        self._sim_dialog(s, neu=True)

    def sim_bearbeiten(self):
        if not self.sim: return self.sim_neu()
        self._sim_dialog(self.sim, neu=False)

    def sim_loeschen(self):
        if not self.sim: return
        if QMessageBox.question(self, APP, f"Simulation \"{self.sim['name']}\" löschen?") != QMessageBox.Yes: return
        self.merke(); del self.sims[self.aktiv]; self.aktiv = max(0, self.aktiv - 1); self.runner = None
        self._fix_sim_namen(); self._refresh()
        if self.sims: self.rebuild()

    def _sim_dialog(self, s, neu):
        d = AlgoDialog(self, s, self.makros, len(self.sims) + (1 if neu else 0) > 1)
        if not d.exec(): return
        self.merke(); self.makros = d.makros
        if neu: self.sims.append(d.sim); self.aktiv = len(self.sims) - 1
        else: self.sims[self.aktiv] = d.sim
        self._fix_sim_namen()
        ok = self.rechnen(neu=True)
        self._refresh()
        if ok and self.a_sofort.isChecked():
            s = self.sim
            if not any(v["flag_a"] for v in s["variablen"]):
                namen = [v["name"] for v in s["variablen"]]
                xn = self.x_box.currentText()
                erst = next((v for v in s["variablen"] if v["name"] != xn and len(set(v["werte"][:60])) > 1), None)
                if erst: self.y_list.item(namen.index(erst["name"])).setSelected(True)
            self.anzeigen(merken=False)

    def rechnen(self, neu=True, schritte=None):
        s = self.sim
        if not s: return False
        try:
            if neu or self.runner is None or self.runner_sim is not s:
                self.runner = core.Runner(dict(s, programm=core.expand_makros(s["programm"], self.makros))); self.runner_sim = s
            n = schritte or s["wiederhole"]
            prog = QProgressDialog("Bitte warten...", "Abbrechen", 0, n, self) if n > 1500 else None
            if prog: prog.setWindowModality(Qt.WindowModal); prog.setMinimumDuration(400)
            done = 0
            while done < n:
                k = min(400, n - done); self.runner.step(k); done += k
                if prog:
                    prog.setValue(done)
                    if prog.wasCanceled(): break
            if prog: prog.close()
        except ZeroDivisionError:
            QMessageBox.warning(self, APP, "Division durch Null im Programm.")
        except (OverflowError, ValueError) as e:
            QMessageBox.warning(self, APP, f"Rechenfehler (Wert zu groß oder Funktion nicht definiert):\n{e}")
        except TypeError:
            QMessageBox.warning(self, APP, "Unbekannte Funktion im Programm."); self.runner = None; return False
        except Exception as e:
            QMessageBox.warning(self, APP, f"Fehler im Programm:\n{e}"); self.runner = None; return False
        self.statusBar().showMessage(f"{len(s['variablen'][0]['werte']) if s['variablen'] else 0} Werte berechnet", 4000)
        return True

    def weiter_rechnen(self):
        s = self.sim
        if not s: return
        vorhanden = max((len(v["werte"]) for v in s["variablen"]), default=0)
        frei = core.MAX_WERTE - vorhanden
        if frei <= 0:
            QMessageBox.information(self, APP, f"Es sind schon {core.MAX_WERTE} Werte berechnet (Maximum)."); return
        n, ok = QInputDialog.getInt(self, "Weiter rechnen", "Anzahl weiterer Durchläufe:", min(s["wiederhole"], frei), 1, frei)
        if not ok: return
        self.merke()
        if self.runner is None or self.runner_sim is not s:
            # Fortsetzung einer geladenen Simulation: Rechnung bis zum gespeicherten Stand wiederholen
            self.runner = core.Runner(dict(s, programm=core.expand_makros(s["programm"], self.makros))); self.runner_sim = s
            try: self.runner.step(vorhanden)
            except Exception as e:
                QMessageBox.warning(self, APP, f"Fehler im Programm:\n{e}"); self.runner = None; return
        self.rechnen(neu=False, schritte=n); self._tabelle(); self.rebuild()

    # ================================================= Schaubild
    def _chart(self):
        return next((o for o in self.sheet["objekte"] if o["k"] == "chart"), None)

    def _kurven_aus_flags(self):
        """Welche Groessen gehoeren ins Schaubild? Markierte Groessen aller Simulationen mit derselben x-Achse."""
        s = self.sim
        if not s: return []
        x = s["x_achse"].upper(); out = []
        for si, t in enumerate(self.sims):
            if t is s or t["x_achse"].upper() == x:
                out += [(si, v["name"]) for v in t["variablen"] if v["flag_a"]]
        return out

    def anzeigen(self, _=False, merken=True):
        s = self.sim
        if not s:
            QMessageBox.information(self, APP, "Es gibt noch keine Simulation.\nMenü Einfügen → Neue Simulation."); return
        gewaehlt = {it.text() for it in self.y_list.selectedItems()}
        if not gewaehlt:
            QMessageBox.information(self, APP, "Bitte mindestens eine Größe für die Hochachse markieren."); return
        if not any(v["werte"] for v in s["variablen"]) and not self.rechnen(neu=True): return
        if merken: self.merke()
        s["x_achse"] = self.x_box.currentText(); s["y_achse"] = self.y_box.currentText() if self.dreid.isChecked() else s["y_achse"]
        for v in s["variablen"]:
            v["flag_a"] = 1 if v["name"] in gewaehlt else 0
            v["flag_b"] = 1 if v["flag_a"] or v["name"] == s["x_achse"] else v["flag_b"]
        self.rebuild(); self._tabelle()

    def rebuild(self):
        """Schaubild(er) und Legende aus den markierten Groessen neu aufbauen."""
        s = self.sim
        if not s: return
        info = self._kurven_aus_flags(); d3 = self.dreid.isChecked()
        kurven = []
        for nr, (si, name) in enumerate(info):
            t = self.sims[si]; vs = {v["name"]: v for v in t["variablen"]}
            v = vs[name]; core.kurve_init(v, nr)
            xv = next((w for w in t["variablen"] if w["name"].upper() == t["x_achse"].upper()), None)
            yv = next((w for w in t["variablen"] if w["name"].upper() == t["y_achse"].upper()), None)
            if xv is None or not v["werte"]: continue
            ku = {"name": name + (f" [{t['name']}]" if len(self.sims) > 1 else ""), "x": xv["werte"], "y": v["werte"], "k": core.kurve_get(v), "info": (si, name)}
            if d3:
                if yv is None: continue
                ku.update(y=yv["werte"], z=v["werte"])
            kurven.append(ku)
        sp = self.spec
        def skala(key, werte, andere=None):
            a = sp[key]
            w = [x for x in werte if math.isfinite(x)]
            if self.a_auto.isChecked() and a["auto"] and w:
                a["von"], a["bis"], a["abstand"] = core.auto_skala(min(w), max(w))
            return a
        charts = []
        opt = {"pc": sp["pc"], "farbe": sp["farbe"], "legende": sp["legende"], "timer": sp["timer"], "nach": sp["nach"], "norm": sp["norm"]}
        mit_titel = sp.get("achsentitel", True) is not False
        sims_im_bild = list(dict.fromkeys(k["info"][0] for k in kurven))
        x_titel = achsen_titel(self.sims, [(si, self.sims[si]["x_achse"]) for si in sims_im_bild])
        if d3:
            xa = skala("xa", [x for k in kurven for x in k["x"]]); ya = skala("ya", [x for k in kurven for x in k["y"]])
            za = skala("za", [x for k in kurven for x in k["z"]])
            o = dict(opt, titel={"x": x_titel, "y": achsen_titel(self.sims, [(si, self.sims[si]["y_achse"]) for si in sims_im_bild]),
                                 "z": achsen_titel(self.sims, [k["info"] for k in kurven])} if mit_titel else None)
            charts.append(core.build_chart3d(kurven, xa, ya, za, o, draw.measure))
        else:
            gruppen = [[k] for k in kurven] if self.getrennt.isChecked() and len(kurven) > 1 else [kurven]
            for gi, gr in enumerate(gruppen):
                xa = skala("xa", [x for k in kurven for x in k["x"]])
                ya = dict(sp["ya"]) if len(gruppen) > 1 else sp["ya"]
                w = [x for k in gr for x in k["y"] if math.isfinite(x)]
                if self.a_auto.isChecked() and ya["auto"] and w: ya["von"], ya["bis"], ya["abstand"] = core.auto_skala(min(w), max(w))
                xa2 = dict(xa); ya2 = dict(ya)
                if xa["auto"] and self.a_auto.isChecked(): xa2["lage"] = ya2["von"]; xa["lage"] = ya2["von"]
                if ya["auto"] and self.a_auto.isChecked(): ya2["lage"] = xa2["von"]; ya["lage"] = xa2["von"]
                o = dict(opt, titel={"x": x_titel, "y": achsen_titel(self.sims, [k["info"] for k in gr])} if mit_titel else None)
                if len(gruppen) > 1:
                    h = sp["pc"][3] / len(gruppen)
                    o["pc"] = [sp["pc"][0], sp["pc"][1] + gi * h, sp["pc"][2], h - 2]
                charts.append(core.build_chart(gr, xa2, ya2, o, draw.measure))
        if not getattr(self, "_seite_fix", False):
            for c in charts: c["pc"] = [int(round(x)) for x in c["pc"]]
        rest = [o for o in self.sheet["objekte"] if o["k"] not in ("chart", "legende")]
        leg = core.build_legende(kurven, draw.measure) if sp["legende"] else []
        self.sheet["objekte"] = charts + rest + leg
        self.kurven_info = [k["info"] for k in kurven] if len(charts) == 1 else []
        self.blatt.sel = None; self.blatt.anpassen(); self.dirty = True; self._titel()

    def objekt_bewegt(self, i, resize):
        o = self.sheet["objekte"][i]
        if o["k"] == "chart":
            g = o["g"]; pc = [round(g[0] / 16 * 100), round(g[1] / 12 * 100), round(g[2] / 16 * 100), round(g[3] / 12 * 100)]
            self.spec["pc"] = [int(max(0, x)) for x in pc]; o["pc"] = list(self.spec["pc"])
            if resize:
                if self.sim and self._kurven_aus_flags(): self.rebuild()
                else: self.statusBar().showMessage("Größe wird beim nächsten \"Anzeigen\" übernommen.", 4000)

    def objekt_dialog(self, i, teil):
        o = self.sheet["objekte"][i]
        if o["k"] == "chart":
            if teil.startswith("kurve:"): self.kurve_dialog(o, int(teil[6:]))
            elif teil.startswith("achse:"): self.achse_dialog(o, int(teil[6:]))
            else: self.format_schaubild()
        elif o["k"] == "text": self.blatt.start_edit(o)
        elif o["k"] == "bild": self.blatt.sel = i; self.format_grafik()
        elif o["k"] == "legende": self.format_schaubild()

    def kurve_dialog(self, chart, kid):
        nr = sum(1 for k in chart["kids"][:kid] if k["k"] == "kurve")
        if chart is not self._chart() or nr >= len(self.kurven_info):
            QMessageBox.information(self, APP, "Diese Kurve lässt sich keiner Größe zuordnen.\nBitte zuerst auf \"Anzeigen\" klicken."); return
        si, name = self.kurven_info[nr]
        v = next(w for w in self.sims[si]["variablen"] if w["name"] == name)
        d = KurvenDialog(self, core.kurve_get(v), v["animationsbild_hex"])
        if d.exec():
            self.merke(); core.kurve_set(v, d.k); v["animationsbild_hex"] = d.bild_hex; self.rebuild()

    def achse_dialog(self, chart, kid):
        pos = chart["idx"].index(kid) if kid in chart["idx"] else 0
        key = ("xa", "ya", "za")[min(pos, 2)]
        d = AchseDialog(self, self.spec[key], ("x-Achse", "y-Achse", "z-Achse")[min(pos, 2)])
        if d.exec():
            self.merke(); self.spec[key] = d.a; self.rebuild()

    def format_schaubild(self):
        d = SchaubildDialog(self, self.spec)
        if d.exec():
            self.merke(); self.spec = d.spec; self.a_leg.setChecked(self.spec["legende"])
            if self.sim and self._kurven_aus_flags(): self.rebuild()
            self.blatt.update()

    def format_achszahlen(self):
        d = ZahlenformatDialog(self, self.spec["nach"] if self.spec["nach"] is not None else 2, self.spec["norm"])
        if d.exec():
            self.merke(); self.spec["nach"] = d.nach.value(); self.spec["norm"] = d.norm.isChecked(); self.rebuild()

    def format_tabelle(self):
        idx = self.tabelle.currentIndex()
        vs = [self.model.vars[idx.column()]] if idx.isValid() else list(self.model.vars)
        if not vs:
            QMessageBox.information(self, APP, "Die Tabelle enthält noch keine Werte."); return
        d = ZahlenformatDialog(self, vs[0]["_attr4"][1]); d.norm.hide()
        if d.exec():
            self.merke()
            for v in vs: v["_attr4"] = [v["_attr4"][0], d.nach.value(), v["_attr4"][2]]
            self._tabelle()

    def _toggle_legende(self):
        self.merke(); self.spec["legende"] = self.a_leg.isChecked()
        if self.sim and self._kurven_aus_flags(): self.rebuild()
        else:
            if not self.spec["legende"]: self.sheet["objekte"] = [o for o in self.sheet["objekte"] if o["k"] != "legende"]
            self.blatt.update()

    def _toggle_tabelle(self):
        self.tabelle.setVisible(self.a_tab.isChecked())
        if not self.a_tab.isChecked() and not self.a_sb.isChecked(): self.a_sb.setChecked(True); self.scroll.show()
        if self.a_tab.isChecked() and self.a_sb.isChecked():
            h = max(300, self.left.height()); self.left.setSizes([int(h * 0.62), int(h * 0.38)])

    def _toggle_schaubild(self):
        self.scroll.setVisible(self.a_sb.isChecked())
        if not self.a_sb.isChecked() and not self.a_tab.isChecked(): self.a_tab.setChecked(True); self.tabelle.show()

    def _tabmenu(self, pos):
        m = QMenu(self)
        m.addAction("Kopieren", self._tab_kopieren); m.addAction("Nach Excel exportieren (CSV)...", self.export_csv)
        m.addAction("Format...", self.format_tabelle)
        m.exec(self.tabelle.viewport().mapToGlobal(pos))

    def _tab_kopieren(self):
        sel = self.tabelle.selectionModel().selectedIndexes()
        if not sel: return
        rows = sorted({i.row() for i in sel}); cols = sorted({i.column() for i in sel})
        text = "\t".join(self.model.vars[c]["name"] for c in cols) + "\n"
        text += "\n".join("\t".join(self.model.data(self.model.index(r, c)) or "" for c in cols) for r in rows)
        QGuiApplication.clipboard().setText(text)

    # ================================================= Animation
    def anim_zustand(self, chart, t):
        """Fuer jeden Kurven-Index: bis wohin zeichnen (-1 = gar nicht), dazu Marken (x, y, Bild, Farbe)."""
        kb, marker = {}, []
        kids = [(ci, c) for ci, c in enumerate(chart["kids"]) if c["k"] == "kurve"]
        punkte = draw.kurven_punkte(chart)
        params = []
        for nr, (ci, c) in enumerate(kids):
            k = None; hx = ""
            if nr < len(self.kurven_info):
                si, name = self.kurven_info[nr]
                v = next((w for w in self.sims[si]["variablen"] if w["name"] == name), None)
                if v: k = core.kurve_get(v); hx = v["animationsbild_hex"]
            params.append((k, hx))
        keine = not any(k and k["ani"] for k, _ in params)
        fertig = True
        for nr, (ci, c) in enumerate(kids):
            k, hx = params[nr]
            pts = punkte[nr] if nr < len(punkte) else []
            n = len(pts)
            if n == 0: continue
            an = keine or (k and k["ani"])
            if not an: continue
            typ = k["anityp"] if k and not keine else 0
            stil = k["kurvenstil"] if k and not keine else 2
            if typ == 1: i = t % n; fertig = False
            elif typ == 2:
                i = t % (2 * n - 2) if n > 1 else 0; i = i if i < n else 2 * n - 2 - i; fertig = False
            else:
                i = min(t, n - 1)
                if t < n - 1: fertig = False
            kb[ci] = -1 if stil == 0 else (None if stil == 1 else i)
            farbe = k["farbe"] if k else (0, 0, 200)
            marker.append((pts[i][0], pts[i][1], bild_aus_hex(hx), farbe))
        self._anim_fertig = fertig
        return kb, marker

    def anim_start(self):
        ch = self._chart()
        if ch is None or not any(draw.kurven_punkte(ch)):
            QMessageBox.information(self, APP, "Es gibt noch keine Kurve, die animiert werden kann."); return
        if self.blatt.anim is None: self.anim_t = 0
        self.blatt.anim = self.anim_t; self._anim_fertig = False
        n = max(len(p) for p in draw.kurven_punkte(ch))
        self._anim_schritt = max(1, n // 1500)
        self.anim_timer.start(max(5, self.spec["timer"]))

    def anim_pause(self):
        self.anim_timer.stop()

    def anim_stop(self):
        self.anim_timer.stop(); self.blatt.anim = None; self.anim_t = 0; self.blatt.update()

    def _anim_tick(self):
        self.anim_t += self._anim_schritt; self.blatt.anim = self.anim_t; self.blatt.repaint()
        if getattr(self, "_anim_fertig", False): self.anim_timer.stop()

    # ================================================= Objekte auf dem Blatt
    def set_mode(self, mode):
        self.blatt.commit_edit(); self.blatt.mode = mode
        self.blatt.setCursor(Qt.IBeamCursor if mode == "text" else Qt.ArrowCursor)
        (self.a_text if mode == "text" else self.a_pfeil).setChecked(True)

    def _sel(self, arten=None):
        i = self.blatt.sel
        if i is None or i >= len(self.sheet["objekte"]): return None
        o = self.sheet["objekte"][i]
        return o if arten is None or o["k"] in arten else None

    def auswahl_geaendert(self):
        o = self._sel(("text",))
        if o:
            st = draw.text_style(o)
            for k, a in self.stil_acts.items(): a.setChecked(bool(st.get(k)))
            self.font_size.setCurrentText(f"{o['size']:g}"); self.font_name.setCurrentText(o["font"])

    def text_fertig(self, obj, pos, text):
        text = text.strip()
        if obj is None:
            if not text: return
            self.merke()
            try: size = float(self.font_size.currentText().replace(",", "."))
            except ValueError: size = 12.0
            o = core.mk_text(text, pos[0], pos[1], size, self.font_name.currentText(), draw.measure, nutzer=True)
            st = {k: True for k, a in self.stil_acts.items() if a.isChecked()}
            if st: o["stil_claude"] = st
            self.sheet["objekte"].append(o); self.blatt.sel = len(self.sheet["objekte"]) - 1
        else:
            self.merke()
            if not text: self.sheet["objekte"] = [x for x in self.sheet["objekte"] if x is not obj]; self.blatt.sel = None
            else: core.set_text(obj, text, draw.measure)
        self.blatt.anpassen()

    def _stil(self, key):
        o = self._sel(("text",))
        if key == "hoch" and self.stil_acts["hoch"].isChecked(): self.stil_acts["tief"].setChecked(False)
        if key == "tief" and self.stil_acts["tief"].isChecked(): self.stil_acts["hoch"].setChecked(False)
        if o:
            self.merke(); o["stil_claude"] = {k: True for k, a in self.stil_acts.items() if a.isChecked()}; self.blatt.update()

    def _font_geaendert(self, _=None):
        o = self._sel(("text",))
        if not o: return
        try: size = float(self.font_size.currentText().replace(",", "."))
        except ValueError: return
        self.merke(); o["font"] = self.font_name.currentText(); o["size"] = size
        core.set_text(o, core.text_of(o), draw.measure); self.blatt.update()

    def format_text(self):
        o = self._sel(("text",))
        if not o:
            QMessageBox.information(self, APP, "Bitte zuerst einen Text auf dem Arbeitsblatt anklicken."); return
        st = draw.text_style(o)
        f = QFont(o["font"]); f.setPointSizeF(o["size"]); f.setBold(bool(st.get("fett"))); f.setItalic(bool(st.get("kursiv"))); f.setUnderline(bool(st.get("unter")))
        ok, f = QFontDialog.getFont(f, self, "Schrift")
        if ok:
            self.merke(); o["font"] = f.family(); o["size"] = float(f.pointSizeF() if f.pointSizeF() > 0 else o["size"])
            st = dict(st, fett=f.bold(), kursiv=f.italic(), unter=f.underline()); o["stil_claude"] = {k: v for k, v in st.items() if v}
            core.set_text(o, core.text_of(o), draw.measure); self.auswahl_geaendert(); self.blatt.update()

    def format_grafik(self):
        o = self._sel(("bild",))
        if not o:
            QMessageBox.information(self, APP, "Bitte zuerst eine Grafik auf dem Arbeitsblatt anklicken."); return
        alt = copy.deepcopy(o)
        d = BildDialog(self, o)
        if d.exec():
            neu = copy.deepcopy(o); o.clear(); o.update(alt); self.merke(); o.clear(); o.update(neu); self.blatt.anpassen()
        else:
            o.clear(); o.update(alt)

    def _bild_objekt(self, img, x=1.0, y=1.0):
        w = img.width() / PX_CM; h = img.height() / PX_CM
        if w > 14: h *= 14 / w; w = 14.0
        return {"k": "bild", "g": [x, y, w, h], "a0": 0, "ext": b"bmp", "data": image_bytes(img), "tr": bytes(6)}

    def grafik_einfuegen(self):
        fn, _ = QFileDialog.getOpenFileName(self, "Grafik einfügen", "", "Grafiken (*.bmp *.png *.jpg *.jpeg *.gif)")
        if not fn: return
        img = QImage(fn)
        if img.isNull():
            QMessageBox.warning(self, APP, "Die Grafik konnte nicht gelesen werden."); return
        self.merke(); self.sheet["objekte"].append(self._bild_objekt(img)); self.blatt.sel = len(self.sheet["objekte"]) - 1; self.blatt.anpassen()

    def bild_aus_zwischenablage(self):
        img = QGuiApplication.clipboard().image()
        if img.isNull():
            QMessageBox.information(self, APP, "Die Zwischenablage enthält kein Bild."); return
        self.merke(); self.sheet["objekte"].append(self._bild_objekt(img)); self.blatt.sel = len(self.sheet["objekte"]) - 1; self.blatt.anpassen()

    def kopieren(self):
        o = self._sel()
        if o: self.clip = copy.deepcopy(o); self.statusBar().showMessage("Kopiert", 2000)

    def ausschneiden(self):
        if self._sel(): self.kopieren(); self.loeschen()

    def einfuegen(self):
        if self.clip is None: return self.bild_aus_zwischenablage()
        self.merke(); o = copy.deepcopy(self.clip); o["g"][0] += 0.5; o["g"][1] += 0.5
        if o["k"] == "chart": self.sheet["objekte"].insert(1 if self._chart() is not None else 0, o)
        else: self.sheet["objekte"].append(o)
        self.blatt.sel = self.sheet["objekte"].index(o); self.blatt.anpassen()

    def loeschen(self):
        o = self._sel()
        if not o: return
        self.merke(); self.sheet["objekte"] = [x for x in self.sheet["objekte"] if x is not o]
        if o["k"] == "chart": self.sheet["objekte"] = [x for x in self.sheet["objekte"] if x["k"] != "legende"]; self.kurven_info = []
        self.blatt.sel = None; self.blatt.anpassen()

    def drehen(self):
        o = self._sel(("text",))
        if not o:
            QMessageBox.information(self, APP, "Drehen ist für Texte möglich. Bitte zuerst einen Text anklicken."); return
        d = WinkelDialog(self, o["winkel"] / 10.0)
        if d.exec(): self.merke(); o["winkel"] = int(round(d.winkel * 10)) % 3600; self.blatt.update()

    def kontext(self, i, teil, pos):
        m = QMenu(self)
        if i is None:
            m.addAction("Neue Simulation", self.sim_neu); m.addAction("Simulation bearbeiten", self.sim_bearbeiten)
            m.addAction("Einfügen", self.einfuegen); m.addAction("Schaubild...", self.format_schaubild)
        else:
            o = self.sheet["objekte"][i]
            if o["k"] == "chart":
                if teil.startswith("kurve:"): m.addAction("Kurven-Parameter...", lambda: self.kurve_dialog(o, int(teil[6:])))
                if teil.startswith("achse:"): m.addAction("Achse...", lambda: self.achse_dialog(o, int(teil[6:])))
                m.addAction("Eigenschaften des Schaubilds...", self.format_schaubild)
                m.addAction("Zahlen an Achsen...", self.format_achszahlen)
            elif o["k"] == "text":
                m.addAction("Text ändern", lambda: self.blatt.start_edit(o)); m.addAction("Schrift...", self.format_text); m.addAction("Drehen...", self.drehen)
            elif o["k"] == "bild":
                m.addAction("Grafik...", self.format_grafik)
            m.addSeparator(); m.addAction("Ausschneiden", self.ausschneiden); m.addAction("Kopieren", self.kopieren); m.addAction("Löschen", self.loeschen)
        m.exec(pos)

    def sonderzeichen(self):
        if self.sonder is None:
            self.sonder = SonderzeichenDialog(self); self.sonder.gewaehlt.connect(self._sonder_ein)
        self.sonder.show(); self.sonder.raise_()

    def _sonder_ein(self, ch):
        if self.blatt.edit is not None: self.blatt.edit.insert(ch); self.blatt.edit.setFocus()
        else:
            QGuiApplication.clipboard().setText(ch); self.statusBar().showMessage(f"\"{ch}\" in die Zwischenablage kopiert (zuerst mit dem Text-Werkzeug auf das Blatt klicken, um direkt einzufügen)", 5000)

    # ================================================= Ausgabe
    def blatt_bild(self, s=80.0, farbe=True):
        w, h = self.blatt.groesse()
        b = [draw.bounds(o) for o in self.sheet["objekte"]]
        if b: w = max(x[0] + x[2] for x in b) + 0.3; h = max(x[1] + x[3] for x in b) + 0.3
        img = QImage(int(w * s), int(h * s), QImage.Format_RGB32); img.fill(QColor(255, 255, 255))
        p = QPainter(img); p.setRenderHint(QPainter.Antialiasing); p.setRenderHint(QPainter.TextAntialiasing)
        alt = [(o, o["farbe"]) for o in self.sheet["objekte"] if o["k"] == "chart"]
        if not farbe:
            for o, _ in alt: o["farbe"] = core.farbe_bytes(255, 255, 255)
        self.blatt.male(p, s); p.end()
        for o, f in alt: o["farbe"] = f
        return img

    def export_bild(self):
        fn, _ = QFileDialog.getSaveFileName(self, "Arbeitsblatt als Bild speichern", "arbeitsblatt_claude.png", "PNG (*.png)")
        if fn: self.blatt_bild().save(fn)

    def export_csv(self):
        vs = self.model.vars
        if not vs:
            QMessageBox.information(self, APP, "Es gibt noch keine Werte."); return
        fn, _ = QFileDialog.getSaveFileName(self, "Nach Excel exportieren", "werte_claude.csv", "CSV (*.csv)")
        if not fn: return
        with open(fn, "w", encoding="utf-8-sig") as fh:
            fh.write(";".join(v["name"] for v in vs) + "\n")
            for r in range(max(len(v["werte"]) for v in vs)):
                fh.write(";".join(repr(v["werte"][r]).replace(".", ",") if r < len(v["werte"]) else "" for v in vs) + "\n")
        self.statusBar().showMessage("Exportiert", 3000)

    def _printer(self):
        if self.printer is None: self.printer = QPrinter(QPrinter.HighResolution)
        return self.printer

    def druckereinrichtung(self):
        QPageSetupDialog(self._printer(), self).exec()

    def druck_dokument(self, teile, farbe=True):
        s = self.sim; doc = QTextDocument(); esc = lambda t: t.replace("&", "&amp;").replace("<", "&lt;")
        html = [f"<h2>{esc(os.path.basename(self.path) if self.path else 'Unbenannt')}</h2>"]
        if s:
            html.append(f"<p><b>Simulation:</b> {esc(s['name'])} &nbsp; (Wiederhole {s['wiederhole']} mal)</p>")
            if teile.get("programm"):
                html.append("<h3>Programm</h3><pre>" + esc("\n".join(core.expand_makros(s["programm"], self.makros))) + "</pre>")
            if teile.get("startwerte"):
                rows = "".join(f"<tr><td>{esc(v['name'])}&nbsp;&nbsp;</td><td align='right'>{core.zahl_text(v['startwert'])[0] if v['startwert_aktiv'] else ''}</td></tr>" for v in s["variablen"])
                html.append("<h3>Startwerte</h3><table>" + rows + "</table>")
            if teile.get("sprachlich") and s["sprachlich"]["felder"]:
                f = s["sprachlich"]["felder"]
                html.append("<h3>Sprachliches Modell</h3><p>" + "<br>".join(esc(" ".join(f[i:i + 3])) for i in range(0, len(f) - 2, 3)) + "</p>")
            if teile.get("grafisch") and (s["grafisch"]["zustand"] or s["grafisch"]["rate"]):
                img = QImage(900, 620, QImage.Format_RGB32); img.fill(QColor(255, 255, 255))
                p = QPainter(img); p.setRenderHint(QPainter.Antialiasing); male_fluss(p, s["grafisch"]); p.end()
                doc.addResource(QTextDocument.ImageResource, QUrl("mw://fluss"), img)
                html.append("<h3>Grafisches Modell</h3><p><img src='mw://fluss' width='520'></p>")
        if teile.get("schaubild") and self.sheet["objekte"]:
            img = self.blatt_bild(60.0, farbe)
            doc.addResource(QTextDocument.ImageResource, QUrl("mw://blatt"), img)
            html.append(f"<h3>Schaubild</h3><p><img src='mw://blatt' width='{min(620, img.width())}'></p>")
        if teile.get("tabelle") and self.model.vars:
            vs = self.model.vars; n = min(self.model.rowCount(), 2000)
            kopf = "".join(f"<th align='right'>&nbsp;{esc(v['name'])}</th>" for v in vs)
            rows = "".join("<tr>" + "".join(f"<td align='right'>&nbsp;{core.tabellen_text(v['werte'][r], v['_attr4'][1]) if r < len(v['werte']) else ''}</td>" for v in vs) + "</tr>" for r in range(n))
            html.append(f"<h3>Tabelle</h3><table><tr>{kopf}</tr>{rows}</table>")
        doc.setHtml("<body style='font-family: Arial; font-size: 10pt'>" + "".join(html) + "</body>")
        return doc

    def drucken(self):
        d = DruckenDialog(self)
        if not d.exec(): return
        pr = self._printer()
        try:
            from PySide6.QtCore import QMarginsF
            pr.setPageMargins(QMarginsF(d.rand[0] * 10, d.rand[1] * 10, 15, 15), QPageLayout.Millimeter)
        except Exception:
            pass
        if QPrintDialog(pr, self).exec():
            self.druck_dokument(d.teile, d.farbe.isChecked()).print_(pr)

    def info(self):
        QMessageBox.about(self, APP, f"<b>{APP}</b><br>Modellbildung mit Programmschleifen.<br><br>"
                          "Eigenständiges, neu geschriebenes Programm. Es liest und schreibt Modelldateien im Format MOEBIUS30 (*.prg).<br>"
                          "Nicht vom Autor von Moebius (Detlef Hoche) und nicht mit ihm verbunden.")


class App(QApplication):
    """Nimmt auch Dateien an, die im Finder per Doppelklick geoeffnet werden."""
    def __init__(self, argv):
        super().__init__(argv)
        self.fenster = None; self.wartend = None

    def event(self, e):
        if e.type() == QEvent.FileOpen:
            if self.fenster is not None: self.fenster.open_file(e.file())
            else: self.wartend = e.file()
            return True
        return super().event(e)


def main():
    app = App(sys.argv); app.setApplicationName(APP); app.setApplicationDisplayName(APP)
    symbol = os.path.join(HIER, "modellwerk_icon_claude.png")
    if os.path.exists(symbol): app.setWindowIcon(QIcon(symbol))
    w = MainWindow(); app.fenster = w
    datei = next((a for a in sys.argv[1:] if os.path.exists(a)), None) or app.wartend
    if datei: w.open_file(datei)
    w.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
