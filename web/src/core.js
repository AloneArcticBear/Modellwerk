//claude
// core.js - Rechenkern von Modellwerk fuer den Browser (Port von mw_core.py).
// Dateiformat MOEBIUS30 lesen/schreiben, Arbeitsblatt-Objekte, Interpreter, Schaubild-Aufbau.
(function (root) {
"use strict";
const MW = {};
MW.MAX_WERTE = 100000;
MW.MAX_ORIGINAL = 8191;

// ------------------------------------------------------------ cp1252
const CP_HI = [0x20AC, null, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, null, 0x017D, null,
  null, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, null, 0x017E, 0x0178];
const CP_REV = new Map();
CP_HI.forEach((u, i) => { if (u !== null) CP_REV.set(u, 0x80 + i); });
function cpDecode(bytes) {
  let s = "";
  for (const b of bytes) {
    if (b >= 0x80 && b < 0xA0) { const u = CP_HI[b - 0x80]; s += u === null ? "\uFFFD" : String.fromCharCode(u); }
    else s += String.fromCharCode(b);
  }
  return s;
}
function cpEncode(str) {
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 0x80 || (c >= 0xA0 && c < 0x100)) out.push(c);
    else if (CP_REV.has(c)) out.push(CP_REV.get(c));
    else out.push(0x3F);                                   // '?' wie Pythons "replace"
  }
  return Uint8Array.from(out);
}
MW.cpDecode = cpDecode; MW.cpEncode = cpEncode;

class FormatError extends Error {}
MW.FormatError = FormatError;
const PRINTABLE = (c) => (c >= 32 && c < 127) || (c >= 160 && c < 256) || c === 9;

// ------------------------------------------------------------ Lesen / Schreiben
class Reader {
  constructor(bytes, pos = 0) { this.b = bytes; this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.p = pos; }
  need(k) { if (this.p + k > this.b.length) throw new FormatError("Dateiende erreicht"); }
  u8() { this.need(1); return this.b[this.p++]; }
  i32() { this.need(4); const v = this.dv.getInt32(this.p, true); this.p += 4; return v; }
  f64() { this.need(8); const v = this.dv.getFloat64(this.p, true); this.p += 8; return v; }
  raw(k) { this.need(k); const v = this.b.slice(this.p, this.p + k); this.p += k; return v; }
  count(limit = 100000) { const n = this.i32(); if (!(n >= 0 && n <= limit)) throw new FormatError("unplausible Anzahl " + n); return n; }
  lstr(maxlen = 100000, check = true) {
    const n = this.i32();
    if (!(n >= 0 && n <= maxlen)) throw new FormatError("unplausible Stringlaenge " + n);
    const v = this.raw(n);
    if (check) for (const c of v) if (!PRINTABLE(c)) throw new FormatError("kein Text");
    return cpDecode(v);
  }
}
class Writer {
  constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; this.dv = new DataView(this.buf.buffer); }
  grow(k) {
    if (this.n + k <= this.buf.length) return;
    let s = this.buf.length; while (s < this.n + k) s *= 2;
    const nb = new Uint8Array(s); nb.set(this.buf.subarray(0, this.n)); this.buf = nb; this.dv = new DataView(nb.buffer);
  }
  u8(v) { this.grow(1); this.buf[this.n++] = v & 255; }
  i32(v) { this.grow(4); this.dv.setInt32(this.n, v, true); this.n += 4; }
  f64(...vs) { this.grow(8 * vs.length); for (const v of vs) { this.dv.setFloat64(this.n, v, true); this.n += 8; } }
  bytes(b) { this.grow(b.length); this.buf.set(b, this.n); this.n += b.length; }
  str(s) { const b = cpEncode(s); this.i32(b.length); this.bytes(b); }
  list(items) { this.i32(items.length); for (const s of items) this.str(s); }
  done() { return this.buf.slice(0, this.n); }
}
MW.Reader = Reader; MW.Writer = Writer;

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { const o = new Uint8Array(h.length >> 1); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(2 * i, 2), 16); return o; };
MW.hex = hex; MW.unhex = unhex;
const eqBytes = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
MW.eqBytes = eqBytes;

// ------------------------------------------------------------ Simulation
function readVariable(r) {
  const v = {};
  v.name = r.lstr(200);
  v.simulation = r.lstr(500);
  v.startwert_aktiv = r.u8();
  v.startwert = r.f64();
  v.flag_a = r.u8();
  v.flag_b = r.u8();
  const n = r.count(MW.MAX_WERTE + 1);
  const w = new Array(n);
  for (let i = 0; i < n; i++) w[i] = r.f64();
  v.werte = w;
  v._attr1 = hex(r.raw(6));
  v._attr2 = r.i32();
  v._kurve = hex(r.raw(21));
  v.animationsbild_hex = r.lstr(100000000);
  v._attr3 = hex(r.raw(6));
  v._attr4 = [r.i32(), r.i32(), r.i32()];
  return v;
}
const box = (r) => [r.i32(), r.i32(), r.i32(), r.i32(), r.i32(), r.i32()];
function readSimulation(r) {
  const s = {};
  s.name = r.lstr(500);
  s.programm = Array.from({ length: r.count() }, () => r.lstr());
  s._unbekannt = r.i32();
  const nv = r.i32();
  if (!(nv >= 1 && nv <= 1000)) throw new FormatError("unplausible Variablenanzahl " + nv);
  s.variablen = Array.from({ length: nv }, () => readVariable(r));
  s.x_achse = r.lstr(500);
  s.y_achse = r.lstr(500);
  s.wiederhole = r.i32();
  s.gross_klein = r.u8();
  s.sprachlich = {
    zustandsgroessen: Array.from({ length: r.count() }, () => r.lstr()),
    raten: Array.from({ length: r.count() }, () => r.lstr()),
    felder: Array.from({ length: r.count() }, () => r.lstr()),
  };
  const g = { zustand: [], rate: [], konstante: [], pfeile: [] };
  for (let i = r.count(); i > 0; i--) g.zustand.push({ box: box(r), name: r.lstr() });
  for (let i = r.count(); i > 0; i--) { const b = box(r); const name = r.lstr(); const term = r.lstr(); g.rate.push({ box: b, name, term, _x: r.i32() }); }
  for (let i = r.count(); i > 0; i--) g.konstante.push({ box: box(r), name: r.lstr() });
  for (let i = r.count(); i > 0; i--) {
    const n = r.count(10000); const punkte = [];
    for (let j = 0; j < n; j++) punkte.push([r.i32(), r.i32()]);
    g.pfeile.push({ punkte, _typ: r.u8(), verbindung: [r.i32(), r.i32(), r.i32(), r.i32(), r.i32()] });
  }
  s.grafisch = g;
  s._optionen = Array.from(r.raw(3));
  return s;
}
function findSimulations(data, start = 0x3A) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let p = start; p < data.length - 8; p++) {
    const n = dv.getInt32(p, true);
    if (!(n >= 1 && n <= 100)) continue;
    try { readSimulation(new Reader(data, p + 4)); return p; } catch (e) { if (!(e instanceof FormatError)) throw e; }
  }
  throw new FormatError("Simulationsteil nicht gefunden");
}
MW.parse = function (data) {
  if (cpDecode(data.slice(0, 9)) !== "MOEBIUS30") throw new FormatError("Dies ist keine Moebius-3.0-Datei.");
  // Zuerst: Simulationsteil direkt hinter dem Arbeitsblatt (schnell). Sonst wie im Python-Original suchen.
  let p = null;
  try {
    const r0 = new Reader(data, 0x36); const n0 = r0.count(100000);
    for (let i = 0; i < n0; i++) rdObj(r0);
    const q = r0.p + 5;
    readSimulation(new Reader(data, q + 4)); p = q;
  } catch (e) { p = null; }
  if (p === null) p = findSimulations(data);
  const doc = { _prefix: data.slice(0, p) };
  const r = new Reader(data, p);
  const n = r.i32();
  doc.simulationen = Array.from({ length: n }, () => readSimulation(r));
  doc.aktive_simulation = r.i32();
  if (r.p !== data.length) doc._rest_bytes = data.length - r.p;
  return doc;
};
function writeSimulation(w, s) {
  w.str(s.name); w.list(s.programm); w.i32(s._unbekannt);
  w.i32(s.variablen.length);
  for (const v of s.variablen) {
    w.str(v.name); w.str(v.simulation);
    w.u8(v.startwert_aktiv); w.f64(v.startwert);
    w.u8(v.flag_a); w.u8(v.flag_b);
    w.i32(v.werte.length); w.grow(8 * v.werte.length); for (const x of v.werte) w.f64(x);
    w.bytes(unhex(v._attr1)); w.i32(v._attr2); w.bytes(unhex(v._kurve));
    w.str(v.animationsbild_hex); w.bytes(unhex(v._attr3));
    for (const x of v._attr4) w.i32(x);
  }
  w.str(s.x_achse); w.str(s.y_achse); w.i32(s.wiederhole);
  w.u8(s.gross_klein);
  const sp = s.sprachlich;
  w.list(sp.zustandsgroessen); w.list(sp.raten); w.list(sp.felder);
  const g = s.grafisch;
  w.i32(g.zustand.length); for (const z of g.zustand) { z.box.forEach((x) => w.i32(x)); w.str(z.name); }
  w.i32(g.rate.length); for (const z of g.rate) { z.box.forEach((x) => w.i32(x)); w.str(z.name); w.str(z.term); w.i32(z._x); }
  w.i32(g.konstante.length); for (const z of g.konstante) { z.box.forEach((x) => w.i32(x)); w.str(z.name); }
  w.i32(g.pfeile.length);
  for (const a of g.pfeile) {
    w.i32(a.punkte.length); for (const [x, y] of a.punkte) { w.i32(x); w.i32(y); }
    w.u8(a._typ); a.verbindung.forEach((x) => w.i32(x));
  }
  w.bytes(Uint8Array.from(s._optionen));
}
MW.dump = function (doc) {
  const w = new Writer(); w.bytes(doc._prefix);
  w.i32(doc.simulationen.length);
  for (const s of doc.simulationen) writeSimulation(w, s);
  w.i32(Math.min(doc.aktive_simulation || 0, doc.simulationen.length - 1));
  return w.done();
};

// ------------------------------------------------------------ Interpreter
const RND = { random: Math.random };
MW.RND = RND;
function pyErr(msg) { const e = new Error(msg); e.rechenfehler = true; return e; }
const FUN = {
  SIN: (x) => Math.sin(x), COS: (x) => Math.cos(x), ARCTAN: (x) => Math.atan(x),
  EXP: (x) => { const r = Math.exp(x); if (!isFinite(r) && isFinite(x)) throw pyErr("math range error"); return r; },
  LN: (x) => { if (!(x > 0)) throw pyErr("math domain error"); return Math.log(x); },
  SQR: (x) => x * x,
  SQRT: (x) => { if (x < 0) throw pyErr("math domain error"); return Math.sqrt(x); },
  FRAC: (x) => x - Math.trunc(x), INT: (x) => Math.trunc(x), ABS: (x) => Math.abs(x),
  RANDOM: (x = 1.0) => RND.random() * x,
};
MW.FUN = FUN;
const IDENT_SRC = "[A-Za-z_ÄÖÜäöüß][A-Za-z_0-9ÄÖÜäöüß]*";
MW.IDENT = new RegExp("^" + IDENT_SRC + "$");
function ident(name, cs) {
  const up = name.toUpperCase();
  const n = cs && !(up in FUN) ? name : up;
  return n in FUN ? "F." + n : "E[" + JSON.stringify("v_" + n.replace(/ß/g, "SS")) + "]";
}
MW.identKey = function (name, cs) { const up = name.toUpperCase(); const n = cs && !(up in FUN) ? name : up; return "v_" + n.replace(/ß/g, "SS"); };
function expr(e, cs) {
  e = e.replace(/(\d),(\d)/g, "$1.$2");
  e = e.split("<>").join("!=");
  let o = "";
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === "=" && !"<>!:=".includes(e[i - 1] || "") && e[i + 1] !== "=") o += "==";
    else o += c;
  }
  e = o.replace(/\^/g, "**");
  const re = new RegExp("(\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(" + IDENT_SRC + ")", "g");
  return e.replace(re, (m, num, id) => (num !== undefined ? num : ident(id, cs)));
}
MW.translate = function (lines, cs = false) {
  const out = [];
  for (let line of lines) {
    line = line.split("//")[0].trim();
    for (let st of line.split(";").map((x) => x.trim()).filter(Boolean)) {
      let cond = null, kw = "if";
      let m = /^if\s+(.*?)\s+then\s+(.*)$/is.exec(st);
      if (m) { cond = m[1]; st = m[2]; }
      else {
        m = /^while\s+(.*?)\s+do\s+(.*)$/is.exec(st);
        if (m) { cond = m[1]; st = m[2]; kw = "while"; }
      }
      let v, e;
      if (st.includes(":=")) { const i = st.indexOf(":="); v = st.slice(0, i); e = st.slice(i + 2); }
      else if (st.includes("=")) { const i = st.indexOf("="); v = st.slice(0, i); e = st.slice(i + 1); }
      else throw new FormatError("Anweisung nicht verstanden: " + st);
      const ziel = v.trim();
      if (!MW.IDENT.test(ziel)) throw new FormatError("Anweisung nicht verstanden: " + st);
      let code = `${ident(ziel, cs)} = ${expr(e, cs)};`;
      if (cond) code = kw === "if" ? `if (${expr(cond, cs)}) { ${code} }`
        : `{ let _w = 0; while (${expr(cond, cs)}) { if (++_w > 1000000) throw new Error("Endlosschleife in WHILE"); ${code} } }`;
      out.push(code);
    }
  }
  return out.join("\n");
};
MW.compile = function (lines, cs) {
  const js = MW.translate(lines, cs);
  try { return new Function("E", "F", js); }
  catch (e) { throw new FormatError("Syntax-Fehler im Programm."); }
};
const KEYWORDS = new Set(["IF", "THEN", "WHILE", "DO"]);
MW.KEYWORDS = KEYWORDS;
MW.programVariables = function (lines, cs = false) {
  const seen = [], assigned = new Set();
  const reId = new RegExp(IDENT_SRC, "g");
  for (let line of lines) {
    line = line.split("//")[0];
    for (const st of line.split(";")) {
      const body = st.replace(/^\s*(if|while)\s+.*?\s+(then|do)\s+/i, "");
      const m = new RegExp("^\\s*(" + IDENT_SRC + ")\\s*:?=").exec(body);
      if (m) assigned.add(cs ? m[1] : m[1].toUpperCase());
      for (const name of st.replace(/\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/g, " ").match(reId) || []) {
        const up = name.toUpperCase();
        if (up in FUN || KEYWORDS.has(up)) continue;
        const key = cs ? name : up;
        if (!seen.includes(key)) seen.push(key);
      }
    }
  }
  return [seen, assigned];
};
class Runner {
  constructor(sim) {
    this.sim = sim; this.cs = !!sim.gross_klein; this.E = {};
    for (const v of sim.variablen) { this.E[MW.identKey(v.name, this.cs)] = v.startwert; v.werte = []; }
    this.fn = MW.compile(sim.programm, this.cs);
  }
  step(n) {
    const vs = this.sim.variablen.map((v) => [v.werte, MW.identKey(v.name, this.cs)]);
    const E = this.E;
    for (let i = 0; i < n; i++) {
      if (vs.length && vs[0][0].length >= MW.MAX_WERTE) break;
      const vorher = vs.map(([, k]) => E[k]);
      this.fn(E, FUN);
      for (let j = 0; j < vs.length; j++) {
        const x = E[vs[j][1]];
        if (typeof x !== "number") throw pyErr("Variable " + vs[j][1].slice(2) + " hat keinen Wert");
        if (!isFinite(x) && isFinite(vorher[j])) {
          throw pyErr(isNaN(x) ? "Rechenfehler (nicht definierter Wert)" : "Division durch Null oder Wert zu groß");
        }
      }
      for (const [werte, k] of vs) werte.push(+E[k]);
    }
  }
}
MW.Runner = Runner;

MW.newVariable = (name, start = 0.0, hasStart = true, simName = "") => ({
  name, simulation: simName, startwert_aktiv: hasStart ? 1 : 0, startwert: +start, flag_a: 0, flag_b: 0, werte: [],
  _attr1: "00".repeat(6), _attr2: 10, _kurve: "00".repeat(21), animationsbild_hex: "", _attr3: "00".repeat(6), _attr4: [10, 4, 64],
});
MW.newSimulation = (name = "Simulation") => ({
  name, programm: [], _unbekannt: 0, variablen: [], x_achse: "", y_achse: "", wiederhole: 100, gross_klein: 0,
  sprachlich: { zustandsgroessen: [], raten: [], felder: [] },
  grafisch: { zustand: [], rate: [], konstante: [], pfeile: [] }, _optionen: [0, 1, 0],
});

// ------------------------------------------------------------ Arbeitsblatt
const T_CHART = 0x40, T_ACHSE = 0x3F, T_KURVE = 0x05;
MW.STILE = ["durchgezogen", "gestrichelt", "gepunktet", "Strich-Punkt", "Strich-Punkt-Punkt", "unsichtbar"];
const f4 = (r) => [r.f64(), r.f64(), r.f64(), r.f64()];
function rdObj(r) {
  const p = r.p, t = r.u8();
  if (t === T_CHART || t === T_ACHSE || t === T_KURVE) {
    const o = { k: t === T_CHART ? "chart" : t === T_ACHSE ? "achse" : "kurve", g: f4(r), z: r.i32() };
    o.kids = Array.from({ length: r.count(20000) }, () => rdObj(r));
    if (t === T_ACHSE) o.tr = r.raw(111);
    else if (t === T_CHART) {
      o.a = r.i32(); o.f = r.f64(); o.plot = f4(r); o.dreid = r.u8(); o.pc = [r.i32(), r.i32(), r.i32(), r.i32()];
      o.farbe = r.raw(4); o.b1 = r.u8(); o.timer = r.i32(); o.b2 = r.u8();
      o.font = r.lstr(100); o.fs = r.i32(); o.i0 = r.i32(); o.b3 = r.u8();
      o.zachse = o.dreid ? null : rdObj(r);
      o.idx = Array.from({ length: o.dreid ? 3 : 2 }, () => r.i32());
    }
    return o;
  }
  if (t === 2) return { k: "linie", g: f4(r), a0: r.i32(), farbe: r.raw(4), stil: r.u8(), d1: r.f64(), pfeil: r.u8(), b2: r.u8(), d2: r.f64(), b3: r.u8(), n: r.i32() };
  if (t === 0x0B || t === 0x0C) {
    const o = { k: "poly", t, g: f4(r), a0: r.i32(), farbe: r.raw(4), stil: r.u8(), d1: r.f64(), f1: r.u8(), i1: r.i32(), f2: r.u8(), i2: r.i32(), d2: r.f64() };
    const n = r.count(1000000); const pts = new Array(n);
    for (let i = 0; i < n; i++) pts[i] = [r.f64(), r.f64()];
    o.pts = pts; o.zu = r.u8();
    return o;
  }
  if (t === 8) {
    const o = { k: "text", g: f4(r), winkel: r.i32(), farbe: r.raw(4), f1: r.u8(), d1: r.f64(), farbe2: r.raw(4), i1: r.i32(), f2: r.u8(), f3: r.u8(),
      bb: r.raw(2), font: r.lstr(100), size: r.f64(), m: [r.f64(), r.f64(), r.f64(), r.f64(), r.f64(), r.f64()], i: r.i32(), b2: r.raw(2),
      sup: [r.f64(), r.f64(), r.f64()], b3: r.raw(2) };
    o.chars = Array.from({ length: r.count(1000000) }, () => r.raw(78));
    return o;
  }
  if (t === 0x0F) return { k: "legende", g: f4(r), a0: r.i32(), farbe: r.raw(4), stil: r.u8(), d: r.f64(), name: r.lstr(1000) };
  if (t === 0x0D) return { k: "marke", g: f4(r), a0: r.i32(), farbe: r.raw(4), stil: r.u8(), d: r.f64(), form: r.u8() };
  if (t === 7) {
    const o = { k: "bild", g: f4(r), a0: r.i32() };
    const size = r.count(200000000);
    o.ext = r.raw(r.u8()); o.data = r.raw(size); o.tr = r.raw(6);
    return o;
  }
  throw new FormatError("unbekannter Objekttyp 0x" + t.toString(16) + " bei 0x" + p.toString(16));
}
function wrObj(w, o) {
  const k = o.k;
  if (k === "chart" || k === "achse" || k === "kurve") {
    w.u8(k === "chart" ? T_CHART : k === "achse" ? T_ACHSE : T_KURVE);
    w.f64(...o.g); w.i32(o.z); w.i32(o.kids.length);
    for (const c of o.kids) wrObj(w, c);
    if (k === "achse") w.bytes(o.tr);
    else if (k === "chart") {
      w.i32(o.a); w.f64(o.f); w.f64(...o.plot); w.u8(o.dreid);
      o.pc.forEach((v) => w.i32(v));
      w.bytes(o.farbe); w.u8(o.b1); w.i32(o.timer); w.u8(o.b2);
      w.str(o.font); w.i32(o.fs); w.i32(o.i0); w.u8(o.b3);
      if (!o.dreid) wrObj(w, o.zachse);
      o.idx.forEach((v) => w.i32(v));
    }
  } else if (k === "linie") {
    w.u8(2); w.f64(...o.g); w.i32(o.a0); w.bytes(o.farbe); w.u8(o.stil); w.f64(o.d1); w.u8(o.pfeil); w.u8(o.b2); w.f64(o.d2); w.u8(o.b3); w.i32(o.n);
  } else if (k === "poly") {
    w.u8(o.t); w.f64(...o.g); w.i32(o.a0); w.bytes(o.farbe); w.u8(o.stil); w.f64(o.d1); w.u8(o.f1); w.i32(o.i1); w.u8(o.f2); w.i32(o.i2); w.f64(o.d2);
    w.i32(o.pts.length); w.grow(16 * o.pts.length); for (const [a, b] of o.pts) w.f64(a, b);
    w.u8(o.zu);
  } else if (k === "text") {
    w.u8(8); w.f64(...o.g); w.i32(o.winkel); w.bytes(o.farbe); w.u8(o.f1); w.f64(o.d1); w.bytes(o.farbe2); w.i32(o.i1); w.u8(o.f2); w.u8(o.f3); w.bytes(o.bb);
    w.str(o.font); w.f64(o.size); w.f64(...o.m); w.i32(o.i); w.bytes(o.b2); w.f64(...o.sup); w.bytes(o.b3);
    w.i32(o.chars.length); for (const c of o.chars) w.bytes(c);
  } else if (k === "legende") {
    w.u8(0x0F); w.f64(...o.g); w.i32(o.a0); w.bytes(o.farbe); w.u8(o.stil); w.f64(o.d); w.str(o.name);
  } else if (k === "marke") {
    w.u8(0x0D); w.f64(...o.g); w.i32(o.a0); w.bytes(o.farbe); w.u8(o.stil); w.f64(o.d); w.u8(o.form);
  } else if (k === "bild") {
    w.u8(7); w.f64(...o.g); w.i32(o.a0); w.i32(o.data.length); w.u8(o.ext.length); w.bytes(o.ext); w.bytes(o.data); w.bytes(o.tr);
  }
}
MW.parseSheet = function (prefix) {
  const r = new Reader(prefix, 0x36);
  const objekte = Array.from({ length: r.count(100000) }, () => rdObj(r));
  return { kopf: prefix.slice(0, 0x36), objekte, ende: prefix.slice(r.p) };
};
MW.dumpSheet = function (sheet) {
  const w = new Writer(); w.bytes(sheet.kopf); w.i32(sheet.objekte.length);
  for (const o of sheet.objekte) wrObj(w, o);
  w.bytes(sheet.ende);
  return w.done();
};
(function () {
  const w = new Writer();
  w.bytes(cpEncode("MOEBIUS30")); w.bytes(Uint8Array.from([0, 0, 1, 1])); w.bytes(new Uint8Array(4)); w.i32(5); w.bytes(new Uint8Array(13));
  w.f64(16.0, 12.0); w.bytes(new Uint8Array(4));
  MW.NEW_HEADER = w.done();
})();
MW.newSheet = () => ({ kopf: MW.NEW_HEADER.slice(), objekte: [], ende: new Uint8Array(5) });
MW.textOf = (o) => cpDecode(o.chars.map((c) => c[0]));
MW.rgb = (f) => [f[0], f[1], f[2]];
MW.farbeBytes = (r, g, b) => Uint8Array.from([r, g, b, 0]);

// ------------------------------------------------------------ Kurven-Einstellungen
MW.FARBEN = [["schwarz", [0, 0, 0]], ["dunkelblau", [0, 0, 128]], ["dunkelgrün", [0, 128, 0]], ["blaugrün", [0, 128, 128]],
  ["dunkelrot", [128, 0, 0]], ["violett", [128, 0, 128]], ["braun", [128, 128, 0]], ["silber", [192, 192, 192]],
  ["grau", [128, 128, 128]], ["blau", [0, 0, 255]], ["hellgrün", [0, 255, 0]], ["türkis", [0, 255, 255]],
  ["rot", [255, 0, 0]], ["pink", [255, 0, 255]], ["gelb", [255, 255, 0]], ["weiß", [255, 255, 255]]];
MW.KURVENFARBEN = [[0, 0, 0], [0, 0, 128], [0, 128, 0], [0, 128, 128], [128, 0, 0], [128, 0, 128], [128, 128, 0], [0, 0, 255]];
MW.TYPEN = ["Linien-Diagramm", "Punkt-Diagramm", "Punkt-Linien-Diagramm", "Balken-Diagramm"];
MW.FORMEN = ["Kreuz", "Kreis", "Scheibe"];
const colI32 = (i) => [i & 255, (i >> 8) & 255, (i >> 16) & 255];
const i32Col = (c) => c[0] | (c[1] << 8) | (c[2] << 16);
const dvOf = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
MW.kurveGet = function (v) {
  const a1 = unhex(v._attr1), ku = unhex(v._kurve), a3 = unhex(v._attr3);
  const d1 = dvOf(a1), dk = dvOf(ku), d3 = dvOf(a3);
  return { typ: d1.getInt32(0, true), splines: a1[4], stil: a1[5], dicke: Math.max(1, Math.floor(v._attr2 / 10)),
    farbe: colI32(dk.getInt32(0, true)), form: dk.getInt32(4, true), groesse: dk.getInt32(8, true), pfarbe: colI32(dk.getInt32(12, true)),
    ani: ku[16], kurvenstil: dk.getInt32(17, true), anityp: d3.getInt32(0, true), nachkomma: v._attr4[1], breite: v._attr4[2] };
};
MW.kurveSet = function (v, k) {
  const old = MW.kurveGet(v);
  const a3 = unhex(v._attr3); dvOf(a3).setInt32(0, k.anityp, true);
  const a1 = new Uint8Array(6); dvOf(a1).setInt32(0, k.typ, true); a1[4] = k.splines; a1[5] = k.stil;
  v._attr1 = hex(a1);
  if (k.dicke !== old.dicke) v._attr2 = 10 * k.dicke;
  const ku = new Uint8Array(21); const dk = dvOf(ku);
  dk.setInt32(0, i32Col(k.farbe), true); dk.setInt32(4, k.form, true); dk.setInt32(8, k.groesse, true); dk.setInt32(12, i32Col(k.pfarbe), true);
  ku[16] = k.ani; dk.setInt32(17, k.kurvenstil, true);
  v._kurve = hex(ku); v._attr3 = hex(a3);
  v._attr4 = [v._attr4[0], k.nachkomma, k.breite];
};
MW.kurveInit = function (v, nummer) {
  const k = MW.kurveGet(v);
  if (k.groesse === 0) {
    const c = MW.KURVENFARBEN[nummer % MW.KURVENFARBEN.length];
    Object.assign(k, { farbe: c, pfarbe: c, form: 2, groesse: 4 });
    MW.kurveSet(v, k);
  }
};

// ------------------------------------------------------------ Achsen
(function () {
  const w = new Writer();
  w.bytes(Uint8Array.from([1, 1, 1, 1, 1, 0])); w.f64(1.0); w.i32(4); w.f64(0.0, 1.0); w.u8(2); w.i32(3); w.i32(1);
  w.f64(0.3, 0.2); w.u8(1); w.f64(0.0, 0.0, 0.0, 5.0); w.u8(0); w.f64(1.0); w.i32(4); w.bytes(Uint8Array.from([1, 128, 128, 128, 0, 1]));
  MW.ACHSE_VORLAGE = w.done();
  if (MW.ACHSE_VORLAGE.length !== 111) throw new Error("Achsenvorlage");
})();
MW.achseGet = function (tr) {
  const d = dvOf(tr);
  return { sichtbar: !!tr[0], auto: !!tr[59], lage: d.getFloat64(68, true), von: d.getFloat64(76, true), bis: d.getFloat64(84, true),
    log: !!tr[92], abstand: d.getFloat64(93, true), kleine: d.getInt32(101, true), hstil: tr[105], hfarbe: [tr[106], tr[107], tr[108]],
    hilfslinien: !!tr[110] };
};
MW.achseTr = function (a, basis) {
  const tr = (basis || MW.ACHSE_VORLAGE).slice(); const d = dvOf(tr);
  tr[0] = a.sichtbar ? 1 : 0; tr[59] = a.auto ? 1 : 0;
  d.setFloat64(68, a.lage, true); d.setFloat64(76, a.von, true); d.setFloat64(84, a.bis, true);
  tr[92] = a.log ? 1 : 0;
  d.setFloat64(93, a.abstand, true); d.setInt32(101, a.kleine, true);
  tr[105] = a.hstil; tr.set(MW.farbeBytes(...a.hfarbe), 106); tr[110] = a.hilfslinien ? 1 : 0;
  return tr;
};
MW.achseNeu = () => MW.achseGet(MW.ACHSE_VORLAGE);
MW.autoSkala = function (lo, hi) {
  if (!(isFinite(lo) && isFinite(hi))) { lo = 0.0; hi = 1.0; }
  if (lo > 0 && lo < 0.5 * hi) lo = 0.0;
  if (hi < 0 && hi > 0.5 * lo) hi = 0.0;
  if (hi <= lo) hi = lo + (lo ? Math.abs(lo) : 1.0);
  const roh = (hi - lo) / 5.0;
  const mag = Math.pow(10, Math.floor(Math.log10(roh)));
  const schritt = [1, 2, 5, 10].find((s) => s * mag >= roh * 0.999) * mag;
  const von = Math.floor(lo / schritt + 1e-9) * schritt;
  let bis = Math.ceil(hi / schritt - 1e-9) * schritt;
  if (bis <= von) bis = von + schritt;
  return [von, bis, schritt];
};

// ------------------------------------------------------------ Zahlen formatieren (wie Pythons %g / %f / %E)
function fmtG(x, p) {
  if (x === 0) return "0";
  if (!isFinite(x)) return isNaN(x) ? "nan" : (x > 0 ? "inf" : "-inf");
  p = p || 1;
  const s = x.toExponential(p - 1);
  const e = parseInt(s.slice(s.indexOf("e") + 1), 10);
  if (e < -4 || e >= p) {
    let [m, ex] = s.split("e");
    if (m.includes(".")) m = m.replace(/0+$/, "").replace(/\.$/, "");
    const ei = parseInt(ex, 10);
    return m + "e" + (ei < 0 ? "-" : "+") + String(Math.abs(ei)).padStart(2, "0");
  }
  let f = x.toFixed(Math.max(0, p - 1 - e));
  if (f.includes(".")) f = f.replace(/0+$/, "").replace(/\.$/, "");
  return f;
}
function fmtE(x, n) {
  const s = x.toExponential(n); let [m, ex] = s.split("e"); const ei = parseInt(ex, 10);
  return m + "E" + (ei < 0 ? "-" : "+") + String(Math.abs(ei)).padStart(2, "0");
}
MW.fmtG = fmtG;
MW.zahlText = function (x, nachkomma = null, norm = false) {
  if (x === 0) return ["0", null];
  const a = Math.abs(x);
  if (norm || a >= 1e5 || a < 1e-3) {
    const e = Math.floor(Math.log10(a) + 1e-12); const m = x / Math.pow(10, e);
    const ms = (nachkomma !== null && nachkomma !== undefined ? m.toFixed(nachkomma) : fmtG(m, 4)).replace(".", ",");
    return [ms + "·10", e];
  }
  const s = nachkomma !== null && nachkomma !== undefined ? x.toFixed(nachkomma) : fmtG(x, 6);
  return [s.replace(".", ","), null];
};
MW.tabellenText = function (x, nachkomma = 4) {
  if (!isFinite(x)) return fmtG(x, 6);
  if (x !== 0 && (Math.abs(x) >= 1e9 || Math.abs(x) < Math.pow(10, -Math.max(nachkomma, 1)))) return fmtE(x, nachkomma).replace(".", ",");
  return x.toFixed(nachkomma).replace(".", ",");
};

// ------------------------------------------------------------ Zeichenobjekte erzeugen
const measureDefault = (text, font, size) => [0.0195 * size * Math.max(1, text.length), size / 72 * 2.54 * 1.18];
MW.measureDefault = measureDefault;
function charRec(c, size) { const b = new Uint8Array(78); b[0] = c; b[1] = c; dvOf(b).setFloat64(3, size, true); return b; }
MW.mkText = function (text, x, y, size = 12.0, font = "Arial", measure = null, farbe = [0, 0, 0], nutzer = false, winkel = 0) {
  const [w, h] = (measure || measureDefault)(text, font, size);
  const raw = cpEncode(text);
  return { k: "text", g: [x, y, w, h], winkel, farbe: MW.farbeBytes(...farbe), f1: nutzer ? 1 : 0, d1: nutzer ? 0.1 : h,
    farbe2: new Uint8Array(4), i1: 0, f2: nutzer ? 1 : 0, f3: 0, bb: Uint8Array.from([1, 1]), font, size: +size,
    m: [h, h, 0.0, 0.05, 0.0, 0.0], i: 120, b2: Uint8Array.from([0, 1]), sup: [0.8, 0.4, -0.3], b3: Uint8Array.from([1, 3]),
    chars: Array.from(raw, (c) => charRec(c, size)) };
};
MW.setText = function (o, text, measure = null) {
  o.chars = Array.from(cpEncode(text), (c) => charRec(c, o.size));
  const [w, h] = (measure || measureDefault)(text, o.font, o.size);
  o.g[2] = w; o.g[3] = h;
};
MW.mkLinie = (x, y, dx, dy, farbe = [0, 0, 0], stil = 0, pfeil = false, dick = false) => ({
  k: "linie", g: [x, y, dx, dy], a0: 0, farbe: MW.farbeBytes(...farbe), stil, d1: pfeil || dick ? 0.48 : 0.1, pfeil: pfeil ? 1 : 0,
  b2: 0, d2: 0.24, b3: 1, n: 45 });
const mkAchse = (kids, g, a) => ({ k: "achse", g, z: 0, kids, tr: MW.achseTr(a) });
MW.ticks = function (a) {
  const von = a.von, bis = a.bis, ab = a.abstand;
  if (ab <= 0 || bis <= von || (bis - von) / ab > 400) return [[], []];
  const gross = [], klein = [];
  const n = Math.floor((bis - von) / ab + 1e-9);
  const kl = Math.max(0, a.kleine);
  for (let i = 0; i <= n; i++) {
    const t = von + i * ab; gross.push(t);
    for (let j = 1; j <= kl; j++) { const s = t + j * ab / (kl + 1); if (s < bis - 1e-12 * Math.abs(bis - von)) klein.push(s); }
  }
  return [gross, klein];
};
function zahlObjekte(t, x, y, size, measure, anker, fmt) {
  const [s, e] = MW.zahlText(t, fmt[0], fmt[1]);
  const [w] = measure(s, "Arial", size);
  const we = e !== null ? measure(String(e), "Arial", size * 0.7)[0] + 0.05 : 0.0;
  const x0 = anker === "m" ? x - (w + we) / 2 : x - (w + we);
  const o = MW.mkText(s, x0, y, size, "Arial", measure);
  o.g[2] = w + we;
  if (e !== null) o.exp_claude = e;
  return [o];
}
MW.exponenten = function (objekte) {
  for (const ch of objekte) {
    if (ch.k !== "chart") continue;
    for (const a of ch.kids) {
      if (a.k !== "achse") continue;
      const ag = MW.achseGet(a.tr);
      const texte = a.kids.filter((t) => t.k === "text");
      if (!texte.some((t) => MW.textOf(t).endsWith("·10"))) continue;
      if (ag.bis <= ag.von || ag.abstand <= 0) continue;
      const waag = a.g[2] >= a.g[3];
      for (const t of texte) {
        if (!MW.textOf(t).endsWith("·10")) continue;
        const rel = waag ? (t.g[0] + t.g[2] / 2) / a.g[2] : 1.0 - (t.g[1] + t.g[3] / 2) / a.g[3];
        let w = ag.von + rel * (ag.bis - ag.von);
        w = ag.von + Math.round((w - ag.von) / ag.abstand) * ag.abstand;
        if (w !== 0) t.exp_claude = Math.floor(Math.log10(Math.abs(w)) + 1e-9);
      }
    }
  }
};
const clampPt = (v) => Math.max(-50.0, Math.min(100.0, v));
MW.buildChart = function (kurven, xa, ya, opt, measure = null) {
  measure = measure || measureDefault;
  const [sb, sh] = opt.seite || [16.0, 12.0]; const pc = opt.pc;
  const g = [sb * pc[0] / 100, sh * pc[1] / 100, sb * pc[2] / 100, sh * pc[3] / 100];
  const W = g[2], H = g[3];
  const size = Math.max(8.0, Math.min(12.0, 11.3 * Math.sqrt(W / 12.8)));
  const th = measure("0", "Arial", size)[1];
  const [xg, xk] = MW.ticks(xa); const [yg, yk] = MW.ticks(ya);
  const innen = (t, a) => a.von + 1e-9 * (a.bis - a.von) < t && t < a.bis - 1e-9 * (a.bis - a.von);
  const ylab = yg.filter((t) => innen(t, ya)); const xlab = xg.filter((t) => innen(t, xa));
  const fmt = [opt.nach === undefined ? null : opt.nach, !!opt.norm];
  const breite = (t) => { const [s, e] = MW.zahlText(t, fmt[0], fmt[1]); return measure(s, "Arial", size)[0] + (e !== null ? measure(String(e), "Arial", size * 0.7)[0] + 0.05 : 0); };
  const xUnten = Math.abs(xa.lage - ya.von) < 1e-12 * Math.max(1.0, Math.abs(ya.bis - ya.von)) || !(ya.von < xa.lage && xa.lage < ya.bis);
  const yLinks = Math.abs(ya.lage - xa.von) < 1e-12 * Math.max(1.0, Math.abs(xa.bis - xa.von)) || !(xa.von < ya.lage && ya.lage < xa.bis);
  const TL = 0.28, TK = 0.19;
  const wy = TL + Math.max(0.2, ...ylab.map(breite));
  const hx = TL + th;
  const ox = yLinks ? wy : 0.0;
  // Achsentitel (Name und Einheit): y-Titel ueber der Pfeilspitze (eigener Streifen oben), x-Titel rechts in der Zahlenzeile
  const titelX = opt.titel && xa.sichtbar ? String(opt.titel.x || "").trim() : "";
  const titelY = opt.titel && ya.sichtbar ? String(opt.titel.y || "").trim() : "";
  const oben = titelY ? th + 0.12 : 0.0;
  const PW = W - ox, PH = (xUnten ? H - hx : H) - oben;
  const X = (v) => (v - xa.von) / (xa.bis - xa.von) * PW;
  const Yr = (v) => PH - (v - ya.von) / (ya.bis - ya.von) * PH;   // relativ zur Zeichenflaeche
  const Y = (v) => oben + Yr(v);                                   // relativ zum Schaubild
  const kids = [];
  if (xa.hilfslinien) for (const t of xlab) kids.push(MW.mkLinie(ox + X(t), oben + PH, 0.0, -PH, xa.hfarbe, xa.hstil));
  if (ya.hilfslinien) for (const t of ylab) kids.push(MW.mkLinie(ox, Y(t), PW, 0.0, ya.hfarbe, ya.hstil));
  const ax = [];
  if (xa.sichtbar) {
    const wt = titelX ? measure(titelX, "Arial", size)[0] : 0.0;
    const frei = titelX ? PW - wt - 0.2 : Infinity;   // Zahlen, die in den Titel ragen wuerden, entfallen
    ax.push(MW.mkLinie(0.0, 0.0, PW, 0.0, [0, 0, 0], 0, true));
    for (const t of xk) ax.push(MW.mkLinie(X(t), 0.0, 0.0, TK));
    for (const t of xg) {
      ax.push(MW.mkLinie(X(t), 0.0, 0.0, TL, [0, 0, 0], 0, false, true));
      if (innen(t, xa) && X(t) + breite(t) / 2 <= frei) ax.push(...zahlObjekte(t, X(t), TL, size, measure, "m", fmt));
    }
    if (titelX) { const o = MW.mkText(titelX, PW - wt, TL, size, "Arial", measure); o.achsentitel_claude = 1; ax.push(o); }
  }
  const yx = xUnten ? oben + PH : Y(xa.lage);
  const ix = kids.length; kids.push(mkAchse(ax, [ox, yx, PW, hx], xa));
  const ay = [];
  if (ya.sichtbar) {
    ay.push(MW.mkLinie(wy, PH, 0.0, -PH, [0, 0, 0], 0, true));
    for (const t of yk) ay.push(MW.mkLinie(wy - TK, Yr(t), TK, 0.0));
    for (const t of yg) {
      ay.push(MW.mkLinie(wy - TL, Yr(t), TL, 0.0, [0, 0, 0], 0, false, true));
      if (innen(t, ya)) ay.push(...zahlObjekte(t, wy - TL, Yr(t) - th / 2, size, measure, "r", fmt));
    }
    if (titelY) { const o = MW.mkText(titelY, wy + 0.12, -oben, size, "Arial", measure); o.achsentitel_claude = 1; ay.push(o); }
  }
  const xy = yLinks ? 0.0 : X(ya.lage) - wy;
  const iy = kids.length; kids.push(mkAchse(ay, [xy, oben, wy, PH], ya));
  for (const ku of kurven) {
    const k = ku.k; const pts = [];
    const n = Math.min(ku.x.length, ku.y.length);
    for (let i = 0; i < n; i++) { const a = ku.x[i], b = ku.y[i]; if (isFinite(a) && isFinite(b)) pts.push([clampPt(ox + X(a)), clampPt(Y(b))]); }
    if (!pts.length) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of pts) { if (px < x0) x0 = px; if (py < y0) y0 = py; if (px > x1) x1 = px; if (py > y1) y1 = py; }
    const w = x1 - x0, h = y1 - y0;
    const rel = pts.map(([px, py]) => [px - x0, py - y0]);
    const base = { a0: k.dicke > 1 ? k.dicke : 0, farbe: MW.farbeBytes(...k.farbe), stil: k.stil, d1: 0.45, i1: 0, f2: 1, i2: 0, d2: 0.5 };
    const kk = [];
    if (k.typ === 0 || k.typ === 2) kk.push(Object.assign({}, base, { k: "poly", t: k.splines ? 0x0C : 0x0B, g: [0.0, 0.0, w, h], f1: 1, pts: rel, zu: 0 }));
    if (k.typ === 1 || k.typ === 2) {
      const r = 0.0115 * k.groesse;
      for (const [px, py] of rel) kk.push({ k: "marke", g: [px - r / 2, py - r / 2, r, r], a0: 0, farbe: MW.farbeBytes(...k.pfarbe), stil: 0, d: 0.0225 * k.groesse, form: k.form });
    }
    if (k.typ === 3) {
      const bw = Math.max(0.03, 0.6 * PW / Math.max(1, rel.length));
      const yNull = Y(Math.max(ya.von, Math.min(ya.bis, 0.0))) - y0;
      for (const [px, py] of rel) kk.push(Object.assign({}, base, { k: "poly", t: 0x0B, g: [0.0, 0.0, px + bw / 2, Math.max(py, yNull)], f1: 0, zu: 1,
        pts: [[px - bw / 2, yNull], [px - bw / 2, py], [px + bw / 2, py], [px + bw / 2, yNull]] }));
    }
    kids.push({ k: "kurve", g: [x0, y0, w, h], z: 0, kids: kk, name: ku.name });
  }
  return { k: "chart", g, z: 0, kids, a: 2500, f: 0.7, plot: [ox, oben, PW, PH], dreid: 0, pc: pc.slice(), farbe: MW.farbeBytes(...opt.farbe),
    b1: 0, timer: opt.timer, b2: opt.legende ? 1 : 0, font: "Arial", fs: 12, i0: 0, b3: 0,
    zachse: mkAchse([], [0.0, 0.0, 0.0, 0.0], MW.achseNeu()), idx: [ix, iy] };
};
MW.buildLegende = function (kurven, measure = null, x = 0.1, y = 0.0) {
  measure = measure || measureDefault;
  return kurven.map((ku, i) => {
    const w = measure(ku.name, "Arial", 10.0)[0] + 1.3; const k = ku.k;
    return { k: "legende", g: [x, y + i * 0.47, w, 0.47], a0: 0, farbe: MW.farbeBytes(...(k.typ !== 1 ? k.farbe : k.pfarbe)), stil: k.stil, d: 0.5, name: ku.name };
  });
};
MW.chartPlotRect = function (chart) {
  const xs = [], ys = [];
  for (const i of chart.idx) {
    if (i < chart.kids.length) {
      const a = chart.kids[i];
      for (const l of a.kids) {
        if (l.k === "linie" && l.pfeil) { const x0 = a.g[0] + l.g[0], y0 = a.g[1] + l.g[1]; xs.push(x0, x0 + l.g[2]); ys.push(y0, y0 + l.g[3]); }
      }
    }
  }
  if (!xs.length) return [0.0, 0.0, chart.g[2], chart.g[3]];
  const mnx = Math.min(...xs), mny = Math.min(...ys);
  return [mnx, mny, Math.max(...xs) - mnx, Math.max(...ys) - mny];
};
MW.buildChart3d = function (kurven, xa, ya, za, opt, measure = null) {
  measure = measure || measureDefault;
  const [sb, sh] = opt.seite || [16.0, 12.0]; const pc = opt.pc;
  const g = [sb * pc[0] / 100, sh * pc[1] / 100, sb * pc[2] / 100, sh * pc[3] / 100];
  const W = g[2], H = g[3];
  const size = Math.max(8.0, Math.min(11.0, 10.0 * Math.sqrt(W / 12.8)));
  const th = measure("0", "Arial", size)[1];
  const fmt = [opt.nach === undefined ? null : opt.nach, !!opt.norm];
  const x0 = 0.12 * W, y0 = 0.88 * H;
  const ex = [0.60 * W, 0.0], ey = [0.26 * W, -0.26 * H], ez = [0.0, -0.58 * H];
  const rel = (v, a) => (v - a.von) / (a.bis - a.von);
  const P = (x, y, z) => { const u = rel(x, xa), v = rel(y, ya), w = rel(z, za); return [x0 + u * ex[0] + v * ey[0] + w * ez[0], y0 + u * ex[1] + v * ey[1] + w * ez[1]]; };
  const kids = [], idx = [];
  const titel3 = opt.titel ? [opt.titel.x, opt.titel.y, opt.titel.z].map((t) => String(t || "").trim()) : ["", "", ""];
  for (const [a, e, quer, titel] of [[xa, ex, [0.0, 0.14], titel3[0]], [ya, ey, [0.12, 0.08], titel3[1]], [za, ez, [-0.14, 0.0], titel3[2]]]) {
    const L = [];
    if (a.sichtbar) {
      L.push(MW.mkLinie(x0, y0, e[0] * 1.08, e[1] * 1.08, [0, 0, 0], 0, true));
      if (titel) { const o = MW.mkText(titel, x0 + e[0] * 1.08 + 0.15, y0 + e[1] * 1.08 - th / 2, size, "Arial", measure); o.achsentitel_claude = 1; L.push(o); }
      for (const t of MW.ticks(a)[0]) {
        const u = rel(t, a); const px = x0 + u * e[0], py = y0 + u * e[1];
        L.push(MW.mkLinie(px, py, quer[0], quer[1], [0, 0, 0], 0, false, true));
        if (u > 1e-9) {
          const [s, ex10] = MW.zahlText(t, fmt[0], fmt[1]); const w = measure(s, "Arial", size)[0];
          const tx = px + quer[0] - (quer[0] < 0 ? w + 0.05 : quer[0] > 0 ? 0.0 : w / 2);
          const ty = py + quer[1] - (quer[0] !== 0 && quer[1] === 0 ? th / 2 : 0.0);
          const o = MW.mkText(s, tx, ty, size, "Arial", measure);
          if (ex10 !== null) o.exp_claude = ex10;
          L.push(o);
        }
      }
    }
    idx.push(kids.length); kids.push(mkAchse(L, [0.0, 0.0, W, H], a));
  }
  for (const ku of kurven) {
    const k = ku.k; const pts = [];
    const n = Math.min(ku.x.length, ku.y.length, ku.z.length);
    for (let i = 0; i < n; i++) {
      const a = ku.x[i], b = ku.y[i], c = ku.z[i];
      if (isFinite(a) && isFinite(b) && isFinite(c)) { const [px, py] = P(a, b, c); pts.push([clampPt(px), clampPt(py)]); }
    }
    if (!pts.length) continue;
    let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
    for (const [px, py] of pts) { mx = Math.min(mx, px); my = Math.min(my, py); Mx = Math.max(Mx, px); My = Math.max(My, py); }
    const relp = pts.map(([px, py]) => [px - mx, py - my]);
    const kk = [];
    if ([0, 2, 3].includes(k.typ)) kk.push({ k: "poly", t: 0x0B, g: [0.0, 0.0, Mx - mx, My - my], a0: k.dicke > 1 ? k.dicke : 0, farbe: MW.farbeBytes(...k.farbe),
      stil: k.stil, d1: 0.45, f1: 1, i1: 0, f2: 1, i2: 0, d2: 0.5, pts: relp, zu: 0 });
    if (k.typ === 1 || k.typ === 2) {
      const r = 0.0115 * k.groesse;
      for (const [px, py] of relp) kk.push({ k: "marke", g: [px - r / 2, py - r / 2, r, r], a0: 0, farbe: MW.farbeBytes(...k.pfarbe), stil: 0, d: 0.0225 * k.groesse, form: k.form });
    }
    kids.push({ k: "kurve", g: [mx, my, Mx - mx, My - my], z: 0, kids: kk });
  }
  return { k: "chart", g, z: 0, kids, a: 2500, f: 0.7, plot: [0.0, 0.0, W, H], dreid: 1, pc: pc.slice(), farbe: MW.farbeBytes(...opt.farbe), b1: 0,
    timer: opt.timer, b2: opt.legende ? 1 : 0, font: "Arial", fs: 12, i0: 0, b3: 0, zachse: null, idx };
};

// ------------------------------------------------------------ Makros, Modell -> Programm
MW.expandMakros = function (lines, makros, tiefe = 0) {
  if (tiefe > 20) throw new FormatError("Vermutlich Makro-Endlosschleife.");
  const out = [];
  for (const line of lines) {
    const m = /^\s*\{(.+?)\}\s*$/.exec(line);
    if (m && Object.prototype.hasOwnProperty.call(makros, m[1])) out.push(...MW.expandMakros(makros[m[1]], makros, tiefe + 1));
    else out.push(line);
  }
  return out;
};
MW.grafikProgramm = function (g, vereinfacht = true) {
  const lines = [];
  for (const r of g.rate) { const term = r.term.trim(); if (term) lines.push(term.includes(":=") ? term : `${r.name} := ${term}`); }
  for (const a of g.pfeile) {
    const v = a.verbindung;
    if (v[2] >= 0 && v[3] >= 0 && v[2] < g.rate.length && v[3] < g.zustand.length) {
      const z = g.zustand[v[3]].name, r = g.rate[v[2]].name;
      const op = a._typ === 255 ? "-" : "+";
      lines.push(`${z} := ${z} ${op} ${r}` + (vereinfacht ? "" : "*dt"));
    }
  }
  lines.push("Zeit := Zeit + " + (vereinfacht ? "1" : "dt"));
  return lines;
};
MW.spracheProgramm = function (felder, vereinfacht = true) {
  const erst = [], dann = [];
  for (let j = 0; j + 2 < felder.length; j += 3) {
    const [s, p, t] = felder.slice(j, j + 3).map((x) => x.trim());
    if (!s || !t) continue;
    if (p === "ist proportional zu") erst.push(`${s} := F${s}*(${t})`);
    else if (p === "nimmt zu um") dann.push(`${s} := ${s} + ${t}` + (vereinfacht ? "" : "*dt"));
    else if (p === "nimmt ab um") dann.push(`${s} := ${s} - ${t}` + (vereinfacht ? "" : "*dt"));
    else erst.push(`${s} := ${t}`);
  }
  return erst.concat(dann, ["Zeit := Zeit + " + (vereinfacht ? "1" : "dt")]);
};

// ------------------------------------------------------------ JSON (gleiches Format wie die Mac-App)
MW.toJson = function toJson(x) {
  if (x instanceof Uint8Array) return { $b: hex(x) };
  if (Array.isArray(x)) return x.map(toJson);
  if (x && typeof x === "object") { const o = {}; for (const k of Object.keys(x)) o[k] = toJson(x[k]); return o; }
  if (typeof x === "number" && !isFinite(x)) return { $f: isNaN(x) ? "nan" : x > 0 ? "inf" : "-inf" };
  return x;
};
MW.fromJson = function fromJson(x) {
  if (Array.isArray(x)) return x.map(fromJson);
  if (x && typeof x === "object") {
    const keys = Object.keys(x);
    if (keys.length === 1 && keys[0] === "$b") return unhex(x.$b);
    if (keys.length === 1 && keys[0] === "$f") return x.$f === "nan" ? NaN : x.$f.startsWith("-") ? -Infinity : Infinity;
    const o = {}; for (const k of keys) o[k] = fromJson(x[k]); return o;
  }
  return x;
};

// ------------------------------------------------------------ ZIP (ohne Kompression) fuer den .prg-Export
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
MW.zip = function (files) {
  const parts = [], central = []; let off = 0;
  const enc = new TextEncoder();
  for (const { name, data } of files) {
    const nb = enc.encode(name); const crc = crc32(data);
    const h = new Uint8Array(30 + nb.length); const d = dvOf(h);
    d.setUint32(0, 0x04034b50, true); d.setUint16(4, 20, true); d.setUint16(6, 0x0800, true); d.setUint16(8, 0, true);
    d.setUint16(10, 0, true); d.setUint16(12, 0x21, true); d.setUint32(14, crc, true); d.setUint32(18, data.length, true);
    d.setUint32(22, data.length, true); d.setUint16(26, nb.length, true); h.set(nb, 30);
    parts.push(h, data);
    const c = new Uint8Array(46 + nb.length); const dc = dvOf(c);
    dc.setUint32(0, 0x02014b50, true); dc.setUint16(4, 20, true); dc.setUint16(6, 20, true); dc.setUint16(8, 0x0800, true);
    dc.setUint16(14, 0x21, true); dc.setUint32(16, crc, true); dc.setUint32(20, data.length, true); dc.setUint32(24, data.length, true);
    dc.setUint16(28, nb.length, true); dc.setUint32(42, off, true); c.set(nb, 46);
    central.push(c); off += h.length + data.length;
  }
  const cs = central.reduce((s, c) => s + c.length, 0);
  const e = new Uint8Array(22); const de = dvOf(e);
  de.setUint32(0, 0x06054b50, true); de.setUint16(8, files.length, true); de.setUint16(10, files.length, true);
  de.setUint32(12, cs, true); de.setUint32(16, off, true);
  const all = parts.concat(central, [e]); const n = all.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n); let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
};
// ZIP lesen (unkomprimiert oder "deflate" ueber DecompressionStream), fuer .prg-Dateien in .zip
MW.unzip = async function (data) {
  const d = dvOf(data); const out = []; let p = 0;
  while (p + 30 <= data.length && d.getUint32(p, true) === 0x04034b50) {
    const method = d.getUint16(p + 8, true); const csize = d.getUint32(p + 18, true);
    const nlen = d.getUint16(p + 26, true), xlen = d.getUint16(p + 28, true);
    const name = new TextDecoder().decode(data.subarray(p + 30, p + 30 + nlen));
    const start = p + 30 + nlen + xlen; const raw = data.subarray(start, start + csize);
    let bytes = null;
    if (method === 0) bytes = raw.slice();
    else if (method === 8 && typeof DecompressionStream !== "undefined") {
      const ds = new DecompressionStream("deflate-raw");
      bytes = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
    }
    if (bytes) out.push({ name, data: bytes });
    p = start + csize;
  }
  return out;
};

if (typeof module !== "undefined" && module.exports) module.exports = MW; else root.MW = MW;
})(typeof window !== "undefined" ? window : globalThis);
