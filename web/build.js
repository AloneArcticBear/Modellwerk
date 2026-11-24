//claude
// Baut die Web-App aus den Quelldateien (Skripte und Stil inline, eine Datei):
//   dist/modellwerk_claude.html  - Fassung fuer claude.ai (Artifact: ohne <html>/<head>/<body>)
//   ../docs/index.html           - normale Webseite, z. B. fuer GitHub Pages, mit Beispielen und Symbolen
// Aufruf:  node build.js
const fs = require("fs"), path = require("path");
const lies = (f) => fs.readFileSync(path.join(__dirname, "src", f), "utf8");
const js = ["core.js", "icons.js", "draw.js", "ui.js", "dialogs.js", "app.js"].map(lies).join("\n");
const css = lies("style.css");
const meta = `<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Modellwerk">
<meta name="theme-color" content="#d4d0c8">`;
const rumpf = `<div id="app" class="klassisch" lang="de"><p style="padding:16px;font:15px/1.4 Arial,sans-serif">Modellwerk wird geladen …<br>Bleibt diese Meldung stehen, ist der Browser zu alt – bitte iPadOS/Safari aktualisieren.</p></div>
<script>${js.replace(/<\/script/gi, "<\\/script")}
(function () {
  try {
    document.getElementById("app").textContent = "";
    const app = new MWApp(document.getElementById("app"));
    window.mwApp = app;
    app.start().then(() => app.fit());
  } catch (e) {
    document.getElementById("app").textContent = "Modellwerk konnte nicht starten: " + e.message;
  }
})();
</script>`;

// 1) Fassung fuer claude.ai
const artifact = `<title>Modellwerk für iPad</title>\n${meta}\n<style>${css}</style>\n${rumpf}`;
fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "dist", "modellwerk_claude.html"), artifact);

// 2) normale Webseite
const seite = `<!doctype html><!--claude-->
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Modellwerk</title>
<meta name="description" content="Modellbildung und Simulation für die Schule – liest und schreibt Moebius-Dateien (.prg).">
${meta}
<link rel="icon" type="image/png" href="modellwerk_icon_claude.png">
<link rel="apple-touch-icon" href="modellwerk_touch_icon_claude.png">
<style>html,body{margin:0;height:100%;background:#d4d0c8}
${css}</style>
</head>
<body>
${rumpf}
</body>
</html>
`;
const DOCS = path.join(__dirname, "..", "docs");
fs.mkdirSync(path.join(DOCS, "beispiele"), { recursive: true });
fs.writeFileSync(path.join(DOCS, "index.html"), seite);
// Beispiele: im Repo aus mac/beispiele_claude, beim Entwickeln aus dist/beispiele
const bsp = [path.join(__dirname, "..", "mac", "beispiele_claude"), path.join(__dirname, "dist", "beispiele")].find((d) => fs.existsSync(d));
if (bsp) {
  for (const f of fs.readdirSync(bsp).filter((n) => n.endsWith(".json"))) {
    fs.copyFileSync(path.join(bsp, f), path.join(DOCS, "beispiele", f));
    const d = path.join(__dirname, "dist", "beispiele");
    if (path.resolve(bsp) !== path.resolve(d)) { fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(path.join(bsp, f), path.join(d, f)); }
  }
}
for (const f of ["modellwerk_icon_claude.png", "modellwerk_touch_icon_claude.png"]) {
  const q = path.join(__dirname, "assets", f);
  if (fs.existsSync(q)) fs.copyFileSync(q, path.join(DOCS, f));
}
console.log("gebaut:", artifact.length, "Zeichen (claude.ai),", seite.length, "Zeichen (Webseite)");
