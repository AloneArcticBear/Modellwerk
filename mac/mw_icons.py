#claude
"""mw_icons.py - selbst gezeichnete Symbole fuer Werkzeugleisten (keine fremden Grafiken)."""
from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QColor, QFont, QIcon, QPainter, QPainterPath, QPen, QPixmap, QPolygonF

_cache = {}


def icon(name, fg="#000000", size=20):
    key = (name, fg, size)
    if key in _cache:
        return _cache[key]
    px = QPixmap(size * 2, size * 2)
    px.setDevicePixelRatio(2.0)
    px.fill(Qt.transparent)
    p = QPainter(px)
    p.setRenderHint(QPainter.Antialiasing)
    c = QColor(fg)
    pen = QPen(c, 1.5); pen.setJoinStyle(Qt.RoundJoin); pen.setCapStyle(Qt.RoundCap)
    p.setPen(pen)
    s = float(size)
    P = lambda x, y: QPointF(x * s, y * s)
    R = lambda x, y, w, h: QRectF(x * s, y * s, w * s, h * s)

    def text(t, bold=False, italic=False, under=False, scale=0.7):
        f = QFont("Arial"); f.setPixelSize(int(s * scale)); f.setBold(bold); f.setItalic(italic); f.setUnderline(under)
        p.setFont(f); p.drawText(R(0, 0, 1, 1), Qt.AlignCenter, t)

    def page(x, y, w, h):
        path = QPainterPath(P(x, y)); path.lineTo(P(x + w * 0.65, y)); path.lineTo(P(x + w, y + h * 0.3))
        path.lineTo(P(x + w, y + h)); path.lineTo(P(x, y + h)); path.closeSubpath(); p.drawPath(path)

    if name == "open":
        p.drawPolygon(QPolygonF([P(.1, .3), P(.4, .3), P(.5, .4), P(.9, .4), P(.9, .8), P(.1, .8)]))
        p.drawLine(P(.1, .5), P(.9, .5))
    elif name == "save":
        p.drawRect(R(.15, .15, .7, .7)); p.drawRect(R(.3, .15, .4, .25)); p.fillRect(R(.3, .55, .4, .3), c)
    elif name == "print":
        p.drawRect(R(.15, .4, .7, .3)); p.drawRect(R(.3, .15, .4, .25)); p.drawRect(R(.3, .6, .4, .25))
    elif name == "newsim":
        page(.2, .15, .5, .7); p.drawLine(P(.65, .75), P(.95, .75)); p.drawLine(P(.8, .6), P(.8, .9))
    elif name == "copysim":
        page(.12, .12, .45, .6); page(.42, .3, .45, .6)
    elif name == "editsim":
        page(.15, .15, .5, .7); p.drawLine(P(.45, .8), P(.9, .35)); p.drawLine(P(.45, .8), P(.5, .65))
    elif name == "chart":
        p.drawLine(P(.15, .1), P(.15, .85)); p.drawLine(P(.15, .85), P(.9, .85))
        path = QPainterPath(P(.2, .75)); path.cubicTo(P(.45, .7), P(.5, .25), P(.88, .2)); p.drawPath(path)
    elif name == "table":
        p.drawRect(R(.12, .18, .76, .64))
        for y in (.39, .6): p.drawLine(P(.12, y), P(.88, y))
        for x in (.37, .63): p.drawLine(P(x, .18), P(x, .82))
    elif name == "play":
        p.setBrush(c); p.drawPolygon(QPolygonF([P(.28, .18), P(.82, .5), P(.28, .82)]))
    elif name == "stop":
        p.setBrush(c); p.drawRect(R(.25, .25, .5, .5))
    elif name == "pause":
        p.setBrush(c); p.drawRect(R(.25, .22, .17, .56)); p.drawRect(R(.58, .22, .17, .56))
    elif name == "arrow":
        p.setBrush(c); p.drawPolygon(QPolygonF([P(.25, .12), P(.25, .78), P(.42, .62), P(.55, .9), P(.66, .85), P(.53, .58), P(.75, .56)]))
    elif name == "text":
        text("T", bold=True, scale=0.8)
    elif name == "bold":
        text("F", bold=True)
    elif name == "italic":
        text("K", italic=True)
    elif name == "underline":
        text("U", under=True)
    elif name == "super":
        text("x²")
    elif name == "sub":
        text("x₂")
    elif name == "more":
        p.setBrush(c); p.drawPolygon(QPolygonF([P(.15, .25), P(.5, .5), P(.15, .75)])); p.drawPolygon(QPolygonF([P(.5, .25), P(.85, .5), P(.5, .75)]))
    elif name == "move":
        for a, b in (((.5, .1), (.5, .9)), ((.1, .5), (.9, .5))): p.drawLine(P(*a), P(*b))
        for tip, l, r in (((.5, .1), (.38, .25), (.62, .25)), ((.5, .9), (.38, .75), (.62, .75)),
                          ((.1, .5), (.25, .38), (.25, .62)), ((.9, .5), (.75, .38), (.75, .62))):
            p.drawLine(P(*tip), P(*l)); p.drawLine(P(*tip), P(*r))
    elif name == "label":
        text("Abc", scale=0.45)
    elif name == "delete":
        p.setPen(QPen(c, 2.2)); p.drawLine(P(.22, .22), P(.78, .78)); p.drawLine(P(.78, .22), P(.22, .78))
    elif name == "state":
        p.drawRect(R(.12, .28, .76, .44))
    elif name == "rate":
        p.drawEllipse(R(.3, .3, .4, .4)); p.drawLine(P(.05, .5), P(.3, .5)); p.drawLine(P(.7, .5), P(.95, .5))
        p.drawLine(P(.85, .4), P(.95, .5)); p.drawLine(P(.85, .6), P(.95, .5))
    elif name == "link":
        path = QPainterPath(P(.12, .8)); path.quadTo(P(.3, .2), P(.85, .25)); p.drawPath(path)
        p.drawLine(P(.85, .25), P(.68, .16)); p.drawLine(P(.85, .25), P(.72, .4))
    elif name == "trash":
        p.drawRect(R(.25, .3, .5, .55)); p.drawLine(P(.15, .3), P(.85, .3)); p.drawLine(P(.4, .18), P(.6, .18))
        for x in (.4, .5, .6): p.drawLine(P(x, .42), P(x, .75))
    else:
        text("?")
    p.end()
    ic = QIcon(px)
    _cache[key] = ic
    return ic
