#claude
"""mw_dialogs.py - Dialoge von Modellwerk."""
import copy
import math
import re

from PySide6.QtCore import QPointF, QRectF, Qt, QTimer, Signal
from PySide6.QtGui import QAction, QBrush, QColor, QFont, QIcon, QImage, QPainter, QPainterPath, QPen, QPixmap, QPolygonF
from PySide6.QtWidgets import (QAbstractItemView, QButtonGroup, QCheckBox, QComboBox, QDialog, QDialogButtonBox,
                               QFileDialog, QFormLayout, QGridLayout, QGroupBox, QHBoxLayout, QHeaderView,
                               QInputDialog, QLabel, QLineEdit, QListWidget, QMenu, QMessageBox, QPlainTextEdit,
                               QPushButton, QRadioButton, QScrollArea, QSpinBox, QTableWidget, QTableWidgetItem,
                               QTextBrowser, QToolButton, QVBoxLayout, QWidget)

import mw_core as core
from mw_icons import icon

APP = "Modellwerk"
PRAEDIKATE = ["ist proportional zu", "nimmt zu um", "nimmt ab um"]

HILFE = """<h3>Kurzanleitung</h3>
<p><b>1. Modell eingeben:</b> Menü <i>Einfügen → Neue Simulation</i>. Im Fenster <i>Algorithmische Modellierung</i>
steht links das Programm, das wiederholt ausgeführt wird, rechts stehen die Startwerte und Einheiten (z. B. <code>m/s</code>). Statt zu tippen kann man das
Modell auch in Sätzen (<i>Sprachliches Modell</i>) oder als Flussdiagramm (<i>Grafisches Modell</i>) eingeben.</p>
<p><b>2. Anzeigen:</b> Rechts im Hauptfenster die Größe für die x-Achse wählen, die Größen für die y-Achse markieren
und auf <i>Anzeigen</i> klicken. Die Achsen werden mit Größe und Einheit beschriftet, z. B. <i>t in s</i>
(abschaltbar unter <i>Format → Schaubild</i>). Mit <i>Tabelle</i> erscheinen die Zahlenwerte.</p>
<p><b>3. Bearbeiten:</b> Klick auf eine Kurve öffnet die Kurven-Parameter, Klick auf eine Achse die Skalierung.
Mit dem Text-Werkzeug (T) schreibt man auf das Blatt. Objekte lassen sich mit der Maus verschieben.</p>
<h3>Programmsprache</h3>
<p>Zuweisung <code>x := x + v*dt</code>, mehrere Anweisungen mit <code>;</code> trennen, Kommentar mit <code>//</code>,
Dezimalkomma (<code>0,5</code>).<br>Bedingung: <code>IF x &gt; 3 THEN v := 0</code>, Schleife: <code>WHILE … DO …</code><br>
Funktionen: sin, cos, arctan, exp, ln, sqr, sqrt, frac, int, abs, random</p>
<p>Makro: Zeilen markieren, Rechtsklick → <i>Makro erzeugen</i>. Im Programm steht dann <code>{Name}</code>.</p>
<h3>Speichern</h3>
<p>Modellwerk-Dateien (.json) behalten alles, auch die Einheiten. Moebius-Dateien (.prg) kennen keine Einheiten:
erhalten bleiben nur die Einheiten, die an den Achsen stehen.</p>"""


class WiederholeSpin(QSpinBox):
    """Zahlenfeld fuer 'Wiederhole': zu grosse Eingaben werden auf das Maximum gesetzt statt verschluckt,
    beim Anklicken ist der Inhalt markiert."""
    def __init__(self):
        super().__init__()
        self.setRange(1, core.MAX_WERTE); self.setCorrectionMode(QSpinBox.CorrectToNearestValue)
        self.setMinimumWidth(96); self.setAccelerated(True)

    def validate(self, text, pos):
        from PySide6.QtGui import QValidator
        t = text.strip()
        if t.isdigit() and len(t) <= 9:
            return (QValidator.Acceptable if 1 <= int(t) <= core.MAX_WERTE else QValidator.Intermediate), text, pos
        return super().validate(text, pos)

    def fixup(self, text):
        t = text.strip()
        if t.isdigit(): return str(max(1, min(core.MAX_WERTE, int(t))))
        return super().fixup(text)

    def focusInEvent(self, e):
        super().focusInEvent(e); QTimer.singleShot(0, self.selectAll)


def num(text):
    return float(text.strip().replace(",", "."))


def fz(x):
    return f"{x:.10g}".replace(".", ",")


def farb_icon(rgb):
    px = QPixmap(16, 12); px.fill(QColor(*rgb))
    p = QPainter(px); p.setPen(QColor(0, 0, 0)); p.drawRect(0, 0, 15, 11); p.end()
    return QIcon(px)


class FarbCombo(QComboBox):
    def __init__(self, rgb=(0, 0, 0)):
        super().__init__()
        for name, c in core.FARBEN:
            self.addItem(farb_icon(c), name, c)
        self.set(rgb)

    def set(self, rgb):
        rgb = tuple(rgb)
        for i, (_, c) in enumerate(core.FARBEN):
            if c == rgb:
                self.setCurrentIndex(i); return
        self.addItem(farb_icon(rgb), "eigene Farbe", rgb); self.setCurrentIndex(self.count() - 1)

    def get(self):
        return tuple(self.currentData())


class Dlg(QDialog):
    """Grundgeruest: Inhalt + OK/Abbrechen/Hilfe."""
    def __init__(self, parent, titel, hilfe=True):
        super().__init__(parent)
        self.setWindowTitle(titel)
        self.lay = QVBoxLayout(self)
        self.box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        self.box.button(QDialogButtonBox.Ok).setText("OK"); self.box.button(QDialogButtonBox.Cancel).setText("Abbrechen")
        if hilfe:
            b = self.box.addButton("Hilfe", QDialogButtonBox.HelpRole); b.clicked.connect(lambda: HilfeDialog(self).exec())
        self.box.accepted.connect(self.ok); self.box.rejected.connect(self.reject)

    def finish(self):
        self.lay.addWidget(self.box)

    def ok(self):
        try:
            self.apply()
        except ValueError:
            QMessageBox.warning(self, APP, "Bitte gültige Zahlen eingeben."); return
        self.accept()

    def apply(self):
        pass


class HilfeDialog(QDialog):
    def __init__(self, parent):
        super().__init__(parent)
        self.setWindowTitle("Hilfe"); self.resize(560, 480)
        lay = QVBoxLayout(self); t = QTextBrowser(); t.setHtml(HILFE); lay.addWidget(t)
        b = QDialogButtonBox(QDialogButtonBox.Close); b.button(QDialogButtonBox.Close).setText("Schließen")
        b.rejected.connect(self.reject); lay.addWidget(b)


# ------------------------------------------------------------------ kleine Dialoge

class LinienDialog(Dlg):
    def __init__(self, parent, stil, dicke, farbe):
        super().__init__(parent, "Linienattribute")
        f = QFormLayout(); self.lay.addLayout(f)
        self.stil = QComboBox(); self.stil.addItems(core.STILE); self.stil.setCurrentIndex(min(stil, 5))
        self.dicke = QSpinBox(); self.dicke.setRange(1, 20); self.dicke.setValue(dicke); self.dicke.setToolTip("in Pixel")
        self.farbe = FarbCombo(farbe)
        f.addRow("Stil:", self.stil); f.addRow("Dicke:", self.dicke); f.addRow("Farbe:", self.farbe)
        self.finish()

    def werte(self):
        return self.stil.currentIndex(), self.dicke.value(), self.farbe.get()


class ZahlenformatDialog(Dlg):
    def __init__(self, parent, nachkomma, norm=False):
        super().__init__(parent, "Zahlenformat")
        f = QFormLayout(); self.lay.addLayout(f)
        self.nach = QSpinBox(); self.nach.setRange(0, 18); self.nach.setValue(nachkomma)
        self.norm = QCheckBox("Normdarstellung"); self.norm.setChecked(norm)
        self.norm.setToolTip("Wissenschaftliche Darstellung mit Exponent")
        f.addRow("Nachkommastellen:", self.nach); f.addRow(self.norm)
        self.finish()


class WinkelDialog(Dlg):
    def __init__(self, parent, winkel=0.0):
        super().__init__(parent, "Drehen")
        f = QFormLayout(); self.lay.addLayout(f)
        self.e = QLineEdit(fz(winkel)); self.e.setToolTip("in Grad")
        f.addRow("Winkel:", self.e); self.finish()

    def apply(self):
        self.winkel = num(self.e.text())


class MakroDialog(Dlg):
    def __init__(self, parent, name, lines):
        super().__init__(parent, f"Makro {name}", hilfe=False)
        self.memo = QPlainTextEdit("\n".join(lines)); self.lay.addWidget(self.memo); self.resize(560, 360); self.finish()

    def lines(self):
        return self.memo.toPlainText().split("\n")


class SonderzeichenDialog(QDialog):
    gewaehlt = Signal(str)

    def __init__(self, parent):
        super().__init__(parent)
        self.setWindowTitle("Sonderzeichen"); self.setWindowFlag(Qt.Tool)
        g = QGridLayout(self)
        zeichen = "αβγδεηθλμπρσφωΔΣΩ°·±×÷≈≠≤≥²³½¼µ∞√∂∫→←↑↓"
        for i, ch in enumerate(zeichen):
            b = QToolButton(); b.setText(ch); b.setFixedSize(28, 28)
            b.clicked.connect(lambda _=False, c=ch: self.gewaehlt.emit(c))
            g.addWidget(b, i // 8, i % 8)


class DruckenDialog(Dlg):
    def __init__(self, parent):
        super().__init__(parent, "Drucken...")
        h = QHBoxLayout(); self.lay.addLayout(h)
        gb = QGroupBox("Drucken"); g = QGridLayout(gb)
        self.c = {}
        for i, (key, text, on) in enumerate((("programm", "Programm", True), ("startwerte", "Startwerte", True),
                                             ("sprachlich", "sprachlich", False), ("schaubild", "Schaubild", True),
                                             ("grafisch", "grafisch", False), ("tabelle", "Tabelle", False))):
            cb = QCheckBox(text); cb.setChecked(on); self.c[key] = cb; g.addWidget(cb, i // 2, i % 2)
        h.addWidget(gb)
        gr = QGroupBox("Rand"); f = QFormLayout(gr)
        self.rx = QLineEdit("2,0"); self.ry = QLineEdit("2,0")
        f.addRow("links (cm):", self.rx); f.addRow("oben (cm):", self.ry); h.addWidget(gr)
        self.farbe = QCheckBox("Hintergrundfarbe des Schaubilds drucken"); self.farbe.setChecked(True); self.lay.addWidget(self.farbe)
        self.finish()

    def apply(self):
        self.rand = (num(self.rx.text()), num(self.ry.text()))
        self.teile = {k: cb.isChecked() for k, cb in self.c.items()}


class BildDialog(Dlg):
    def __init__(self, parent, o):
        super().__init__(parent, "Grafik")
        self.o = o
        gb = QGroupBox("Maße"); f = QFormLayout(gb)
        self.e = [QLineEdit(fz(round(v, 3))) for v in o["g"]]
        for lab, e in zip(("x (cm):", "y (cm):", "Breite (cm):", "Höhe (cm):"), self.e): f.addRow(lab, e)
        self.ratio = QCheckBox("Seitenverhältnis behalten"); self.ratio.setChecked(True); f.addRow(self.ratio)
        self.e[2].editingFinished.connect(lambda: self._ratio(2)); self.e[3].editingFinished.connect(lambda: self._ratio(3))
        self.lay.addWidget(gb)
        self.grau = QCheckBox("Graustufen"); self.dreh = QCheckBox("Um 90° drehen")
        self.lr = QCheckBox("Spiegeln: Links <--> Rechts"); self.ou = QCheckBox("Spiegeln: Oben <--> Unten")
        for w in (self.grau, self.dreh, self.lr, self.ou): self.lay.addWidget(w)
        self.finish()

    def _ratio(self, i):
        if not self.ratio.isChecked() or not self.o["g"][2] or not self.o["g"][3]: return
        try:
            v = num(self.e[i].text())
        except ValueError:
            return
        r = self.o["g"][2] / self.o["g"][3]
        if i == 2: self.e[3].setText(fz(round(v / r, 3)))
        else: self.e[2].setText(fz(round(v * r, 3)))

    def apply(self):
        g = [num(e.text()) for e in self.e]
        if self.grau.isChecked() or self.dreh.isChecked() or self.lr.isChecked() or self.ou.isChecked():
            img = QImage.fromData(bytes(self.o["data"]))
            if not img.isNull():
                if self.grau.isChecked(): img = img.convertToFormat(QImage.Format_Grayscale8)
                if self.lr.isChecked() or self.ou.isChecked(): img = img.mirrored(self.lr.isChecked(), self.ou.isChecked())
                if self.dreh.isChecked():
                    from PySide6.QtGui import QTransform
                    img = img.transformed(QTransform().rotate(90)); g[2], g[3] = g[3], g[2]
                self.o["data"] = image_bytes(img)
        self.o["g"] = g


def image_bytes(img):
    from PySide6.QtCore import QBuffer, QByteArray, QIODevice
    ba = QByteArray(); buf = QBuffer(ba); buf.open(QIODevice.WriteOnly)
    img.convertToFormat(QImage.Format_RGB32).save(buf, "BMP"); buf.close()
    return bytes(ba.data())


# ------------------------------------------------------------------ Schaubild, Achse, Kurve

class AchseDialog(Dlg):
    def __init__(self, parent, a, titel="Achse"):
        super().__init__(parent, titel)
        self.a = dict(a)
        g1 = QGroupBox(); f = QGridLayout(g1)
        self.von, self.bis, self.lage = QLineEdit(fz(a["von"])), QLineEdit(fz(a["bis"])), QLineEdit(fz(a["lage"]))
        self.von.setToolTip("Beginn der Skalierung"); self.bis.setToolTip("Ende der Skalierung")
        self.lage.setToolTip("Position auf der anderen Achse")
        self.log = QCheckBox("Logarithmische Skala"); self.log.setChecked(a["log"]); self.log.setEnabled(False)
        self.log.setToolTip("wird noch nicht unterstützt")
        f.addWidget(QLabel("Von"), 0, 0); f.addWidget(self.von, 0, 1); f.addWidget(QLabel("Lage"), 0, 2); f.addWidget(self.lage, 0, 3)
        f.addWidget(QLabel("Bis"), 1, 0); f.addWidget(self.bis, 1, 1); f.addWidget(self.log, 1, 2, 1, 2)
        self.lay.addWidget(g1)
        h = QHBoxLayout(); self.lay.addLayout(h)
        g2 = QGroupBox("Striche"); f2 = QFormLayout(g2)
        self.abst = QLineEdit(fz(a["abstand"])); self.abst.setToolTip("gemessen in Einheiten der Achse")
        self.kl = QSpinBox(); self.kl.setRange(0, 20); self.kl.setValue(a["kleine"])
        self.kl.setToolTip("Anzahl der Striche zwischen zwei großen Strichen.")
        f2.addRow("Abstand", self.abst); f2.addRow("Kleine", self.kl); h.addWidget(g2)
        g3 = QGroupBox("Optionen"); v = QVBoxLayout(g3)
        b = QPushButton("Hilfslinienattribute"); b.clicked.connect(self._attr); v.addWidget(b)
        self.hl = QCheckBox("Hilfslinien"); self.hl.setChecked(a["hilfslinien"]); self.hl.setToolTip("Verlängerung der großen Striche")
        v.addWidget(self.hl); h.addWidget(g3)
        self.sicht = QCheckBox("sichtbar"); self.sicht.setChecked(a["sichtbar"]); self.lay.addWidget(self.sicht)
        self.auto = QCheckBox("automatisch skalieren"); self.auto.setChecked(a["auto"]); self.lay.addWidget(self.auto)
        for e in (self.von, self.bis, self.abst): e.textEdited.connect(lambda: self.auto.setChecked(False))
        self.finish()

    def _attr(self):
        d = LinienDialog(self, self.a["hstil"], 1, self.a["hfarbe"])
        if d.exec():
            self.a["hstil"], _, self.a["hfarbe"] = d.werte()

    def apply(self):
        von, bis, ab = num(self.von.text()), num(self.bis.text()), num(self.abst.text())
        if bis <= von or ab <= 0: raise ValueError
        self.a.update(von=von, bis=bis, abstand=ab, lage=num(self.lage.text()), kleine=self.kl.value(),
                      hilfslinien=self.hl.isChecked(), sichtbar=self.sicht.isChecked(), auto=self.auto.isChecked())


class SchaubildDialog(Dlg):
    def __init__(self, parent, spec):
        super().__init__(parent, "Eigenschaften des Schaubilds")
        self.spec = copy.deepcopy(spec)
        f0 = QFormLayout(); self.lay.addLayout(f0)
        self.hg = FarbCombo(spec.get("fenster", (255, 255, 255))); self.hg.setToolTip("Farbe des Fensters")
        f0.addRow("Fensterhintergrund", self.hg)
        gb = QGroupBox("Schaubild"); g = QGridLayout(gb)
        self.pc = [QSpinBox() for _ in range(4)]
        for sb, v in zip(self.pc, spec["pc"]): sb.setRange(0, 100); sb.setValue(v); sb.setSuffix(" %")
        for i, (lab, tip) in enumerate((("Links", "0=links 100=rechts"), ("Oben", "0=oben 100=unten"),
                                        ("Breite", "100=ganzes Fenster"), ("Höhe", "100=ganzes Fenster"))):
            self.pc[i].setToolTip(tip)
            g.addWidget(QLabel(lab), i % 2, 0 if i < 2 else 2); g.addWidget(self.pc[i], i % 2, 1 if i < 2 else 3)
        self.farbe = FarbCombo(spec["farbe"]); self.farbe.setToolTip("Hintergrund des Schaubilds")
        g.addWidget(QLabel("Farbe"), 2, 0); g.addWidget(self.farbe, 2, 1, 1, 3)
        row = QHBoxLayout()
        for key, text in (("xa", "x-Achse"), ("ya", "y-Achse")):
            b = QPushButton(text); b.setToolTip("Skalierung ändern"); b.clicked.connect(lambda _=False, k=key, t=text: self._achse(k, t)); row.addWidget(b)
        g.addLayout(row, 3, 0, 1, 4)
        self.leg = QCheckBox("Legende"); self.leg.setChecked(spec["legende"]); self.leg.setToolTip("Legende anzeigen")
        g.addWidget(self.leg, 4, 0, 1, 4)
        self.tit = QCheckBox("Achsen beschriften (Name und Einheit)"); self.tit.setChecked(spec.get("achsentitel", True) is not False)
        self.tit.setToolTip("Die Achsen werden mit dem Namen der Größe und ihrer Einheit beschriftet (Einheiten unter Simulation bearbeiten → Startwerte).")
        g.addWidget(self.tit, 5, 0, 1, 4)
        self.timer = QSpinBox(); self.timer.setRange(1, 10000); self.timer.setSingleStep(10); self.timer.setValue(spec["timer"]); self.timer.setSuffix(" ms")
        g.addWidget(QLabel("Timer-Intervall:"), 6, 0, 1, 2); g.addWidget(self.timer, 6, 2, 1, 2)
        self.lay.addWidget(gb); self.finish()

    def _achse(self, key, titel):
        d = AchseDialog(self, self.spec[key], titel)
        if d.exec(): self.spec[key] = d.a

    def apply(self):
        self.spec.update(pc=[sb.value() for sb in self.pc], farbe=self.farbe.get(), legende=self.leg.isChecked(),
                         achsentitel=self.tit.isChecked(), timer=self.timer.value(), fenster=self.hg.get())
        if self.spec["pc"][2] < 5 or self.spec["pc"][3] < 5: raise ValueError


class KurvenDialog(Dlg):
    def __init__(self, parent, k, bild_hex):
        super().__init__(parent, "Kurven-Parameter")
        self.k = dict(k); self.bild_hex = bild_hex
        top = QHBoxLayout(); self.lay.addLayout(top)
        left = QVBoxLayout(); top.addLayout(left)
        self.typ = self._radio("Typ", core.TYPEN, k["typ"], 2); left.addWidget(self.typ[0])
        gl = QGroupBox("Linien"); hl = QHBoxLayout(gl)
        b = QPushButton("Linienattribute"); b.setToolTip("Farbe, Dicke, Stil der Kurve"); b.clicked.connect(self._linie); hl.addWidget(b)
        self.spl = QCheckBox("Splines"); self.spl.setChecked(bool(k["splines"])); self.spl.setToolTip("quadratische Interpolation"); hl.addWidget(self.spl)
        left.addWidget(gl)
        gp = QGroupBox("Punkte"); g = QGridLayout(gp)
        self.form = self._radio("Form", core.FORMEN, min(k["form"], 2), 1); g.addWidget(self.form[0], 0, 0, 3, 1)
        self.gr = QSpinBox(); self.gr.setRange(1, 15); self.gr.setValue(max(1, min(15, k["groesse"]))); self.gr.setToolTip("gemessen in Pt.")
        self.pf = FarbCombo(k["pfarbe"]); self.pf.setToolTip("Farbe der Punkte")
        g.addWidget(QLabel("Größe"), 0, 1); g.addWidget(self.gr, 0, 2); g.addWidget(QLabel("Farbe:"), 1, 1); g.addWidget(self.pf, 1, 2)
        top.addWidget(gp)
        ga = QGroupBox("Animation"); ha = QHBoxLayout(ga)
        self.an = QCheckBox("an"); self.an.setChecked(bool(k["ani"])); ha.addWidget(self.an)
        self.kst = self._radio("Entstehung der Kurve", ["unsichtbar", "sofort zeichnen", "animiert zeichnen"], min(k["kurvenstil"], 2), 1); ha.addWidget(self.kst[0])
        self.aty = self._radio("Animationstyp", ["linear", "zyklisch", "autoreverse"], min(k["anityp"], 2), 1); ha.addWidget(self.aty[0])
        vb = QVBoxLayout(); ha.addLayout(vb)
        bo = QPushButton("Öffnen"); bo.setToolTip("Bild auswählen"); bo.clicked.connect(self._bild)
        bl = QPushButton("Löschen"); bl.setToolTip("Kein Bild anzeigen"); bl.clicked.connect(lambda: self._set_bild(""))
        self.vorschau = QLabel(); self.vorschau.setFixedSize(44, 44); self.vorschau.setAlignment(Qt.AlignCenter)
        vb.addWidget(bo); vb.addWidget(self.vorschau); vb.addWidget(bl)
        self.lay.addWidget(ga); self._set_bild(bild_hex); self.finish()

    def _radio(self, titel, items, index, spalten):
        gb = QGroupBox(titel); g = QGridLayout(gb); grp = QButtonGroup(gb)
        for i, t in enumerate(items):
            rb = QRadioButton(t); grp.addButton(rb, i); g.addWidget(rb, i // spalten if spalten > 1 else i, i % spalten if spalten > 1 else 0)
            if i == index: rb.setChecked(True)
        return gb, grp

    def _linie(self):
        d = LinienDialog(self, self.k["stil"], self.k["dicke"], self.k["farbe"])
        if d.exec():
            self.k["stil"], self.k["dicke"], self.k["farbe"] = d.werte()

    def _bild(self):
        fn, _ = QFileDialog.getOpenFileName(self, "Bild auswählen", "", "Grafiken (*.bmp *.png *.jpg *.jpeg)")
        if fn:
            img = QImage(fn)
            if img.isNull():
                QMessageBox.warning(self, APP, "Das Bild konnte nicht gelesen werden."); return
            if max(img.width(), img.height()) > 96: img = img.scaled(96, 96, Qt.KeepAspectRatio, Qt.SmoothTransformation)
            from PySide6.QtCore import QBuffer, QByteArray, QIODevice
            ba = QByteArray(); buf = QBuffer(ba); buf.open(QIODevice.WriteOnly); img.save(buf, "PNG"); buf.close()
            self._set_bild(bytes(ba.data()).hex())

    def _set_bild(self, hx):
        self.bild_hex = hx
        img = bild_aus_hex(hx)
        if img is None: self.vorschau.setText("–"); self.vorschau.setPixmap(QPixmap())
        else: self.vorschau.setPixmap(QPixmap.fromImage(img).scaled(40, 40, Qt.KeepAspectRatio, Qt.SmoothTransformation))

    def apply(self):
        self.k.update(typ=self.typ[1].checkedId(), splines=1 if self.spl.isChecked() else 0, form=self.form[1].checkedId(),
                      groesse=self.gr.value(), pfarbe=self.pf.get(), ani=1 if self.an.isChecked() else 0,
                      kurvenstil=self.kst[1].checkedId(), anityp=self.aty[1].checkedId())


def bild_aus_hex(hx):
    if not hx: return None
    try:
        img = QImage.fromData(bytes.fromhex(hx))
    except ValueError:
        return None
    return None if img.isNull() else img


# ------------------------------------------------------------------ Algorithmische Modellierung

def braucht_startwert(lines, cs):
    """Namen, die gelesen werden, bevor sie im Programm einen Wert bekommen."""
    ident = core._IDENT; key = (lambda n: n) if cs else (lambda n: n.upper())
    gesetzt, braucht = set(), set()
    for line in lines:
        line = line.split("//")[0]
        for st in line.split(";"):
            m = re.match(r"(?i)\s*(?:if|while)\s+(.*?)\s+(?:then|do)\s+(.*)", st)
            cond, body = (m.group(1), m.group(2)) if m else ("", st)
            m2 = re.match(r"\s*(" + ident + r")\s*:?=(.*)", body)
            ziel, rhs = (m2.group(1), m2.group(2)) if m2 else (None, body)
            for n in re.findall(ident, cond + " " + rhs):
                if n.upper() in core._FUN or n.upper() in core.KEYWORDS: continue
                if key(n) not in gesetzt: braucht.add(key(n))
            if ziel and not m: gesetzt.add(key(ziel))
    return braucht


class AlgoDialog(QDialog):
    def __init__(self, parent, sim, makros, mehrere):
        super().__init__(parent)
        self.setWindowTitle("Algorithmische Modellierung"); self.resize(820, 600)
        self.sim = copy.deepcopy(sim); self.makros = copy.deepcopy(makros); self.mehrere = mehrere; self.busy = False
        lay = QVBoxLayout(self)
        top = QHBoxLayout(); lay.addLayout(top)
        self.wh = WiederholeSpin(); self.wh.setValue(max(1, min(core.MAX_WERTE, self.sim["wiederhole"])))
        self.wh.setToolTip(f"Anzahl der berechneten Werte (max. {core.MAX_WERTE:,}). Größere Zahlen werden auf das Maximum gesetzt.\n"
                           f"Das Original-Moebius kann höchstens {core.MAX_ORIGINAL} Werte.".replace(",", "."))
        self.name = QLineEdit(self.sim["name"])
        top.addWidget(QLabel("Wiederhole")); top.addWidget(self.wh); top.addWidget(QLabel(f"mal (max. {core.MAX_WERTE:,})".replace(",", "."))); top.addSpacing(30)
        top.addWidget(QLabel("Name der Simulation:")); top.addWidget(self.name, 1)
        mid = QHBoxLayout(); lay.addLayout(mid, 1)
        self.prog = QPlainTextEdit("\n".join(self.sim["programm"])); self.prog.setLineWrapMode(QPlainTextEdit.NoWrap)
        self.prog.setToolTip("Programmschleife"); f = QFont("Menlo"); f.setStyleHint(QFont.Monospace); f.setPointSize(13); self.prog.setFont(f)
        self.prog.setContextMenuPolicy(Qt.CustomContextMenu); self.prog.customContextMenuRequested.connect(self._menu)
        mid.addWidget(self.prog, 3)
        right = QVBoxLayout(); mid.addLayout(right, 2)
        right.addWidget(QLabel("Startwerte und Einheiten:"))
        self.tab = QTableWidget(0, 3); self.tab.setHorizontalHeaderLabels(["Größe", "Startwert", "Einheit"]); self.tab.verticalHeader().hide()
        self.tab.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.tab.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.tab.setContextMenuPolicy(Qt.CustomContextMenu); self.tab.customContextMenuRequested.connect(self._tabmenu)
        right.addWidget(self.tab, 1)
        self.cs = QCheckBox("Groß-, Kleinschreibung"); self.cs.setChecked(bool(self.sim["gross_klein"])); right.addWidget(self.cs)
        b1 = QPushButton("Sprachliches Modell"); b1.clicked.connect(self._sprachlich); right.addWidget(b1)
        b2 = QPushButton("Grafisches Modell"); b2.clicked.connect(self._grafisch); right.addWidget(b2)
        box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        box.button(QDialogButtonBox.Ok).setText("OK"); box.button(QDialogButtonBox.Cancel).setText("Abbrechen")
        box.addButton("Hilfe", QDialogButtonBox.HelpRole).clicked.connect(lambda: HilfeDialog(self).exec())
        box.accepted.connect(self._ok); box.rejected.connect(self.reject); lay.addWidget(box)
        self.timer = QTimer(self); self.timer.setSingleShot(True); self.timer.setInterval(350); self.timer.timeout.connect(self._sync)
        self.prog.textChanged.connect(self.timer.start); self.cs.toggled.connect(self._sync)
        self._sync()

    # --- Startwerte
    def _lines(self):
        return self.prog.toPlainText().split("\n")

    def _read_table(self):
        werte = {}
        for r in range(self.tab.rowCount()):
            n = self.tab.item(r, 0).text(); t = self.tab.item(r, 1).text().strip() if self.tab.item(r, 1) else ""
            if t:
                try: werte[n] = num(t)
                except ValueError: pass
        return werte

    def _read_einheiten(self):
        return {self.tab.item(r, 0).text(): (self.tab.item(r, 2).text().strip() if self.tab.item(r, 2) else "")
                for r in range(self.tab.rowCount()) if self.tab.item(r, 0)}

    def _sync(self):
        if self.busy: return
        cs = self.cs.isChecked()
        try:
            voll = core.expand_makros(self._lines(), self.makros)
            names, _ = core.program_variables(voll, cs)
            braucht = braucht_startwert(voll, cs)
        except Exception:
            return
        alt = {(v["name"] if cs else v["name"].upper()): v for v in self.sim["variablen"]}
        werte = self._read_table(); einh = self._read_einheiten()
        for n, w in werte.items():
            k = n if cs else n.upper()
            if k in alt: alt[k]["startwert"] = w; alt[k]["startwert_aktiv"] = 1
        for n, e in einh.items():
            k = n if cs else n.upper()
            if k in alt: alt[k]["einheit"] = e
        neu = []
        for n in names:
            v = alt.get(n)
            if v is None:
                v = core.new_variable(n, 0.0, n in braucht, self.sim["name"] if self.mehrere else "")
            elif v["name"] != n:
                v["name"] = n
            neu.append(v)
        self.sim["variablen"] = neu
        self.busy = True
        self.tab.setRowCount(len(neu))
        for r, v in enumerate(neu):
            it = QTableWidgetItem(v["name"]); it.setFlags(Qt.ItemIsEnabled); self.tab.setItem(r, 0, it)
            zeigen = v["startwert_aktiv"] or v["name"] in braucht
            self.tab.setItem(r, 1, QTableWidgetItem(fz(v["startwert"]) if zeigen else ""))
            ei = QTableWidgetItem(v.get("einheit", "")); ei.setToolTip("Einheit, z. B. m/s – erscheint an der Achse"); self.tab.setItem(r, 2, ei)
        self.busy = False

    def _tabmenu(self, pos):
        m = QMenu(self)
        m.addAction("Zurücksetzen", self._reset)
        m.exec(self.tab.mapToGlobal(pos))

    def _reset(self):
        for v in self.sim["variablen"]: v["startwert"] = 0.0
        for r in range(self.tab.rowCount()):
            if self.tab.item(r, 1).text().strip(): self.tab.item(r, 1).setText("0")

    # --- Makros
    def _menu(self, pos):
        m = self.prog.createStandardContextMenu()
        m.addSeparator()
        m.addAction("Makro erzeugen", self._makro_neu)
        m.addAction("Makro auflösen", self._makro_auf)
        m.addAction("Makro bearbeiten", self._makro_edit)
        m.exec(self.prog.mapToGlobal(pos))

    def _block(self):
        cur = self.prog.textCursor(); doc = self.prog.document()
        a = doc.findBlock(cur.selectionStart()).blockNumber(); b = doc.findBlock(cur.selectionEnd()).blockNumber()
        return a, b

    def _makro_name(self):
        a, b = self._block(); lines = self._lines()
        if a == b:
            m = re.fullmatch(r"\s*\{(.+?)\}\s*", lines[a])
            if m and m.group(1) in self.makros: return a, m.group(1)
        QMessageBox.information(self, APP, "Der gewählte Bereich ist kein Makro."); return None, None

    def _makro_neu(self):
        a, b = self._block(); lines = self._lines()
        name, ok = QInputDialog.getText(self, "Makro erzeugen", "Geben Sie den Namen des Makros ein:")
        name = name.strip()
        if not ok or not name: return
        if name in self.makros:
            QMessageBox.warning(self, APP, "Es existiert schon ein Makro mit diesem Namen."); return
        self.makros[name] = lines[a:b + 1]
        self.prog.setPlainText("\n".join(lines[:a] + ["{" + name + "}"] + lines[b + 1:]))

    def _makro_auf(self):
        a, name = self._makro_name()
        if name is None: return
        lines = self._lines()
        self.prog.setPlainText("\n".join(lines[:a] + self.makros.pop(name) + lines[a + 1:]))

    def _makro_edit(self):
        a, name = self._makro_name()
        if name is None: return
        d = MakroDialog(self, name, self.makros[name])
        if d.exec(): self.makros[name] = d.lines(); self._sync()

    # --- andere Modellformen
    def _sprachlich(self):
        d = SprachDialog(self, self.sim)
        if d.exec():
            self.sim["sprachlich"] = d.ergebnis; self.sim["_optionen"][1] = 1 if d.vereinfacht.isChecked() else 0
            self.prog.setPlainText("\n".join(core.sprache_programm(d.ergebnis["felder"], d.vereinfacht.isChecked())))
            self._sync()

    def _grafisch(self):
        d = GrafDialog(self, self.sim)
        if d.exec():
            self.sim["grafisch"] = d.canvas.g
            self.sim["_optionen"] = [self.sim["_optionen"][0], 1 if d.vereinfacht.isChecked() else 0, 1 if d.erweitert.isChecked() else 0]
            self.prog.setPlainText("\n".join(core.grafik_programm(d.canvas.g, d.vereinfacht.isChecked())))
            self._sync()

    def _ok(self):
        self.timer.stop(); self._sync()
        werte = self._read_table(); einh = self._read_einheiten()
        cs = self.cs.isChecked()
        for v in self.sim["variablen"]:
            if v["name"] in werte: v["startwert"] = werte[v["name"]]; v["startwert_aktiv"] = 1
            else: v["startwert_aktiv"] = 0; v["startwert"] = 0.0
            if v["name"] in einh: v["einheit"] = einh[v["name"]]
        self.wh.interpretText()
        self.sim["programm"] = self._lines(); self.sim["wiederhole"] = self.wh.value()
        self.sim["gross_klein"] = 1 if cs else 0
        self.sim["name"] = self.name.text().strip() or self.sim["name"]
        try:
            core.translate(core.expand_makros(self.sim["programm"], self.makros), cs)
            compile(core.translate(core.expand_makros(self.sim["programm"], self.makros), cs), "<Programm>", "exec")
        except SyntaxError as e:
            QMessageBox.warning(self, APP, f"Syntax-Fehler im Programm (Anweisung {e.lineno})."); return
        except Exception as e:
            QMessageBox.warning(self, APP, f"Fehler im Programm:\n{e}"); return
        self.accept()


# ------------------------------------------------------------------ Sprachliche Modellierung

class SprachDialog(QDialog):
    def __init__(self, parent, sim):
        super().__init__(parent)
        self.setWindowTitle("Sprachliche Modellierung"); self.resize(820, 600)
        sp = sim["sprachlich"]
        lay = QVBoxLayout(self)
        top = QHBoxLayout(); lay.addLayout(top, 2)
        self.zu = self._liste("Zustandsgrößen", sp["zustandsgroessen"], True)
        self.ra = self._liste("Veränderungsraten", sp["raten"], True)
        self.pr = self._liste("Aussagen", PRAEDIKATE, False)
        for w in (self.zu, self.ra, self.pr): top.addWidget(w[0])
        mid = QHBoxLayout(); lay.addLayout(mid)
        mid.addWidget(QLabel("<b>Modell</b>  (Doppelklick auf einen Eintrag oben trägt ihn in das markierte Feld ein)"), 1)
        self.vereinfacht = QCheckBox("vereinfacht"); self.vereinfacht.setChecked(bool(sim["_optionen"][1]))
        self.vereinfacht.setToolTip("Angehakt: ein Durchlauf = eine Zeiteinheit. Sonst wird die Veränderungsrate mit dt multipliziert.")
        mid.addWidget(self.vereinfacht)
        self.modell = QTableWidget(50, 3); self.modell.setHorizontalHeaderLabels(["Größe", "Aussage", "Term"])
        self.modell.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        f = sp["felder"]
        for i in range(0, len(f) - 2, 3):
            for c in range(3): self.modell.setItem(i // 3, c, QTableWidgetItem(f[i + c]))
        self.modell.setCurrentCell(len(f) // 3, 0)
        lay.addWidget(self.modell, 3)
        bot = QHBoxLayout(); lay.addLayout(bot)
        box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        box.button(QDialogButtonBox.Ok).setText("OK"); box.button(QDialogButtonBox.Ok).setToolTip("In Algorithmus übersetzen")
        box.button(QDialogButtonBox.Cancel).setText("Abbrechen"); box.button(QDialogButtonBox.Cancel).setToolTip("Nicht übersetzen")
        box.addButton("Hilfe", QDialogButtonBox.HelpRole).clicked.connect(lambda: HilfeDialog(self).exec())
        box.accepted.connect(self._ok); box.rejected.connect(self.reject)
        bot.addWidget(box, 1)
        tr = QToolButton(); tr.setIcon(icon("trash")); tr.setToolTip("Papierkorb: markierte Zeile löschen"); tr.clicked.connect(self._del)
        bot.addWidget(tr)

    def _liste(self, titel, items, editierbar):
        gb = QGroupBox(titel); v = QVBoxLayout(gb)
        t = QTableWidget(20 if editierbar else len(items), 1); t.horizontalHeader().hide(); t.verticalHeader().hide()
        t.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        for i, s in enumerate(items):
            it = QTableWidgetItem(s)
            if not editierbar: it.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable)
            t.setItem(i, 0, it)
        if editierbar: t.setToolTip("Namen eintragen und mit der Eingabetaste bestätigen")
        t.cellDoubleClicked.connect(lambda r, c, tt=t: self._einfuegen(tt, r))
        if not editierbar: t.setEditTriggers(QAbstractItemView.NoEditTriggers)
        else: t.setEditTriggers(QAbstractItemView.EditKeyPressed | QAbstractItemView.AnyKeyPressed | QAbstractItemView.SelectedClicked)
        v.addWidget(t)
        return gb, t

    def _einfuegen(self, tabelle, row):
        it = tabelle.item(row, 0)
        if not it or not it.text().strip(): return
        r, c = max(0, self.modell.currentRow()), max(0, self.modell.currentColumn())
        alt = self.modell.item(r, c).text() if self.modell.item(r, c) else ""
        text = it.text().strip() if c < 2 or not alt else alt + "*" + it.text().strip()
        self.modell.setItem(r, c, QTableWidgetItem(text))
        if c < 2: self.modell.setCurrentCell(r, c + 1)

    def _del(self):
        r = self.modell.currentRow()
        if r >= 0: self.modell.removeRow(r); self.modell.insertRow(self.modell.rowCount())

    @staticmethod
    def _spalte(t):
        return [t.item(r, 0).text().strip() for r in range(t.rowCount()) if t.item(r, 0) and t.item(r, 0).text().strip()]

    def _ok(self):
        felder = []
        for r in range(self.modell.rowCount()):
            z = [(self.modell.item(r, c).text().strip() if self.modell.item(r, c) else "") for c in range(3)]
            if not any(z): continue
            if not all(z):
                QMessageBox.warning(self, APP, f"Zeile {r + 1} ist unvollständig."); return
            if z[1] not in PRAEDIKATE:
                QMessageBox.warning(self, APP, f"Zeile {r + 1}: Die Aussage muss eine der drei Aussagen oben rechts sein."); return
            felder += z
        if not felder:
            QMessageBox.information(self, APP, "Das Modell ist leer."); return
        self.ergebnis = {"zustandsgroessen": self._spalte(self.zu[1]), "raten": self._spalte(self.ra[1]), "felder": felder}
        self.accept()


# ------------------------------------------------------------------ Veraenderungsrate

class RateDialog(Dlg):
    def __init__(self, parent, name, term, eingaenge):
        super().__init__(parent, "Veränderungsrate")
        g = QGridLayout(); self.lay.addLayout(g)
        self.name = QLineEdit(name); self.name.setToolTip("Mit Tastatur eingeben")
        self.term = QLineEdit(term); self.term.setToolTip("Klicken Sie auf Knöpfe oder Variablen")
        gl = QLabel("="); f = QFont("Courier New"); f.setPointSize(16); gl.setFont(f)
        g.addWidget(QLabel("Name der Veränderungsrate:"), 0, 0); g.addWidget(QLabel("Term zur Berechnung:"), 0, 2)
        g.addWidget(self.name, 1, 0); g.addWidget(gl, 1, 1); g.addWidget(self.term, 1, 2)
        g.setColumnStretch(2, 2)
        fr = QHBoxLayout(); self.lay.addLayout(fr)
        for fn in ("sqr", "sin", "cos", "arctan", "ln", "exp", "sqrt", "frac", "int", "abs", "random"):
            b = QPushButton(fn); b.setAutoDefault(False); b.clicked.connect(lambda _=False, t=fn: self._ins(t + "(")); fr.addWidget(b)
        h = QHBoxLayout(); self.lay.addLayout(h)
        self.liste = QListWidget(); self.liste.addItems(eingaenge); self.liste.setToolTip("Eingangsgrößen")
        self.liste.itemClicked.connect(lambda it: self._ins(it.text())); h.addWidget(self.liste, 1)
        pad = QGridLayout(); h.addLayout(pad)
        tasten = [["7", "8", "9", "/", "("], ["4", "5", "6", "*", ")"], ["1", "2", "3", "-", "<-"], ["0", ",", "^", "+", "C"]]
        for r, row in enumerate(tasten):
            for c, t in enumerate(row):
                b = QPushButton(t); b.setFixedSize(42, 34); b.setAutoDefault(False)
                b.clicked.connect(lambda _=False, tt=t: self._taste(tt)); pad.addWidget(b, r, c)
        self.finish()

    def _ins(self, t):
        self.term.insert(t); self.term.setFocus()

    def _taste(self, t):
        if t == "<-": self.term.backspace()
        elif t == "C": self.term.clear()
        else: self._ins(t)

    def apply(self):
        self.n = self.name.text().strip(); self.t = self.term.text().strip()
        if not re.fullmatch(core._IDENT, self.n): raise ValueError


# ------------------------------------------------------------------ Grafische Modellierung

class FlowCanvas(QWidget):
    """Zeichenflaeche fuer das Flussdiagramm. Modell = sim['grafisch']."""
    def __init__(self, g):
        super().__init__()
        self.g = copy.deepcopy(g); self.tool = "zustand"; self.drag = None; self.gummi = None
        self.setMinimumSize(900, 620); self.setMouseTracking(True)
        for liste in (self.g["zustand"], self.g["rate"], self.g["konstante"]):
            for n in liste: n["box"] = self._norm(n["box"])

    @staticmethod
    def _norm(b):
        if b[4] > b[2] and b[5] > b[3]: return list(b)
        return [b[0], b[1], b[2], b[3], b[2] + b[4], b[3] + b[5]]

    def _box(self, cx, cy, name, breit):
        w = max(54, 12 + 8 * len(name)) if breit else 40
        return [int(cx), int(cy), int(cx - w / 2), int(cy - 15), int(cx + w / 2), int(cy + 15)]

    def knoten(self):
        for art in ("zustand", "rate", "konstante"):
            for i, n in enumerate(self.g[art]): yield art, i, n

    def bei(self, x, y):
        for art, i, n in self.knoten():
            b = n["box"]
            if b[2] - 4 <= x <= b[4] + 4 and b[3] - 4 <= y <= b[5] + 4: return art, i
        return None

    def pfeil_bei(self, x, y):
        for i, a in enumerate(self.g["pfeile"]):
            p = a["punkte"]
            for j in range(len(p) - 1):
                dx, dy = p[j + 1][0] - p[j][0], p[j + 1][1] - p[j][1]; L = dx * dx + dy * dy
                t = 0 if L == 0 else max(0, min(1, ((x - p[j][0]) * dx + (y - p[j][1]) * dy) / L))
                if math.hypot(x - p[j][0] - t * dx, y - p[j][1] - t * dy) < 5: return i
        return None

    def _rand(self, n, zx, zy):
        """Punkt auf dem Rand von Knoten n in Richtung (zx, zy)."""
        b = n["box"]; cx, cy = (b[2] + b[4]) / 2, (b[3] + b[5]) / 2
        dx, dy = zx - cx, zy - cy
        if dx == 0 and dy == 0: return int(cx), int(cy)
        hw, hh = (b[4] - b[2]) / 2, (b[5] - b[3]) / 2
        f = min(hw / abs(dx) if dx else 1e9, hh / abs(dy) if dy else 1e9)
        return int(cx + dx * f), int(cy + dy * f)

    def _mitte(self, n):
        b = n["box"]; return (b[2] + b[4]) / 2, (b[3] + b[5]) / 2

    def route(self, a):
        v = a["verbindung"]
        if v[2] >= 0 and v[3] >= 0: quelle, ziel = self.g["rate"][v[2]], self.g["zustand"][v[3]]
        elif v[0] >= 0 and v[4] >= 0: quelle, ziel = self.g["zustand"][v[0]], self.g["rate"][v[4]]
        elif v[1] >= 0 and v[4] >= 0: quelle, ziel = self.g["konstante"][v[1]], self.g["rate"][v[4]]
        else: return
        if a["_typ"] == 255: quelle, ziel = ziel, quelle        # Abfluss: Zustand -> Rate
        a["punkte"] = [self._rand(quelle, *self._mitte(ziel)), self._rand(ziel, *self._mitte(quelle))]
        if a["_typ"] == 255: a["punkte"].reverse()            # gespeichert wird immer Rate -> Zustand

    def route_knoten(self, art, i):
        pos = {"zustand": (0, 3), "konstante": (1,), "rate": (2, 4)}[art]
        for a in self.g["pfeile"]:
            if any(a["verbindung"][p] == i for p in pos): self.route(a)

    def name_neu(self, basis):
        namen = {n["name"].upper() for _, _, n in self.knoten()}
        i = 1
        while f"{basis}{i}".upper() in namen: i += 1
        return f"{basis}{i}"

    # --- Maus
    def mousePressEvent(self, e):
        x, y = e.position().x(), e.position().y(); k = self.bei(x, y)
        if self.tool == "pfeil" and k:
            b = self.g[k[0]][k[1]]["box"]; self.drag = (k, x - b[0], y - b[1])
        elif self.tool == "zustand" and not k:
            name, ok = QInputDialog.getText(self, "Zustandsgröße", "Name der Zustandsgröße:", text=self.name_neu("Zustand"))
            if ok and re.fullmatch(core._IDENT, name.strip()):
                self.g["zustand"].append({"box": self._box(x, y, name.strip(), True), "name": name.strip()})
        elif self.tool in ("rate", "verbindung"):
            self.gummi = [(x, y), (x, y), k]
        elif self.tool == "loeschen":
            if k: self.loesche(*k)
            else:
                i = self.pfeil_bei(x, y)
                if i is not None: del self.g["pfeile"][i]
        elif self.tool == "edit" and k:
            self.beschriften(*k)
        self.update()

    def mouseMoveEvent(self, e):
        x, y = e.position().x(), e.position().y()
        if self.drag:
            (art, i), dx, dy = self.drag; n = self.g[art][i]; b = n["box"]
            ox, oy = int(x - dx - b[0]), int(y - dy - b[1])
            n["box"] = [b[0] + ox, b[1] + oy, b[2] + ox, b[3] + oy, b[4] + ox, b[5] + oy]
            self.route_knoten(art, i); self.update()
        elif self.gummi:
            self.gummi[1] = (x, y); self.update()

    def mouseReleaseEvent(self, e):
        x, y = e.position().x(), e.position().y()
        if self.gummi:
            (x0, y0), _, start = self.gummi; ende = self.bei(x, y); self.gummi = None
            if self.tool == "rate": self.neue_rate(x0, y0, start, x, y, ende)
            else: self.neue_verbindung(x0, y0, start, ende)
        self.drag = None; self.update()

    def neue_rate(self, x0, y0, start, x, y, ende):
        a = start[1] if start and start[0] == "zustand" else None
        b = ende[1] if ende and ende[0] == "zustand" else None
        if a is None and b is None:
            QMessageBox.information(self, APP, "Eine Veränderungsrate muss an einer Zustandsgröße beginnen oder enden.\n"
                                    "Ziehen Sie mit gedrückter Maustaste von oder zu einer Zustandsgröße."); return
        if a is not None and a == b: return
        name = self.name_neu("Rate")
        r = len(self.g["rate"])
        if a is not None and b is not None: rx, ry = (x0 + x) / 2, (y0 + y) / 2
        elif a is not None: rx, ry = x, y
        else: rx, ry = x0, y0
        if a is not None and b is None and self.bei(rx, ry) == ("zustand", a):
            QMessageBox.information(self, APP, "Bitte mit gedrückter Maustaste von der Zustandsgröße weg auf eine freie Stelle ziehen."); return
        self.g["rate"].append({"box": self._box(rx, ry, name, False), "name": name, "term": "", "_x": 0})
        if a is not None: self.g["pfeile"].append({"punkte": [], "_typ": 255, "verbindung": [-1, -1, r, a, -1]})
        if b is not None: self.g["pfeile"].append({"punkte": [], "_typ": 1, "verbindung": [-1, -1, r, b, -1]})
        self.route_knoten("rate", r)
        self.beschriften("rate", r)

    def neue_verbindung(self, x0, y0, start, ende):
        if not ende or ende[0] != "rate":
            QMessageBox.information(self, APP, "Ein Wirkungspfeil muss auf einer Veränderungsrate enden."); return
        r = ende[1]
        if start and start[0] == "zustand": v = [start[1], -1, -1, -1, r]
        elif start and start[0] == "konstante": v = [-1, start[1], -1, -1, r]
        elif start is None:
            name, ok = QInputDialog.getText(self, "Konstante", "Name der Konstanten:", text=self.name_neu("Konstante"))
            if not ok or not re.fullmatch(core._IDENT, name.strip()): return
            self.g["konstante"].append({"box": self._box(x0, y0, name.strip(), True), "name": name.strip()})
            v = [-1, len(self.g["konstante"]) - 1, -1, -1, r]
        else: return
        if any(a["verbindung"] == v for a in self.g["pfeile"]): return
        a = {"punkte": [], "_typ": 1, "verbindung": v}; self.g["pfeile"].append(a); self.route(a)

    def eingaenge(self, r):
        out = []
        for a in self.g["pfeile"]:
            v = a["verbindung"]
            if v[4] == r:
                if v[0] >= 0: out.append(self.g["zustand"][v[0]]["name"])
                if v[1] >= 0: out.append(self.g["konstante"][v[1]]["name"])
        return out

    def beschriften(self, art, i):
        n = self.g[art][i]
        if art == "rate":
            term = n["term"].split(":=", 1)[1].strip() if ":=" in n["term"] else n["term"]
            d = RateDialog(self, n["name"], term, self.eingaenge(i))
            if d.exec():
                n["name"] = d.n; n["term"] = f"{d.n}:={d.t}" if d.t else ""
        else:
            name, ok = QInputDialog.getText(self, "Beschriftung", "Name:", text=n["name"])
            if ok and re.fullmatch(core._IDENT, name.strip()):
                n["name"] = name.strip(); b = n["box"]; n["box"] = self._box((b[2] + b[4]) / 2, (b[3] + b[5]) / 2, n["name"], True)
                self.route_knoten(art, i)
        self.update()

    def loesche(self, art, i):
        pos = {"zustand": (0, 3), "konstante": (1,), "rate": (2, 4)}[art]
        self.g["pfeile"] = [a for a in self.g["pfeile"] if not any(a["verbindung"][p] == i for p in pos)]
        for a in self.g["pfeile"]:
            for p in pos:
                if a["verbindung"][p] > i: a["verbindung"][p] -= 1
        del self.g[art][i]

    # --- Zeichnen
    def paintEvent(self, _):
        p = QPainter(self); p.setRenderHint(QPainter.Antialiasing); p.fillRect(self.rect(), QColor(255, 255, 255))
        male_fluss(p, self.g)
        if self.gummi:
            p.setPen(QPen(QColor(0, 90, 220), 1, Qt.DashLine)); p.drawLine(QPointF(*self.gummi[0]), QPointF(*self.gummi[1]))


def male_fluss(p, g, dx=0.0, dy=0.0):
    """Zeichnet ein Flussdiagramm (auch fuer Druck und Vorschau)."""
    def box(n):
        b = n["box"]
        if not (b[4] > b[2] and b[5] > b[3]): b = [b[0], b[1], b[2], b[3], b[2] + b[4], b[3] + b[5]]
        return QRectF(b[2] + dx, b[3] + dy, b[4] - b[2], b[5] - b[3])
    f = QFont("Arial"); f.setPixelSize(13); p.setFont(f)
    for a in g["pfeile"]:
        pts = [QPointF(x + dx, y + dy) for x, y in a["punkte"]]
        if len(pts) < 2: continue
        fluss = a["verbindung"][2] >= 0
        if fluss and a["_typ"] == 255: pts = pts[::-1]
        p.setPen(QPen(QColor(0, 0, 0) if fluss else QColor(0, 0, 160), 3 if fluss else 1.2)); p.setBrush(Qt.NoBrush)
        p.drawPolyline(QPolygonF(pts))
        a0, a1 = pts[-2], pts[-1]; ang = math.atan2(a1.y() - a0.y(), a1.x() - a0.x()); L = 11 if fluss else 9
        p.setPen(Qt.NoPen); p.setBrush(QColor(0, 0, 0) if fluss else QColor(0, 0, 160))
        p.drawPolygon(QPolygonF([a1] + [QPointF(a1.x() - L * math.cos(ang + d), a1.y() - L * math.sin(ang + d)) for d in (0.38, -0.38)]))
    for n in g["zustand"]:
        r = box(n); p.setPen(QPen(QColor(0, 0, 0), 1.6)); p.setBrush(QColor(255, 255, 224)); p.drawRect(r)
        p.drawText(r, Qt.AlignCenter, n["name"])
    for n in g["rate"]:
        r = box(n); c = r.center(); rad = min(r.height() / 2, 15)
        p.setPen(QPen(QColor(0, 0, 0), 1.6)); p.setBrush(QColor(224, 240, 255)); p.drawEllipse(c, rad, rad)
        p.drawLine(QPointF(c.x() - rad * 0.6, c.y() - rad * 0.6), QPointF(c.x() + rad * 0.6, c.y() + rad * 0.6))
        p.drawLine(QPointF(c.x() - rad * 0.6, c.y() + rad * 0.6), QPointF(c.x() + rad * 0.6, c.y() - rad * 0.6))
        p.drawText(QRectF(c.x() - 80, c.y() + rad + 1, 160, 16), Qt.AlignCenter, n["name"])
    for n in g["konstante"]:
        r = box(n); p.setPen(QPen(QColor(0, 0, 0), 1.2, Qt.DashLine)); p.setBrush(QColor(255, 255, 255)); p.drawEllipse(r)
        p.setPen(QColor(0, 0, 0)); p.drawText(r, Qt.AlignCenter, n["name"])


class GrafDialog(QDialog):
    def __init__(self, parent, sim):
        super().__init__(parent)
        self.setWindowTitle("Grafische Modellierung"); self.resize(900, 640)
        lay = QVBoxLayout(self)
        h = QHBoxLayout(); lay.addLayout(h, 1)
        bar = QVBoxLayout(); h.addLayout(bar)
        self.canvas = FlowCanvas(sim["grafisch"])
        self.grp = QButtonGroup(self)
        for key, ic, tip in (("pfeil", "move", "Verschieben"), ("edit", "label", "Eingabe der Beschriftung"), ("loeschen", "delete", "Löschen"),
                             ("zustand", "state", "Zustandsgröße"), ("rate", "rate", "Veränderungsrate"),
                             ("verbindung", "link", "Wirkungspfeil oder Konstante")):
            b = QToolButton(); b.setIcon(icon(ic, size=26)); b.setIconSize(b.iconSize() * 1.6); b.setFixedSize(40, 40)
            b.setCheckable(True); b.setToolTip(tip); b.setChecked(key == "zustand")
            b.clicked.connect(lambda _=False, k=key: self._tool(k)); self.grp.addButton(b); bar.addWidget(b)
        bar.addStretch()
        sc = QScrollArea(); sc.setWidget(self.canvas); h.addWidget(sc, 1)
        self.hinweis = QLabel(); lay.addWidget(self.hinweis); self._tool("zustand")
        bot = QHBoxLayout(); lay.addLayout(bot)
        v = QVBoxLayout(); bot.addLayout(v)
        self.vereinfacht = QCheckBox("vereinfachtes Modell"); self.vereinfacht.setChecked(bool(sim["_optionen"][1]))
        self.vereinfacht.setToolTip("Angehakt: ein Durchlauf = eine Zeiteinheit. Sonst wird die Veränderungsrate mit dt multipliziert.")
        self.erweitert = QCheckBox("erweiterte Syntax"); self.erweitert.setChecked(bool(sim["_optionen"][2]))
        self.erweitert.setToolTip("Funktionen für Zustandsgrößen zulassen?")
        v.addWidget(self.vereinfacht); v.addWidget(self.erweitert)
        box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        box.button(QDialogButtonBox.Ok).setText("OK"); box.button(QDialogButtonBox.Ok).setToolTip("In Algorithmus übersetzen")
        box.button(QDialogButtonBox.Cancel).setText("Abbrechen"); box.button(QDialogButtonBox.Cancel).setToolTip("Nicht übersetzen")
        box.addButton("Hilfe", QDialogButtonBox.HelpRole).clicked.connect(lambda: HilfeDialog(self).exec())
        box.accepted.connect(self._ok); box.rejected.connect(self.reject); bot.addWidget(box, 1)

    def _tool(self, k):
        self.canvas.tool = k
        self.hinweis.setText({"pfeil": "Verschieben: Symbol mit gedrückter Maustaste ziehen.",
                              "edit": "Beschriftung: auf ein Symbol klicken. Bei einer Veränderungsrate wird der Term eingegeben.",
                              "loeschen": "Löschen: auf ein Symbol oder einen Pfeil klicken.",
                              "zustand": "Zustandsgröße: auf eine freie Stelle klicken.",
                              "rate": "Veränderungsrate: von einer Zustandsgröße wegziehen (Abfluss), zu ihr hinziehen (Zufluss) oder von einer zur anderen.",
                              "verbindung": "Wirkungspfeil: von Zustandsgröße oder Konstante zur Veränderungsrate ziehen. Start auf freier Stelle = neue Konstante."}[k])

    def _ok(self):
        g = self.canvas.g
        if not g["zustand"]:
            QMessageBox.information(self, APP, "Das Modell enthält noch keine Zustandsgröße."); return
        fehlt = [r["name"] for r in g["rate"] if not r["term"].strip()]
        if fehlt:
            QMessageBox.warning(self, APP, "Für diese Veränderungsraten fehlt der Term: " + ", ".join(fehlt)
                                + "\nMit dem Werkzeug \"Beschriftung\" auf die Rate klicken."); return
        self.accept()
