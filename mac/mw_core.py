#claude
"""
mw_core.py - Rechenkern von Modellwerk (Dateiformat MOEBIUS30 lesen/schreiben, Interpreter)
urspruenglich: moebius_prg_claude.py - Leser, Exporter und Nachrechner fuer Moebius-3.0-Dateien (*.prg)

Moebius (Detlef Hoche) speichert Modelle im Binaerformat "MOEBIUS30".
Dieses Skript liest den Simulationsteil vollstaendig (Programm, Startwerte,
gespeicherte Werte, sprachliches und grafisches Modell) und kann die
Simulation selbst nachrechnen.

Aufruf:
    python3 moebius_prg_claude.py info   datei.prg
    python3 moebius_prg_claude.py json   datei.prg [ausgabe.json]
    python3 moebius_prg_claude.py run    datei.prg [simulationsnummer]   -> CSV auf stdout
    python3 moebius_prg_claude.py verify datei.prg   (eigene Rechnung vs. gespeicherte Werte)

Nur Python-Standardbibliothek, getestet mit Python 3.9+.
"""
import json
import math
import random
import re
import struct
import sys

ENCODING = "cp1252"
MAX_WERTE = 100000      # hoechste Zahl von Durchlaeufen (Original Moebius: 8191)
MAX_ORIGINAL = 8191
_PRINTABLE = set(range(32, 127)) | set(range(160, 256)) | {9}


class FormatError(Exception):
    pass


class _Reader:
    def __init__(self, data, pos=0):
        self.b = data
        self.p = pos

    def _need(self, k):
        if self.p + k > len(self.b):
            raise FormatError("Dateiende erreicht")

    def u8(self):
        self._need(1)
        v = self.b[self.p]
        self.p += 1
        return v

    def i32(self):
        self._need(4)
        v = struct.unpack_from("<i", self.b, self.p)[0]
        self.p += 4
        return v

    def f64(self):
        self._need(8)
        v = struct.unpack_from("<d", self.b, self.p)[0]
        self.p += 8
        return v

    def raw(self, k):
        self._need(k)
        v = self.b[self.p:self.p + k]
        self.p += k
        return v

    def count(self, limit=100000):
        n = self.i32()
        if not 0 <= n <= limit:
            raise FormatError(f"unplausible Anzahl {n}")
        return n

    def lstr(self, maxlen=100000, check=True):
        """Delphi-AnsiString: int32 Laenge + Zeichen (cp1252)."""
        n = self.i32()
        if not 0 <= n <= maxlen:
            raise FormatError(f"unplausible Stringlaenge {n}")
        v = self.raw(n)
        if check and not all(c in _PRINTABLE for c in v):
            raise FormatError("kein Text")
        return v.decode(ENCODING)


# ---------------------------------------------------------------- Simulation

def _read_variable(r):
    v = {}
    v["name"] = r.lstr(200)
    v["simulation"] = r.lstr(500)          # leer bei Dateien mit nur einer Simulation
    v["startwert_aktiv"] = r.u8()           # 1 = steht in der Startwert-Tabelle
    v["startwert"] = r.f64()
    v["flag_a"] = r.u8()                    # Bedeutung unsicher (Anzeige-Option)
    v["flag_b"] = r.u8()                    # Bedeutung unsicher (Anzeige-Option)
    n = r.count(MAX_WERTE + 1)
    v["werte"] = list(struct.unpack_from(f"<{n}d", r.raw(8 * n))) if n else []
    # Darstellungs-/Animationsattribute der Kurve (nur teilweise entschluesselt)
    v["_attr1"] = r.raw(6).hex()
    v["_attr2"] = r.i32()
    v["_kurve"] = r.raw(21).hex()           # Typ, Punkte, Animation ...
    v["animationsbild_hex"] = r.lstr(100_000_000)   # Bild (PNG/BMP) als Hex-Text, meist leer
    v["_attr3"] = r.raw(6).hex()
    v["_attr4"] = [r.i32(), r.i32(), r.i32()]
    return v


def _box(r):
    return [r.i32() for _ in range(6)]


def _read_simulation(r):
    s = {}
    s["name"] = r.lstr(500)
    s["programm"] = [r.lstr() for _ in range(r.count())]
    s["_unbekannt"] = r.i32()
    nv = r.i32()
    if not 1 <= nv <= 1000:
        raise FormatError(f"unplausible Variablenanzahl {nv}")
    s["variablen"] = [_read_variable(r) for _ in range(nv)]
    s["x_achse"] = r.lstr(500)
    s["y_achse"] = r.lstr(500)
    s["wiederhole"] = r.i32()               # "Wiederhole ... mal" (Original max. 8191)
    s["gross_klein"] = r.u8()               # 1 = Gross-/Kleinschreibung beachten
    s["sprachlich"] = {
        "zustandsgroessen": [r.lstr() for _ in range(r.count())],
        "raten": [r.lstr() for _ in range(r.count())],
        # Saetze als Folge von je 3 Feldern: Subjekt, Praedikat, Term
        "felder": [r.lstr() for _ in range(r.count())],
    }
    g = {"zustand": [], "rate": [], "konstante": [], "pfeile": []}
    for _ in range(r.count()):
        g["zustand"].append({"box": _box(r), "name": r.lstr()})
    for _ in range(r.count()):
        g["rate"].append({"box": _box(r), "name": r.lstr(), "term": r.lstr(), "_x": r.i32()})
    for _ in range(r.count()):
        g["konstante"].append({"box": _box(r), "name": r.lstr()})
    for _ in range(r.count()):
        n = r.count(10000)
        pts = [(r.i32(), r.i32()) for _ in range(n)]
        g["pfeile"].append({"punkte": pts, "_typ": r.u8(), "verbindung": [r.i32() for _ in range(5)]})
    s["grafisch"] = g
    t = list(r.raw(3))
    s["_optionen"] = t                      # vermutlich [?, vereinfachtes Modell, erweiterte Syntax]
    return s


def _find_simulations(data, start=0x3A):
    """Sucht den Beginn des Simulationsteils (int32 Anzahl + erste Simulation)."""
    for p in range(start, len(data) - 8):
        n = struct.unpack_from("<i", data, p)[0]
        if not 1 <= n <= 100:
            continue
        try:
            _read_simulation(_Reader(data, p + 4))
            return p
        except FormatError:
            continue
    raise FormatError("Simulationsteil nicht gefunden")


def parse(path):
    data = open(path, "rb").read()
    if data[:9] != b"MOEBIUS30":
        raise FormatError("Dies ist keine Moebius-3.0-Datei.")
    doc = {
        "datei": path,
        "kopf": {
            "magic": "MOEBIUS30",
            "optionen": list(data[9:13]),
            "werte_cm": list(struct.unpack_from("<2d", data, 0x22)),
            "anzahl_blattobjekte": struct.unpack_from("<i", data, 0x36)[0],
        },
    }
    p = _find_simulations(data)
    doc["blattobjekte_bereich"] = {"von": 0x3A, "bis": p, "bytes": p - 0x3A}
    doc["_prefix"] = data[:p]
    r = _Reader(data, p)
    n = r.i32()
    doc["simulationen"] = [_read_simulation(r) for _ in range(n)]
    doc["aktive_simulation"] = r.i32()
    if r.p != len(data):
        doc["_rest_bytes"] = len(data) - r.p
    return doc


# ---------------------------------------------------------------- Interpreter

_FUN = {
    "SIN": math.sin, "COS": math.cos, "ARCTAN": math.atan, "EXP": math.exp,
    "LN": math.log, "SQR": lambda x: x * x, "SQRT": math.sqrt,
    "FRAC": lambda x: x - math.trunc(x), "INT": lambda x: float(math.trunc(x)),
    "ABS": abs, "RANDOM": lambda x=1.0: random.random() * x,
}
_IDENT = r"[A-Za-z_ÄÖÜäöüß][A-Za-z_0-9ÄÖÜäöüß]*"


def _ident(name, case_sensitive):
    n = name if case_sensitive and name.upper() not in _FUN else name.upper()
    return "v_" + n.replace("ß", "SS") if n not in _FUN else n


def _expr(e, cs):
    e = re.sub(r"(\d),(\d)", r"\1.\2", e)                  # Dezimalkomma
    e = e.replace("<>", "!=")
    e = re.sub(r"(?<![<>!:=])=(?!=)", "==", e)             # Vergleich
    return re.sub(_IDENT, lambda m: _ident(m.group(0), cs), e)


def translate(lines, case_sensitive=False):
    """Uebersetzt das Moebius-Programm in Python-Code (eine Schleifen-Iteration)."""
    out = []
    for line in lines:
        line = line.split("//")[0].strip()
        for st in filter(None, (x.strip() for x in line.split(";"))):
            cond = None; kw = "if"
            m = re.match(r"(?i)if\s+(.*?)\s+then\s+(.*)", st)
            if m:
                cond, st = m.group(1), m.group(2)
            else:
                m = re.match(r"(?i)while\s+(.*?)\s+do\s+(.*)", st)
                if m:
                    cond, st, kw = m.group(1), m.group(2), "while"
            if ":=" in st:
                var, e = st.split(":=", 1)
            elif "=" in st:
                var, e = st.split("=", 1)
            else:
                raise FormatError(f"Anweisung nicht verstanden: {st!r}")
            code = f"{_ident(var.strip(), case_sensitive)} = {_expr(e, case_sensitive)}"
            if cond:
                code = f"{kw} {_expr(cond, case_sensitive)}: {code}"
            out.append(code)
    return "\n".join(out)


def run(sim, steps=None):
    """Rechnet eine Simulation nach. Liefert {Variablenname: [Werte nach jedem Durchlauf]}."""
    cs = bool(sim["gross_klein"])
    env = dict(_FUN)
    for v in sim["variablen"]:
        env[_ident(v["name"], cs)] = v["startwert"]
    code = compile(translate(sim["programm"], cs), sim["name"], "exec")
    hist = {v["name"]: [] for v in sim["variablen"]}
    for _ in range(steps or sim["wiederhole"]):
        exec(code, env)
        for v in sim["variablen"]:
            hist[v["name"]].append(env[_ident(v["name"], cs)])
    return hist



# ---------------------------------------------------------------- Schreiben

def _w_i32(out, v): out += struct.pack("<i", v)
def _w_str(out, s):
    b = s.encode(ENCODING, "replace"); out += struct.pack("<i", len(b)) + b
def _w_list(out, items):
    _w_i32(out, len(items))
    for s in items: _w_str(out, s)


def new_variable(name, start=0.0, has_start=True, sim_name=""):
    return {"name": name, "simulation": sim_name, "startwert_aktiv": 1 if has_start else 0,
            "startwert": float(start), "flag_a": 0, "flag_b": 0, "werte": [],
            "_attr1": "00" * 6, "_attr2": 10, "_kurve": "00" * 21, "animationsbild_hex": "",
            "_attr3": "00" * 6, "_attr4": [10, 4, 64]}


def new_simulation(name="Simulation"):
    return {"name": name, "programm": [], "_unbekannt": 0, "variablen": [],
            "x_achse": "", "y_achse": "", "wiederhole": 100, "gross_klein": 0,
            "sprachlich": {"zustandsgroessen": [], "raten": [], "felder": []},
            "grafisch": {"zustand": [], "rate": [], "konstante": [], "pfeile": []},
            "_optionen": [0, 1, 0]}


def _write_simulation(out, s):
    _w_str(out, s["name"]); _w_list(out, s["programm"]); _w_i32(out, s["_unbekannt"])
    _w_i32(out, len(s["variablen"]))
    for v in s["variablen"]:
        _w_str(out, v["name"]); _w_str(out, v["simulation"])
        out.append(v["startwert_aktiv"]); out += struct.pack("<d", v["startwert"])
        out.append(v["flag_a"]); out.append(v["flag_b"])
        _w_i32(out, len(v["werte"])); out += struct.pack(f"<{len(v['werte'])}d", *v["werte"])
        out += bytes.fromhex(v["_attr1"]); _w_i32(out, v["_attr2"]); out += bytes.fromhex(v["_kurve"])
        _w_str(out, v["animationsbild_hex"]); out += bytes.fromhex(v["_attr3"])
        for x in v["_attr4"]: _w_i32(out, x)
    _w_str(out, s["x_achse"]); _w_str(out, s["y_achse"]); _w_i32(out, s["wiederhole"])
    out.append(s["gross_klein"])
    sp = s["sprachlich"]
    _w_list(out, sp["zustandsgroessen"]); _w_list(out, sp["raten"]); _w_list(out, sp["felder"])
    g = s["grafisch"]
    _w_i32(out, len(g["zustand"]))
    for z in g["zustand"]:
        for x in z["box"]: _w_i32(out, x)
        _w_str(out, z["name"])
    _w_i32(out, len(g["rate"]))
    for z in g["rate"]:
        for x in z["box"]: _w_i32(out, x)
        _w_str(out, z["name"]); _w_str(out, z["term"]); _w_i32(out, z["_x"])
    _w_i32(out, len(g["konstante"]))
    for z in g["konstante"]:
        for x in z["box"]: _w_i32(out, x)
        _w_str(out, z["name"])
    _w_i32(out, len(g["pfeile"]))
    for a in g["pfeile"]:
        _w_i32(out, len(a["punkte"]))
        for x, y in a["punkte"]: _w_i32(out, x); _w_i32(out, y)
        out.append(a["_typ"])
        for x in a["verbindung"]: _w_i32(out, x)
    out += bytes(s["_optionen"])


def dump(doc):
    """Erzeugt die Bytes einer .prg-Datei. Braucht doc['_prefix'] (Kopf + Blattobjekte der Originaldatei)."""
    out = bytearray(doc["_prefix"])
    _w_i32(out, len(doc["simulationen"]))
    for s in doc["simulationen"]: _write_simulation(out, s)
    _w_i32(out, min(doc.get("aktive_simulation", 0), len(doc["simulationen"]) - 1))
    return bytes(out)


# ---------------------------------------------------------------- Hilfen fuer die Oberflaeche

KEYWORDS = {"IF", "THEN", "WHILE", "DO"}


def program_variables(lines, case_sensitive=False):
    """Alle Variablennamen eines Programms in Reihenfolge des ersten Auftretens, und die zugewiesenen."""
    seen, assigned = [], set()
    for line in lines:
        line = line.split("//")[0]
        for st in line.split(";"):
            body = re.sub(r"(?i)^\s*(if|while)\s+.*?\s+(then|do)\s+", "", st)
            m = re.match(r"\s*(" + _IDENT + r")\s*:?=", body)
            if m:
                assigned.add(m.group(1) if case_sensitive else m.group(1).upper())
            for name in re.findall(_IDENT, st):
                up = name.upper()
                if up in _FUN or up in KEYWORDS: continue
                key = name if case_sensitive else up
                if key not in seen: seen.append(key)
    return seen, assigned


class Runner:
    """Fuehrt eine Simulation schrittweise aus ('Rechnen' und 'Weiter rechnen')."""
    def __init__(self, sim):
        self.sim = sim
        self.cs = bool(sim["gross_klein"])
        self.env = dict(_FUN)
        for v in sim["variablen"]:
            self.env[_ident(v["name"], self.cs)] = v["startwert"]
            v["werte"] = []
        self.code = compile(translate(sim["programm"], self.cs), "<Programm>", "exec")

    def step(self, n):
        vs = [(v["werte"], _ident(v["name"], self.cs)) for v in self.sim["variablen"]]
        for _ in range(n):
            if vs and len(vs[0][0]) >= MAX_WERTE: break
            exec(self.code, self.env)
            for werte, key in vs: werte.append(float(self.env[key]))


# ================================================================ Arbeitsblatt (Blattobjekte)
# Das Blatt ist eine Liste von Zeichenobjekten in cm:
#   Schaubild (Gruppe 0x40) mit Hilfslinien, Achsen (Gruppe 0x3f) und Kurven (Gruppe 0x05),
#   Text (0x08), Legenden-Eintrag (0x0f), Bild (0x07).
# Unbekannte Felder werden unveraendert mitgefuehrt, damit Dateien bytegleich bleiben.

T_CHART, T_ACHSE, T_KURVE = 0x40, 0x3F, 0x05
STILE = ["durchgezogen", "gestrichelt", "gepunktet", "Strich-Punkt", "Strich-Punkt-Punkt", "unsichtbar"]


def _rd_obj(r):
    p = r.p
    t = r.u8()
    if t in (T_CHART, T_ACHSE, T_KURVE):
        o = {"k": {T_CHART: "chart", T_ACHSE: "achse", T_KURVE: "kurve"}[t],
             "g": [r.f64() for _ in range(4)], "z": r.i32()}
        o["kids"] = [_rd_obj(r) for _ in range(r.count(20000))]
        if t == T_ACHSE:
            o["tr"] = r.raw(111)
        elif t == T_CHART:
            o["a"] = r.i32(); o["f"] = r.f64(); o["plot"] = [r.f64() for _ in range(4)]
            o["dreid"] = r.u8(); o["pc"] = [r.i32() for _ in range(4)]
            o["farbe"] = r.raw(4); o["b1"] = r.u8(); o["timer"] = r.i32(); o["b2"] = r.u8()
            o["font"] = r.lstr(100); o["fs"] = r.i32(); o["i0"] = r.i32(); o["b3"] = r.u8()
            o["zachse"] = None if o["dreid"] else _rd_obj(r)
            o["idx"] = [r.i32() for _ in range(3 if o["dreid"] else 2)]
        return o
    if t == 2:
        return {"k": "linie", "g": [r.f64() for _ in range(4)], "a0": r.i32(), "farbe": r.raw(4),
                "stil": r.u8(), "d1": r.f64(), "pfeil": r.u8(), "b2": r.u8(), "d2": r.f64(),
                "b3": r.u8(), "n": r.i32()}
    if t in (0x0B, 0x0C):
        o = {"k": "poly", "t": t, "g": [r.f64() for _ in range(4)], "a0": r.i32(), "farbe": r.raw(4),
             "stil": r.u8(), "d1": r.f64(), "f1": r.u8(), "i1": r.i32(), "f2": r.u8(), "i2": r.i32(),
             "d2": r.f64()}
        n = r.count(1000000)
        flat = struct.unpack_from(f"<{2 * n}d", r.raw(16 * n)) if n else ()
        o["pts"] = list(zip(flat[0::2], flat[1::2]))
        o["zu"] = r.u8()
        return o
    if t == 8:
        o = {"k": "text", "g": [r.f64() for _ in range(4)], "winkel": r.i32(), "farbe": r.raw(4),
             "f1": r.u8(), "d1": r.f64(), "farbe2": r.raw(4), "i1": r.i32(), "f2": r.u8(), "f3": r.u8(),
             "bb": r.raw(2), "font": r.lstr(100), "size": r.f64(), "m": [r.f64() for _ in range(6)],
             "i": r.i32(), "b2": r.raw(2), "sup": [r.f64() for _ in range(3)], "b3": r.raw(2)}
        o["chars"] = [r.raw(78) for _ in range(r.count(1000000))]
        return o
    if t == 0x0F:
        return {"k": "legende", "g": [r.f64() for _ in range(4)], "a0": r.i32(), "farbe": r.raw(4),
                "stil": r.u8(), "d": r.f64(), "name": r.lstr(1000)}
    if t == 0x0D:
        return {"k": "marke", "g": [r.f64() for _ in range(4)], "a0": r.i32(), "farbe": r.raw(4),
                "stil": r.u8(), "d": r.f64(), "form": r.u8()}
    if t == 7:
        o = {"k": "bild", "g": [r.f64() for _ in range(4)], "a0": r.i32()}
        size = r.count(200_000_000)
        o["ext"] = r.raw(r.u8()); o["data"] = r.raw(size); o["tr"] = r.raw(6)
        return o
    raise FormatError(f"unbekannter Objekttyp {t:#x} bei {p:#x}")


def _wr_obj(out, o):
    k = o["k"]
    d = lambda *v: out.extend(struct.pack(f"<{len(v)}d", *v))
    if k in ("chart", "achse", "kurve"):
        out.append({"chart": T_CHART, "achse": T_ACHSE, "kurve": T_KURVE}[k])
        d(*o["g"]); _w_i32(out, o["z"]); _w_i32(out, len(o["kids"]))
        for c in o["kids"]: _wr_obj(out, c)
        if k == "achse":
            out += o["tr"]
        elif k == "chart":
            _w_i32(out, o["a"]); d(o["f"]); d(*o["plot"]); out.append(o["dreid"])
            for v in o["pc"]: _w_i32(out, v)
            out += o["farbe"]; out.append(o["b1"]); _w_i32(out, o["timer"]); out.append(o["b2"])
            _w_str(out, o["font"]); _w_i32(out, o["fs"]); _w_i32(out, o["i0"]); out.append(o["b3"])
            if not o["dreid"]: _wr_obj(out, o["zachse"])
            for v in o["idx"]: _w_i32(out, v)
    elif k == "linie":
        out.append(2); d(*o["g"]); _w_i32(out, o["a0"]); out += o["farbe"]; out.append(o["stil"])
        d(o["d1"]); out.append(o["pfeil"]); out.append(o["b2"]); d(o["d2"]); out.append(o["b3"]); _w_i32(out, o["n"])
    elif k == "poly":
        out.append(o["t"]); d(*o["g"]); _w_i32(out, o["a0"]); out += o["farbe"]; out.append(o["stil"])
        d(o["d1"]); out.append(o["f1"]); _w_i32(out, o["i1"]); out.append(o["f2"]); _w_i32(out, o["i2"]); d(o["d2"])
        _w_i32(out, len(o["pts"]))
        if o["pts"]: d(*[c for pt in o["pts"] for c in pt])
        out.append(o["zu"])
    elif k == "text":
        out.append(8); d(*o["g"]); _w_i32(out, o["winkel"]); out += o["farbe"]; out.append(o["f1"]); d(o["d1"])
        out += o["farbe2"]; _w_i32(out, o["i1"]); out.append(o["f2"]); out.append(o["f3"]); out += o["bb"]
        _w_str(out, o["font"]); d(o["size"]); d(*o["m"]); _w_i32(out, o["i"]); out += o["b2"]; d(*o["sup"]); out += o["b3"]
        _w_i32(out, len(o["chars"]))
        for c in o["chars"]: out += c
    elif k == "legende":
        out.append(0x0F); d(*o["g"]); _w_i32(out, o["a0"]); out += o["farbe"]; out.append(o["stil"]); d(o["d"]); _w_str(out, o["name"])
    elif k == "marke":
        out.append(0x0D); d(*o["g"]); _w_i32(out, o["a0"]); out += o["farbe"]; out.append(o["stil"]); d(o["d"]); out.append(o["form"])
    elif k == "bild":
        out.append(7); d(*o["g"]); _w_i32(out, o["a0"]); _w_i32(out, len(o["data"]))
        out.append(len(o["ext"])); out += o["ext"]; out += o["data"]; out += o["tr"]


def parse_sheet(prefix):
    """Zerlegt Kopf + Blattobjekte (doc['_prefix']) in {'kopf': bytes, 'objekte': [...], 'ende': bytes}."""
    r = _Reader(prefix, 0x36)
    objs = [_rd_obj(r) for _ in range(r.count(100000))]
    return {"kopf": prefix[:0x36], "objekte": objs, "ende": prefix[r.p:]}


def dump_sheet(sheet):
    out = bytearray(sheet["kopf"]); _w_i32(out, len(sheet["objekte"]))
    for o in sheet["objekte"]: _wr_obj(out, o)
    out += sheet["ende"]
    return bytes(out)


NEW_HEADER = (b"MOEBIUS30" + bytes([0, 0, 1, 1]) + bytes(4) + struct.pack("<i", 5) + bytes(13)
              + struct.pack("<2d", 16.0, 12.0) + bytes(4))


def new_sheet():
    return {"kopf": NEW_HEADER, "objekte": [], "ende": bytes(5)}


def text_of(o):
    return "".join(bytes([c[0]]).decode(ENCODING, "replace") for c in o["chars"])


def rgb(farbe):
    return farbe[0], farbe[1], farbe[2]


def farbe_bytes(r, g, b):
    return bytes([r, g, b, 0])


# ================================================================ Einstellungen je Groesse (Kurve, Tabelle)

FARBEN = [("schwarz", (0, 0, 0)), ("dunkelblau", (0, 0, 128)), ("dunkelgrün", (0, 128, 0)),
          ("blaugrün", (0, 128, 128)), ("dunkelrot", (128, 0, 0)), ("violett", (128, 0, 128)),
          ("braun", (128, 128, 0)), ("silber", (192, 192, 192)), ("grau", (128, 128, 128)),
          ("blau", (0, 0, 255)), ("hellgrün", (0, 255, 0)), ("türkis", (0, 255, 255)),
          ("rot", (255, 0, 0)), ("pink", (255, 0, 255)), ("gelb", (255, 255, 0)), ("weiß", (255, 255, 255))]
KURVENFARBEN = [(0, 0, 0), (0, 0, 128), (0, 128, 0), (0, 128, 128), (128, 0, 0), (128, 0, 128), (128, 128, 0), (0, 0, 255)]
TYPEN = ["Linien-Diagramm", "Punkt-Diagramm", "Punkt-Linien-Diagramm", "Balken-Diagramm"]
FORMEN = ["Kreuz", "Kreis", "Scheibe"]


def _col_i32(i):
    return (i & 255, (i >> 8) & 255, (i >> 16) & 255)


def _i32_col(c):
    return c[0] | (c[1] << 8) | (c[2] << 16)


def kurve_get(v):
    a1 = bytes.fromhex(v["_attr1"]); ku = bytes.fromhex(v["_kurve"]); a3 = bytes.fromhex(v["_attr3"])
    farbe, form, groesse, pfarbe = struct.unpack_from("<4i", ku, 0)
    return {"typ": struct.unpack_from("<i", a1, 0)[0], "splines": a1[4], "stil": a1[5],
            "dicke": max(1, v["_attr2"] // 10), "farbe": _col_i32(farbe), "form": form, "groesse": groesse,
            "pfarbe": _col_i32(pfarbe), "ani": ku[16], "kurvenstil": struct.unpack_from("<i", ku, 17)[0],
            "anityp": struct.unpack_from("<i", a3, 0)[0], "nachkomma": v["_attr4"][1], "breite": v["_attr4"][2]}


def kurve_set(v, k):
    old = kurve_get(v)
    a3 = bytearray(bytes.fromhex(v["_attr3"])); struct.pack_into("<i", a3, 0, k["anityp"])
    v["_attr1"] = (struct.pack("<i", k["typ"]) + bytes([k["splines"], k["stil"]])).hex()
    if k["dicke"] != old["dicke"]:
        v["_attr2"] = 10 * k["dicke"]
    v["_kurve"] = (struct.pack("<4i", _i32_col(k["farbe"]), k["form"], k["groesse"], _i32_col(k["pfarbe"]))
                   + bytes([k["ani"]]) + struct.pack("<i", k["kurvenstil"])).hex()
    v["_attr3"] = bytes(a3).hex()
    v["_attr4"] = [v["_attr4"][0], k["nachkomma"], k["breite"]]


def kurve_init(v, nummer):
    """Vorgaben fuer eine erstmals angezeigte Groesse: naechste Farbe, Scheibe, Groesse 4."""
    k = kurve_get(v)
    if k["groesse"] == 0:
        c = KURVENFARBEN[nummer % len(KURVENFARBEN)]
        k.update(farbe=c, pfarbe=c, form=2, groesse=4)
        kurve_set(v, k)


# ================================================================ Achsen

ACHSE_VORLAGE = (bytes([1, 1, 1, 1, 1, 0]) + struct.pack("<d", 1.0) + struct.pack("<i", 4)
                 + struct.pack("<2d", 0.0, 1.0) + bytes([2]) + struct.pack("<2i", 3, 1)
                 + struct.pack("<2d", 0.3, 0.2) + bytes([1]) + struct.pack("<4d", 0.0, 0.0, 0.0, 5.0)
                 + bytes([0]) + struct.pack("<d", 1.0) + struct.pack("<i", 4) + bytes([1, 128, 128, 128, 0, 1]))
assert len(ACHSE_VORLAGE) == 111


def achse_get(tr):
    u = struct.unpack_from
    return {"sichtbar": bool(tr[0]), "auto": bool(tr[59]), "lage": u("<d", tr, 68)[0], "von": u("<d", tr, 76)[0],
            "bis": u("<d", tr, 84)[0], "log": bool(tr[92]), "abstand": u("<d", tr, 93)[0],
            "kleine": u("<i", tr, 101)[0], "hstil": tr[105], "hfarbe": rgb(tr[106:110]), "hilfslinien": bool(tr[110])}


def achse_tr(a, basis=None):
    tr = bytearray(basis or ACHSE_VORLAGE)
    tr[0] = 1 if a["sichtbar"] else 0; tr[59] = 1 if a["auto"] else 0
    struct.pack_into("<3d", tr, 68, a["lage"], a["von"], a["bis"])
    tr[92] = 1 if a["log"] else 0
    struct.pack_into("<d", tr, 93, a["abstand"]); struct.pack_into("<i", tr, 101, a["kleine"])
    tr[105] = a["hstil"]; tr[106:110] = farbe_bytes(*a["hfarbe"]); tr[110] = 1 if a["hilfslinien"] else 0
    return bytes(tr)


def achse_neu():
    return achse_get(ACHSE_VORLAGE)


def auto_skala(lo, hi):
    """Runde Achsengrenzen und Strichabstand fuer den Wertebereich lo..hi."""
    if not (math.isfinite(lo) and math.isfinite(hi)):
        lo, hi = 0.0, 1.0
    if lo > 0 and lo < 0.5 * hi: lo = 0.0
    if hi < 0 and hi > 0.5 * lo: hi = 0.0
    if hi <= lo:
        hi = lo + (abs(lo) if lo else 1.0)
    roh = (hi - lo) / 5.0
    mag = 10.0 ** math.floor(math.log10(roh))
    schritt = next(s for s in (1, 2, 5, 10) if s * mag >= roh * 0.999) * mag
    von = math.floor(lo / schritt + 1e-9) * schritt
    bis = math.ceil(hi / schritt - 1e-9) * schritt
    if bis <= von: bis = von + schritt
    return von, bis, schritt


def zahl_text(x, nachkomma=None, norm=False):
    """Zahl mit Dezimalkomma. Liefert (Text, Exponent oder None); der Exponent wird hochgestellt gezeichnet."""
    if x == 0: return "0", None
    a = abs(x)
    if norm or a >= 1e5 or a < 1e-3:
        e = int(math.floor(math.log10(a) + 1e-12)); m = x / 10.0 ** e
        ms = (f"{m:.{nachkomma}f}" if nachkomma is not None else f"{m:.4g}").replace(".", ",")
        return ms + "·10", e
    s = f"{x:.{nachkomma}f}" if nachkomma is not None else f"{x:.6g}"
    return s.replace(".", ","), None


def tabellen_text(x, nachkomma=4):
    if x != 0 and (abs(x) >= 1e9 or abs(x) < 10.0 ** (-max(nachkomma, 1))):
        return f"{x:.{nachkomma}E}".replace(".", ",")
    return f"{x:.{nachkomma}f}".replace(".", ",")


# ================================================================ Zeichenobjekte erzeugen

def _measure_default(text, font, size):
    return 0.0195 * size * max(1, len(text)), size / 72 * 2.54 * 1.18


def mk_text(text, x, y, size=12.0, font="Arial", measure=None, farbe=(0, 0, 0), nutzer=False, winkel=0):
    w, h = (measure or _measure_default)(text, font, size)
    raw = text.encode(ENCODING, "replace")
    chars = [bytes([c, c, 0]) + struct.pack("<d", size) + bytes(67) for c in raw]
    return {"k": "text", "g": [x, y, w, h], "winkel": winkel, "farbe": farbe_bytes(*farbe), "f1": 1 if nutzer else 0,
            "d1": 0.1 if nutzer else h, "farbe2": bytes(4), "i1": 0, "f2": 1 if nutzer else 0, "f3": 0,
            "bb": bytes([1, 1]), "font": font, "size": float(size), "m": [h, h, 0.0, 0.05, 0.0, 0.0],
            "i": 120, "b2": bytes([0, 1]), "sup": [0.8, 0.4, -0.3], "b3": bytes([1, 3]), "chars": chars}


def set_text(o, text, measure=None):
    raw = text.encode(ENCODING, "replace")
    o["chars"] = [bytes([c, c, 0]) + struct.pack("<d", o["size"]) + bytes(67) for c in raw]
    w, h = (measure or _measure_default)(text, o["font"], o["size"])
    o["g"][2], o["g"][3] = w, h


def mk_linie(x, y, dx, dy, farbe=(0, 0, 0), stil=0, pfeil=False, dick=False):
    return {"k": "linie", "g": [x, y, dx, dy], "a0": 0, "farbe": farbe_bytes(*farbe), "stil": stil,
            "d1": 0.48 if (pfeil or dick) else 0.1, "pfeil": 1 if pfeil else 0, "b2": 0, "d2": 0.24, "b3": 1, "n": 45}


def _achse(kids, g, a):
    return {"k": "achse", "g": g, "z": 0, "kids": kids, "tr": achse_tr(a)}


def _ticks(a):
    """(grosse Striche, kleine Striche) als Werte auf der Achse."""
    von, bis, ab = a["von"], a["bis"], a["abstand"]
    if ab <= 0 or bis <= von or (bis - von) / ab > 400:
        return [], []
    gross, klein = [], []
    n = int(math.floor((bis - von) / ab + 1e-9))
    kl = max(0, a["kleine"])
    for i in range(n + 1):
        t = von + i * ab
        gross.append(t)
        for j in range(1, kl + 1):
            s = t + j * ab / (kl + 1)
            if s < bis - 1e-12 * abs(bis - von): klein.append(s)
    return gross, klein


def _zahl_objekte(t, x, y, size, measure, anker, fmt=(None, False)):
    """Zahlentext; bei Exponent-Schreibweise wird Platz fuer den hochgestellten Exponenten reserviert.
    anker: 'm' = x ist Mitte, 'r' = x ist rechter Rand."""
    s, e = zahl_text(t, *fmt)
    w, h = measure(s, "Arial", size)
    we = measure(str(e), "Arial", size * 0.7)[0] + 0.05 if e is not None else 0.0
    x0 = x - (w + we) / 2 if anker == "m" else x - (w + we)
    o = mk_text(s, x0, y, size, measure=measure)
    o["g"][2] = w + we
    if e is not None: o["exp_claude"] = e
    return [o], w + we


def exponenten(objekte):
    """Ergaenzt bei Achsenzahlen der Form 'm·10' den Exponenten (er steht nicht in der Datei,
    sondern ergibt sich aus Von/Abstand der Achse)."""
    for ch in objekte:
        if ch["k"] != "chart": continue
        for a in ch["kids"]:
            if a["k"] != "achse": continue
            ag = achse_get(a["tr"])
            texte = [t for t in a["kids"] if t["k"] == "text"]
            if not any(text_of(t).endswith("·10") for t in texte): continue
            if ag["bis"] <= ag["von"] or ag["abstand"] <= 0: continue
            waag = a["g"][2] >= a["g"][3]
            for t in texte:
                if not text_of(t).endswith("·10"): continue
                if waag: rel = (t["g"][0] + t["g"][2] / 2) / a["g"][2]
                else: rel = 1.0 - (t["g"][1] + t["g"][3] / 2) / a["g"][3]
                w = ag["von"] + rel * (ag["bis"] - ag["von"])
                w = ag["von"] + round((w - ag["von"]) / ag["abstand"]) * ag["abstand"]
                if w != 0: t["exp_claude"] = int(math.floor(math.log10(abs(w)) + 1e-9))


def build_chart(kurven, xa, ya, opt, measure=None):
    """Baut ein 2D-Schaubild als Zeichenobjekt.
    kurven: Liste {name, x:[..], y:[..], k: kurve_get(...)}; xa, ya: Achsen-Einstellungen (achse_get-Format);
    opt: {pc:[L,O,B,H], farbe, legende, timer, seite:(b,h)}."""
    measure = measure or _measure_default
    sb, sh = opt.get("seite", (16.0, 12.0)); pc = opt["pc"]
    g = [sb * pc[0] / 100, sh * pc[1] / 100, sb * pc[2] / 100, sh * pc[3] / 100]
    W, H = g[2], g[3]
    size = max(8.0, min(12.0, 11.3 * (W / 12.8) ** 0.5))
    th = measure("0", "Arial", size)[1]
    xg, xk = _ticks(xa); yg, yk = _ticks(ya)
    innen = lambda t, a: a["von"] + 1e-9 * (a["bis"] - a["von"]) < t < a["bis"] - 1e-9 * (a["bis"] - a["von"])
    xlab = [t for t in xg if innen(t, xa)]; ylab = [t for t in yg if innen(t, ya)]
    fmt = (opt.get("nach"), bool(opt.get("norm")))
    def breite(t):
        s, e = zahl_text(t, *fmt)
        return measure(s, "Arial", size)[0] + (measure(str(e), "Arial", size * 0.7)[0] + 0.05 if e is not None else 0)
    x_unten = abs(xa["lage"] - ya["von"]) < 1e-12 * max(1.0, abs(ya["bis"] - ya["von"])) or not (ya["von"] < xa["lage"] < ya["bis"])
    y_links = abs(ya["lage"] - xa["von"]) < 1e-12 * max(1.0, abs(xa["bis"] - xa["von"])) or not (xa["von"] < ya["lage"] < xa["bis"])
    TL, TK = 0.28, 0.19
    wy = TL + max([breite(t) for t in ylab] + [0.2])
    hx = TL + th
    ox = wy if y_links else 0.0
    # Achsentitel (Name und Einheit): y-Titel ueber der Pfeilspitze (eigener Streifen oben), x-Titel rechts in der Zahlenzeile
    titel = opt.get("titel") or {}
    titel_x = str(titel.get("x") or "").strip() if xa["sichtbar"] else ""
    titel_y = str(titel.get("y") or "").strip() if ya["sichtbar"] else ""
    oben = th + 0.12 if titel_y else 0.0
    PW = W - ox; PH = (H - hx if x_unten else H) - oben
    X = lambda v: (v - xa["von"]) / (xa["bis"] - xa["von"]) * PW
    Yr = lambda v: PH - (v - ya["von"]) / (ya["bis"] - ya["von"]) * PH     # relativ zur Zeichenflaeche
    Y = lambda v: oben + Yr(v)                                              # relativ zum Schaubild
    kids = []
    if xa["hilfslinien"]:
        for t in xlab: kids.append(mk_linie(ox + X(t), oben + PH, 0.0, -PH, xa["hfarbe"], xa["hstil"]))
    if ya["hilfslinien"]:
        for t in ylab: kids.append(mk_linie(ox, Y(t), PW, 0.0, ya["hfarbe"], ya["hstil"]))
    # x-Achse
    ax = []
    if xa["sichtbar"]:
        wt = measure(titel_x, "Arial", size)[0] if titel_x else 0.0
        frei = PW - wt - 0.2 if titel_x else math.inf      # Zahlen, die in den Titel ragen wuerden, entfallen
        ax.append(mk_linie(0.0, 0.0, PW, 0.0, pfeil=True))
        for t in xk: ax.append(mk_linie(X(t), 0.0, 0.0, TK))
        for t in xg:
            ax.append(mk_linie(X(t), 0.0, 0.0, TL, dick=True))
            if innen(t, xa) and X(t) + breite(t) / 2 <= frei: ax += _zahl_objekte(t, X(t), TL, size, measure, "m", fmt)[0]
        if titel_x:
            o = mk_text(titel_x, PW - wt, TL, size, measure=measure); o["achsentitel_claude"] = 1; ax.append(o)
    yx = oben + PH if x_unten else Y(xa["lage"])
    ix = len(kids); kids.append(_achse(ax, [ox, yx, PW, hx], xa))
    # y-Achse
    ay = []
    if ya["sichtbar"]:
        ay.append(mk_linie(wy, PH, 0.0, -PH, pfeil=True))
        for t in yk: ay.append(mk_linie(wy - TK, Yr(t), TK, 0.0))
        for t in yg:
            ay.append(mk_linie(wy - TL, Yr(t), TL, 0.0, dick=True))
            if innen(t, ya): ay += _zahl_objekte(t, wy - TL, Yr(t) - th / 2, size, measure, "r", fmt)[0]
        if titel_y:
            o = mk_text(titel_y, wy + 0.12, -oben, size, measure=measure); o["achsentitel_claude"] = 1; ay.append(o)
    xy = 0.0 if y_links else X(ya["lage"]) - wy
    iy = len(kids); kids.append(_achse(ay, [xy, oben, wy, PH], ya))
    # Kurven
    for ku in kurven:
        k = ku["k"]
        pts = [(ox + X(a), Y(b)) for a, b in zip(ku["x"], ku["y"]) if math.isfinite(a) and math.isfinite(b)]
        pts = [(max(-50.0, min(100.0, px)), max(-50.0, min(100.0, py))) for px, py in pts]
        if not pts: continue
        x0 = min(p[0] for p in pts); y0 = min(p[1] for p in pts)
        w = max(p[0] for p in pts) - x0; h = max(p[1] for p in pts) - y0
        rel = [(px - x0, py - y0) for px, py in pts]
        base = {"a0": k["dicke"] if k["dicke"] > 1 else 0, "farbe": farbe_bytes(*k["farbe"]), "stil": k["stil"],
                "d1": 0.45, "i1": 0, "f2": 1, "i2": 0, "d2": 0.5}
        kk = []
        if k["typ"] in (0, 2):
            kk.append(dict(base, k="poly", t=0x0C if k["splines"] else 0x0B, g=[0.0, 0.0, w, h], f1=1, pts=rel, zu=0))
        if k["typ"] in (1, 2):
            r = 0.0115 * k["groesse"]
            for px, py in rel:
                kk.append({"k": "marke", "g": [px - r / 2, py - r / 2, r, r], "a0": 0, "farbe": farbe_bytes(*k["pfarbe"]),
                           "stil": 0, "d": 0.0225 * k["groesse"], "form": k["form"]})
        if k["typ"] == 3:
            bw = max(0.03, 0.6 * PW / max(1, len(rel)))
            y_null = Y(max(ya["von"], min(ya["bis"], 0.0))) - y0
            for px, py in rel:
                kk.append(dict(base, k="poly", t=0x0B, g=[0.0, 0.0, px + bw / 2, max(py, y_null)], f1=0, zu=1,
                               pts=[(px - bw / 2, y_null), (px - bw / 2, py), (px + bw / 2, py), (px + bw / 2, y_null)]))
        kids.append({"k": "kurve", "g": [x0, y0, w, h], "z": 0, "kids": kk, "name": ku["name"]})
    chart = {"k": "chart", "g": g, "z": 0, "kids": kids, "a": 2500, "f": 0.7, "plot": [ox, oben, PW, PH], "dreid": 0,
             "pc": list(pc), "farbe": farbe_bytes(*opt["farbe"]), "b1": 0, "timer": opt["timer"],
             "b2": 1 if opt["legende"] else 0, "font": "Arial", "fs": 12, "i0": 0, "b3": 0,
             "zachse": _achse([], [0.0, 0.0, 0.0, 0.0], achse_neu()), "idx": [ix, iy]}
    return chart


def build_legende(kurven, measure=None, x=0.1, y=0.0):
    measure = measure or _measure_default
    out = []
    for i, ku in enumerate(kurven):
        w = measure(ku["name"], "Arial", 10.0)[0] + 1.3
        k = ku["k"]
        out.append({"k": "legende", "g": [x, y + i * 0.47, w, 0.47], "a0": 0,
                    "farbe": farbe_bytes(*(k["farbe"] if k["typ"] != 1 else k["pfarbe"])), "stil": k["stil"], "d": 0.5, "name": ku["name"]})
    return out


def chart_plot_rect(chart):
    """Zeichenflaeche des Schaubilds (relativ zum Schaubild) aus den Achsen-Hauptlinien."""
    xs, ys = [], []
    for i in chart["idx"]:
        if i < len(chart["kids"]):
            a = chart["kids"][i]
            for l in a["kids"]:
                if l["k"] == "linie" and l["pfeil"]:
                    x0 = a["g"][0] + l["g"][0]; y0 = a["g"][1] + l["g"][1]
                    xs += [x0, x0 + l["g"][2]]; ys += [y0, y0 + l["g"][3]]
    if not xs:
        return [0.0, 0.0, chart["g"][2], chart["g"][3]]
    return [min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)]


# ================================================================ Makros

def expand_makros(lines, makros, tiefe=0):
    """Ersetzt Zeilen der Form {Name} durch den Inhalt des Makros (auch verschachtelt)."""
    if tiefe > 20:
        raise FormatError("Vermutlich Makro-Endlosschleife.")
    out = []
    for line in lines:
        m = re.fullmatch(r"\s*\{(.+?)\}\s*", line)
        if m and m.group(1) in makros:
            out += expand_makros(makros[m.group(1)], makros, tiefe + 1)
        else:
            out.append(line)
    return out


# ================================================================ Grafisches und sprachliches Modell -> Programm

def grafik_programm(g, vereinfacht=True):
    """Uebersetzt ein Flussdiagramm in Programmzeilen."""
    lines = []
    for r in g["rate"]:
        term = r["term"].strip()
        if term:
            lines.append(term if ":=" in term else f"{r['name']} := {term}")
    for a in g["pfeile"]:
        v = a["verbindung"]
        if v[2] >= 0 and v[3] >= 0 and v[2] < len(g["rate"]) and v[3] < len(g["zustand"]):
            z = g["zustand"][v[3]]["name"]; r = g["rate"][v[2]]["name"]
            op = "-" if a["_typ"] == 255 else "+"
            lines.append(f"{z} := {z} {op} {r}" + ("" if vereinfacht else "*dt"))
    lines.append("Zeit := Zeit + " + ("1" if vereinfacht else "dt"))
    return lines


def sprache_programm(felder, vereinfacht=True):
    erst, dann = [], []
    for j in range(0, len(felder) - 2, 3):
        s, p, t = (x.strip() for x in felder[j:j + 3])
        if not s or not t: continue
        if p == "ist proportional zu": erst.append(f"{s} := F{s}*({t})")
        elif p == "nimmt zu um": dann.append(f"{s} := {s} + {t}" + ("" if vereinfacht else "*dt"))
        elif p == "nimmt ab um": dann.append(f"{s} := {s} - {t}" + ("" if vereinfacht else "*dt"))
        else: erst.append(f"{s} := {t}")
    return erst + dann + ["Zeit := Zeit + " + ("1" if vereinfacht else "dt")]


# ================================================================ JSON (eigenes Dateiformat)

def to_json(x):
    if isinstance(x, (bytes, bytearray)): return {"$b": bytes(x).hex()}
    if isinstance(x, dict): return {k: to_json(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)): return [to_json(v) for v in x]
    if isinstance(x, float) and not math.isfinite(x): return {"$f": repr(x)}
    return x


def from_json(x):
    if isinstance(x, dict):
        if set(x) == {"$b"}: return bytes.fromhex(x["$b"])
        if set(x) == {"$f"}: return float(x["$f"])
        return {k: from_json(v) for k, v in x.items()}
    if isinstance(x, list): return [from_json(v) for v in x]
    return x


# ================================================================ 3D-Schaubild (Schraegbild)

def build_chart3d(kurven, xa, ya, za, opt, measure=None):
    """Schraegbild: x nach rechts, y schraeg nach hinten, z nach oben. kurven: {name, x, y, z, k}."""
    measure = measure or _measure_default
    sb, sh = opt.get("seite", (16.0, 12.0)); pc = opt["pc"]
    g = [sb * pc[0] / 100, sh * pc[1] / 100, sb * pc[2] / 100, sh * pc[3] / 100]
    W, H = g[2], g[3]
    size = max(8.0, min(11.0, 10.0 * (W / 12.8) ** 0.5))
    th = measure("0", "Arial", size)[1]
    fmt = (opt.get("nach"), bool(opt.get("norm")))
    x0, y0 = 0.12 * W, 0.88 * H                     # Ursprung
    ex = (0.60 * W, 0.0); ey = (0.26 * W, -0.26 * H); ez = (0.0, -0.58 * H)
    rel = lambda v, a: (v - a["von"]) / (a["bis"] - a["von"])
    def P(x, y, z):
        u, v, w = rel(x, xa), rel(y, ya), rel(z, za)
        return x0 + u * ex[0] + v * ey[0] + w * ez[0], y0 + u * ex[1] + v * ey[1] + w * ez[1]
    kids = []; idx = []
    titel = opt.get("titel") or {}
    titel3 = [str(titel.get(k) or "").strip() for k in ("x", "y", "z")]
    for a, e, quer, tt in ((xa, ex, (0.0, 0.14), titel3[0]), (ya, ey, (0.12, 0.08), titel3[1]), (za, ez, (-0.14, 0.0), titel3[2])):
        L = []
        if a["sichtbar"]:
            L.append(mk_linie(x0, y0, e[0] * 1.08, e[1] * 1.08, pfeil=True))
            if tt:
                o = mk_text(tt, x0 + e[0] * 1.08 + 0.15, y0 + e[1] * 1.08 - th / 2, size, measure=measure)
                o["achsentitel_claude"] = 1; L.append(o)
            for t in _ticks(a)[0]:
                u = rel(t, a); px, py = x0 + u * e[0], y0 + u * e[1]
                L.append(mk_linie(px, py, quer[0], quer[1], dick=True))
                if u > 1e-9:
                    s, ex10 = zahl_text(t, *fmt); w = measure(s, "Arial", size)[0]
                    tx = px + quer[0] - (w + 0.05 if quer[0] < 0 else (0.0 if quer[0] > 0 else w / 2))
                    ty = py + quer[1] - (th / 2 if quer[0] != 0 and quer[1] == 0 else 0.0)
                    o = mk_text(s, tx, ty, size, measure=measure)
                    if ex10 is not None: o["exp_claude"] = ex10
                    L.append(o)
        idx.append(len(kids)); kids.append(_achse(L, [0.0, 0.0, W, H], a))
    for ku in kurven:
        k = ku["k"]
        pts = [P(a, b, c) for a, b, c in zip(ku["x"], ku["y"], ku["z"]) if math.isfinite(a) and math.isfinite(b) and math.isfinite(c)]
        pts = [(max(-50.0, min(100.0, px)), max(-50.0, min(100.0, py))) for px, py in pts]
        if not pts: continue
        mx = min(p[0] for p in pts); my = min(p[1] for p in pts)
        w = max(p[0] for p in pts) - mx; h = max(p[1] for p in pts) - my
        relp = [(px - mx, py - my) for px, py in pts]
        kk = []
        if k["typ"] in (0, 2, 3):
            kk.append({"k": "poly", "t": 0x0B, "g": [0.0, 0.0, w, h], "a0": k["dicke"] if k["dicke"] > 1 else 0,
                       "farbe": farbe_bytes(*k["farbe"]), "stil": k["stil"], "d1": 0.45, "f1": 1, "i1": 0, "f2": 1, "i2": 0,
                       "d2": 0.5, "pts": relp, "zu": 0})
        if k["typ"] in (1, 2):
            r = 0.0115 * k["groesse"]
            for px, py in relp:
                kk.append({"k": "marke", "g": [px - r / 2, py - r / 2, r, r], "a0": 0, "farbe": farbe_bytes(*k["pfarbe"]),
                           "stil": 0, "d": 0.0225 * k["groesse"], "form": k["form"]})
        kids.append({"k": "kurve", "g": [mx, my, w, h], "z": 0, "kids": kk})
    return {"k": "chart", "g": g, "z": 0, "kids": kids, "a": 2500, "f": 0.7, "plot": [0.0, 0.0, W, H], "dreid": 1,
            "pc": list(pc), "farbe": farbe_bytes(*opt["farbe"]), "b1": 0, "timer": opt["timer"],
            "b2": 1 if opt["legende"] else 0, "font": "Arial", "fs": 12, "i0": 0, "b3": 0, "zachse": None, "idx": idx}
