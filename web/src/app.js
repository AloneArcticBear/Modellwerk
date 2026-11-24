//claude
// app.js - Hauptfenster von Modellwerk (Port von mw_app.py): Arbeitsblatt, Menues, Werkzeugleiste, Seitenleiste, Tabelle.
(function (root) {
"use strict";
const MW = root.MW, UI = root.UI, D = root.MWDraw, DL = root.MWDialogs, IC = root.MWIcons;
const { h } = UI;
const APP = UI.APP;
const PX_CM = 37.8;
const SEITE = [21.0, 13.0];
const BEISPIELE = [["Fallschirmsprung", "beispiele/Fallschirmsprung_claude.json"], ["Sparbuch: Zinseszins", "beispiele/Sparbuch_claude.json"], ["Eine Tasse Tee kühlt ab", "beispiele/Tee_kuehlt_ab_claude.json"]];
const THEME_ICON = { klassisch: "#000000", modern: "#39404f" };
const clone = DL.clone;

function specNeu() {
  return { pc: [10, 10, 80, 80], farbe: [192, 192, 192], legende: true, timer: 50, xa: MW.achseNeu(), ya: MW.achseNeu(), za: MW.achseNeu(),
    fenster: [255, 255, 255], nach: null, norm: false, achsentitel: true };
}

class App {
  constructor(el) {
    this.el = el;
    this.sheet = MW.newSheet(); this.sims = []; this.aktiv = 0; this.makros = {}; this.spec = specNeu();
    this.name = null; this.undo = []; this.runner = null; this.runnerSim = null; this.kurvenInfo = []; this.dirty = false;
    this.clip = null; this.mode = "pfeil"; this.sel = null; this.zoom = 1.4; this.autoZoom = true;
    this.anim = null; this.animT = 0; this.animTimer = null; this.animFertig = false; this.dreidGeladen = null;
    this.theme = UI.store.get("darstellung") === "modern" ? "modern" : "klassisch";
    this.edit = null;
    this.build();
    this.applyTheme(this.theme);
    D.onImageLoaded = () => this.paint();
  }

  // ================================================= Aufbau
  build() {
    const A = (key, text, action, o = {}) => (this.acts[key] = Object.assign({ key, text, action }, o));
    this.acts = {};
    A("neu", "Neu", () => this.neu(), { kbd: "N" });
    A("open", "Öffnen...", () => this.oeffnen(), { kbd: "O", icon: "open", tip: "Öffnen" });
    A("save", "Speichern", () => this.speichern(), { kbd: "S", icon: "save", tip: "Speichern" });
    A("saveprg", "Als Moebius-Datei exportieren (.prg)...", () => this.exportPrg());
    A("print", "Drucken...", () => this.drucken(), { kbd: "P", icon: "print", tip: "Drucken" });
    A("csv", "Tabelle nach Excel exportieren (CSV)...", () => this.exportCsv());
    A("png", "Arbeitsblatt als Bild speichern...", () => this.exportBild());
    A("undo", "Rückgängig", () => this.rueckgaengig(), { kbd: "Z" });
    A("cut", "Ausschneiden", () => this.ausschneiden(), { kbd: "X" });
    A("copy", "Kopieren", () => this.kopieren(), { kbd: "C" });
    A("paste", "Einfügen", () => this.einfuegen(), { kbd: "V" });
    A("del", "Löschen", () => this.loeschen());
    A("rot", "Drehen...", () => this.drehen());
    A("pfeil", "Objekte bearbeiten", () => this.setMode("pfeil"), { icon: "arrow", tip: "Objekte bearbeiten", checked: () => this.mode === "pfeil" });
    A("text", "Text schreiben", () => this.setMode("text"), { icon: "text", tip: "Text schreiben", checked: () => this.mode === "text" });
    A("editsim", "Simulation bearbeiten", () => this.simBearbeiten(), { kbd: "F2", icon: "editsim", tip: "Simulation bearbeiten" });
    A("delsim", "Simulation löschen", () => this.simLoeschen());
    A("tab", "Tabelle", () => this.toggleTabelle(), { icon: "table", tip: "Tabelle", checked: () => !this.tableWrap.hidden });
    A("sb", "Schaubild", () => this.toggleSchaubild(), { icon: "chart", tip: "Schaubild", checked: () => !this.scroll.hidden });
    A("sonder", "Sonderzeichen", () => DL.sonderzeichen((ch) => this.sonderEin(ch)));
    A("play", "Animation starten", () => this.animStart(), { icon: "play", tip: "Animation starten" });
    A("pause", "Animation anhalten", () => this.animPause(), { icon: "pause", tip: "Animation anhalten" });
    A("stop", "Animation beenden", () => this.animStop(), { icon: "stop", tip: "Animation beenden" });
    this.sofort = true; this.autoSkal = true;
    A("sofort", "sofort anzeigen", () => { this.sofort = !this.sofort; }, { checked: () => this.sofort });
    A("auto", "automatisch skalieren", () => { this.autoSkal = !this.autoSkal; }, { checked: () => this.autoSkal });
    A("zin", "Vergrößern", () => this.setZoom(this.zoom * 1.2), { kbd: "+" });
    A("zout", "Verkleinern", () => this.setZoom(this.zoom / 1.2), { kbd: "-" });
    A("zfit", "An Fensterbreite anpassen", () => this.fit(), { kbd: "0" });
    A("grafik", "Grafik...", () => this.grafikEinfuegen());
    A("clipimg", "Bild aus Zwischenablage einfügen", () => this.bildAusZwischenablage());
    A("newsim", "Neue Simulation", () => this.simNeu(), { icon: "newsim", tip: "Neue Simulation" });
    A("copysim", "Kopie der Simulation", () => this.simKopie(), { icon: "copysim", tip: "Kopie der Simulation" });
    A("ftext", "Text...", () => this.formatText());
    A("fgrafik", "Grafik...", () => this.formatGrafik());
    A("fachs", "Zahlen an Achsen...", () => this.formatAchszahlen());
    A("leg", "Legende", () => this.toggleLegende(), { checked: () => !!this.spec.legende });
    A("fsb", "Schaubild...", () => this.formatSchaubild());
    A("ftab", "Zahlen in Tabelle...", () => this.formatTabelle());
    A("hilfe", "Bedienung", () => DL.hilfe(), { kbd: "F1" });
    A("info", "Info über...", () => this.info());
    const a = this.acts;
    const menus = [
      ["Datei", [a.neu, a.open, { text: "Beispiel öffnen", sub: BEISPIELE.map(([t, u]) => ({ text: t, action: () => this.beispiel(u, t) })) }, a.save, a.saveprg, { sep: 1 }, a.print, a.csv, a.png,
        { text: "Zuletzt geöffnet", sub: () => this.recentItems() }]],
      ["Bearbeiten", [a.undo, { sep: 1 }, a.cut, a.copy, a.paste, a.del, a.rot, { sep: 1 }, a.pfeil, a.text, { sep: 1 }, a.editsim, a.delsim]],
      ["Ansicht", [a.tab, a.sb, a.sonder, { sep: 1 }, a.play, a.pause, a.stop, { sep: 1 }, a.sofort, a.auto, { sep: 1 },
        { text: "Darstellung", sub: [{ text: "Klassisch", action: () => this.applyTheme("klassisch"), checked: () => this.theme === "klassisch" },
          { text: "Modern", action: () => this.applyTheme("modern"), checked: () => this.theme === "modern" }] }, a.zin, a.zout, a.zfit]],
      ["Einfügen", [a.grafik, a.clipimg, { sep: 1 }, a.newsim, a.copysim]],
      ["Format", [a.ftext, a.fgrafik, a.fachs, a.leg, a.fsb, a.ftab]],
      ["Hilfe", [a.hilfe, a.info]],
    ];
    const mac = /Mac|iPhone|iPad/.test(navigator.platform) || /Macintosh/.test(navigator.userAgent);
    const kbdText = (k) => (!k ? null : k.startsWith("F") ? k : (mac ? "⌘" : "Strg+") + k);
    const toItems = (list) => list.map((it) => (it.sep ? it : it.sub ? { text: it.text, sub: typeof it.sub === "function" ? it.sub() : it.sub } :
      { text: it.text, action: it.action, key: kbdText(it.kbd), checked: it.checked, disabled: it.disabled }));
    const bar = h("div", { class: "menubar", role: "menubar" });
    for (const [titel, list] of menus) {
      const b = h("button", { class: "mtop", role: "menuitem", text: titel });
      const open = () => {
        const wasOpen = b.classList.contains("open");
        UI.closeMenus(); if (wasOpen) return;
        const r = b.getBoundingClientRect(); UI.popup(toItems(list), r.left, r.bottom); b.classList.add("open");
      };
      b.addEventListener("click", open);
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && document.querySelector(".mtop.open") && !b.classList.contains("open")) open(); });
      bar.append(b);
    }
    // Werkzeugleiste
    const tb = h("div", { class: "toolbar", role: "toolbar" });
    this.tbButtons = [];
    const add = (act) => {
      const b = h("button", { class: "tb", title: act.tip || act.text, "aria-label": act.tip || act.text }, h("img", { alt: "" }));
      b.addEventListener("click", () => { act.action(); this.syncChecks(); });
      this.tbButtons.push([act, b]); tb.append(b);
    };
    const sep = () => tb.append(h("span", { class: "tsep" }));
    [a.open, a.save, a.print].forEach(add); sep(); [a.newsim, a.copysim, a.editsim].forEach(add); sep(); [a.sb, a.tab].forEach(add); sep();
    [a.play, a.stop, a.pause].forEach(add); sep(); [a.pfeil, a.text].forEach(add); sep();
    this.stilActs = {};
    for (const [k, ic, tip] of [["fett", "bold", "fett"], ["kursiv", "italic", "kursiv"], ["unter", "underline", "unterstrichen"], ["hoch", "super", "hochgestellt"], ["tief", "sub", "tiefgestellt"]]) {
      const act = { key: k, text: tip, tip, icon: ic, on: false, checked: () => act.on, action: () => { act.on = !act.on; this.stil(k); } };
      this.stilActs[k] = act; add(act);
    }
    this.fontSize = UI.select(["8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "36", "48"], "12", () => this.fontGeaendert(), "Schriftgröße");
    this.fontSize.style.width = "62px";
    this.fontName = UI.select(D.FONTS, "Arial", () => this.fontGeaendert(), "Schriftart"); this.fontName.style.width = "160px";
    tb.append(this.fontSize, this.fontName);
    // Arbeitsblatt (Zeichenflaeche so gross wie der sichtbare Bereich, gezeichnet wird der gerade sichtbare Ausschnitt)
    this.canvas = h("canvas", { id: "sheet", "aria-label": "Arbeitsblatt", style: { position: "sticky", left: "0", top: "0" } });
    this.inner = h("div", { style: { position: "relative" } }, this.canvas);
    this.scroll = h("div", { id: "sheetScroll" }, this.inner);
    this.scroll.addEventListener("scroll", () => this.paint(), { passive: true });
    // Tabelle
    this.tableWrap = h("div", { id: "tableWrap", hidden: true });
    this.vt = h("div", { class: "vt", tabindex: "0", "aria-label": "Tabelle der Werte" });
    this.tableWrap.append(this.vt);
    this.vt.addEventListener("scroll", () => this.renderTable(), { passive: true });
    this.splitter = h("div", { class: "splitter", hidden: true, role: "separator", "aria-label": "Größe der Tabelle ändern" });
    this.splitter.addEventListener("pointerdown", (e) => {
      this.splitter.setPointerCapture(e.pointerId);
      const y0 = e.clientY, h0 = this.tableWrap.offsetHeight;
      const mv = (ev) => { this.tableWrap.style.height = Math.max(110, Math.min(this.left.offsetHeight - 160, h0 - (ev.clientY - y0))) + "px"; this.resize(); };
      const upp = () => { this.splitter.removeEventListener("pointermove", mv); this.splitter.removeEventListener("pointerup", upp); };
      this.splitter.addEventListener("pointermove", mv); this.splitter.addEventListener("pointerup", upp);
    });
    this.left = h("div", { class: "left" }, this.scroll, this.splitter, this.tableWrap);
    // Seitenleiste
    this.simBox = UI.select([], undefined, (v) => this.simGewaehlt(parseInt(v, 10)), "Zu bearbeitende Simulation auswählen");
    this.dreid = UI.check("3-dimensional", false, () => this.achsenUi());
    this.getrennt = UI.check("getrennte Schaubilder", false);
    this.xBox = UI.select([], undefined, null, "Variable für die Rechtsachse wählen");
    this.yLabel = h("span", { text: "y-Achse:" });
    this.yBox = UI.select([], undefined, null, "Variable für die y-Achse wählen");
    this.zLabel = h("span", { text: "z-Achse:" });
    this.yList = h("div", { class: "list", role: "listbox", "aria-multiselectable": "true", title: "Variablen für die Hochachse markieren" });
    const anz = UI.button("Anzeigen", () => this.anzeigen(), "Die gewählten Variablen werden angezeigt.");
    this.weiterBtn = UI.button("Weiter rechnen...", () => this.weiterRechnen());
    const panel = h("div", { class: "panel" },
      h("span", { text: "Name der Simulation:" }), this.simBox, this.dreid.el, this.getrennt.el, h("span", { text: "x-Achse:" }), this.xBox,
      this.yLabel, this.yBox, this.zLabel, this.yList, anz, this.weiterBtn);
    this.status = h("div", { class: "statusbar", role: "status" }, "Bereit");
    this.el.append(bar, tb, h("div", { class: "main" }, this.left, panel), this.status);
    this.textmodeCls();
    // Eingaben auf dem Blatt
    const cv = this.canvas;
    cv.addEventListener("pointerdown", (e) => this.down(e));
    cv.addEventListener("pointermove", (e) => this.move(e));
    cv.addEventListener("pointerup", (e) => this.up(e));
    cv.addEventListener("pointercancel", () => { this.drag = null; this.pan = null; });
    cv.addEventListener("click", (e) => {
      if (this.mode !== "text" || UI.isModal()) return;
      const [x, y] = this.cm(e); const [i] = D.hit(this.objs, x, y, 0.2);
      if (i !== null && this.objs[i].k === "text") this.startEdit(this.objs[i]); else this.startEdit(null, [x, y]);
    });
    UI.gesten(cv, { dbl: (e) => this.doppel(e), long: (e) => this.lang(e) });
    cv.addEventListener("wheel", (e) => { if (e.ctrlKey) { e.preventDefault(); this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });
    document.addEventListener("keydown", (e) => this.taste(e));
    document.addEventListener("paste", (e) => this.paste(e));
    new ResizeObserver(() => this.resize()).observe(this.scroll);
    window.addEventListener("beforeunload", () => this.autosave(true));
  }

  syncChecks() {
    for (const [act, b] of this.tbButtons) b.classList.toggle("checked", !!(act.checked && act.checked()));
  }
  applyTheme(key) {
    this.theme = key === "modern" ? "modern" : "klassisch";
    this.el.classList.toggle("modern", this.theme === "modern"); this.el.classList.toggle("klassisch", this.theme === "klassisch");
    for (const [act, b] of this.tbButtons) b.firstChild.src = IC.url(act.icon, THEME_ICON[this.theme]);
    UI.store.set("darstellung", this.theme);
    this.syncChecks(); this.paint();
  }
  setStatus(t, ms = 4000) { this.status.textContent = t; clearTimeout(this.stT); if (ms) this.stT = setTimeout(() => { this.status.textContent = "Bereit"; }, ms); }
  textmodeCls() { this.scroll.classList.toggle("textmode", this.mode === "text"); }

  // ================================================= Blatt: Groesse, Zoom, Zeichnen
  get s() { return PX_CM * this.zoom; }
  get objs() { return this.sheet.objekte; }
  groesse() {
    let [w, hh] = SEITE;
    for (const o of this.objs) { const b = D.bounds(o); w = Math.max(w, b[0] + b[2] + 1.0); hh = Math.max(hh, b[1] + b[3] + 1.0); }
    return [w, hh];
  }
  anpassen() {
    const [w, hh] = this.groesse();
    this.inner.style.width = Math.ceil(w * this.s) + "px"; this.inner.style.height = Math.ceil(hh * this.s) + "px";
    this.resize();
  }
  setZoom(z, auto = false) { this.zoom = Math.max(0.6, Math.min(4.0, z)); this.autoZoom = auto; this.anpassen(); }
  fit() { const w = this.scroll.clientWidth; this.setZoom(Math.max(1.0, Math.min(2.6, (w - 4) / (SEITE[0] * PX_CM))), true); }
  resize() {
    const vw = this.scroll.clientWidth, vh = this.scroll.clientHeight;
    if (!vw || !vh) return;
    if (this.autoZoom) {
      const z = Math.max(1.0, Math.min(2.6, (vw - 4) / (SEITE[0] * PX_CM)));
      if (Math.abs(z - this.zoom) > 1e-3) { this.zoom = z; const [w, hh] = this.groesse(); this.inner.style.width = Math.ceil(w * this.s) + "px"; this.inner.style.height = Math.ceil(hh * this.s) + "px"; }
    }
    const iw = Math.min(vw, this.inner.offsetWidth || vw), ih = Math.min(vh, this.inner.offsetHeight || vh);
    let dpr = window.devicePixelRatio || 1;
    while (dpr > 1 && iw * ih * dpr * dpr > 16e6) dpr -= 0.25;
    this.dpr = dpr;
    this.canvas.style.width = iw + "px"; this.canvas.style.height = ih + "px";
    this.canvas.width = Math.round(iw * dpr); this.canvas.height = Math.round(ih * dpr);
    this.paint(); this.renderTable();
  }
  paint() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = null; this.paintNow(); });
  }
  paintNow() {
    const c = this.canvas, ctx = c.getContext("2d"); if (!c.width) return;
    const sx = this.scroll.scrollLeft, sy = this.scroll.scrollTop;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, -sx * this.dpr, -sy * this.dpr);
    ctx.fillStyle = D.rgbStr(this.spec.fenster || [255, 255, 255]); ctx.fillRect(sx, sy, c.width / this.dpr, c.height / this.dpr);
    this.male(ctx, this.s, this.anim);
    if (this.sel !== null && this.sel < this.objs.length && this.anim === null) D.drawSelection(ctx, D.bounds(this.objs[this.sel]), this.s, this.theme === "modern" ? "#3b6fe0" : "#0050dc");
  }
  male(ctx, s, anim = null) {
    let nr = 0;
    for (const o of this.objs) {
      if (this.edit && o === this.edit.obj) continue;
      if (o.k === "chart" && anim !== null && nr === 0) {
        const [kb, marker] = this.animZustand(o, anim);
        D.draw(ctx, o, s, 0, 0, null, kb);
        for (const [x, y, img, farbe] of marker) {
          if (img) { const w = img.naturalWidth / PX_CM * 0.75, hh = img.naturalHeight / PX_CM * 0.75; ctx.drawImage(img, (x - w / 2) * s, (y - hh / 2) * s, w * s, hh * s); }
          else { ctx.fillStyle = D.rgbStr(farbe); ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(x * s, y * s, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
        }
      } else D.draw(ctx, o, s);
      if (o.k === "chart") nr++;
    }
  }

  // ================================================= Maus und Finger auf dem Blatt
  cm(e) { const r = this.canvas.getBoundingClientRect(); return [(e.clientX - r.left + this.scroll.scrollLeft) / this.s, (e.clientY - r.top + this.scroll.scrollTop) / this.s]; }
  tol(e) { return e.pointerType === "touch" ? 0.35 : 0.2; }
  down(e) {
    if (e.button === 2) return;
    this.commitEdit();
    const [x, y] = this.cm(e);
    const [i] = D.hit(this.objs, x, y, this.tol(e));
    if (this.mode === "text") { e.preventDefault(); return; }   // Text wird beim "click" begonnen (iPad: Tastatur nur direkt im Tipp)
    this.sel = i;
    if (i !== null) {
      const o = this.objs[i], b = D.bounds(o), gt = e.pointerType === "touch" ? 0.45 : 0.25;
      const griff = Math.abs(x - b[0] - b[2]) < gt && Math.abs(y - b[1] - b[3]) < gt && (o.k === "chart" || o.k === "bild");
      this.drag = { i, x, y, g: o.g.slice(), resize: griff, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
    } else this.pan = { x: e.clientX, y: e.clientY, sl: this.scroll.scrollLeft, st: this.scroll.scrollTop };
    this.auswahlGeaendert(); this.paint();
  }
  move(e) {
    if (this.pan) { this.scroll.scrollLeft = this.pan.sl - (e.clientX - this.pan.x); this.scroll.scrollTop = this.pan.st - (e.clientY - this.pan.y); return; }
    if (!this.drag) return;
    const [x, y] = this.cm(e), d = this.drag, o = this.objs[d.i];
    const dx = x - d.x, dy = y - d.y;
    if (!d.moved) { if (Math.hypot(dx, dy) < (e.pointerType === "touch" ? 0.2 : 0.08)) return; d.moved = true; this.merke(); }
    if (d.resize) { o.g[2] = Math.max(1.0, d.g[2] + dx); o.g[3] = Math.max(1.0, d.g[3] + dy); }
    else { o.g[0] = Math.max(0.0, d.g[0] + dx); o.g[1] = Math.max(0.0, d.g[1] + dy); }
    this.paint();
  }
  up(e) {
    this.pan = null;
    const d = this.drag; this.drag = null;
    if (d && d.moved) { this.objektBewegt(d.i, d.resize); this.anpassen(); }
  }
  doppel(e) {
    if (this.mode === "text") return;
    const [x, y] = this.cm(e); const [i, teil] = D.hit(this.objs, x, y, this.tol(e));
    if (i !== null) this.objektDialog(i, teil);
  }
  lang(e) {
    if (this.drag && this.drag.moved) return;
    this.drag = null; this.pan = null;
    const [x, y] = this.cm(e); const [i, teil] = D.hit(this.objs, x, y, this.tol(e));
    this.sel = i; this.paint(); this.kontext(i, teil, e.clientX, e.clientY);
  }
  taste(e) {
    if (UI.isModal()) return;
    const t = e.target; const inField = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "F1") { e.preventDefault(); DL.hilfe(); return; }
    if (e.key === "F2") { e.preventDefault(); this.simBearbeiten(); return; }
    if (inField) return;
    if (mod) {
      const k = e.key.toLowerCase();
      const map = { n: "neu", o: "open", s: "save", p: "print", z: "undo", x: "cut", c: "copy", "+": "zin", "=": "zin", "-": "zout", "0": "zfit" };
      if (map[k]) { e.preventDefault(); this.acts[map[k]].action(); }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && this.sel !== null) { e.preventDefault(); this.loeschen(); }
    else if (e.key === "Escape") { this.sel = null; this.paint(); }
  }

  // ================================================= Text auf dem Blatt
  startEdit(obj, pos = null) {
    this.commitEdit();
    const inp = h("input", { id: "textEdit", autocomplete: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Text" });
    const font = obj ? obj.font : this.fontName.value, size = obj ? obj.size : parseFloat(this.fontSize.value);
    inp.style.font = D.cssFont(font, Math.max(8, Math.round(size / 72 * 2.54 * this.s)));
    const [x, y] = obj ? [obj.g[0], obj.g[1]] : pos;
    inp.value = obj ? MW.textOf(obj) : "";
    inp.style.left = (x * this.s - 2) + "px"; inp.style.top = (y * this.s - 2) + "px";
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); this.commitEdit(); } else if (e.key === "Escape") { inp.value = obj ? MW.textOf(obj) : ""; this.commitEdit(); } });
    inp.addEventListener("blur", () => setTimeout(() => { if (this.edit && this.edit.inp === inp) this.commitEdit(); }, 120));
    this.inner.append(inp);
    this.edit = { inp, obj, pos };
    inp.focus({ preventScroll: true });   // sofort, damit das iPad die Tastatur einblendet
    this.paint();
  }
  commitEdit() {
    if (!this.edit) return;
    const { inp, obj, pos } = this.edit; this.edit = null;
    const text = inp.value.trim(); inp.remove();
    this.textFertig(obj, pos, text);
    this.paint();
  }
  textFertig(obj, pos, text) {
    if (!obj) {
      if (!text) return;
      this.merke();
      const o = MW.mkText(text, pos[0], pos[1], parseFloat(this.fontSize.value) || 12, this.fontName.value, D.measure, [0, 0, 0], true);
      const st = {}; for (const [k, a] of Object.entries(this.stilActs)) if (a.on) st[k] = true;
      if (Object.keys(st).length) o.stil_claude = st;
      this.objs.push(o); this.sel = this.objs.length - 1;
    } else {
      if (text === MW.textOf(obj)) return;
      this.merke();
      if (!text) { this.sheet.objekte = this.objs.filter((x) => x !== obj); this.sel = null; }
      else MW.setText(obj, text, D.measure);
    }
    this.anpassen();
  }
  stil(key) {
    const sa = this.stilActs;
    if (key === "hoch" && sa.hoch.on) sa.tief.on = false;
    if (key === "tief" && sa.tief.on) sa.hoch.on = false;
    const o = this.selObj(["text"]);
    if (o) { this.merke(); const st = {}; for (const [k, a] of Object.entries(sa)) if (a.on) st[k] = true; o.stil_claude = st; this.paint(); }
    this.syncChecks();
  }
  fontGeaendert() {
    const o = this.selObj(["text"]); if (!o) return;
    const size = parseFloat(this.fontSize.value); if (!(size > 0)) return;
    this.merke(); o.font = this.fontName.value; o.size = size; MW.setText(o, MW.textOf(o), D.measure); this.paint();
  }
  setMode(m) {
    this.commitEdit(); this.mode = m; this.textmodeCls(); this.syncChecks();
    if (m === "text") this.setStatus("Text schreiben: auf das Arbeitsblatt tippen.", 5000);
  }
  selObj(arten) {
    const i = this.sel; if (i === null || i >= this.objs.length) return null;
    const o = this.objs[i]; return !arten || arten.includes(o.k) ? o : null;
  }
  auswahlGeaendert() {
    const o = this.selObj(["text"]);
    if (o) {
      const st = D.textStyle(o); for (const [k, a] of Object.entries(this.stilActs)) a.on = !!st[k];
      const sz = String(Math.round(o.size)); if (![...this.fontSize.options].some((x) => x.value === sz)) this.fontSize.append(h("option", { value: sz }, sz));
      this.fontSize.value = sz;
      if (![...this.fontName.options].some((x) => x.value === o.font)) this.fontName.append(h("option", { value: o.font }, o.font));
      this.fontName.value = o.font;
      this.syncChecks();
    }
  }

  // ================================================= Dokument
  get sim() { return this.sims.length ? this.sims[this.aktiv] : null; }
  merke() {
    this.undo.push(clone([this.sheet.objekte, this.sims, this.aktiv, this.spec, this.makros, this.kurvenInfo]));
    if (this.undo.length > 25) this.undo.splice(0, this.undo.length - 25);
    this.dirty = true; this.titel(); this.autosaveBald();
  }
  rueckgaengig() {
    if (!this.undo.length) { this.setStatus("Nichts rückgängig zu machen.", 3000); return; }
    [this.sheet.objekte, this.sims, this.aktiv, this.spec, this.makros, this.kurvenInfo] = this.undo.pop();
    this.runner = null; this.sel = null; this.refresh();
  }
  async frageSpeichern() {
    if (!this.dirty) return true;
    const r = await UI.ask("Sollen die Änderungen gespeichert werden?", ["Ja", "Nein", "Abbrechen"]);
    if (r === 2) return false;
    if (r === 0) return this.speichern();
    return true;
  }
  laden({ sheet, sims, aktiv = 0, makros = {}, spec = null, name }) {
    this.animStop();
    MW.exponenten(sheet.objekte);
    this.sheet = sheet; this.sims = sims; this.makros = makros || {};
    this.spec = spec || this.specAusBlatt(sheet);
    this.aktiv = Math.max(0, Math.min(aktiv, sims.length - 1));
    this.name = name; this.beispielTitel = null; this.undo = []; this.runner = null; this.dirty = false; this.sel = null;
    this.kurvenInfo = this.kurvenAusFlags();
    const ch = this.chart();
    if (ch && this.kurvenInfo.length !== ch.kids.filter((k) => k.k === "kurve").length) this.kurvenInfo = [];
    this.refresh();
  }
  async neu() {
    if (!(await this.frageSpeichern())) return;
    this.laden({ sheet: MW.newSheet(), sims: [], spec: specNeu(), name: null });
  }
  async oeffnen() {
    if (!(await this.frageSpeichern())) return;
    // iPad: kein Dateifilter, sonst graut die Dateien-App .prg-Dateien aus (unbekannter Dateityp)
    const f = await UI.pickFile(UI.IOS ? "" : ".prg,.PRG,.json,.zip,application/json,application/zip,application/octet-stream");
    if (f) await this.openBytes(await UI.readFile(f), f.name);
  }
  async openBytes(data, name, beispiel = null) {
    try {
      if (data[0] === 0x50 && data[1] === 0x4B) {
        const files = await MW.unzip(data);
        const f = files.find((x) => /\.(prg|json)$/i.test(x.name));
        if (!f) throw new Error("In der ZIP-Datei ist keine .prg- oder .json-Datei.");
        return this.openBytes(f.data, f.name.split("/").pop(), beispiel);
      }
      if (MW.cpDecode(data.slice(0, 9)) === "MOEBIUS30") {
        const d = MW.parse(data);
        this.laden({ sheet: MW.parseSheet(d._prefix), sims: d.simulationen, aktiv: d.aktive_simulation, name });
        this.einheitenAusTiteln();
      } else {
        const j = MW.fromJson(JSON.parse(new TextDecoder().decode(data)));
        if (!j.sheet || !j.simulationen) throw new Error("Unbekanntes Dateiformat.");
        const spec = Object.assign(specNeu(), j.spec || {});
        for (const k of ["xa", "ya", "za"]) spec[k] = Object.assign(MW.achseNeu(), spec[k] || {});
        if (!j.spec || j.spec.achsentitel === undefined) spec.achsentitel = this.achsentitelStandard(j.sheet);
        this.laden({ sheet: j.sheet, sims: j.simulationen, aktiv: j.aktive_simulation || 0, makros: j.makros, spec, name });
      }
      if (beispiel) { this.name = null; this.beispielTitel = beispiel; this.titel(); this.setStatus(`Beispiel „${beispiel}“ geöffnet`); }
      else { this.merkeRecent(name); this.setStatus(`${name} geöffnet`); }
      this.autosave(true);
      return true;
    } catch (e) {
      await UI.msg("Die Datei konnte nicht gelesen werden:\n" + (e && e.message ? e.message : e));
      return false;
    }
  }
  async beispiel(url, titel) {
    if (!(await this.frageSpeichern())) return;
    try {
      const r = await fetch(url); if (!r.ok) throw new Error(r.status);
      await this.openBytes(new Uint8Array(await r.arrayBuffer()), url.split("/").pop(), titel);
    } catch (e) { await UI.msg("Das Beispiel konnte nicht geladen werden."); }
  }
  specAusBlatt(sheet) {
    const spec = specNeu();
    const ch = sheet.objekte.find((o) => o.k === "chart");
    if (ch) {
      Object.assign(spec, { pc: ch.pc.slice(), farbe: MW.rgb(ch.farbe), legende: !!ch.b2, timer: Math.max(1, ch.timer) });
      const achsen = ch.idx.filter((i) => i < ch.kids.length && ch.kids[i].k === "achse").map((i) => ch.kids[i]);
      ["xa", "ya", "za"].forEach((k, j) => { if (achsen[j]) { const ag = MW.achseGet(achsen[j].tr); if (ag.bis > ag.von && ag.abstand > 0) spec[k] = ag; } });
      this.dreidGeladen = !!ch.dreid;
    } else this.dreidGeladen = false;
    spec.achsentitel = this.achsentitelStandard(sheet);
    return spec;
  }
  // Automatische Achsentitel? Ja - ausser der Autor hat die Achsen schon mit freien Texten beschriftet
  // (Texte an der Spitze der y-Achse oder am Ende der x-Achse, wie in den Moebius-Beispielen "t", "Zeit", "Hasen").
  achsentitelStandard(sheet) {
    const ch = sheet.objekte.find((o) => o.k === "chart"); if (!ch) return true;
    const istZahl = (t) => /^[-+]?[\d.,\s·]+$/.test(t);
    if (ch.kids.some((a) => a.k === "achse" && a.kids.some((t) => t.k === "text" && !istZahl(MW.textOf(t).trim())))) return true;
    const [cx, cy, cw, chh] = ch.g; const pr = MW.chartPlotRect(ch);
    const links = cx + pr[0], unten = cy + pr[1] + pr[3];
    const zoneX = [links + pr[2] * 0.6, unten - 1.5, cx + cw + 2.0, cy + chh + 1.5];
    const zoneY = [cx - 2.0, cy - 1.5, links + pr[2] * 0.4, cy + pr[1] + 1.5];
    const drin = (z, x, y) => x >= z[0] && x <= z[2] && y >= z[1] && y <= z[3];
    return !sheet.objekte.some((o) => {
      if (o.k !== "text" || !MW.textOf(o).trim()) return false;
      const mx = o.g[0] + o.g[2] / 2, my = o.g[1] + o.g[3] / 2;
      return drin(zoneX, mx, my) || drin(zoneY, mx, my);
    });
  }
  basisName() { return (this.name || this.beispielTitel || "Modell").replace(/\.(prg|json|zip)$/i, "").replace(/[^\wäöüÄÖÜß .-]+/g, "_").trim() || "Modell"; }
  docJson() {
    this.fixSimNamen();
    return MW.toJson({ format: "modellwerk-2", sheet: this.sheet, simulationen: this.sims, aktive_simulation: this.aktiv, makros: this.makros, spec: this.spec });
  }
  async speichern() {
    const data = JSON.stringify(this.docJson());
    const ok = await UI.save(this.basisName() + ".json", data);
    if (ok) { this.dirty = false; this.titel(); this.setStatus("Gespeichert", 3000); }
    return ok;
  }
  prgBytes() {
    this.fixSimNamen();
    const sims = this.sims.length ? this.sims.map((s) => Object.assign({}, s, { programm: MW.expandMakros(s.programm, this.makros) })) : [MW.newSimulation("Simulation")];
    return MW.dump({ _prefix: MW.dumpSheet(this.sheet), simulationen: sims, aktive_simulation: this.aktiv });
  }
  async exportPrg() {
    const zuviel = this.sims.some((s) => s.wiederhole > MW.MAX_ORIGINAL || s.variablen.some((v) => v.werte.length > MW.MAX_ORIGINAL));
    if (zuviel) await UI.msg(`Hinweis: Diese Datei enthält mehr als ${MW.MAX_ORIGINAL} Durchläufe.\nModellwerk kann sie wieder öffnen, das Original-Moebius vermutlich nicht.`);
    let bytes;
    try { bytes = this.prgBytes(); } catch (e) { await UI.msg("Speichern fehlgeschlagen:\n" + e.message); return; }
    const n = this.basisName();
    // als normale Webseite direkt als .prg; in claude.ai sind .prg-Downloads nicht erlaubt, dort in einer .zip
    if (!UI.imArtifact()) { if (await UI.save(n + ".prg", bytes)) UI.toast("Gespeichert."); return; }
    const ok = await UI.save(n + ".zip", MW.zip([{ name: n + ".prg", data: bytes }]));
    if (ok) UI.toast("Gespeichert. In der Dateien-App auf die .zip-Datei tippen, dann liegt die .prg-Datei daneben.", 6000);
  }
  merkeRecent(name) {
    try {
      let r = JSON.parse(UI.store.get("zuletzt") || "[]").filter((x) => x !== name);
      r = [name, ...r].slice(0, 6); UI.store.set("zuletzt", JSON.stringify(r));
    } catch (e) { /* egal */ }
  }
  recentItems() {
    let r = []; try { r = JSON.parse(UI.store.get("zuletzt") || "[]"); } catch (e) { /* egal */ }
    if (!r.length) return [{ text: "(keine)", disabled: true, action: () => {} }];
    return r.map((n) => ({ text: n, action: () => UI.msg(`„${n}“ bitte über Datei → Öffnen erneut auswählen.\nDer Browser darf Dateien nicht selbstständig wieder öffnen.`) }));
  }
  titel() {
    const n = this.name || (this.beispielTitel ? "Beispiel: " + this.beispielTitel : "Unbenannt");
    document.title = `${n}${this.dirty ? " *" : ""} - ${APP}`;
  }
  // Zwischenspeicher im Browser, damit nach dem Schliessen nichts verloren ist
  autosaveBald() { clearTimeout(this.asT); this.asT = setTimeout(() => this.autosave(), 1500); }
  autosave(sofort = false) {
    try {
      const s = JSON.stringify({ v: 2, doc: this.docJson(), name: this.name, beispielTitel: this.beispielTitel || null, dirty: this.dirty });
      if (s.length < 4.5e6) UI.store.set("dokument", s); else UI.store.del("dokument");
    } catch (e) { /* Speicher voll: ignorieren */ }
  }
  async start() {
    const s = UI.store.get("dokument");
    if (s) {
      try {
        const j = JSON.parse(s); const d = MW.fromJson(j.doc);
        // Beispiel aus einer aelteren Version (ohne Achsentitel/Einheiten): stattdessen das aktuelle Beispiel laden
        const beispielSims = new Set(["Mit Luftwiderstand", "Ohne Luftwiderstand", "Zinseszins", "Abkühlung"]);
        if (!j.v && j.beispielTitel && d.simulationen.every((x) => beispielSims.has(x.name))) throw new Error("altes Beispiel");
        const spec = Object.assign(specNeu(), d.spec || {});
        for (const k of ["xa", "ya", "za"]) spec[k] = Object.assign(MW.achseNeu(), spec[k] || {});
        if (!d.spec || d.spec.achsentitel === undefined) spec.achsentitel = this.achsentitelStandard(d.sheet);
        this.laden({ sheet: d.sheet, sims: d.simulationen, aktiv: d.aktive_simulation, makros: d.makros, spec, name: j.name });
        this.beispielTitel = j.beispielTitel; this.dirty = !!j.dirty; this.titel();
        return;
      } catch (e) { UI.store.del("dokument"); }
    }
    this.laden({ sheet: MW.newSheet(), sims: [], spec: specNeu(), name: null });
    try {
      const r = await fetch(BEISPIELE[0][1]);
      if (r.ok) await this.openBytes(new Uint8Array(await r.arrayBuffer()), BEISPIELE[0][1].split("/").pop(), BEISPIELE[0][0]);
    } catch (e) { /* ohne Beispiel starten */ }
  }

  refresh() {
    this.simBox.replaceChildren(...this.sims.map((s, i) => h("option", { value: i }, s.name)));
    if (this.sims.length) this.simBox.value = String(this.aktiv);
    if (this.dreidGeladen !== null) { this.dreid.set(this.dreidGeladen); this.dreidGeladen = null; }
    this.listen(); this.tabelle(); this.titel(); this.anpassen(); this.syncChecks();
  }
  listen() {
    const s = this.sim; const namen = s ? s.variablen.map((v) => v.name) : [];
    const opts = () => namen.map((n) => h("option", { value: n }, n));
    this.xBox.replaceChildren(...opts()); this.yBox.replaceChildren(...opts());
    this.yList.replaceChildren(...namen.map((n) => {
      const li = h("div", { class: "li", role: "option", "aria-selected": "false", text: n });
      li.addEventListener("click", () => { li.classList.toggle("on"); li.setAttribute("aria-selected", li.classList.contains("on")); });
      return li;
    }));
    if (s) {
      const finde = (n) => namen.findIndex((x) => x.toUpperCase() === n.toUpperCase());
      let ix = finde(s.x_achse); if (ix < 0) ix = Math.max(0, namen.findIndex((x) => ["ZEIT", "T"].includes(x.toUpperCase())));
      if (namen.length) this.xBox.value = namen[ix];
      const iy = finde(s.y_achse); if (iy >= 0) this.yBox.value = namen[iy];
      s.variablen.forEach((v, i) => { if (v.flag_a) { this.yList.children[i].classList.add("on"); this.yList.children[i].setAttribute("aria-selected", "true"); } });
    }
    this.achsenUi(); this.weiterBtn.disabled = !s;
  }
  achsenUi() {
    const d3 = this.dreid.get();
    this.yBox.hidden = !d3; this.zLabel.hidden = !d3; this.getrennt.inp.disabled = d3;
  }
  gewaehlt() { return Array.from(this.yList.children).filter((x) => x.classList.contains("on")).map((x) => x.textContent); }
  fixSimNamen() { const m = this.sims.length > 1; for (const s of this.sims) for (const v of s.variablen) v.simulation = m ? s.name : ""; }

  // ================================================= Tabelle (nur sichtbare Zeilen werden erzeugt)
  tabelle() {
    const s = this.sim;
    if (!s) { this.tvars = []; this.renderTable(true); return; }
    const x = s.x_achse.toUpperCase();
    this.tvars = s.variablen.filter((v) => v.werte.length).sort((a, b) => (a.name.toUpperCase() === x ? 0 : 1) - (b.name.toUpperCase() === x ? 0 : 1));
    this.renderTable(true);
  }
  renderTable(neu = false) {
    if (this.tableWrap.hidden) return;
    const vars = this.tvars || [], RH = 22, rows = Math.max(0, ...vars.map((v) => v.werte.length));
    const kopf = (v) => v.name + (v.einheit ? " in " + v.einheit : "");
    const widths = vars.map((v) => Math.max(72, Math.min(210, v._attr4[2] + 34), Math.min(260, 18 + 7.2 * kopf(v).length)));
    const total = 52 + widths.reduce((a, b) => a + b, 0);
    if (neu || !this.vtBody) {
      this.vt.replaceChildren();
      const head = h("div", { class: "head", style: { width: total + "px" } }, h("div", { class: "cell rowh", style: { width: "52px" } }, ""),
        vars.map((v, i) => h("div", { class: "cell", style: { width: widths[i] + "px" }, title: kopf(v) }, kopf(v))));
      this.vtBody = h("div", { style: { position: "relative", height: rows * RH + "px", width: total + "px" } });
      this.vt.append(head, this.vtBody);
      if (!vars.length) this.vtBody.append(h("div", { style: { padding: "8px" }, class: "hint", text: "Noch keine Werte. Erst eine Simulation rechnen." }));
    }
    const top = this.vt.scrollTop, hgt = this.vt.clientHeight;
    const a = Math.max(0, Math.floor(top / RH) - 5), b = Math.min(rows, Math.ceil((top + hgt) / RH) + 5);
    const frag = [];
    for (let r = a; r < b; r++) {
      frag.push(h("div", { class: "row", style: { top: r * RH + "px" } }, h("div", { class: "cell rowh", style: { width: "52px" } }, String(r + 1)),
        vars.map((v, i) => h("div", { class: "cell", style: { width: widths[i] + "px" } }, r < v.werte.length ? MW.tabellenText(v.werte[r], v._attr4[1]) : ""))));
    }
    if (vars.length) this.vtBody.replaceChildren(...frag);
  }
  toggleTabelle() {
    const zeigen = this.tableWrap.hidden;
    this.tableWrap.hidden = !zeigen; this.splitter.hidden = !zeigen || this.scroll.hidden;
    if (!zeigen && this.scroll.hidden) { this.scroll.hidden = false; }
    if (zeigen) this.tabelle();
    this.syncChecks(); this.resize();
  }
  toggleSchaubild() {
    const zeigen = this.scroll.hidden;
    this.scroll.hidden = !zeigen;
    if (!zeigen && this.tableWrap.hidden) { this.tableWrap.hidden = false; this.tabelle(); }
    this.splitter.hidden = this.scroll.hidden || this.tableWrap.hidden;
    this.tableWrap.style.flex = this.scroll.hidden ? "1" : ""; this.syncChecks(); this.resize();
  }

  // ================================================= Simulationen
  simGewaehlt(i) { if (i >= 0 && i < this.sims.length) { this.aktiv = i; this.runner = null; this.listen(); this.tabelle(); } }
  simNeu() { this.simDialog(MW.newSimulation(`Simulation ${this.sims.length + 1}`), true); }
  simKopie() { if (!this.sim) return this.simNeu(); const s = clone(this.sim); s.name += " (Kopie)"; this.simDialog(s, true); }
  simBearbeiten() { if (!this.sim) return this.simNeu(); this.simDialog(this.sim, false); }
  async simLoeschen() {
    if (!this.sim) return;
    if ((await UI.ask(`Simulation „${this.sim.name}“ löschen?`)) !== 0) return;
    this.merke(); this.sims.splice(this.aktiv, 1); this.aktiv = Math.max(0, this.aktiv - 1); this.runner = null;
    this.fixSimNamen(); this.refresh(); if (this.sims.length) this.rebuild();
  }
  async simDialog(s, neu) {
    const r = await DL.algo(s, this.makros, this.sims.length + (neu ? 1 : 0) > 1);
    if (!r) return;
    this.merke(); this.makros = r.makros;
    if (neu) { this.sims.push(r.sim); this.aktiv = this.sims.length - 1; } else this.sims[this.aktiv] = r.sim;
    this.fixSimNamen();
    const ok = await this.rechnen(true);
    this.refresh();
    if (ok && this.sofort) {
      const sim = this.sim;
      if (!sim.variablen.some((v) => v.flag_a)) {
        const xn = this.xBox.value;
        const erst = sim.variablen.find((v) => v.name !== xn && new Set(v.werte.slice(0, 60)).size > 1);
        if (erst) this.yList.children[sim.variablen.indexOf(erst)].classList.add("on");
      }
      this.anzeigen(false);
    }
  }
  async rechnen(neu = true, schritte = null) {
    const s = this.sim; if (!s) return false;
    try {
      if (neu || !this.runner || this.runnerSim !== s) { this.runner = new MW.Runner(Object.assign({}, s, { programm: MW.expandMakros(s.programm, this.makros) })); this.runner.sim = s; this.runnerSim = s; }
      this.runner.step(schritte || s.wiederhole);
    } catch (e) {
      if (e.rechenfehler) await UI.msg("Rechenfehler: " + e.message);
      else { this.runner = null; await UI.msg("Fehler im Programm:\n" + e.message); return false; }
    }
    this.setStatus(`${s.variablen.length ? s.variablen[0].werte.length : 0} Werte berechnet`);
    return true;
  }
  async weiterRechnen() {
    const s = this.sim; if (!s) return;
    const vorhanden = Math.max(0, ...s.variablen.map((v) => v.werte.length));
    const frei = MW.MAX_WERTE - vorhanden;
    if (frei <= 0) { await UI.msg(`Es sind schon ${MW.MAX_WERTE} Werte berechnet (Maximum).`); return; }
    const n = await UI.inputInt("Weiter rechnen", "Anzahl weiterer Durchläufe:", Math.min(s.wiederhole, frei), 1, frei);
    if (!n) return;
    this.merke();
    if (!this.runner || this.runnerSim !== s) {
      const alt = s.variablen.map((v) => v.werte.slice());
      try { this.runner = new MW.Runner(Object.assign({}, s, { programm: MW.expandMakros(s.programm, this.makros) })); this.runner.sim = s; this.runnerSim = s; this.runner.step(vorhanden); }
      catch (e) { s.variablen.forEach((v, i) => { v.werte = alt[i]; }); this.runner = null; await UI.msg("Fehler im Programm:\n" + e.message); return; }
    }
    await this.rechnen(false, n); this.tabelle(); this.rebuild();
  }

  // ================================================= Schaubild
  chart() { return this.objs.find((o) => o.k === "chart") || null; }
  kurvenAusFlags() {
    const s = this.sim; if (!s) return [];
    const x = s.x_achse.toUpperCase(); const out = [];
    this.sims.forEach((t, si) => { if (t === s || t.x_achse.toUpperCase() === x) for (const v of t.variablen) if (v.flag_a) out.push([si, v.name]); });
    return out;
  }
  async anzeigen(merken = true) {
    const s = this.sim;
    if (!s) { await UI.msg("Es gibt noch keine Simulation.\nMenü Einfügen → Neue Simulation."); return; }
    const gew = new Set(this.gewaehlt());
    if (!gew.size) { await UI.msg("Bitte mindestens eine Größe für die Hochachse markieren."); return; }
    if (!s.variablen.some((v) => v.werte.length) && !(await this.rechnen(true))) return;
    if (merken) this.merke();
    s.x_achse = this.xBox.value; if (this.dreid.get()) s.y_achse = this.yBox.value;
    for (const v of s.variablen) { v.flag_a = gew.has(v.name) ? 1 : 0; v.flag_b = v.flag_a || v.name === s.x_achse ? 1 : v.flag_b; }
    this.rebuild(); this.tabelle();
  }
  rebuild() {
    const s = this.sim; if (!s) return;
    const info = this.kurvenAusFlags(), d3 = this.dreid.get(), kurven = [];
    info.forEach(([si, name], nr) => {
      const t = this.sims[si]; const v = t.variablen.find((w) => w.name === name); MW.kurveInit(v, nr);
      const xv = t.variablen.find((w) => w.name.toUpperCase() === t.x_achse.toUpperCase());
      const yv = t.variablen.find((w) => w.name.toUpperCase() === t.y_achse.toUpperCase());
      if (!xv || !v.werte.length) return;
      const ku = { name: name + (this.sims.length > 1 ? ` [${t.name}]` : ""), x: xv.werte, y: v.werte, k: MW.kurveGet(v), info: [si, name] };
      if (d3) { if (!yv) return; ku.y = yv.werte; ku.z = v.werte; }
      kurven.push(ku);
    });
    const sp = this.spec;
    const mm = (arr) => { let lo = Infinity, hi = -Infinity; for (const a of arr) for (const x of a) if (isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; } return lo <= hi ? [lo, hi] : null; };
    const skala = (key, arrs) => { const a = sp[key]; const r = mm(arrs); if (this.autoSkal && a.auto && r) [a.von, a.bis, a.abstand] = MW.autoSkala(r[0], r[1]); return a; };
    const charts = [];
    const opt = { pc: sp.pc, farbe: sp.farbe, legende: sp.legende, timer: sp.timer, nach: sp.nach, norm: sp.norm };
    const mitTitel = sp.achsentitel !== false;
    const xTitel = this.achsenTitel([...new Set(kurven.map((k) => k.info[0]))].map((si) => [si, this.sims[si].x_achse]));
    const yTitel = (gr) => this.achsenTitel(gr.map((k) => k.info));
    if (d3) {
      const xa = skala("xa", kurven.map((k) => k.x)), ya = skala("ya", kurven.map((k) => k.y)), za = skala("za", kurven.map((k) => k.z));
      const o = Object.assign({}, opt, { titel: mitTitel ? { x: xTitel, y: this.achsenTitel([...new Set(kurven.map((k) => k.info[0]))].map((si) => [si, this.sims[si].y_achse])), z: yTitel(kurven) } : null });
      charts.push(MW.buildChart3d(kurven, xa, ya, za, o, D.measure));
    } else {
      const gruppen = this.getrennt.get() && kurven.length > 1 ? kurven.map((k) => [k]) : [kurven];
      gruppen.forEach((gr, gi) => {
        const xa = skala("xa", kurven.map((k) => k.x));
        const ya = gruppen.length > 1 ? Object.assign({}, sp.ya) : sp.ya;
        const r = mm(gr.map((k) => k.y));
        if (this.autoSkal && ya.auto && r) [ya.von, ya.bis, ya.abstand] = MW.autoSkala(r[0], r[1]);
        const xa2 = Object.assign({}, xa), ya2 = Object.assign({}, ya);
        if (xa.auto && this.autoSkal) { xa2.lage = ya2.von; xa.lage = ya2.von; }
        if (ya.auto && this.autoSkal) { ya2.lage = xa2.von; ya.lage = xa2.von; }
        const o = Object.assign({}, opt, { titel: mitTitel ? { x: xTitel, y: yTitel(gr) } : null });
        if (gruppen.length > 1) { const hh = sp.pc[3] / gruppen.length; o.pc = [sp.pc[0], sp.pc[1] + gi * hh, sp.pc[2], hh - 2]; }
        charts.push(MW.buildChart(gr, xa2, ya2, o, D.measure));
      });
    }
    for (const c of charts) c.pc = c.pc.map((x) => Math.round(x));
    const rest = this.objs.filter((o) => o.k !== "chart" && o.k !== "legende");
    const leg = sp.legende ? MW.buildLegende(kurven, D.measure) : [];
    this.sheet.objekte = charts.concat(rest, leg);
    this.kurvenInfo = charts.length === 1 ? kurven.map((k) => k.info) : [];
    this.sel = null; this.anpassen(); this.dirty = true; this.titel(); this.autosaveBald();
  }
  // Achsentitel aus Namen und Einheiten, z. B. "t in s" oder "v, w in m/s" oder "s in m, v in m/s"
  achsenTitel(paare) {
    const namen = [], einheiten = new Map();
    for (const [si, n] of paare) {
      const t = this.sims[si]; if (!t || !n) continue;
      const v = t.variablen.find((w) => w.name.toUpperCase() === String(n).toUpperCase());
      const name = v ? v.name : String(n), key = name.toUpperCase();
      if (!einheiten.has(key)) { namen.push(name); einheiten.set(key, ""); }
      const e = v && v.einheit ? String(v.einheit).trim() : "";
      if (e && !einheiten.get(key)) einheiten.set(key, e);
    }
    if (!namen.length) return "";
    const ein = namen.map((n) => einheiten.get(n.toUpperCase()));
    if (ein[0] && ein.every((e) => e === ein[0])) return namen.join(", ") + " in " + ein[0];
    return namen.map((n, i) => (ein[i] ? `${n} in ${ein[i]}` : n)).join(", ");
  }
  // .prg kennt keine Einheiten: aus den Achsentiteln eines exportierten Schaubilds zurueckholen
  einheitenAusTiteln() {
    const ch = this.chart(); if (!ch) return;
    for (const a of ch.kids) {
      if (a.k !== "achse") continue;
      for (const t of a.kids) {
        if (t.k !== "text") continue;
        const titel = MW.textOf(t).trim();
        if (!titel || /^[-+]?[\d.,\s·]+$/.test(titel)) continue;
        const teile = titel.split(/,\s*/).map((x) => { const m = /^(.+?) in (.+)$/.exec(x.trim()); return m ? [m[1].trim(), m[2].trim()] : [x.trim(), ""]; });
        const gemeinsam = teile.length > 1 && teile.slice(0, -1).every((x) => !x[1]) ? teile[teile.length - 1][1] : "";
        for (const [n, e0] of teile) {
          const e = e0 || gemeinsam; if (!n || !e) continue;
          for (const s of this.sims) for (const v of s.variablen) if (v.name.toUpperCase() === n.toUpperCase() && !v.einheit) v.einheit = e;
        }
      }
    }
  }
  objektBewegt(i, resize) {
    const o = this.objs[i];
    if (o.k === "chart") {
      const g = o.g; this.spec.pc = [g[0] / 16 * 100, g[1] / 12 * 100, g[2] / 16 * 100, g[3] / 12 * 100].map((x) => Math.max(0, Math.round(x))); o.pc = this.spec.pc.slice();
      if (resize) { if (this.sim && this.kurvenAusFlags().length) this.rebuild(); else this.setStatus("Größe wird beim nächsten „Anzeigen“ übernommen."); }
    }
    this.autosaveBald();
  }
  objektDialog(i, teil) {
    const o = this.objs[i];
    if (o.k === "chart") {
      if (teil.startsWith("kurve:")) this.kurveDialog(o, parseInt(teil.slice(6), 10));
      else if (teil.startsWith("achse:")) this.achseDialog(o, parseInt(teil.slice(6), 10));
      else this.formatSchaubild();
    } else if (o.k === "text") this.startEdit(o);
    else if (o.k === "bild") { this.sel = i; this.formatGrafik(); }
    else if (o.k === "legende") this.formatSchaubild();
  }
  async kurveDialog(chart, kid) {
    const nr = chart.kids.slice(0, kid).filter((k) => k.k === "kurve").length;
    if (chart !== this.chart() || nr >= this.kurvenInfo.length) { await UI.msg("Diese Kurve lässt sich keiner Größe zuordnen.\nBitte zuerst auf „Anzeigen“ tippen."); return; }
    const [si, name] = this.kurvenInfo[nr]; const v = this.sims[si].variablen.find((w) => w.name === name);
    const r = await DL.kurve(MW.kurveGet(v), v.animationsbild_hex);
    if (r) { this.merke(); MW.kurveSet(v, r.k); v.animationsbild_hex = r.bildHex; this.rebuild(); }
  }
  async achseDialog(chart, kid) {
    const pos = Math.max(0, chart.idx.indexOf(kid)); const key = ["xa", "ya", "za"][Math.min(pos, 2)];
    const r = await DL.achse(this.spec[key], ["x-Achse", "y-Achse", "z-Achse"][Math.min(pos, 2)]);
    if (r) { this.merke(); this.spec[key] = r; this.rebuild(); }
  }
  async formatSchaubild() {
    const r = await DL.schaubild(this.spec);
    if (r) { this.merke(); this.spec = r; if (this.sim && this.kurvenAusFlags().length) this.rebuild(); this.paint(); }
  }
  async formatAchszahlen() {
    const r = await DL.zahlenformat(this.spec.nach !== null && this.spec.nach !== undefined ? this.spec.nach : 2, this.spec.norm);
    if (r) { this.merke(); this.spec.nach = r.nach; this.spec.norm = r.norm; this.rebuild(); }
  }
  async formatTabelle() {
    const vs = this.tvars || [];
    if (!vs.length) { await UI.msg("Die Tabelle enthält noch keine Werte."); return; }
    const r = await DL.zahlenformat(vs[0]._attr4[1], false, false);
    if (r) { this.merke(); for (const v of vs) v._attr4 = [v._attr4[0], r.nach, v._attr4[2]]; this.tabelle(); }
  }
  toggleLegende() {
    this.merke(); this.spec.legende = !this.spec.legende;
    if (this.sim && this.kurvenAusFlags().length) this.rebuild();
    else { if (!this.spec.legende) this.sheet.objekte = this.objs.filter((o) => o.k !== "legende"); this.paint(); }
  }

  // ================================================= Animation
  animZustand(chart, t) {
    const kb = {}, marker = [];
    const kids = chart.kids.map((c, ci) => [ci, c]).filter(([, c]) => c.k === "kurve");
    const punkte = D.kurvenPunkte(chart);
    const params = kids.map((_, nr) => {
      if (nr < this.kurvenInfo.length) {
        const [si, name] = this.kurvenInfo[nr]; const v = this.sims[si] && this.sims[si].variablen.find((w) => w.name === name);
        if (v) return [MW.kurveGet(v), v.animationsbild_hex];
      }
      return [null, ""];
    });
    const keine = !params.some(([k]) => k && k.ani);
    let fertig = true;
    kids.forEach(([ci], nr) => {
      const [k, hx] = params[nr]; const pts = punkte[nr] || []; const n = pts.length;
      if (!n) return;
      if (!(keine || (k && k.ani))) return;
      const typ = k && !keine ? k.anityp : 0, stil = k && !keine ? k.kurvenstil : 2;
      let i;
      if (typ === 1) { i = t % n; fertig = false; }
      else if (typ === 2) { i = n > 1 ? t % (2 * n - 2) : 0; i = i < n ? i : 2 * n - 2 - i; fertig = false; }
      else { i = Math.min(t, n - 1); if (t < n - 1) fertig = false; }
      kb[ci] = stil === 0 ? -1 : stil === 1 ? null : i;
      marker.push([pts[i][0], pts[i][1], this.animBild(hx), k ? k.farbe : [0, 0, 200]]);
    });
    this.animFertig = fertig;
    return [kb, marker];
  }
  animBild(hx) {
    if (!hx) return null;
    this.animBilder = this.animBilder || new Map();
    if (!this.animBilder.has(hx)) {
      this.animBilder.set(hx, null);
      const b = DL.bildHex(hx); if (b) DL.ladeBild(b).then((im) => { this.animBilder.set(hx, im); this.paint(); });
    }
    return this.animBilder.get(hx);
  }
  async animStart() {
    const ch = this.chart();
    if (!ch || !D.kurvenPunkte(ch).some((p) => p.length)) { await UI.msg("Es gibt noch keine Kurve, die animiert werden kann."); return; }
    if (this.anim === null) this.animT = 0;
    this.anim = this.animT; this.animFertig = false;
    const n = Math.max(...D.kurvenPunkte(ch).map((p) => p.length));
    this.animSchritt = Math.max(1, Math.floor(n / 1500));
    clearInterval(this.animTimer);
    this.animTimer = setInterval(() => this.animTick(), Math.max(5, this.spec.timer));
  }
  animPause() { clearInterval(this.animTimer); this.animTimer = null; }
  animStop() { clearInterval(this.animTimer); this.animTimer = null; this.anim = null; this.animT = 0; this.paint(); }
  animTick() { this.animT += this.animSchritt; this.anim = this.animT; this.paintNow(); if (this.animFertig) this.animPause(); }

  // ================================================= Objekte
  kontext(i, teil, x, y) {
    let items;
    if (i === null) items = [{ text: "Neue Simulation", action: () => this.simNeu() }, { text: "Simulation bearbeiten", action: () => this.simBearbeiten() },
      { text: "Einfügen", action: () => this.einfuegen() }, { text: "Schaubild...", action: () => this.formatSchaubild() }];
    else {
      const o = this.objs[i]; items = [];
      if (o.k === "chart") {
        if (teil.startsWith("kurve:")) items.push({ text: "Kurven-Parameter...", action: () => this.kurveDialog(o, parseInt(teil.slice(6), 10)) });
        if (teil.startsWith("achse:")) items.push({ text: "Achse...", action: () => this.achseDialog(o, parseInt(teil.slice(6), 10)) });
        items.push({ text: "Eigenschaften des Schaubilds...", action: () => this.formatSchaubild() }, { text: "Zahlen an Achsen...", action: () => this.formatAchszahlen() });
      } else if (o.k === "text") items.push({ text: "Text ändern", action: () => this.startEdit(o) }, { text: "Schrift...", action: () => this.formatText() }, { text: "Drehen...", action: () => this.drehen() });
      else if (o.k === "bild") items.push({ text: "Grafik...", action: () => this.formatGrafik() });
      items.push({ sep: 1 }, { text: "Ausschneiden", action: () => this.ausschneiden() }, { text: "Kopieren", action: () => this.kopieren() }, { text: "Löschen", action: () => this.loeschen() });
    }
    UI.popup(items, x, y);
  }
  async formatText() {
    const o = this.selObj(["text"]);
    if (!o) { await UI.msg("Bitte zuerst einen Text auf dem Arbeitsblatt antippen."); return; }
    const r = await DL.schrift(o.font, o.size, D.textStyle(o));
    if (r) {
      this.merke(); o.font = r.font; o.size = r.size;
      const st = Object.assign({}, D.textStyle(o), { fett: r.fett, kursiv: r.kursiv, unter: r.unter });
      o.stil_claude = Object.fromEntries(Object.entries(st).filter(([, v]) => v));
      MW.setText(o, MW.textOf(o), D.measure); this.auswahlGeaendert(); this.paint();
    }
  }
  async formatGrafik() {
    const o = this.selObj(["bild"]);
    if (!o) { await UI.msg("Bitte zuerst eine Grafik auf dem Arbeitsblatt antippen."); return; }
    const alt = clone(o);
    const r = await DL.bild(o);
    if (r) { const neu = clone(o); Object.keys(o).forEach((k) => delete o[k]); Object.assign(o, alt); this.merke(); Object.keys(o).forEach((k) => delete o[k]); Object.assign(o, neu); this.anpassen(); }
    else { Object.keys(o).forEach((k) => delete o[k]); Object.assign(o, alt); }
  }
  async bildObjekt(bytes, x = 1.0, y = 1.0) {
    const im = await DL.ladeBild(bytes);
    if (!im) { await UI.msg("Die Grafik konnte nicht gelesen werden."); return null; }
    const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0);
    let w = im.naturalWidth / PX_CM, hh = im.naturalHeight / PX_CM;
    if (w > 14) { hh *= 14 / w; w = 14.0; }
    return { k: "bild", g: [x, y, w, hh], a0: 0, ext: MW.cpEncode("bmp"), data: DL.bmpBytes(c), tr: new Uint8Array(6) };
  }
  async grafikEinfuegen() {
    const f = await UI.pickFile("image/*,.bmp"); if (!f) return;
    const o = await this.bildObjekt(await UI.readFile(f)); if (!o) return;
    this.merke(); this.objs.push(o); this.sel = this.objs.length - 1; this.anpassen();
  }
  bildAusZwischenablage() { UI.msg("Kopiere ein Bild in einer anderen App und füge es hier mit ⌘V (Tastatur) ein.\nOhne Tastatur: Bild in der Fotos-App sichern und über Einfügen → Grafik... auswählen."); }
  async paste(e) {
    if (UI.isModal() || (e.target instanceof HTMLInputElement) || (e.target instanceof HTMLTextAreaElement)) return;
    const item = Array.from(e.clipboardData ? e.clipboardData.items : []).find((it) => it.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      const o = await this.bildObjekt(new Uint8Array(await item.getAsFile().arrayBuffer())); if (!o) return;
      this.merke(); this.objs.push(o); this.sel = this.objs.length - 1; this.anpassen();
    } else if (this.clip) { e.preventDefault(); this.einfuegen(); }
  }
  kopieren() { const o = this.selObj(); if (o) { this.clip = clone(o); this.setStatus("Kopiert", 2000); } }
  ausschneiden() { if (this.selObj()) { this.kopieren(); this.loeschen(); } }
  einfuegen() {
    if (!this.clip) { this.bildAusZwischenablage(); return; }
    this.merke(); const o = clone(this.clip); o.g[0] += 0.5; o.g[1] += 0.5;
    if (o.k === "chart") this.objs.splice(this.chart() ? 1 : 0, 0, o); else this.objs.push(o);
    this.sel = this.objs.indexOf(o); this.anpassen();
  }
  loeschen() {
    const o = this.selObj(); if (!o) return;
    this.merke(); this.sheet.objekte = this.objs.filter((x) => x !== o);
    if (o.k === "chart") { this.sheet.objekte = this.objs.filter((x) => x.k !== "legende"); this.kurvenInfo = []; }
    this.sel = null; this.anpassen();
  }
  async drehen() {
    const o = this.selObj(["text"]);
    if (!o) { await UI.msg("Drehen ist für Texte möglich. Bitte zuerst einen Text antippen."); return; }
    const w = await DL.winkel(o.winkel / 10.0);
    if (w !== null) { this.merke(); o.winkel = ((Math.round(w * 10) % 3600) + 3600) % 3600; this.paint(); }
  }
  sonderEin(ch) {
    if (this.edit) { const i = this.edit.inp; const p = i.selectionStart ?? i.value.length; i.value = i.value.slice(0, p) + ch + i.value.slice(i.selectionEnd ?? p); i.focus(); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ch).catch(() => {});
    this.setStatus(`„${ch}“ kopiert. Zuerst mit dem Text-Werkzeug auf das Blatt tippen, um direkt einzufügen.`, 5000);
  }

  // ================================================= Ausgabe
  blattBild(s = 80.0, farbe = true) {
    const bs = this.objs.map((o) => D.bounds(o));
    let [w, hh] = this.groesse();
    if (bs.length) { w = Math.max(...bs.map((b) => b[0] + b[2])) + 0.3; hh = Math.max(...bs.map((b) => b[1] + b[3])) + 0.3; }
    const c = document.createElement("canvas"); c.width = Math.ceil(w * s); c.height = Math.ceil(hh * s);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    const alt = this.objs.filter((o) => o.k === "chart").map((o) => [o, o.farbe]);
    if (!farbe) for (const [o] of alt) o.farbe = MW.farbeBytes(255, 255, 255);
    const ed = this.edit; this.edit = null; this.male(ctx, s); this.edit = ed;
    for (const [o, f] of alt) o.farbe = f;
    return c;
  }
  async exportBild() {
    const c = this.blattBild();
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    await UI.save(this.basisName() + ".png", blob);
  }
  async exportCsv() {
    const vs = this.tvars && this.tvars.length ? this.tvars : (this.sim ? this.sim.variablen.filter((v) => v.werte.length) : []);
    if (!vs.length) { await UI.msg("Es gibt noch keine Werte."); return; }
    const n = Math.max(...vs.map((v) => v.werte.length));
    const lines = [vs.map((v) => v.name).join(";")];
    for (let r = 0; r < n; r++) lines.push(vs.map((v) => (r < v.werte.length ? String(v.werte[r]).replace(".", ",") : "")).join(";"));
    await UI.save(this.basisName() + ".csv", "﻿" + lines.join("\r\n") + "\r\n");
  }
  druckHtml(teile, rand, farbe) {
    const s = this.sim, esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const titel = this.name || this.beispielTitel || "Unbenannt";
    const out = [`${"<"}!doctype html>${"<"}html lang="de">${"<"}head><meta charset="utf-8"><title>${esc(titel)}</title><style>
      @page { margin: ${rand[1]}cm 1.5cm 1.5cm ${rand[0]}cm; } body { font: 10pt Arial, sans-serif; margin: ${rand[1]}cm 1.5cm 1.5cm ${rand[0]}cm; }
      pre { font: 9pt Menlo, "Courier New", monospace; } table { border-collapse: collapse; } td, th { padding: 1px 8px; text-align: right; }
      h2 { margin: 0 0 6px; } h3 { margin: 14px 0 4px; } img { max-width: 100%; }</style>${"<"}/head>${"<"}body>`];
    out.push(`<h2>${esc(titel)}</h2>`);
    if (s) {
      out.push(`<p><b>Simulation:</b> ${esc(s.name)} &nbsp; (Wiederhole ${s.wiederhole} mal)</p>`);
      if (teile.programm) out.push("<h3>Programm</h3><pre>" + esc(MW.expandMakros(s.programm, this.makros).join("\n")) + "</pre>");
      if (teile.startwerte) out.push("<h3>Startwerte</h3><table>" + s.variablen.map((v) => `<tr><td style="text-align:left">${esc(v.name)}</td><td>${v.startwert_aktiv ? esc(MW.zahlText(v.startwert)[0]) : ""}</td></tr>`).join("") + "</table>");
      const f = s.sprachlich.felder;
      if (teile.sprachlich && f.length) { const z = []; for (let i = 0; i + 2 < f.length; i += 3) z.push(esc(f.slice(i, i + 3).join(" "))); out.push("<h3>Sprachliches Modell</h3><p>" + z.join("<br>") + "</p>"); }
      if (teile.grafisch && (s.grafisch.zustand.length || s.grafisch.rate.length)) {
        const c = document.createElement("canvas"); c.width = 1800; c.height = 1240; const ctx = c.getContext("2d"); ctx.scale(2, 2);
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 900, 620); D.maleFluss(ctx, s.grafisch);
        out.push(`<h3>Grafisches Modell</h3><p><img src="${c.toDataURL("image/png")}" width="520" alt="Flussdiagramm"></p>`);
      }
    }
    if (teile.schaubild && this.objs.length) { const c = this.blattBild(60.0, farbe); out.push(`<h3>Schaubild</h3><p><img src="${c.toDataURL("image/png")}" width="${Math.min(620, c.width)}" alt="Arbeitsblatt"></p>`); }
    if (teile.tabelle && this.tvars && this.tvars.length) {
      const vs = this.tvars; const n = Math.min(Math.max(...vs.map((v) => v.werte.length)), 2000);
      const rows = []; for (let r = 0; r < n; r++) rows.push("<tr>" + vs.map((v) => `<td>${r < v.werte.length ? MW.tabellenText(v.werte[r], v._attr4[1]) : ""}</td>`).join("") + "</tr>");
      out.push("<h3>Tabelle</h3><table><tr>" + vs.map((v) => `<th>${esc(v.name)}</th>`).join("") + "</tr>" + rows.join("") + "</table>");
    }
    out.push("<" + "/body>" + "<" + "/html>");
    return out.join("\n");
  }
  async drucken() {
    const r = await DL.drucken(); if (!r) return;
    if (r.teile.tabelle && (!this.tvars || !this.tvars.length)) this.tabelle();
    const ok = await UI.save(this.basisName() + " - Druck.html", this.druckHtml(r.teile, r.rand, r.farbe));
    if (ok) UI.toast("Druckansicht gespeichert. In der Dateien-App öffnen und über Teilen → Drucken ausdrucken.", 6000);
  }
  info() {
    return UI.modal({ title: "Info über " + APP, body: h("div", { style: { maxWidth: "48ch" } },
      h("p", {}, h("b", { text: APP }), h("br"), "Modellbildung mit Programmschleifen. Web-Version für iPad, Mac und andere Geräte."),
      h("p", { text: "Eigenständiges, neu geschriebenes Programm. Es liest und schreibt Modelldateien im Format MOEBIUS30 (*.prg) und Dateien der Mac-App (*.json)." }),
      h("p", { text: "Nicht vom Autor von Moebius (Detlef Hoche) und nicht mit ihm verbunden." })),
      buttons: [{ text: "OK", value: true, default: true }] });
  }
}
root.MWApp = App;
})(typeof window !== "undefined" ? window : globalThis);
