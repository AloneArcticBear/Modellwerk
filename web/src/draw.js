//claude
// draw.js - zeichnet die Blattobjekte (Port von mw_draw.py). Einheit cm, s = Pixel pro cm.
(function (root) {
"use strict";
const MW = root.MW;
const D = {};
const DASH = [null, [4, 2], [1, 2], [4, 2, 1, 2], [4, 2, 1, 2, 1, 2]];
const rgbStr = (f) => `rgb(${f[0]},${f[1]},${f[2]})`;
D.rgbStr = rgbStr;
D.FONTS = ["Arial", "Helvetica", "Times New Roman", "Courier New", "Georgia", "Verdana", "Trebuchet MS", "Palatino", "Gill Sans", "Futura"];
function cssFont(name, px, fett, kursiv) {
  const fb = /Times|Georgia|Palatino/.test(name) ? "serif" : /Courier/.test(name) ? "monospace" : "sans-serif";
  return `${kursiv ? "italic " : ""}${fett ? "bold " : ""}${px}px "${name}", ${fb}`;
}
D.cssFont = cssFont;
const fontPx = (size, s) => Math.max(1, Math.round(size / 72.0 * 2.54 * s));
let mctx = null;
function metrics(ctx, text) {
  const m = ctx.measureText(text);
  const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)[1]);
  const asc = m.fontBoundingBoxAscent !== undefined ? m.fontBoundingBoxAscent : px * 0.905;
  const desc = m.fontBoundingBoxDescent !== undefined ? m.fontBoundingBoxDescent : px * 0.212;
  return { w: m.width, asc, desc, h: asc + desc };
}
D.measure = function (text, font, size) {
  if (!mctx) mctx = document.createElement("canvas").getContext("2d");
  mctx.font = cssFont(font, fontPx(size, 100.0));
  const m = metrics(mctx, text);
  return [m.w / 100.0, m.h / 100.0];
};
function pen(ctx, farbe, stil, w) {
  ctx.strokeStyle = rgbStr(farbe); ctx.lineWidth = w; ctx.lineCap = "butt"; ctx.lineJoin = "round";
  const d = DASH[stil] || null;
  ctx.setLineDash(d ? d.map((x) => x * Math.max(1, w)) : []);
}
// Bilder (BMP/PNG aus der Datei) werden einmal dekodiert; danach wird neu gezeichnet.
const images = new WeakMap();
D.onImageLoaded = null;
function image(data) {
  if (images.has(data)) return images.get(data);
  const rec = { img: null, failed: false };
  images.set(data, rec);
  const url = URL.createObjectURL(new Blob([data]));
  const im = new Image();
  im.onload = () => { rec.img = im; if (D.onImageLoaded) D.onImageLoaded(); };
  im.onerror = () => { rec.failed = true; URL.revokeObjectURL(url); if (D.onImageLoaded) D.onImageLoaded(); };
  im.src = url;
  return rec;
}
D.image = image;
D.textStyle = (o) => o.stil_claude || {};

function draw(ctx, o, s, ox = 0, oy = 0, bis = null, kurvenBis = null) {
  const k = o.k, g = o.g;
  if (k === "chart" || k === "achse" || k === "kurve") {
    const x = ox + g[0], y = oy + g[1];
    let pr = null;
    if (k === "chart" && !o.dreid) {
      pr = MW.chartPlotRect(o);
      ctx.fillStyle = rgbStr(o.farbe); ctx.fillRect((x + pr[0]) * s, (y + pr[1]) * s, pr[2] * s, pr[3] * s);
    }
    if (k === "chart" && o.dreid) { ctx.fillStyle = rgbStr(o.farbe); ctx.fillRect(x * s, y * s, g[2] * s, g[3] * s); }
    let mi = 0;
    o.kids.forEach((c, ci) => {
      let b = bis;
      if (k === "chart" && kurvenBis && c.k === "kurve") {
        b = Object.prototype.hasOwnProperty.call(kurvenBis, ci) ? kurvenBis[ci] : null;
        if (b === -1) return;
      }
      if (k === "kurve" && bis !== null && (c.k === "marke" || (c.k === "poly" && c.zu))) { mi += 1; if (mi - 1 > bis) return; }
      if (k === "chart" && c.k === "kurve" && !o.dreid) {
        ctx.save(); ctx.beginPath(); ctx.rect((x + pr[0]) * s - 3, (y + pr[1]) * s - 3, pr[2] * s + 6, pr[3] * s + 6); ctx.clip();
        draw(ctx, c, s, x, y, b); ctx.restore();
      } else draw(ctx, c, s, x, y, b);
    });
  } else if (k === "linie") {
    if (o.stil === 5) return;
    const ax = (ox + g[0]) * s, ay = (oy + g[1]) * s, bx = (ox + g[0] + g[2]) * s, by = (oy + g[1] + g[3]) * s;
    pen(ctx, o.farbe, o.stil, Math.max(1.0, o.a0));
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    if (o.pfeil) {
      const ang = Math.atan2(by - ay, bx - ax), L = Math.max(6.0, 0.22 * s);
      ctx.setLineDash([]); ctx.fillStyle = rgbStr(o.farbe); ctx.beginPath(); ctx.moveTo(bx, by);
      for (const d of [0.32, -0.32]) ctx.lineTo(bx - L * Math.cos(ang + d), by - L * Math.sin(ang + d));
      ctx.closePath(); ctx.fill();
    }
  } else if (k === "poly") {
    const pts = bis === null || o.zu ? o.pts : o.pts.slice(0, bis + 1);
    if (!pts.length) return;
    const x = ox + g[0], y = oy + g[1];
    if (o.zu) {
      pen(ctx, o.farbe, 0, 1); ctx.fillStyle = rgbStr(o.farbe); ctx.beginPath();
      pts.forEach(([a, b], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x + a) * s, (y + b) * s));
      ctx.closePath(); ctx.fill(); ctx.stroke(); return;
    }
    if (o.stil === 5) return;
    pen(ctx, o.farbe, o.stil, Math.max(1.4, o.a0));
    ctx.beginPath();
    const q = (i) => [(x + pts[i][0]) * s, (y + pts[i][1]) * s];
    ctx.moveTo(...q(0));
    if (o.t === 0x0C && pts.length > 2 && pts.length < 3000) {
      for (let i = 1; i < pts.length - 1; i++) { const [ax, ay] = q(i), [bx, by] = q(i + 1); ctx.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2); }
      ctx.lineTo(...q(pts.length - 1));
    } else {
      // sehr viele Punkte: nur Punkte zeichnen, die mindestens einen halben Pixel auseinander liegen
      let lx = NaN, ly = NaN;
      for (let i = 1; i < pts.length; i++) {
        const px = (x + pts[i][0]) * s, py = (y + pts[i][1]) * s;
        if (i < pts.length - 1 && Math.abs(px - lx) < 0.5 && Math.abs(py - ly) < 0.5) continue;
        ctx.lineTo(px, py); lx = px; ly = py;
      }
    }
    ctx.stroke(); ctx.setLineDash([]);
  } else if (k === "marke") {
    const r = Math.max(1.5, o.d * 0.75 * s);
    const cx = (ox + g[0] + g[2] / 2) * s, cy = (oy + g[1] + g[3] / 2) * s;
    const col = rgbStr(o.farbe);
    ctx.setLineDash([]);
    if (o.form === 0) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.lineCap = "square"; ctx.beginPath();
      ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx + r, cy - r); ctx.stroke();
    } else if (o.form === 1) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    } else {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fill();
    }
  } else if (k === "text") {
    const st = D.textStyle(o);
    const size = o.size * (st.hoch || st.tief ? 0.7 : 1.0);
    ctx.font = cssFont(o.font, fontPx(size, s), st.fett, st.kursiv);
    ctx.fillStyle = rgbStr(o.farbe); ctx.textBaseline = "alphabetic";
    const lines = MW.textOf(o).split("\r");
    const fm = metrics(ctx, lines[0] || "0");
    const dy = st.hoch ? -0.25 * fm.h : st.tief ? 0.25 * fm.h : 0;
    ctx.save(); ctx.translate((ox + g[0]) * s, (oy + g[1]) * s);
    if (o.winkel) ctx.rotate(-o.winkel / 10.0 * Math.PI / 180);
    lines.forEach((line, i) => {
      const by = fm.asc + dy + i * fm.h;
      ctx.fillText(line, 0, by);
      if (st.unter) {
        const w = ctx.measureText(line).width; ctx.strokeStyle = ctx.fillStyle; ctx.setLineDash([]);
        ctx.lineWidth = Math.max(1, fontPx(size, s) / 16); ctx.beginPath(); ctx.moveTo(0, by + 2); ctx.lineTo(w, by + 2); ctx.stroke();
      }
    });
    if (o.exp_claude !== undefined) {
      const w = ctx.measureText(lines[0]).width;
      ctx.font = cssFont(o.font, fontPx(size * 0.7, s));
      ctx.fillText(String(o.exp_claude), w + 1, fm.asc * 0.55);
    }
    ctx.restore();
  } else if (k === "legende") {
    const x = (ox + g[0]) * s, y = (oy + g[1]) * s, h = g[3] * s;
    pen(ctx, o.farbe, o.stil !== 5 ? o.stil : 0, 2);
    ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + 0.9 * s, y + h / 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = cssFont("Arial", fontPx(10.0, s)); ctx.fillStyle = "#000"; ctx.textBaseline = "alphabetic";
    const fm = metrics(ctx, o.name || "0");
    ctx.fillText(o.name, x + 1.1 * s, y + (h + fm.asc - fm.desc) / 2);
  } else if (k === "bild") {
    const rec = image(o.data);
    const x = (ox + g[0]) * s, y = (oy + g[1]) * s, w = g[2] * s, h = g[3] * s;
    if (rec.img) ctx.drawImage(rec.img, x, y, w, h);
    else {
      ctx.strokeStyle = "#808080"; ctx.lineWidth = 1; ctx.setLineDash([4, 2]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
      ctx.fillStyle = "#808080"; ctx.font = "12px Arial"; ctx.textAlign = "center"; ctx.fillText(rec.failed ? "Bild" : "…", x + w / 2, y + h / 2); ctx.textAlign = "left";
    }
  }
}
D.draw = draw;
D.drawSelection = function (ctx, b, s, accent) {
  ctx.save(); ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.strokeRect(b[0] * s - 2, b[1] * s - 2, b[2] * s + 4, b[3] * s + 4); ctx.setLineDash([]);
  ctx.fillStyle = accent; ctx.fillRect((b[0] + b[2]) * s - 4, (b[1] + b[3]) * s - 4, 11, 11);
  ctx.restore();
};
D.bounds = function (o, ox = 0, oy = 0) {
  const g = o.g;
  if (o.k === "linie") {
    const x0 = Math.min(g[0], g[0] + g[2]), x1 = Math.max(g[0], g[0] + g[2]), y0 = Math.min(g[1], g[1] + g[3]), y1 = Math.max(g[1], g[1] + g[3]);
    return [ox + x0, oy + y0, x1 - x0, y1 - y0];
  }
  if (o.k === "text" && (o.winkel === 900 || o.winkel === 2700)) return [ox + g[0], oy + g[1] - g[2], g[3], g[2]];
  return [ox + g[0], oy + g[1], Math.max(g[2], 0.05), Math.max(g[3], 0.05)];
};
function segDist(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}
function kurvenAbstand(c, x, y) {
  let best = 1e9; const gx = c.g[0], gy = c.g[1];
  for (const k of c.kids) {
    if (k.k === "poly") {
      const pts = k.pts, step = Math.max(1, Math.floor(pts.length / 800)), px = gx + k.g[0], py = gy + k.g[1];
      for (let i = 0; i < pts.length - step; i += step) best = Math.min(best, segDist(x, y, px + pts[i][0], py + pts[i][1], px + pts[i + step][0], py + pts[i + step][1]));
    } else if (k.k === "marke") best = Math.min(best, Math.hypot(x - gx - k.g[0], y - gy - k.g[1]));
  }
  return best;
}
// tol: Trefferabstand in cm (mit dem Finger groesser als mit der Maus)
D.hit = function (objekte, x, y, tol = 0.2) {
  for (let i = objekte.length - 1; i >= 0; i--) {
    const o = objekte[i], b = D.bounds(o);
    if (!(b[0] - 0.1 <= x && x <= b[0] + b[2] + 0.1 && b[1] - 0.1 <= y && y <= b[1] + b[3] + 0.1)) continue;
    if (o.k === "chart") {
      const cx = x - o.g[0], cy = y - o.g[1]; let best = null;
      o.kids.forEach((c, j) => { if (c.k === "kurve") { const d = kurvenAbstand(c, cx, cy); if (d < tol && (!best || d < best[0])) best = [d, "kurve:" + j]; } });
      if (best) return [i, best[1]];
      for (let j = 0; j < o.kids.length; j++) {
        const c = o.kids[j];
        if (c.k === "achse") { const cb = D.bounds(c); if (cb[0] - 0.05 <= cx && cx <= cb[0] + cb[2] + 0.05 && cb[1] - 0.05 <= cy && cy <= cb[1] + cb[3] + 0.05) return [i, "achse:" + j]; }
      }
    }
    return [i, ""];
  }
  return [null, ""];
};
// Punkte jeder Kurve in Blatt-cm (fuer die Animation): Linienzug, sonst Mittelpunkte der Punktmarken, sonst Balkenoberkanten.
D.kurvenPunkte = function (chart) {
  const out = [];
  for (const c of chart.kids) {
    if (c.k !== "kurve") continue;
    const ox = chart.g[0] + c.g[0], oy = chart.g[1] + c.g[1];
    const linie = c.kids.find((k) => k.k === "poly" && !k.zu);
    if (linie) { out.push(linie.pts.map(([a, b]) => [ox + linie.g[0] + a, oy + linie.g[1] + b])); continue; }
    const marken = c.kids.filter((k) => k.k === "marke");
    if (marken.length) { out.push(marken.map((m) => [ox + m.g[0] + m.g[2] / 2, oy + m.g[1] + m.g[3] / 2])); continue; }
    const balken = c.kids.filter((k) => k.k === "poly" && k.zu && k.pts.length === 4);
    out.push(balken.map((b) => [ox + b.g[0] + (b.pts[1][0] + b.pts[2][0]) / 2, oy + b.g[1] + b.pts[1][1]]));
  }
  return out;
};
// Flussdiagramm (Grafisches Modell) zeichnen - wie male_fluss in mw_dialogs.py
D.maleFluss = function (ctx, g, dx = 0, dy = 0) {
  const box = (n) => {
    let b = n.box;
    if (!(b[4] > b[2] && b[5] > b[3])) b = [b[0], b[1], b[2], b[3], b[2] + b[4], b[3] + b[5]];
    return [b[2] + dx, b[3] + dy, b[4] - b[2], b[5] - b[3]];
  };
  ctx.font = "13px Arial, sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.setLineDash([]);
  for (const a of g.pfeile) {
    let pts = a.punkte.map(([x, y]) => [x + dx, y + dy]);
    if (pts.length < 2) continue;
    const fluss = a.verbindung[2] >= 0;
    if (fluss && a._typ === 255) pts = pts.slice().reverse();
    const col = fluss ? "#000" : "#0000a0";
    ctx.strokeStyle = col; ctx.lineWidth = fluss ? 3 : 1.2; ctx.lineCap = "butt"; ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    const [ax, ay] = pts[pts.length - 2], [bx, by] = pts[pts.length - 1];
    const ang = Math.atan2(by - ay, bx - ax), L = fluss ? 11 : 9;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(bx, by);
    for (const d of [0.38, -0.38]) ctx.lineTo(bx - L * Math.cos(ang + d), by - L * Math.sin(ang + d));
    ctx.closePath(); ctx.fill();
  }
  for (const n of g.zustand) {
    const [x, y, w, h] = box(n);
    ctx.fillStyle = "#ffffe0"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "#000"; ctx.lineWidth = 1.6; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#000"; ctx.fillText(n.name, x + w / 2, y + h / 2);
  }
  for (const n of g.rate) {
    const [x, y, w, h] = box(n); const cx = x + w / 2, cy = y + h / 2, r = Math.min(h / 2, 15), q = r * 0.6;
    ctx.fillStyle = "#e0f0ff"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - q, cy - q); ctx.lineTo(cx + q, cy + q); ctx.moveTo(cx - q, cy + q); ctx.lineTo(cx + q, cy - q); ctx.stroke();
    ctx.fillStyle = "#000"; ctx.fillText(n.name, cx, cy + r + 9);
  }
  for (const n of g.konstante) {
    const [x, y, w, h] = box(n);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1.2; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#000"; ctx.fillText(n.name, x + w / 2, y + h / 2);
  }
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
};
root.MWDraw = D;
})(typeof window !== "undefined" ? window : globalThis);
