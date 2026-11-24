//claude
// dialogs.js - die Dialoge von Modellwerk (Port von mw_dialogs.py).
(function (root) {
"use strict";
const MW = root.MW, UI = root.UI, D = root.MWDraw;
const { h } = UI;
const DL = {};
const PRAEDIKATE = ["ist proportional zu", "nimmt zu um", "nimmt ab um"];
DL.PRAEDIKATE = PRAEDIKATE;
const clone = (x) => (typeof structuredClone === "function" ? structuredClone(x) : MW.fromJson(JSON.parse(JSON.stringify(MW.toJson(x)))));
DL.clone = clone;

const HILFE = `<h3>Kurzanleitung</h3>
<p><b>1. Modell eingeben:</b> Menü <i>Einfügen → Neue Simulation</i>. Im Fenster <i>Algorithmische Modellierung</i>
steht links das Programm, das wiederholt ausgeführt wird, rechts stehen die Startwerte und Einheiten (z. B. <code>m/s</code>). Statt zu tippen kann man das
Modell auch in Sätzen (<i>Sprachliches Modell</i>) oder als Flussdiagramm (<i>Grafisches Modell</i>) eingeben.</p>
<p><b>2. Anzeigen:</b> Rechts im Hauptfenster die Größe für die x-Achse wählen, die Größen für die y-Achse antippen
und auf <i>Anzeigen</i> tippen. Die Achsen werden mit Größe und Einheit beschriftet, z. B. <i>t in s</i>
(abschaltbar unter <i>Format → Schaubild</i>). Mit <i>Tabelle</i> erscheinen die Zahlenwerte.</p>
<p><b>3. Bearbeiten:</b> Doppeltipp auf eine Kurve öffnet die Kurven-Parameter, Doppeltipp auf eine Achse die Skalierung,
langes Drücken öffnet das Kontextmenü. Mit dem Text-Werkzeug (T) schreibt man auf das Blatt. Objekte lassen sich mit dem Finger verschieben.</p>
<h3>Programmsprache</h3>
<p>Zuweisung <code>x := x + v*dt</code>, mehrere Anweisungen mit <code>;</code> trennen, Kommentar mit <code>//</code>,
Dezimalkomma (<code>0,5</code>).<br>Bedingung: <code>IF x &gt; 3 THEN v := 0</code>, Schleife: <code>WHILE … DO …</code><br>
Funktionen: sin, cos, arctan, exp, ln, sqr, sqrt, frac, int, abs, random</p>
<p>Makro: Zeilen markieren, dann <i>Makro… → Makro erzeugen</i>. Im Programm steht dann <code>{Name}</code>.</p>
<h3>Speichern</h3>
<p><i>Datei → Speichern</i> speichert eine Modellwerk-Datei (.json), die auch die Mac-App öffnet.
<i>Datei → Als Moebius-Datei exportieren</i> speichert eine .prg-Datei. Läuft Modellwerk in claude.ai, ist sie in eine
.zip-Datei verpackt: In der Dateien-App genügt ein Tipp auf die .zip-Datei, um sie auszupacken. Moebius-Dateien kennen keine Einheiten: erhalten bleiben nur die
Einheiten, die an den Achsen stehen.</p>`;
DL.hilfe = () => {
  const d = h("div", { class: "help", style: { maxWidth: "68ch" } }); d.innerHTML = HILFE;
  return UI.modal({ title: "Hilfe", body: d, buttons: [{ text: "Schließen", value: true, default: true }], width: 620 });
};
const HILFE_BTN = { text: "Hilfe", left: true, onClick: () => { DL.hilfe(); return UI.KEEP; } };

// Grundgeruest wie die Klasse Dlg: OK / Abbrechen / Hilfe. apply() darf UI.WertFehler werfen.
function dlg(title, body, apply, opts = {}) {
  return UI.modal({ title, body, width: opts.width, buttons: [
    ...(opts.hilfe === false ? [] : [HILFE_BTN]),
    { text: "OK", default: true, onClick: async () => {
      try { const r = await apply(); return r === undefined ? true : r; }
      catch (e) { if (e instanceof UI.WertFehler) { await UI.msg(e.message && e.message !== "keine Zahl" ? e.message : "Bitte gültige Zahlen eingeben."); return UI.KEEP; } throw e; }
    } },
    { text: "Abbrechen", value: null },
  ] });
}
DL.dlg = dlg;
const row = (...k) => h("div", { class: "row2" }, ...k);
const lab = (t, forId) => h("label", { text: t, for: forId || null });

// ------------------------------------------------------------ kleine Dialoge
DL.linien = async function (stil, dicke, farbe) {
  const s = UI.select(MW.STILE.map((t, i) => [i, t]), Math.min(stil, 5));
  const d = UI.spin(dicke, 1, 20, 1, { tip: "in Pixel" });
  const f = UI.farbCombo(farbe);
  const r = await dlg("Linienattribute", h("div", { class: "grid2" }, lab("Stil:", s.id), s, lab("Dicke:"), d.el, lab("Farbe:"), f.el),
    () => [parseInt(s.value, 10), d.get(), f.get()]);
  return r || null;
};
DL.zahlenformat = async function (nachkomma, norm = false, mitNorm = true) {
  const n = UI.spin(nachkomma, 0, 18);
  const c = UI.check("Normdarstellung", norm, null, "Wissenschaftliche Darstellung mit Exponent");
  const r = await dlg("Zahlenformat", h("div", { class: "grid2" }, lab("Nachkommastellen:"), n.el, mitNorm ? h("span") : null, mitNorm ? c.el : null),
    () => ({ nach: n.get(), norm: c.get() }));
  return r || null;
};
DL.winkel = async function (winkel) {
  const e = h("input", { class: "field", inputmode: "decimal", title: "in Grad", id: UI.uid("w") }); e.value = UI.fz(winkel);
  const r = await dlg("Drehen", h("div", { class: "grid2" }, lab("Winkel:", e.id), e), () => UI.num(e.value));
  return r === null || r === true ? null : r;
};
DL.makro = async function (name, lines) {
  const t = h("textarea", { class: "field prog", rows: 12, cols: 50, spellcheck: "false", autocapitalize: "off", autocorrect: "off" }); t.value = lines.join("\n");
  const r = await dlg("Makro " + name, t, () => t.value.split("\n"), { hilfe: false });
  return r || null;
};
DL.schrift = async function (font, size, st) {
  const f = UI.select(D.FONTS.includes(font) ? D.FONTS : [font, ...D.FONTS], font);
  const g = UI.spin(Math.round(size), 4, 96);
  const b = UI.check("fett", st.fett), k = UI.check("kursiv", st.kursiv), u = UI.check("unterstrichen", st.unter);
  const r = await dlg("Schrift", h("div", { class: "grid2" }, lab("Schriftart:"), f, lab("Größe:"), g.el, h("span"), h("div", { class: "row2" }, b.el, k.el, u.el)),
    () => ({ font: f.value, size: g.get(), fett: b.get(), kursiv: k.get(), unter: u.get() }));
  return r || null;
};
let sonder = null;
DL.sonderzeichen = function (onPick) {
  if (sonder && document.body.contains(sonder)) return;
  const zeichen = "αβγδεηθλμπρσφωΔΣΩ°·±×÷≈≠≤≥²³½¼µ∞√∂∫→←↑↓";
  const grid = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(8, 36px)", gap: "3px" } });
  for (const ch of zeichen) grid.append(h("button", { class: "btn", style: { padding: "0", minHeight: "34px" }, onclick: () => onPick(ch) }, ch));
  UI.modal({ title: "Sonderzeichen", body: grid, buttons: [{ text: "Schließen", value: true }] });
};
DL.drucken = async function () {
  const teile = [["programm", "Programm", true], ["startwerte", "Startwerte", true], ["sprachlich", "sprachlich", false],
    ["schaubild", "Schaubild", true], ["grafisch", "grafisch", false], ["tabelle", "Tabelle", false]];
  const cbs = teile.map(([k, t, on]) => [k, UI.check(t, on)]);
  const g = h("div", { style: { display: "grid", gridTemplateColumns: "auto auto", gap: "2px 16px" } }, cbs.map(([, c]) => c.el));
  const rx = h("input", { class: "field", inputmode: "decimal", value: "2,0", style: { width: "70px" } }); rx.value = "2,0";
  const ry = h("input", { class: "field", inputmode: "decimal", value: "2,0", style: { width: "70px" } }); ry.value = "2,0";
  const farbe = UI.check("Hintergrundfarbe des Schaubilds drucken", true);
  const body = h("div", {}, h("div", { class: "cols" }, UI.group("Drucken", g), UI.group("Rand", h("div", { class: "grid2" }, lab("links (cm):"), rx, lab("oben (cm):"), ry))),
    farbe.el, h("p", { class: "hint", style: { maxWidth: "48ch", margin: "6px 0 0" } },
      "Es wird eine Druckansicht (.html) gespeichert. Diese in der Dateien-App öffnen und über Teilen → Drucken ausdrucken."));
  const r = await dlg("Drucken...", body, () => ({ rand: [UI.num(rx.value), UI.num(ry.value)], teile: Object.fromEntries(cbs.map(([k, c]) => [k, c.get()])), farbe: farbe.get() }));
  return r || null;
};

// ------------------------------------------------------------ Bilder
DL.bmpBytes = function (canvas) {
  const w = canvas.width, hgt = canvas.height, data = canvas.getContext("2d").getImageData(0, 0, w, hgt).data;
  const rowLen = Math.ceil(w * 3 / 4) * 4, size = 54 + rowLen * hgt;
  const b = new Uint8Array(size), dv = new DataView(b.buffer);
  b[0] = 0x42; b[1] = 0x4D; dv.setUint32(2, size, true); dv.setUint32(10, 54, true); dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true); dv.setInt32(22, hgt, true); dv.setUint16(26, 1, true); dv.setUint16(28, 24, true);
  dv.setUint32(34, rowLen * hgt, true); dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true);
  for (let y = 0; y < hgt; y++) {
    const off = 54 + (hgt - 1 - y) * rowLen;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = data[i + 3] / 255;
      b[off + 3 * x] = Math.round(data[i + 2] * a + 255 * (1 - a));
      b[off + 3 * x + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
      b[off + 3 * x + 2] = Math.round(data[i] * a + 255 * (1 - a));
    }
  }
  return b;
};
DL.ladeBild = (bytes) => new Promise((resolve) => {
  const url = URL.createObjectURL(new Blob([bytes])); const im = new Image();
  im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = url;
});
DL.bildHex = function (hx) { if (!hx) return null; try { return MW.unhex(hx); } catch (e) { return null; } };
DL.bild = async function (o) {
  const e = o.g.map((v) => { const x = h("input", { class: "field", inputmode: "decimal", style: { width: "90px" } }); x.value = UI.fz(Math.round(v * 1000) / 1000); return x; });
  const ratio = UI.check("Seitenverhältnis behalten", true);
  const r0 = o.g[3] ? o.g[2] / o.g[3] : 1;
  const sync = (i) => { if (!ratio.get() || !o.g[2] || !o.g[3]) return; try { const v = UI.num(e[i].value); if (i === 2) e[3].value = UI.fz(Math.round(v / r0 * 1000) / 1000); else e[2].value = UI.fz(Math.round(v * r0 * 1000) / 1000); } catch (x) { /* Eingabe unvollstaendig */ } };
  e[2].addEventListener("change", () => sync(2)); e[3].addEventListener("change", () => sync(3));
  const grau = UI.check("Graustufen"), dreh = UI.check("Um 90° drehen"), lr = UI.check("Spiegeln: Links <--> Rechts"), ou = UI.check("Spiegeln: Oben <--> Unten");
  const body = h("div", {}, UI.group("Maße", h("div", { class: "grid2" }, lab("x (cm):"), e[0], lab("y (cm):"), e[1], lab("Breite (cm):"), e[2], lab("Höhe (cm):"), e[3]), ratio.el),
    grau.el, h("br"), dreh.el, h("br"), lr.el, h("br"), ou.el);
  return dlg("Grafik", body, async () => {
    const g = e.map((x) => UI.num(x.value));
    if (grau.get() || dreh.get() || lr.get() || ou.get()) {
      const im = await DL.ladeBild(o.data);
      if (im) {
        const w = im.naturalWidth, hh = im.naturalHeight, c = document.createElement("canvas");
        c.width = dreh.get() ? hh : w; c.height = dreh.get() ? w : hh;
        const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.translate(c.width / 2, c.height / 2);
        if (dreh.get()) ctx.rotate(Math.PI / 2);
        ctx.scale(lr.get() ? -1 : 1, ou.get() ? -1 : 1);
        ctx.drawImage(im, -w / 2, -hh / 2);
        if (grau.get()) {
          const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data;
          for (let i = 0; i < d.length; i += 4) { const v = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]); d[i] = d[i + 1] = d[i + 2] = v; }
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(id, 0, 0);
        }
        o.data = DL.bmpBytes(c); o.ext = MW.cpEncode("bmp");
        if (dreh.get()) { const t = g[2]; g[2] = g[3]; g[3] = t; }
      }
    }
    o.g = g;
  });
};

// ------------------------------------------------------------ Schaubild, Achse, Kurve
DL.achse = async function (a0, titel = "Achse") {
  const a = Object.assign({}, a0, { hfarbe: a0.hfarbe.slice() });
  const fld = (v, tip) => { const x = h("input", { class: "field", inputmode: "decimal", title: tip, style: { width: "110px" } }); x.value = UI.fz(v); return x; };
  const von = fld(a.von, "Beginn der Skalierung"), bis = fld(a.bis, "Ende der Skalierung"), lage = fld(a.lage, "Position auf der anderen Achse");
  const log = UI.check("Logarithmische Skala", a.log, null, "wird noch nicht unterstützt"); log.inp.disabled = true;
  const abst = fld(a.abstand, "gemessen in Einheiten der Achse");
  const kl = UI.spin(a.kleine, 0, 20, 1, { tip: "Anzahl der Striche zwischen zwei großen Strichen." });
  const hl = UI.check("Hilfslinien", a.hilfslinien, null, "Verlängerung der großen Striche");
  const sicht = UI.check("sichtbar", a.sichtbar), auto = UI.check("automatisch skalieren", a.auto);
  for (const x of [von, bis, abst]) x.addEventListener("input", () => auto.set(false));
  const attr = UI.button("Hilfslinienattribute", async () => { const r = await DL.linien(a.hstil, 1, a.hfarbe); if (r) { a.hstil = r[0]; a.hfarbe = r[2]; } });
  const body = h("div", {},
    UI.group("", h("div", { class: "grid4" }, lab("Von"), von, lab("Lage"), lage, lab("Bis"), bis, h("span"), log.el)),
    h("div", { class: "cols" }, UI.group("Striche", h("div", { class: "grid2" }, lab("Abstand"), abst, lab("Kleine"), kl.el)),
      UI.group("Optionen", h("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, attr, hl.el))),
    sicht.el, h("br"), auto.el);
  const r = await dlg(titel, body, () => {
    const v = UI.num(von.value), b = UI.num(bis.value), ab = UI.num(abst.value);
    if (b <= v || ab <= 0) throw new UI.WertFehler("„Bis“ muss größer als „Von“ sein und der Abstand größer als 0.");
    return Object.assign(a, { von: v, bis: b, abstand: ab, lage: UI.num(lage.value), kleine: kl.get(), hilfslinien: hl.get(), sichtbar: sicht.get(), auto: auto.get() });
  });
  return r || null;
};
DL.schaubild = async function (spec0) {
  const spec = clone(spec0);
  const hg = UI.farbCombo(spec.fenster || [255, 255, 255], "Farbe des Fensters");
  const tips = [["Links", "0=links 100=rechts"], ["Oben", "0=oben 100=unten"], ["Breite", "100=ganzes Fenster"], ["Höhe", "100=ganzes Fenster"]];
  const pc = spec.pc.map((v, i) => UI.spin(v, 0, 100, 1, { tip: tips[i][1], width: 56 }));
  const farbe = UI.farbCombo(spec.farbe, "Hintergrund des Schaubilds");
  const leg = UI.check("Legende", spec.legende, null, "Legende anzeigen");
  const tit = UI.check("Achsen beschriften (Name und Einheit)", spec.achsentitel !== false, null, "Die Achsen werden mit dem Namen der Größe und ihrer Einheit beschriftet (Einheiten unter Simulation bearbeiten → Startwerte).");
  const timer = UI.spin(spec.timer, 1, 10000, 10, { width: 70 });
  const ach = (key, t) => UI.button(t, async () => { const r = await DL.achse(spec[key], t); if (r) spec[key] = r; }, "Skalierung ändern");
  const body = h("div", {},
    h("div", { class: "grid2" }, lab("Fensterhintergrund"), hg.el),
    UI.group("Schaubild",
      h("div", { class: "grid4" }, lab(tips[0][0]), pc[0].el, lab(tips[2][0]), pc[2].el, lab(tips[1][0]), pc[1].el, lab(tips[3][0]), pc[3].el, lab("Farbe"), h("div", { style: { gridColumn: "span 3" } }, farbe.el)),
      h("div", { class: "row2", style: { marginTop: "6px" } }, ach("xa", "x-Achse"), ach("ya", "y-Achse")),
      h("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", margin: "4px 0" } }, leg.el, tit.el),
      h("div", { class: "row2" }, lab("Timer-Intervall (ms):"), timer.el)));
  const r = await dlg("Eigenschaften des Schaubilds", body, () => {
    const p = pc.map((x) => x.get());
    if (p[2] < 5 || p[3] < 5) throw new UI.WertFehler("Breite und Höhe müssen mindestens 5 % betragen.");
    return Object.assign(spec, { pc: p, farbe: farbe.get(), legende: leg.get(), achsentitel: tit.get(), timer: timer.get(), fenster: hg.get() });
  });
  return r || null;
};
DL.kurve = async function (k0, bildHex) {
  const k = Object.assign({}, k0, { farbe: k0.farbe.slice(), pfarbe: k0.pfarbe.slice() });
  let hx = bildHex || "";
  const typ = UI.radios("Typ", MW.TYPEN, k.typ, 2);
  const spl = UI.check("Splines", !!k.splines, null, "quadratische Interpolation");
  const linBtn = UI.button("Linienattribute", async () => { const r = await DL.linien(k.stil, k.dicke, k.farbe); if (r) [k.stil, k.dicke, k.farbe] = r; }, "Farbe, Dicke, Stil der Kurve");
  const form = UI.radios("Form", MW.FORMEN, Math.min(k.form, 2), 1);
  const gr = UI.spin(Math.max(1, Math.min(15, k.groesse)), 1, 15, 1, { tip: "gemessen in Pt." });
  const pf = UI.farbCombo(k.pfarbe, "Farbe der Punkte");
  const an = UI.check("an", !!k.ani);
  const kst = UI.radios("Entstehung der Kurve", ["unsichtbar", "sofort zeichnen", "animiert zeichnen"], Math.min(k.kurvenstil, 2), 1);
  const aty = UI.radios("Animationstyp", ["linear", "zyklisch", "autoreverse"], Math.min(k.anityp, 2), 1);
  const vor = h("div", { style: { width: "44px", height: "44px", display: "grid", placeItems: "center", background: "#fff", border: "1px solid #888" } });
  const zeige = async () => {
    vor.replaceChildren(); const b = DL.bildHex(hx);
    const im = b ? await DL.ladeBild(b) : null;
    if (im) { im.style.maxWidth = "40px"; im.style.maxHeight = "40px"; vor.append(im); } else vor.textContent = "–";
  };
  const oeffnen = UI.button("Öffnen", async () => {
    const f = await UI.pickFile("image/*,.bmp"); if (!f) return;
    const im = await DL.ladeBild(await UI.readFile(f));
    if (!im) { await UI.msg("Das Bild konnte nicht gelesen werden."); return; }
    const sc = Math.min(1, 96 / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.naturalWidth * sc)); c.height = Math.max(1, Math.round(im.naturalHeight * sc));
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    hx = MW.hex(new Uint8Array(await blob.arrayBuffer())); zeige();
  }, "Bild auswählen");
  const loeschen = UI.button("Löschen", () => { hx = ""; zeige(); }, "Kein Bild anzeigen");
  zeige();
  const body = h("div", {},
    h("div", { class: "cols" },
      h("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, typ.el, UI.group("Linien", h("div", { class: "row2" }, linBtn, spl.el))),
      UI.group("Punkte", h("div", { class: "cols" }, form.el, h("div", { class: "grid2", style: { alignContent: "start" } }, lab("Größe"), gr.el, lab("Farbe:"), pf.el)))),
    UI.group("Animation", h("div", { class: "cols" }, an.el, kst.el, aty.el, h("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } }, oeffnen, vor, loeschen))));
  const r = await dlg("Kurven-Parameter", body, () => {
    Object.assign(k, { typ: typ.get(), splines: spl.get() ? 1 : 0, form: form.get(), groesse: gr.get(), pfarbe: pf.get(), ani: an.get() ? 1 : 0, kurvenstil: kst.get(), anityp: aty.get() });
    return { k, bildHex: hx };
  }, { width: 720 });
  return r || null;
};

// ------------------------------------------------------------ Algorithmische Modellierung
function brauchtStartwert(lines, cs) {
  const key = cs ? (n) => n : (n) => n.toUpperCase();
  const reId = new RegExp(MW.IDENT.source.slice(1, -1), "g");
  const gesetzt = new Set(), braucht = new Set();
  const namen = (t) => (t.replace(/\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/g, " ").match(reId) || []);
  for (let line of lines) {
    line = line.split("//")[0];
    for (const st of line.split(";")) {
      const m = /^\s*(?:if|while)\s+(.*?)\s+(?:then|do)\s+(.*)$/is.exec(st);
      const [cond, body] = m ? [m[1], m[2]] : ["", st];
      const m2 = new RegExp("^\\s*(" + MW.IDENT.source.slice(1, -1) + ")\\s*:?=(.*)$", "s").exec(body);
      const [ziel, rhs] = m2 ? [m2[1], m2[2]] : [null, body];
      for (const n of namen(cond + " " + rhs)) {
        const u = n.toUpperCase();
        if (u in MW.FUN || MW.KEYWORDS.has(u)) continue;
        if (!gesetzt.has(key(n))) braucht.add(key(n));
      }
      if (ziel && !m) gesetzt.add(key(ziel));
    }
  }
  return braucht;
}
DL.brauchtStartwert = brauchtStartwert;
function fehlerZeile(lines, cs) {
  for (let i = 0; i < lines.length; i++) {
    try { new Function("E", "F", MW.translate([lines[i]], cs)); }
    catch (e) { return i + 1; }
  }
  return null;
}
DL.algo = function (sim0, makros0, mehrere) {
  const sim = clone(sim0); const makros = clone(makros0);
  let busy = false;
  const wh = UI.spin(Math.max(1, Math.min(MW.MAX_WERTE, sim.wiederhole)), 1, MW.MAX_WERTE, 1,
    { width: 86, tip: `Anzahl der berechneten Werte (max. ${MW.MAX_WERTE.toLocaleString("de-DE")}). Größere Zahlen werden auf das Maximum gesetzt.\nDas Original-Moebius kann höchstens ${MW.MAX_ORIGINAL} Werte.` });
  const name = h("input", { class: "field", style: { flex: "1", minWidth: "120px" } }); name.value = sim.name;
  const prog = h("textarea", { class: "field prog", spellcheck: "false", autocapitalize: "off", autocorrect: "off", autocomplete: "off", title: "Programmschleife",
    style: { width: "100%", height: "100%", minHeight: "260px" } });
  prog.value = sim.programm.join("\n");
  const tbody = h("tbody");
  const tab = h("table", { class: "gtable" }, h("thead", {}, h("tr", {}, h("th", { text: "Größe" }), h("th", { text: "Startwert" }), h("th", { text: "Einheit" }))), tbody);
  const cs = UI.check("Groß-, Kleinschreibung", !!sim.gross_klein, () => sync());
  const lines = () => prog.value.split("\n");
  const readTable = () => {
    const werte = {};
    for (const tr of tbody.children) {
      const t = tr.querySelector("input.startwert").value.trim();
      if (t) { try { werte[tr.dataset.name] = UI.num(t); } catch (e) { /* ungueltig: ignorieren */ } }
    }
    return werte;
  };
  const readEinheiten = () => {
    const e = {};
    for (const tr of tbody.children) { const i = tr.querySelector("input.einheit"); if (i) e[tr.dataset.name] = i.value.trim(); }
    return e;
  };
  function sync() {
    if (busy) return;
    const c = cs.get(); let names, braucht;
    try { const voll = MW.expandMakros(lines(), makros); [names] = MW.programVariables(voll, c); braucht = brauchtStartwert(voll, c); }
    catch (e) { return; }
    const alt = new Map(sim.variablen.map((v) => [c ? v.name : v.name.toUpperCase(), v]));
    const werte = readTable(), einh = readEinheiten();
    for (const [n, w] of Object.entries(werte)) { const k = c ? n : n.toUpperCase(); if (alt.has(k)) { alt.get(k).startwert = w; alt.get(k).startwert_aktiv = 1; } }
    for (const [n, e] of Object.entries(einh)) { const k = c ? n : n.toUpperCase(); if (alt.has(k)) alt.get(k).einheit = e; }
    const neu = names.map((n) => { let v = alt.get(n); if (!v) v = MW.newVariable(n, 0.0, braucht.has(n), mehrere ? sim.name : ""); else if (v.name !== n) v.name = n; return v; });
    sim.variablen = neu;
    busy = true;
    const ae = document.activeElement;
    const focusName = ae && ae.closest && ae.closest("tr")?.dataset.name, focusKlasse = ae && ae.classList && ae.classList.contains("einheit") ? "einheit" : "startwert";
    tbody.replaceChildren(...neu.map((v) => {
      const inp = h("input", { class: "startwert", inputmode: "decimal", autocomplete: "off", "aria-label": "Startwert " + v.name });
      inp.value = v.startwert_aktiv || braucht.has(v.name) ? UI.fz(v.startwert) : "";
      const ein = h("input", { class: "einheit", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", "aria-label": "Einheit " + v.name, title: "Einheit, z. B. m/s – erscheint an der Achse" });
      ein.value = v.einheit || "";
      return h("tr", { "data-name": v.name }, h("td", { class: "name", text: v.name }), h("td", {}, inp), h("td", { class: "einheit" }, ein));
    }));
    if (focusName) tbody.querySelector(`tr[data-name="${CSS.escape(focusName)}"] input.${focusKlasse}`)?.focus();
    busy = false;
  }
  let timer = null;
  prog.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(sync, 350); });
  const reset = UI.button("Zurücksetzen", () => { for (const v of sim.variablen) v.startwert = 0.0; for (const i of tbody.querySelectorAll("input")) if (i.value.trim()) i.value = "0"; }, "Alle Startwerte auf 0 setzen");
  // Makros
  const block = () => {
    const a = prog.value.slice(0, prog.selectionStart).split("\n").length - 1;
    const b = prog.value.slice(0, Math.max(prog.selectionStart, prog.selectionEnd - (prog.selectionEnd > prog.selectionStart && prog.value[prog.selectionEnd - 1] === "\n" ? 1 : 0))).split("\n").length - 1;
    return [a, b];
  };
  const makroName = async () => {
    const [a, b] = block(); const ls = lines();
    if (a === b) { const m = /^\s*\{(.+?)\}\s*$/.exec(ls[a]); if (m && makros[m[1]]) return [a, m[1]]; }
    await UI.msg("Der gewählte Bereich ist kein Makro."); return [null, null];
  };
  const makroMenu = (x, y) => UI.popup([
    { text: "Makro erzeugen", action: async () => {
      const [a, b] = block(); const ls = lines();
      const n = ((await UI.input("Makro erzeugen", "Geben Sie den Namen des Makros ein:")) || "").trim();
      if (!n) return;
      if (makros[n]) { await UI.msg("Es existiert schon ein Makro mit diesem Namen."); return; }
      makros[n] = ls.slice(a, b + 1);
      prog.value = ls.slice(0, a).concat(["{" + n + "}"], ls.slice(b + 1)).join("\n"); sync();
    } },
    { text: "Makro auflösen", action: async () => {
      const [a, n] = await makroName(); if (n === null) return; const ls = lines();
      prog.value = ls.slice(0, a).concat(makros[n], ls.slice(a + 1)).join("\n"); delete makros[n]; sync();
    } },
    { text: "Makro bearbeiten", action: async () => {
      const [, n] = await makroName(); if (n === null) return;
      const r = await DL.makro(n, makros[n]); if (r) { makros[n] = r; sync(); }
    } },
  ], x, y);
  const mkBtn = UI.button("Makro…", (e) => { const r = e.currentTarget.getBoundingClientRect(); makroMenu(r.left, r.bottom); }, "Makros erzeugen, auflösen, bearbeiten");
  prog.addEventListener("contextmenu", (e) => { if (e.pointerType === "touch") return; e.preventDefault(); makroMenu(e.clientX, e.clientY); });
  // andere Modellformen
  const sprBtn = UI.button("Sprachliches Modell", async () => {
    const r = await DL.sprachlich(sim);
    if (r) { sim.sprachlich = r.ergebnis; sim._optionen[1] = r.vereinfacht ? 1 : 0; prog.value = MW.spracheProgramm(r.ergebnis.felder, r.vereinfacht).join("\n"); sync(); }
  });
  const graBtn = UI.button("Grafisches Modell", async () => {
    const r = await DL.grafisch(sim);
    if (r) { sim.grafisch = r.g; sim._optionen = [sim._optionen[0], r.vereinfacht ? 1 : 0, r.erweitert ? 1 : 0]; prog.value = MW.grafikProgramm(r.g, r.vereinfacht).join("\n"); sync(); }
  });
  const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", width: "min(92vw, 860px)", height: "min(72vh, 620px)" } },
    h("div", { class: "row2" }, lab("Wiederhole"), wh.el, h("span", { text: `mal (max. ${MW.MAX_WERTE.toLocaleString("de-DE")})` }), h("span", { style: { width: "18px" } }), lab("Name der Simulation:"), name),
    h("div", { style: { display: "flex", gap: "8px", flex: "1", minHeight: "0", flexWrap: "wrap" } },
      h("div", { style: { flex: "3 1 320px", minWidth: "0", display: "flex", flexDirection: "column" } }, prog),
      h("div", { style: { flex: "1 1 250px", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" } },
        h("span", { text: "Startwerte und Einheiten:" }), h("div", { style: { flex: "1", overflow: "auto", minHeight: "120px", background: "#fff" } }, tab),
        h("div", { class: "row2" }, reset, mkBtn), cs.el, sprBtn, graBtn)));
  sync();
  return UI.modal({ title: "Algorithmische Modellierung", body, buttons: [
    HILFE_BTN,
    { text: "OK", default: true, onClick: async () => {
      clearTimeout(timer); sync();
      const werte = readTable(), einh = readEinheiten(); const c = cs.get();
      for (const v of sim.variablen) {
        if (Object.prototype.hasOwnProperty.call(werte, v.name)) { v.startwert = werte[v.name]; v.startwert_aktiv = 1; }
        else { v.startwert_aktiv = 0; v.startwert = 0.0; }
        if (Object.prototype.hasOwnProperty.call(einh, v.name)) v.einheit = einh[v.name];
      }
      sim.programm = lines(); sim.wiederhole = wh.get(); sim.gross_klein = c ? 1 : 0;
      sim.name = name.value.trim() || sim.name;
      const voll = (() => { try { return MW.expandMakros(sim.programm, makros); } catch (e) { return null; } })();
      if (!voll) { await UI.msg("Vermutlich Makro-Endlosschleife."); return UI.KEEP; }
      try { MW.compile(voll, c); }
      catch (e) {
        const z = fehlerZeile(voll, c);
        await UI.msg(z ? `Syntax-Fehler im Programm (Zeile ${z}):\n${voll[z - 1]}` : `Fehler im Programm:\n${e.message}`); return UI.KEEP;
      }
      return { sim, makros };
    } },
    { text: "Abbrechen", value: null },
  ] });
};

// ------------------------------------------------------------ Sprachliche Modellierung
DL.sprachlich = function (sim) {
  const sp = sim.sprachlich;
  let cur = [Math.floor(sp.felder.length / 3), 0];
  const mtb = h("tbody");
  const zeilen = Math.max(50, Math.ceil(sp.felder.length / 3) + 10);
  for (let r = 0; r < zeilen; r++) {
    const tr = h("tr");
    for (let c = 0; c < 3; c++) {
      const inp = h("input", { autocomplete: "off", autocapitalize: "off", "aria-label": ["Größe", "Aussage", "Term"][c] + " Zeile " + (r + 1) });
      inp.value = sp.felder[r * 3 + c] || "";
      inp.addEventListener("focus", () => { cur = [r, c]; mtb.querySelectorAll("tr.cur").forEach((x) => x.classList.remove("cur")); tr.classList.add("cur"); });
      if (c === 1) inp.setAttribute("list", "praedikate");
      tr.append(h("td", {}, inp));
    }
    mtb.append(tr);
  }
  const cell = (r, c) => mtb.children[r].children[c].firstChild;
  const einfuegen = (text) => {
    text = text.trim(); if (!text) return;
    const [r, c] = cur; const inp = cell(r, c); const alt = inp.value;
    inp.value = c < 2 || !alt ? text : alt + "*" + text;
    if (c < 2) { cur = [r, c + 1]; cell(r, c + 1).focus({ preventScroll: true }); }
  };
  const liste = (titel, items, editierbar, n) => {
    const tb = h("tbody");
    for (let i = 0; i < (editierbar ? Math.max(n, items.length + 5) : items.length); i++) {
      let el;
      if (editierbar) { el = h("input", { autocomplete: "off", autocapitalize: "off", "aria-label": titel + " " + (i + 1) }); el.value = items[i] || ""; }
      else el = h("div", { class: "name", text: items[i], style: { padding: "3px 6px" } });
      const td = h("td", {}, el);
      UI.gesten(td, { dbl: () => einfuegen(editierbar ? el.value : items[i]) });
      el.addEventListener("dblclick", (e) => { e.preventDefault(); einfuegen(editierbar ? el.value : items[i]); });
      tb.append(h("tr", {}, td));
    }
    const box = h("div", { style: { flex: "1 1 180px", minWidth: "0", display: "flex", flexDirection: "column" } },
      UI.group(titel, h("div", { style: { maxHeight: "180px", overflow: "auto" } }, h("table", { class: "gtable" }, tb))));
    return { box, werte: () => Array.from(tb.querySelectorAll("input"), (x) => x.value.trim()).filter(Boolean) };
  };
  const zu = liste("Zustandsgrößen", sp.zustandsgroessen, true, 20);
  const ra = liste("Veränderungsraten", sp.raten, true, 20);
  const pr = liste("Aussagen", PRAEDIKATE, false, 3);
  const ver = UI.check("vereinfacht", !!sim._optionen[1], null, "Angehakt: ein Durchlauf = eine Zeiteinheit. Sonst wird die Veränderungsrate mit dt multipliziert.");
  const trash = h("button", { class: "tb", title: "Papierkorb: markierte Zeile löschen", "aria-label": "Zeile löschen", onclick: () => {
    const r = cur[0]; for (let i = r; i < mtb.children.length - 1; i++) for (let c = 0; c < 3; c++) cell(i, c).value = cell(i + 1, c).value;
    for (let c = 0; c < 3; c++) cell(mtb.children.length - 1, c).value = "";
  } }, h("img", { src: MWIcons.url("trash", "#000000"), alt: "" }));
  const dl = h("datalist", { id: "praedikate" }, PRAEDIKATE.map((p) => h("option", { value: p })));
  const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", width: "min(92vw, 860px)" } }, dl,
    h("div", { class: "cols" }, zu.box, ra.box, pr.box),
    h("div", { class: "row2" }, h("b", { text: "Modell" }), h("span", { class: "hint", text: "Doppeltipp auf einen Eintrag oben trägt ihn in das markierte Feld ein." }), h("span", { style: { marginLeft: "auto" } }, ver.el)),
    h("div", { style: { maxHeight: "min(34vh, 300px)", overflow: "auto" } }, h("table", { class: "gtable" }, h("thead", {}, h("tr", {}, h("th", { text: "Größe" }), h("th", { text: "Aussage" }), h("th", { text: "Term" }))), mtb)),
    h("div", { class: "row2", style: { justifyContent: "flex-end" } }, trash));
  return UI.modal({ title: "Sprachliche Modellierung", body, buttons: [
    HILFE_BTN,
    { text: "OK", default: true, tip: "In Algorithmus übersetzen", onClick: async () => {
      const felder = [];
      for (let r = 0; r < mtb.children.length; r++) {
        const z = [0, 1, 2].map((c) => cell(r, c).value.trim());
        if (!z.some(Boolean)) continue;
        if (!z.every(Boolean)) { await UI.msg(`Zeile ${r + 1} ist unvollständig.`); return UI.KEEP; }
        if (!PRAEDIKATE.includes(z[1])) { await UI.msg(`Zeile ${r + 1}: Die Aussage muss eine der drei Aussagen oben rechts sein.`); return UI.KEEP; }
        felder.push(...z);
      }
      if (!felder.length) { await UI.msg("Das Modell ist leer."); return UI.KEEP; }
      return { ergebnis: { zustandsgroessen: zu.werte(), raten: ra.werte(), felder }, vereinfacht: ver.get() };
    } },
    { text: "Abbrechen", value: null, tip: "Nicht übersetzen" },
  ] });
};

// ------------------------------------------------------------ Veraenderungsrate
DL.rate = async function (name0, term0, eingaenge) {
  const name = h("input", { class: "field", title: "Mit Tastatur eingeben", autocapitalize: "off", autocomplete: "off" }); name.value = name0;
  const term = h("input", { class: "field", title: "Tippen Sie auf Knöpfe oder Variablen", autocapitalize: "off", autocomplete: "off", style: { flex: "1" } }); term.value = term0;
  let pos = term.value.length;
  term.addEventListener("blur", () => { pos = term.selectionStart ?? term.value.length; });
  const ins = (t) => { const v = term.value; term.value = v.slice(0, pos) + t + v.slice(pos); pos += t.length; };
  const taste = (t) => { if (t === "<-") { if (pos > 0) { term.value = term.value.slice(0, pos - 1) + term.value.slice(pos); pos--; } } else if (t === "C") { term.value = ""; pos = 0; } else ins(t); };
  const fns = h("div", { class: "row2" }, ["sqr", "sin", "cos", "arctan", "ln", "exp", "sqrt", "frac", "int", "abs", "random"].map((f) => h("button", { class: "btn", onclick: () => ins(f + "(") }, f)));
  const liste = h("div", { class: "list", title: "Eingangsgrößen", style: { minHeight: "150px" } }, eingaenge.map((n) => h("div", { class: "li", text: n, onclick: () => ins(n) })));
  const pad = h("div", { class: "pad" }, [["7", "8", "9", "/", "("], ["4", "5", "6", "*", ")"], ["1", "2", "3", "-", "<-"], ["0", ",", "^", "+", "C"]].flat().map((t) => h("button", { class: "btn", onclick: () => taste(t) }, t)));
  const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", width: "min(92vw, 640px)" } },
    h("div", { style: { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,2fr)", gap: "4px 8px", alignItems: "center" } },
      h("span", { text: "Name der Veränderungsrate:" }), h("span"), h("span", { text: "Term zur Berechnung:" }), name, h("b", { text: "=", style: { fontSize: "20px" } }), term),
    fns, h("div", { class: "cols" }, h("div", { style: { flex: "1 1 160px", display: "flex" } }, liste), pad));
  const r = await dlg("Veränderungsrate", body, () => {
    const n = name.value.trim(), t = term.value.trim();
    if (!MW.IDENT.test(n)) throw new UI.WertFehler("Der Name darf nur aus Buchstaben, Ziffern und _ bestehen und muss mit einem Buchstaben beginnen.");
    return { n, t };
  });
  return r || null;
};

// ------------------------------------------------------------ Grafische Modellierung (Flussdiagramm)
class FlowCanvas {
  constructor(g) {
    this.g = clone(g); this.tool = "zustand"; this.drag = null; this.gummi = null; this.busy = false;
    for (const l of [this.g.zustand, this.g.rate, this.g.konstante]) for (const n of l) n.box = FlowCanvas.norm(n.box);
    this.c = h("canvas", { width: 900, height: 620, "aria-label": "Flussdiagramm" });
    this.dpr = window.devicePixelRatio || 1;
    this.c.width = 900 * this.dpr; this.c.height = 620 * this.dpr; this.c.style.width = "900px"; this.c.style.height = "620px";
    this.c.addEventListener("pointerdown", (e) => this.down(e));
    this.c.addEventListener("pointermove", (e) => this.move(e));
    this.c.addEventListener("pointerup", (e) => this.up(e));
    this.c.addEventListener("pointercancel", () => { this.drag = null; this.gummi = null; this.paint(); });
    this.paint();
  }
  static norm(b) { return b[4] > b[2] && b[5] > b[3] ? b.slice() : [b[0], b[1], b[2], b[3], b[2] + b[4], b[3] + b[5]]; }
  pos(e) { const r = this.c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  box(cx, cy, name, breit) { const w = breit ? Math.max(54, 12 + 8 * name.length) : 40; return [Math.round(cx), Math.round(cy), Math.round(cx - w / 2), Math.round(cy - 15), Math.round(cx + w / 2), Math.round(cy + 15)]; }
  *knoten() { for (const art of ["zustand", "rate", "konstante"]) for (let i = 0; i < this.g[art].length; i++) yield [art, i, this.g[art][i]]; }
  bei(x, y) { for (const [art, i, n] of this.knoten()) { const b = n.box; if (b[2] - 6 <= x && x <= b[4] + 6 && b[3] - 6 <= y && y <= b[5] + 6) return [art, i]; } return null; }
  pfeilBei(x, y) {
    for (let i = 0; i < this.g.pfeile.length; i++) {
      const p = this.g.pfeile[i].punkte;
      for (let j = 0; j < p.length - 1; j++) {
        const dx = p[j + 1][0] - p[j][0], dy = p[j + 1][1] - p[j][1], L = dx * dx + dy * dy;
        const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((x - p[j][0]) * dx + (y - p[j][1]) * dy) / L));
        if (Math.hypot(x - p[j][0] - t * dx, y - p[j][1] - t * dy) < 8) return i;
      }
    }
    return null;
  }
  mitte(n) { const b = n.box; return [(b[2] + b[4]) / 2, (b[3] + b[5]) / 2]; }
  rand(n, zx, zy) {
    const b = n.box, cx = (b[2] + b[4]) / 2, cy = (b[3] + b[5]) / 2, dx = zx - cx, dy = zy - cy;
    if (dx === 0 && dy === 0) return [Math.trunc(cx), Math.trunc(cy)];
    const hw = (b[4] - b[2]) / 2, hh = (b[5] - b[3]) / 2;
    const f = Math.min(dx ? hw / Math.abs(dx) : 1e9, dy ? hh / Math.abs(dy) : 1e9);
    return [Math.trunc(cx + dx * f), Math.trunc(cy + dy * f)];
  }
  route(a) {
    const v = a.verbindung; let q, z;
    if (v[2] >= 0 && v[3] >= 0) { q = this.g.rate[v[2]]; z = this.g.zustand[v[3]]; }
    else if (v[0] >= 0 && v[4] >= 0) { q = this.g.zustand[v[0]]; z = this.g.rate[v[4]]; }
    else if (v[1] >= 0 && v[4] >= 0) { q = this.g.konstante[v[1]]; z = this.g.rate[v[4]]; }
    else return;
    if (a._typ === 255) [q, z] = [z, q];
    a.punkte = [this.rand(q, ...this.mitte(z)), this.rand(z, ...this.mitte(q))];
    if (a._typ === 255) a.punkte.reverse();
  }
  routeKnoten(art, i) { const pos = { zustand: [0, 3], konstante: [1], rate: [2, 4] }[art]; for (const a of this.g.pfeile) if (pos.some((p) => a.verbindung[p] === i)) this.route(a); }
  nameNeu(basis) { const namen = new Set(Array.from(this.knoten(), ([, , n]) => n.name.toUpperCase())); let i = 1; while (namen.has((basis + i).toUpperCase())) i++; return basis + i; }
  async down(e) {
    if (this.busy) return;
    this.c.setPointerCapture(e.pointerId);
    const [x, y] = this.pos(e); const k = this.bei(x, y);
    if (this.tool === "pfeil" && k) { const b = this.g[k[0]][k[1]].box; this.drag = [k, x - b[0], y - b[1]]; }
    else if (this.tool === "zustand" && !k) {
      this.busy = true;
      const n = ((await UI.input("Zustandsgröße", "Name der Zustandsgröße:", this.nameNeu("Zustand"))) || "").trim();
      this.busy = false;
      if (MW.IDENT.test(n)) this.g.zustand.push({ box: this.box(x, y, n, true), name: n });
      else if (n) await UI.msg("Ungültiger Name.");
    } else if (this.tool === "rate" || this.tool === "verbindung") this.gummi = [[x, y], [x, y], k];
    else if (this.tool === "loeschen") { if (k) this.loesche(...k); else { const i = this.pfeilBei(x, y); if (i !== null) this.g.pfeile.splice(i, 1); } }
    else if (this.tool === "edit" && k) { this.busy = true; await this.beschriften(...k); this.busy = false; }
    this.paint();
  }
  move(e) {
    const [x, y] = this.pos(e);
    if (this.drag) {
      const [[art, i], dx, dy] = this.drag; const n = this.g[art][i], b = n.box;
      const ox = Math.round(x - dx - b[0]), oy = Math.round(y - dy - b[1]);
      n.box = [b[0] + ox, b[1] + oy, b[2] + ox, b[3] + oy, b[4] + ox, b[5] + oy];
      this.routeKnoten(art, i); this.paint();
    } else if (this.gummi) { this.gummi[1] = [x, y]; this.paint(); }
  }
  async up(e) {
    const [x, y] = this.pos(e);
    if (this.gummi) {
      const [[x0, y0], , start] = this.gummi; const ende = this.bei(x, y); this.gummi = null;
      this.busy = true;
      if (this.tool === "rate") await this.neueRate(x0, y0, start, x, y, ende); else await this.neueVerbindung(x0, y0, start, ende);
      this.busy = false;
    }
    this.drag = null; this.paint();
  }
  async neueRate(x0, y0, start, x, y, ende) {
    const a = start && start[0] === "zustand" ? start[1] : null, b = ende && ende[0] === "zustand" ? ende[1] : null;
    if (a === null && b === null) { await UI.msg("Eine Veränderungsrate muss an einer Zustandsgröße beginnen oder enden.\nZiehen Sie mit dem Finger von oder zu einer Zustandsgröße."); return; }
    if (a !== null && a === b) return;
    let rx, ry;
    if (a !== null && b !== null) { rx = (x0 + x) / 2; ry = (y0 + y) / 2; } else if (a !== null) { rx = x; ry = y; } else { rx = x0; ry = y0; }
    if (a !== null && b === null) { const k = this.bei(rx, ry); if (k && k[0] === "zustand" && k[1] === a) { await UI.msg("Bitte mit dem Finger von der Zustandsgröße weg auf eine freie Stelle ziehen."); return; } }
    const name = this.nameNeu("Rate"); const r = this.g.rate.length;
    this.g.rate.push({ box: this.box(rx, ry, name, false), name, term: "", _x: 0 });
    if (a !== null) this.g.pfeile.push({ punkte: [], _typ: 255, verbindung: [-1, -1, r, a, -1] });
    if (b !== null) this.g.pfeile.push({ punkte: [], _typ: 1, verbindung: [-1, -1, r, b, -1] });
    this.routeKnoten("rate", r); this.paint();
    await this.beschriften("rate", r);
  }
  async neueVerbindung(x0, y0, start, ende) {
    if (!ende || ende[0] !== "rate") { await UI.msg("Ein Wirkungspfeil muss auf einer Veränderungsrate enden."); return; }
    const r = ende[1]; let v;
    if (start && start[0] === "zustand") v = [start[1], -1, -1, -1, r];
    else if (start && start[0] === "konstante") v = [-1, start[1], -1, -1, r];
    else if (!start) {
      const n = ((await UI.input("Konstante", "Name der Konstanten:", this.nameNeu("Konstante"))) || "").trim();
      if (!MW.IDENT.test(n)) return;
      this.g.konstante.push({ box: this.box(x0, y0, n, true), name: n }); v = [-1, this.g.konstante.length - 1, -1, -1, r];
    } else return;
    if (this.g.pfeile.some((a) => a.verbindung.join() === v.join())) return;
    const a = { punkte: [], _typ: 1, verbindung: v }; this.g.pfeile.push(a); this.route(a);
  }
  eingaenge(r) {
    const out = [];
    for (const a of this.g.pfeile) { const v = a.verbindung; if (v[4] === r) { if (v[0] >= 0) out.push(this.g.zustand[v[0]].name); if (v[1] >= 0) out.push(this.g.konstante[v[1]].name); } }
    return out;
  }
  async beschriften(art, i) {
    const n = this.g[art][i];
    if (art === "rate") {
      const term = n.term.includes(":=") ? n.term.split(":=").slice(1).join(":=").trim() : n.term;
      const d = await DL.rate(n.name, term, this.eingaenge(i));
      if (d) { n.name = d.n; n.term = d.t ? `${d.n}:=${d.t}` : ""; }
    } else {
      const name = ((await UI.input("Beschriftung", "Name:", n.name)) || "").trim();
      if (MW.IDENT.test(name)) { n.name = name; const b = n.box; n.box = this.box((b[2] + b[4]) / 2, (b[3] + b[5]) / 2, name, true); this.routeKnoten(art, i); }
    }
    this.paint();
  }
  loesche(art, i) {
    const pos = { zustand: [0, 3], konstante: [1], rate: [2, 4] }[art];
    this.g.pfeile = this.g.pfeile.filter((a) => !pos.some((p) => a.verbindung[p] === i));
    for (const a of this.g.pfeile) for (const p of pos) if (a.verbindung[p] > i) a.verbindung[p] -= 1;
    this.g[art].splice(i, 1);
  }
  paint() {
    const ctx = this.c.getContext("2d"); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 900, 620);
    D.maleFluss(ctx, this.g);
    if (this.gummi) { ctx.strokeStyle = "#0050dc"; ctx.lineWidth = 1; ctx.setLineDash([5, 3]); ctx.beginPath(); ctx.moveTo(...this.gummi[0]); ctx.lineTo(...this.gummi[1]); ctx.stroke(); ctx.setLineDash([]); }
  }
}
DL.FlowCanvas = FlowCanvas;
DL.grafisch = function (sim) {
  const cv = new FlowCanvas(sim.grafisch);
  const hinweise = {
    pfeil: "Verschieben: Symbol mit dem Finger ziehen.",
    edit: "Beschriftung: auf ein Symbol tippen. Bei einer Veränderungsrate wird der Term eingegeben.",
    loeschen: "Löschen: auf ein Symbol oder einen Pfeil tippen.",
    zustand: "Zustandsgröße: auf eine freie Stelle tippen.",
    rate: "Veränderungsrate: von einer Zustandsgröße wegziehen (Abfluss), zu ihr hinziehen (Zufluss) oder von einer zur anderen.",
    verbindung: "Wirkungspfeil: von Zustandsgröße oder Konstante zur Veränderungsrate ziehen. Start auf freier Stelle = neue Konstante.",
  };
  const hinweis = h("div", { class: "hint", style: { minHeight: "2.6em" } });
  const btns = [];
  const setTool = (k) => { cv.tool = k; hinweis.textContent = hinweise[k]; btns.forEach(([kk, b]) => b.classList.toggle("checked", kk === k)); };
  const col = h("div", { class: "toolcol" }, [["pfeil", "move", "Verschieben"], ["edit", "label", "Eingabe der Beschriftung"], ["loeschen", "delete", "Löschen"],
    ["zustand", "state", "Zustandsgröße"], ["rate", "rate", "Veränderungsrate"], ["verbindung", "link", "Wirkungspfeil oder Konstante"]].map(([k, ic, tip]) => {
    const b = h("button", { class: "tb", title: tip, "aria-label": tip, onclick: () => setTool(k) }, h("img", { src: MWIcons.url(ic, "#000000", 20, 3), alt: "" }));
    btns.push([k, b]); return b;
  }));
  setTool("zustand");
  const ver = UI.check("vereinfachtes Modell", !!sim._optionen[1], null, "Angehakt: ein Durchlauf = eine Zeiteinheit. Sonst wird die Veränderungsrate mit dt multipliziert.");
  const erw = UI.check("erweiterte Syntax", !!sim._optionen[2], null, "Funktionen für Zustandsgrößen zulassen?");
  const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", width: "min(94vw, 980px)", height: "min(76vh, 720px)" } },
    h("div", { style: { display: "flex", gap: "6px", flex: "1", minHeight: "0" } }, col, h("div", { class: "flowwrap" }, cv.c)),
    hinweis, h("div", { class: "row2" }, ver.el, erw.el));
  return UI.modal({ title: "Grafische Modellierung", body, buttons: [
    HILFE_BTN,
    { text: "OK", default: true, tip: "In Algorithmus übersetzen", onClick: async () => {
      const g = cv.g;
      if (!g.zustand.length) { await UI.msg("Das Modell enthält noch keine Zustandsgröße."); return UI.KEEP; }
      const fehlt = g.rate.filter((r) => !r.term.trim()).map((r) => r.name);
      if (fehlt.length) { await UI.msg("Für diese Veränderungsraten fehlt der Term: " + fehlt.join(", ") + "\nMit dem Werkzeug „Beschriftung“ auf die Rate tippen."); return UI.KEEP; }
      return { g, vereinfacht: ver.get(), erweitert: erw.get() };
    } },
    { text: "Abbrechen", value: null, tip: "Nicht übersetzen" },
  ] });
};

root.MWDialogs = DL;
})(typeof window !== "undefined" ? window : globalThis);
