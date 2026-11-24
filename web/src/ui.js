//claude
// ui.js - kleine Bausteine fuer Fenster, Dialoge und Bedienelemente (ersetzt Qt-Widgets).
(function (root) {
"use strict";
const MW = root.MW;
const UI = {};
const APP = "Modellwerk";
UI.APP = APP;

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
UI.h = h;
let idn = 0;
UI.uid = (p = "f") => `${p}${++idn}`;
UI.appEl = () => document.getElementById("app");

class WertFehler extends Error {}
UI.WertFehler = WertFehler;
UI.num = function (text) {
  const t = String(text).trim().replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) throw new WertFehler("keine Zahl");
  return parseFloat(t);
};
UI.fz = (x) => MW.fmtG(x, 10).replace(".", ",");

// ------------------------------------------------------------ Modale Fenster
const stack = [];
UI.isModal = () => stack.length > 0;
UI.modal = function ({ title, body, buttons = [], width, onClose, cls }) {
  return new Promise((resolve) => {
    const ov = h("div", { class: "overlay" });
    const close = (v) => { ov.remove(); stack.splice(stack.indexOf(ctrl), 1); document.removeEventListener("keydown", key, true); if (onClose) onClose(v); resolve(v); };
    const tt = h("div", { class: "tt" }, h("span", { text: title }), h("button", { class: "btn x", "aria-label": "Schließen", onclick: () => close(null) }, "✕"));
    const db = h("div", { class: "db" }, body);
    const bb = h("div", { class: "bb" });
    const ctrl = { close, el: null, bb };
    for (const b of buttons) {
      const btn = h("button", { class: "btn" + (b.default ? " default" : "") + (b.ghost ? " ghost" : ""), title: b.tip || null, id: b.id || null }, b.text);
      btn.addEventListener("click", async () => { const r = b.onClick ? await b.onClick(ctrl) : b.value; if (r !== undefined && r !== UI.KEEP) close(r); });
      if (b.left) { btn.style.marginRight = "auto"; bb.prepend(btn); } else bb.append(btn);
    }
    const dlg = h("div", { class: "dlg " + (cls || ""), role: "dialog", "aria-modal": "true", "aria-label": title, style: width ? { width: `min(96vw, ${width}px)` } : null }, tt, db, buttons.length ? bb : null);
    ctrl.el = dlg;
    ov.append(dlg);
    UI.appEl().append(ov);
    stack.push(ctrl);
    // Fenster an der Titelleiste verschieben
    let drag = null;
    tt.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; drag = [e.clientX, e.clientY, dlg.offsetLeft, dlg.offsetTop]; tt.setPointerCapture(e.pointerId); });
    tt.addEventListener("pointermove", (e) => { if (!drag) return; dlg.style.position = "relative"; dlg.style.left = (e.clientX - drag[0]) + "px"; dlg.style.top = (e.clientY - drag[1]) + "px"; drag[2] = 0; });
    tt.addEventListener("pointerup", () => { drag = null; });
    const key = (e) => {
      if (stack[stack.length - 1] !== ctrl) return;
      if (e.key === "Escape") { e.preventDefault(); close(null); }
      else if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement) && !e.target.closest?.(".gtable") && !e.target.closest?.(".dropdown")) {
        const d = buttons.find((b) => b.default); if (d) { e.preventDefault(); bb.querySelector(".default")?.click(); }
      }
    };
    document.addEventListener("keydown", key, true);
    const first = dlg.querySelector(".db input, .db textarea, .db select, .db button");
    if (first && !("ontouchstart" in window)) setTimeout(() => first.focus(), 30);
  });
};
UI.KEEP = Symbol("keep");
UI.msg = (text, title = APP) => UI.modal({ title, body: h("div", { style: { whiteSpace: "pre-wrap", maxWidth: "52ch" } }, text), buttons: [{ text: "OK", value: true, default: true }] });
UI.info = UI.msg;
UI.ask = (text, buttons = ["Ja", "Nein"], title = APP) =>
  UI.modal({ title, body: h("div", { style: { whiteSpace: "pre-wrap", maxWidth: "52ch" } }, text), buttons: buttons.map((t, i) => ({ text: t, value: i, default: i === 0 })) })
    .then((v) => (v === null ? buttons.length - 1 : v));
UI.input = function (title, label, value = "", opts = {}) {
  const id = UI.uid("in");
  const inp = h("input", { class: "field", id, value, inputmode: opts.inputmode || null, autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  inp.value = value;
  const p = UI.modal({ title, body: h("div", { class: "grid2", style: { minWidth: "min(80vw, 340px)" } }, h("label", { for: id, text: label }), inp),
    buttons: [{ text: "OK", default: true, onClick: () => inp.value }, { text: "Abbrechen", value: null }] });
  setTimeout(() => { inp.focus(); inp.select(); }, 40);
  return p;
};
UI.inputInt = async function (title, label, value, min, max) {
  const sp = UI.spin(value, min, max);
  const r = await UI.modal({ title, body: h("div", { class: "grid2" }, h("span", { text: label }), sp.el),
    buttons: [{ text: "OK", default: true, onClick: () => sp.get() }, { text: "Abbrechen", value: null }] });
  return r;
};
UI.toast = function (text, ms = 2600) {
  const t = h("div", { class: "toast", role: "status", text }); UI.appEl().append(t); setTimeout(() => t.remove(), ms);
};

// ------------------------------------------------------------ Bedienelemente
UI.button = (text, onclick, tip) => h("button", { class: "btn", onclick, title: tip || null }, text);
UI.check = function (text, checked, onchange, tip) {
  const id = UI.uid("cb");
  const inp = h("input", { type: "checkbox", id }); inp.checked = !!checked;
  if (onchange) inp.addEventListener("change", () => onchange(inp.checked));
  const el = h("label", { class: "cb", for: id, title: tip || null }, inp, text);
  return { el, inp, get: () => inp.checked, set: (v) => { inp.checked = !!v; } };
};
UI.select = function (items, value, onchange, tip) {
  const s = h("select", { class: "sel", title: tip || null, id: UI.uid("s") });
  for (const it of items) { const [v, t] = Array.isArray(it) ? it : [it, it]; s.append(h("option", { value: v }, t)); }
  if (value !== undefined) s.value = value;
  if (onchange) s.addEventListener("change", () => onchange(s.value));
  return s;
};
UI.spin = function (value, min, max, step = 1, opts = {}) {
  const inp = h("input", { class: "field", inputmode: opts.decimal ? "decimal" : "numeric", id: UI.uid("sp"), autocomplete: "off", title: opts.tip || null });
  if (opts.width) inp.style.width = opts.width + "px";
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const get = () => { const t = inp.value.replace(opts.suffix || "", "").trim(); const v = parseInt(t, 10); return isNaN(v) ? clamp(value) : clamp(v); };
  const set = (v) => { value = clamp(v); inp.value = String(value) + (opts.suffix || ""); };
  inp.addEventListener("focus", () => setTimeout(() => inp.select(), 0));
  inp.addEventListener("blur", () => set(get()));
  inp.addEventListener("keydown", (e) => { if (e.key === "ArrowUp") { e.preventDefault(); set(get() + step); } else if (e.key === "ArrowDown") { e.preventDefault(); set(get() - step); } });
  const arrow = (d, t) => h("button", { class: "btn", tabindex: "-1", "aria-label": d > 0 ? "mehr" : "weniger", onclick: () => set(get() + d * step) }, t);
  const el = h("span", { class: "spin" }, inp, h("span", { class: "arrows" }, arrow(1, "▲"), arrow(-1, "▼")));
  set(value);
  return { el, inp, get, set };
};
UI.group = (title, ...kids) => h("div", { class: "group" }, title ? h("span", { class: "gt", text: title }) : null, ...kids);
UI.radios = function (title, items, index, cols = 1) {
  const name = UI.uid("r");
  const grid = h("div", { style: { display: "grid", gridTemplateColumns: `repeat(${cols}, auto)`, gap: "2px 12px" } });
  const inps = items.map((t, i) => {
    const id = name + "_" + i; const inp = h("input", { type: "radio", name, id }); inp.checked = i === index;
    grid.append(h("label", { class: "cb", for: id }, inp, t)); return inp;
  });
  return { el: UI.group(title, grid), get: () => Math.max(0, inps.findIndex((x) => x.checked)), inps };
};
function swatch(rgb) { return h("span", { class: "swatch", style: { background: `rgb(${rgb.join(",")})` } }); }
UI.farbCombo = function (rgb, tip) {
  let cur = rgb.slice();
  const lab = h("span");
  const btn = h("button", { class: "sel", type: "button", title: tip || null, style: { textAlign: "left", minWidth: "150px" } }, lab);
  const name = (c) => (MW.FARBEN.find(([, x]) => x.join() === c.join()) || ["eigene Farbe"])[0];
  const render = () => { lab.replaceChildren(swatch(cur), name(cur)); };
  btn.addEventListener("click", () => {
    const r = btn.getBoundingClientRect();
    const dd = h("div", { class: "dropdown", role: "listbox" });
    const off = () => { dd.remove(); document.removeEventListener("pointerdown", out, true); };
    const out = (e) => { if (!dd.contains(e.target)) off(); };
    for (const [n, c] of MW.FARBEN) {
      const li = h("div", { class: "li" + (c.join() === cur.join() ? " on" : ""), role: "option" }, swatch(c), n);
      li.addEventListener("click", () => { cur = c.slice(); render(); off(); });
      dd.append(li);
    }
    UI.appEl().append(dd);
    const top = Math.min(r.bottom, window.innerHeight - Math.min(dd.offsetHeight, window.innerHeight * 0.5) - 8);
    dd.style.left = Math.min(r.left, window.innerWidth - dd.offsetWidth - 8) + "px"; dd.style.top = Math.max(8, top) + "px";
    setTimeout(() => document.addEventListener("pointerdown", out, true), 0);
  });
  render();
  return { el: btn, get: () => cur.slice(), set: (c) => { cur = c.slice(); render(); } };
};

// ------------------------------------------------------------ Kontext- und Aufklappmenues
let openMenu = null;
UI.closeMenus = () => { if (openMenu) { openMenu.forEach((m) => m.remove()); openMenu = null; document.querySelectorAll(".mtop.open").forEach((x) => x.classList.remove("open")); } };
UI.popup = function (items, x, y, level = 0) {
  if (level === 0) UI.closeMenus();
  const m = h("div", { class: "menu", role: "menu" });
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { m.append(h("div", { class: "sep" })); continue; }
    const on = typeof it.checked === "function" ? it.checked() : it.checked;
    const dis = typeof it.disabled === "function" ? it.disabled() : it.disabled;
    const mi = h("div", { class: "mi" + (on ? " on" : "") + (dis ? " off" : "") + (it.sub ? " sub" : ""), role: "menuitem" }, h("span", { text: it.text }), it.key ? h("span", { class: "key", text: it.key }) : null);
    if (it.sub) {
      const show = () => { const r = mi.getBoundingClientRect(); openMenu.slice(level + 1).forEach((q) => q.remove()); openMenu.length = level + 1; UI.popup(it.sub, r.right - 4, r.top, level + 1); };
      mi.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(); });
      mi.addEventListener("click", show);
    } else if (!dis) mi.addEventListener("click", () => { UI.closeMenus(); it.action(); });
    m.append(mi);
  }
  UI.appEl().append(m);
  const w = m.offsetWidth, hh = m.offsetHeight;
  m.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + "px";
  m.style.top = Math.max(4, Math.min(y, window.innerHeight - hh - 4)) + "px";
  if (level === 0) {
    openMenu = [m];
    setTimeout(() => {
      const out = (e) => { if (!openMenu || openMenu.some((q) => q.contains(e.target)) || e.target.closest(".mtop")) return; UI.closeMenus(); document.removeEventListener("pointerdown", out, true); };
      document.addEventListener("pointerdown", out, true);
    }, 0);
  } else openMenu.push(m);
  return m;
};

// ------------------------------------------------------------ Finger-Gesten: Doppeltipp und langes Druecken
// cb.down(e) -> true, wenn der Druck selbst verarbeitet wird; cb.dbl(e); cb.long(e)
UI.gesten = function (el, cb) {
  let last = null, timer = null, start = null;
  el.addEventListener("pointerdown", (e) => {
    start = { x: e.clientX, y: e.clientY, t: Date.now(), e };
    clearTimeout(timer);
    if (cb.long && e.pointerType !== "mouse") timer = setTimeout(() => { if (start) { cb.long(start.e); start = null; last = null; } }, 520);
  });
  el.addEventListener("pointermove", (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) { clearTimeout(timer); start = null; } });
  el.addEventListener("pointerup", (e) => {
    clearTimeout(timer);
    if (!start) return;
    const now = Date.now();
    if (last && now - last.t < 380 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24) { last = null; start = null; if (cb.dbl) cb.dbl(e); return; }
    last = { t: now, x: e.clientX, y: e.clientY }; start = null;
  });
  el.addEventListener("pointercancel", () => { clearTimeout(timer); start = null; });
  if (cb.long) el.addEventListener("contextmenu", (e) => { e.preventDefault(); if (e.pointerType !== "touch") cb.long(e); });
};

// ------------------------------------------------------------ Dateien
// iPad/iPhone: Safari meldet sich auf dem iPad als "Macintosh", hat aber Touchpunkte
UI.IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
UI.pickFile = function (accept) {
  return new Promise((resolve) => {
    const inp = h("input", { type: "file", style: { display: "none" } });
    if (accept) inp.accept = accept;
    let fertig = false;
    const ende = (f) => { if (fertig) return; fertig = true; resolve(f); inp.remove(); };
    inp.addEventListener("change", () => ende(inp.files[0] || null));
    inp.addEventListener("cancel", () => ende(null));
    UI.appEl().append(inp); inp.click();
  });
};
UI.readFile = (file) => file.arrayBuffer().then((b) => new Uint8Array(b));
let dl = undefined;
UI.downloads = async () => {
  if (dl === undefined) { try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dl = null; } }
  return dl;
};
// Laeuft die Seite als Artifact in claude.ai (dort nur bestimmte Dateitypen speicherbar) oder als normale Webseite?
UI.imArtifact = () => !!(window.claude && typeof window.claude.use === "function");
// Speichert eine Datei (ueber die downloads-Faehigkeit der Seite, sonst ueber einen normalen Download-Link)
UI.save = async function (filename, data) {
  const d = await UI.downloads();
  if (d) {
    try { await d.save({ filename, data }); return true; }
    catch (e) {
      if (e && e.code === "declined") return false;
      if (e && e.code === "rate_limited") { await UI.msg("Es ist schon ein Speichern-Fenster offen. Bitte kurz warten und erneut versuchen."); return false; }
      if (e && (e.code === "rejected_extension" || e.code === "extension_not_enabled")) { await UI.msg("Dieses Dateiformat kann hier nicht gespeichert werden."); return false; }
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([data])); const a = h("a", { href: url, download: filename });
    UI.appEl().append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) { await UI.msg("Speichern ist in dieser Ansicht nicht möglich."); return false; }
};
UI.store = {
  get(k) { try { return localStorage.getItem("modellwerk_" + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem("modellwerk_" + k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem("modellwerk_" + k); } catch (e) { /* egal */ } },
};
root.UI = UI;
})(typeof window !== "undefined" ? window : globalThis);
