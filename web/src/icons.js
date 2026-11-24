//claude
// icons.js - Symbole der Werkzeugleisten, Strich fuer Strich wie mw_icons.py der Mac-App
// (gleiche Koordinaten, Stiftbreite 1,5 px, runde Enden und Ecken, Grundgroesse 20 px).
(function (root) {
"use strict";
const cache = new Map();

function draw(ctx, name, fg, size) {
  const s = size;
  ctx.save();
  ctx.strokeStyle = fg; ctx.fillStyle = fg;
  ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.lineCap = "round";
  const X = (v) => v * s;
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(X(x1), X(y1)); ctx.lineTo(X(x2), X(y2)); ctx.stroke(); };
  const rect = (x, y, w, h, fill) => { ctx.beginPath(); ctx.rect(X(x), X(y), X(w), X(h)); if (fill) ctx.fill(); ctx.stroke(); };
  const poly = (pts, fill) => {
    ctx.beginPath(); ctx.moveTo(X(pts[0][0]), X(pts[0][1]));
    for (const [x, y] of pts.slice(1)) ctx.lineTo(X(x), X(y));
    ctx.closePath(); if (fill) ctx.fill(); ctx.stroke();
  };
  const page = (x, y, w, h) => poly([[x, y], [x + w * 0.65, y], [x + w, y + h * 0.3], [x + w, y + h], [x, y + h]], false);
  const text = (t, bold = false, italic = false, under = false, scale = 0.7) => {
    const px = Math.floor(s * scale);
    ctx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${px}px Arial, Helvetica, sans-serif`;
    const m = ctx.measureText(t);
    const asc = m.fontBoundingBoxAscent !== undefined ? m.fontBoundingBoxAscent : px * 0.905;
    const desc = m.fontBoundingBoxDescent !== undefined ? m.fontBoundingBoxDescent : px * 0.212;
    const x0 = (s - m.width) / 2 - 0, base = (s - (asc + desc)) / 2 + asc;
    ctx.textBaseline = "alphabetic"; ctx.fillText(t, x0, base);
    if (under) {
      const lw = 1; ctx.lineWidth = lw; ctx.lineCap = "butt";
      const uy = base + 1 + lw / 2;
      ctx.beginPath(); ctx.moveTo(x0, uy); ctx.lineTo(x0 + m.width, uy); ctx.stroke();
    }
  };
  switch (name) {
    case "open":
      poly([[.1, .3], [.4, .3], [.5, .4], [.9, .4], [.9, .8], [.1, .8]], false); line(.1, .5, .9, .5); break;
    case "save":
      rect(.15, .15, .7, .7); rect(.3, .15, .4, .25); ctx.fillRect(X(.3), X(.55), X(.4), X(.3)); break;
    case "print":
      rect(.15, .4, .7, .3); rect(.3, .15, .4, .25); rect(.3, .6, .4, .25); break;
    case "newsim":
      page(.2, .15, .5, .7); line(.65, .75, .95, .75); line(.8, .6, .8, .9); break;
    case "copysim":
      page(.12, .12, .45, .6); page(.42, .3, .45, .6); break;
    case "editsim":
      page(.15, .15, .5, .7); line(.45, .8, .9, .35); line(.45, .8, .5, .65); break;
    case "chart":
      line(.15, .1, .15, .85); line(.15, .85, .9, .85);
      ctx.beginPath(); ctx.moveTo(X(.2), X(.75)); ctx.bezierCurveTo(X(.45), X(.7), X(.5), X(.25), X(.88), X(.2)); ctx.stroke(); break;
    case "table":
      rect(.12, .18, .76, .64);
      for (const y of [.39, .6]) line(.12, y, .88, y);
      for (const x of [.37, .63]) line(x, .18, x, .82);
      break;
    case "play": poly([[.28, .18], [.82, .5], [.28, .82]], true); break;
    case "stop": rect(.25, .25, .5, .5, true); break;
    case "pause": rect(.25, .22, .17, .56, true); rect(.58, .22, .17, .56, true); break;
    case "arrow": poly([[.25, .12], [.25, .78], [.42, .62], [.55, .9], [.66, .85], [.53, .58], [.75, .56]], true); break;
    case "text": text("T", true, false, false, 0.8); break;
    case "bold": text("F", true); break;
    case "italic": text("K", false, true); break;
    case "underline": text("U", false, false, true); break;
    case "super": text("x²"); break;
    case "sub": text("x₂"); break;
    case "more": poly([[.15, .25], [.5, .5], [.15, .75]], true); poly([[.5, .25], [.85, .5], [.5, .75]], true); break;
    case "move":
      line(.5, .1, .5, .9); line(.1, .5, .9, .5);
      for (const [t, l, r] of [[[.5, .1], [.38, .25], [.62, .25]], [[.5, .9], [.38, .75], [.62, .75]],
        [[.1, .5], [.25, .38], [.25, .62]], [[.9, .5], [.75, .38], [.75, .62]]]) { line(...t, ...l); line(...t, ...r); }
      break;
    case "label": text("Abc", false, false, false, 0.45); break;
    case "delete": ctx.lineWidth = 2.2; line(.22, .22, .78, .78); line(.78, .22, .22, .78); break;
    case "state": rect(.12, .28, .76, .44); break;
    case "rate":
      ctx.beginPath(); ctx.ellipse(X(.5), X(.5), X(.2), X(.2), 0, 0, 2 * Math.PI); ctx.stroke();
      line(.05, .5, .3, .5); line(.7, .5, .95, .5); line(.85, .4, .95, .5); line(.85, .6, .95, .5); break;
    case "link":
      ctx.beginPath(); ctx.moveTo(X(.12), X(.8)); ctx.quadraticCurveTo(X(.3), X(.2), X(.85), X(.25)); ctx.stroke();
      line(.85, .25, .68, .16); line(.85, .25, .72, .4); break;
    case "trash":
      rect(.25, .3, .5, .55); line(.15, .3, .85, .3); line(.4, .18, .6, .18);
      for (const x of [.4, .5, .6]) line(x, .42, x, .75);
      break;
    default: text("?");
  }
  ctx.restore();
}

// Liefert eine Bild-URL des Symbols (doppelte Aufloesung wie die Mac-App: 40x40 Pixel fuer 20 pt).
function url(name, fg = "#000000", size = 20, scale = 2) {
  const key = name + "|" + fg + "|" + size + "|" + scale;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas"); c.width = size * scale; c.height = size * scale;
  const ctx = c.getContext("2d"); ctx.scale(scale, scale);
  draw(ctx, name, fg, size);
  const u = c.toDataURL("image/png");
  cache.set(key, u);
  return u;
}
const NAMES = ["open", "save", "print", "newsim", "copysim", "editsim", "chart", "table", "play", "stop", "pause", "arrow", "text",
  "bold", "italic", "underline", "super", "sub", "more", "move", "label", "delete", "state", "rate", "link", "trash"];
root.MWIcons = { draw, url, NAMES, clear: () => cache.clear() };
})(typeof window !== "undefined" ? window : globalThis);
