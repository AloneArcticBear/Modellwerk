#claude
"""mw_draw.py - zeichnet die Blattobjekte (Schaubild, Text, Legende, Bild) mit QPainter. Einheit: cm."""
import math

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QFont, QFontMetricsF, QImage, QPainter, QPainterPath, QPen, QPolygonF

import mw_core as core

PEN_STYLES = [Qt.SolidLine, Qt.DashLine, Qt.DotLine, Qt.DashDotLine, Qt.DashDotDotLine, Qt.NoPen]
_images = {}


def qcolor(farbe):
    return QColor(farbe[0], farbe[1], farbe[2])


def qfont(name, size_pt, scale, fett=False, kursiv=False, unter=False):
    f = QFont(name)
    f.setPixelSize(max(1, int(round(size_pt / 72.0 * 2.54 * scale))))
    f.setBold(fett); f.setItalic(kursiv); f.setUnderline(unter)
    return f


def measure(text, font, size):
    """Breite/Hoehe eines Textes in cm (fuer den Schaubild-Aufbau)."""
    fm = QFontMetricsF(qfont(font, size, 100.0))
    return fm.horizontalAdvance(text) / 100.0, fm.height() / 100.0


def _pen(farbe, stil, dicke_px):
    p = QPen(qcolor(farbe), dicke_px)
    p.setStyle(PEN_STYLES[stil] if 0 <= stil < len(PEN_STYLES) else Qt.SolidLine)
    p.setCapStyle(Qt.FlatCap); p.setJoinStyle(Qt.RoundJoin)
    return p


def _image(o):
    key = id(o["data"])
    if key not in _images:
        img = QImage.fromData(bytes(o["data"]))
        _images[key] = img
    return _images[key]


def text_style(o):
    """Eigene Formatierung eines Nutzertexts (fett/kursiv/unterstrichen/hoch/tief), im Feld 'stil' abgelegt."""
    return o.get("stil_claude", {})


def draw(p, o, s, ox=0.0, oy=0.0, bis=None, markiert=False, kurven_bis=None):
    """Zeichnet Objekt o. s = Pixel pro cm, (ox, oy) = Ursprung des Elternobjekts in cm.
    bis = Punktindex, bis zu dem Kurven gezeichnet werden (Animation)."""
    k = o["k"]
    g = o["g"]
    if k in ("chart", "achse", "kurve"):
        x, y = ox + g[0], oy + g[1]
        if k == "chart" and not o["dreid"]:
            pr = core.chart_plot_rect(o)
            p.fillRect(QRectF((x + pr[0]) * s, (y + pr[1]) * s, pr[2] * s, pr[3] * s), qcolor(o["farbe"]))
        if k == "chart" and o["dreid"]:
            p.fillRect(QRectF(x * s, y * s, g[2] * s, g[3] * s), qcolor(o["farbe"]))
        mi = 0
        for ci, c in enumerate(o["kids"]):
            b = bis
            if k == "chart" and kurven_bis is not None and c["k"] == "kurve":
                b = kurven_bis.get(ci)
                if b == -1: continue
            if k == "kurve" and bis is not None and (c["k"] == "marke" or (c["k"] == "poly" and c["zu"])):
                mi += 1
                if mi - 1 > bis: continue
            if k == "chart" and c["k"] == "kurve" and not o["dreid"]:
                pr = core.chart_plot_rect(o)
                p.save(); p.setClipRect(QRectF((x + pr[0]) * s - 3, (y + pr[1]) * s - 3, pr[2] * s + 6, pr[3] * s + 6), Qt.IntersectClip)
                draw(p, c, s, x, y, b); p.restore()
            else:
                draw(p, c, s, x, y, b)
    elif k == "linie":
        if o["stil"] == 5: return
        a = QPointF((ox + g[0]) * s, (oy + g[1]) * s); b = QPointF((ox + g[0] + g[2]) * s, (oy + g[1] + g[3]) * s)
        p.setPen(_pen(o["farbe"], o["stil"], max(1.0, o["a0"])))
        p.drawLine(a, b)
        if o["pfeil"]:
            ang = math.atan2(b.y() - a.y(), b.x() - a.x()); L = max(6.0, 0.22 * s)
            head = QPolygonF([b] + [QPointF(b.x() - L * math.cos(ang + d), b.y() - L * math.sin(ang + d)) for d in (0.32, -0.32)])
            p.setPen(Qt.NoPen); p.setBrush(qcolor(o["farbe"])); p.drawPolygon(head); p.setBrush(Qt.NoBrush)
    elif k == "poly":
        pts = o["pts"] if bis is None or o["zu"] else o["pts"][:bis + 1]
        if not pts: return
        x, y = ox + g[0], oy + g[1]
        q = [QPointF((x + a) * s, (y + b) * s) for a, b in pts]
        if o["zu"]:
            p.setPen(_pen(o["farbe"], 0, 1)); p.setBrush(qcolor(o["farbe"])); p.drawPolygon(QPolygonF(q)); p.setBrush(Qt.NoBrush)
            return
        if o["stil"] == 5: return
        p.setPen(_pen(o["farbe"], o["stil"], max(1.4, o["a0"]))); p.setBrush(Qt.NoBrush)
        if o["t"] == 0x0C and 2 < len(q) < 3000:
            path = QPainterPath(q[0])
            for i in range(1, len(q) - 1):
                mid = QPointF((q[i].x() + q[i + 1].x()) / 2, (q[i].y() + q[i + 1].y()) / 2)
                path.quadTo(q[i], mid)
            path.lineTo(q[-1]); p.drawPath(path)
        else:
            p.drawPolyline(QPolygonF(q))
    elif k == "marke":
        r = max(1.5, o["d"] * 0.75 * s)
        c = QPointF((ox + g[0] + g[2] / 2) * s, (oy + g[1] + g[3] / 2) * s)
        col = qcolor(o["farbe"])
        if o["form"] == 0:
            p.setPen(QPen(col, 1.2)); p.drawLine(QPointF(c.x() - r, c.y() - r), QPointF(c.x() + r, c.y() + r))
            p.drawLine(QPointF(c.x() - r, c.y() + r), QPointF(c.x() + r, c.y() - r))
        elif o["form"] == 1:
            p.setPen(QPen(col, 1.2)); p.setBrush(Qt.NoBrush); p.drawEllipse(c, r, r)
        else:
            p.setPen(Qt.NoPen); p.setBrush(col); p.drawEllipse(c, r, r); p.setBrush(Qt.NoBrush)
    elif k == "text":
        st = text_style(o)
        size = o["size"] * (0.7 if st.get("hoch") or st.get("tief") else 1.0)
        p.setFont(qfont(o["font"], size, s, st.get("fett", False), st.get("kursiv", False), st.get("unter", False)))
        p.setPen(qcolor(o["farbe"]))
        x, y = (ox + g[0]) * s, (oy + g[1]) * s
        fm = QFontMetricsF(p.font())
        dy = -0.25 * fm.height() if st.get("hoch") else (0.25 * fm.height() if st.get("tief") else 0.0)
        p.save(); p.translate(x, y)
        if o["winkel"]: p.rotate(-o["winkel"] / 10.0)
        lines = core.text_of(o).split("\r")
        for i, line in enumerate(lines):
            p.drawText(QPointF(0.0, fm.ascent() + dy + i * fm.height()), line)
        if "exp_claude" in o:
            w = fm.horizontalAdvance(lines[0])
            p.setFont(qfont(o["font"], size * 0.7, s))
            p.drawText(QPointF(w + 1, fm.ascent() * 0.55), str(o["exp_claude"]))
        p.restore()
    elif k == "legende":
        x, y = (ox + g[0]) * s, (oy + g[1]) * s; h = g[3] * s
        p.setPen(_pen(o["farbe"], o["stil"] if o["stil"] != 5 else 0, 2)); p.drawLine(QPointF(x, y + h / 2), QPointF(x + 0.9 * s, y + h / 2))
        p.setFont(qfont("Arial", 10.0, s)); p.setPen(QColor(0, 0, 0))
        fm = QFontMetricsF(p.font())
        p.drawText(QPointF(x + 1.1 * s, y + (h + fm.ascent() - fm.descent()) / 2), o["name"])
    elif k == "bild":
        img = _image(o)
        r = QRectF((ox + g[0]) * s, (oy + g[1]) * s, g[2] * s, g[3] * s)
        if img.isNull():
            p.setPen(QPen(QColor(128, 128, 128), 1, Qt.DashLine)); p.drawRect(r); p.drawText(r, Qt.AlignCenter, "Bild")
        else:
            p.drawImage(r, img)
    if markiert:
        r = bounds(o, ox, oy)
        p.setPen(QPen(QColor(0, 90, 220), 1, Qt.DashLine)); p.setBrush(Qt.NoBrush)
        p.drawRect(QRectF(r[0] * s - 2, r[1] * s - 2, r[2] * s + 4, r[3] * s + 4))
        p.setPen(Qt.NoPen); p.setBrush(QColor(0, 90, 220))
        p.drawRect(QRectF((r[0] + r[2]) * s - 2, (r[1] + r[3]) * s - 2, 7, 7)); p.setBrush(Qt.NoBrush)


def bounds(o, ox=0.0, oy=0.0):
    g = o["g"]
    if o["k"] == "linie":
        x0, x1 = sorted((g[0], g[0] + g[2])); y0, y1 = sorted((g[1], g[1] + g[3]))
        return [ox + x0, oy + y0, x1 - x0, y1 - y0]
    if o["k"] == "text" and o["winkel"] in (900, 2700):
        return [ox + g[0], oy + g[1] - g[2], g[3], g[2]]
    return [ox + g[0], oy + g[1], max(g[2], 0.05), max(g[3], 0.05)]


def hit(objekte, x, y):
    """Welches Objekt liegt bei (x, y) cm? Liefert (index, teil) mit teil = 'kurve:i' / 'achse:i' / ''."""
    for i in range(len(objekte) - 1, -1, -1):
        o = objekte[i]
        b = bounds(o)
        if not (b[0] - 0.1 <= x <= b[0] + b[2] + 0.1 and b[1] - 0.1 <= y <= b[1] + b[3] + 0.1):
            continue
        if o["k"] == "chart":
            cx, cy = x - o["g"][0], y - o["g"][1]
            best = None
            for j, c in enumerate(o["kids"]):
                if c["k"] == "kurve":
                    d = _kurven_abstand(c, cx, cy)
                    if d < 0.2 and (best is None or d < best[0]): best = (d, f"kurve:{j}")
            if best: return i, best[1]
            for j, c in enumerate(o["kids"]):
                if c["k"] == "achse":
                    cb = bounds(c)
                    if cb[0] - 0.05 <= cx <= cb[0] + cb[2] + 0.05 and cb[1] - 0.05 <= cy <= cb[1] + cb[3] + 0.05:
                        return i, f"achse:{j}"
        return i, ""
    return None, ""


def _kurven_abstand(c, x, y):
    best = 1e9
    gx, gy = c["g"][0], c["g"][1]
    for k in c["kids"]:
        if k["k"] == "poly":
            pts = k["pts"]; step = max(1, len(pts) // 800)
            px, py = gx + k["g"][0], gy + k["g"][1]
            for i in range(0, len(pts) - step, step):
                best = min(best, _seg_dist(x, y, px + pts[i][0], py + pts[i][1], px + pts[i + step][0], py + pts[i + step][1]))
        elif k["k"] == "marke":
            best = min(best, math.hypot(x - gx - k["g"][0], y - gy - k["g"][1]))
    return best


def _seg_dist(x, y, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / L))
    return math.hypot(x - x1 - t * dx, y - y1 - t * dy)


def kurven_punkte(chart):
    """Alle Kurven eines Schaubilds als Liste von Punktlisten in Blatt-cm (fuer die Animation), eine Liste je Kurve.
    Linie: ihre Punkte; Punkt-Diagramm: die Mitten der Marken; Balken: die Mitte der Balken-Oberkante."""
    out = []
    for c in chart["kids"]:
        if c["k"] != "kurve": continue
        ox = chart["g"][0] + c["g"][0]; oy = chart["g"][1] + c["g"][1]
        linie = next((k for k in c["kids"] if k["k"] == "poly" and not k["zu"]), None)
        if linie is not None:
            out.append([(ox + linie["g"][0] + a, oy + linie["g"][1] + b) for a, b in linie["pts"]]); continue
        marken = [k for k in c["kids"] if k["k"] == "marke"]
        if marken:
            out.append([(ox + m["g"][0] + m["g"][2] / 2, oy + m["g"][1] + m["g"][3] / 2) for m in marken]); continue
        balken = [k for k in c["kids"] if k["k"] == "poly" and k["zu"] and len(k["pts"]) == 4]
        out.append([(ox + b["g"][0] + (b["pts"][1][0] + b["pts"][2][0]) / 2, oy + b["g"][1] + b["pts"][1][1]) for b in balken])
    return out
