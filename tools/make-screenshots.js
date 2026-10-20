/* InerCAD · capturas de pantalla reales para el sitio web (site/assets/screens/*.jpg)
 * Abre la propia aplicación en una ventana de Electron, prepara cada escena y la captura a 2×.
 * Uso: npm run screenshots   (equivale a: electron tools/make-screenshots.js) */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'site', 'assets', 'screens');
app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'inercad-shots-'))); // sin autoguardado previo

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Cada escena: nombre de archivo y script que deja la aplicación en el estado deseado */
const SCENES = [
  {
    name: 'principal',
    js: `(async () => {
      App.setSetting('theme', 'dark'); App.setSetting('principal', true); App.setSetting('ellipse', true);
      App.setSetting('hud', true); App.setSetting('hudMin', true); App.setSetting('hudPos', null);
      const ex = Catalog.examples.find((e) => e.id === 'plated');
      App.replaceDoc({ name: ex.name, unit: 'mm', shapes: ex.build() });
      Panels.showTab('res'); App.select([]);
    })()`,
  },
  {
    name: 'ejes',
    js: `(async () => {
      App.setSetting('theme', 'dark'); App.setSetting('principal', true); App.setSetting('ellipse', true);
      const ex = Catalog.examples.find((e) => e.id === 'angle');
      App.replaceDoc({ name: ex.name, unit: 'mm', shapes: ex.build() });
      App.doc.ref.show = true; App.doc.ref.theta = 25; App.emit('ref');
      Panels.showTab('axes'); App.select([]);
    })()`,
  },
  {
    name: 'edicion-claro',
    js: `(async () => {
      App.setSetting('theme', 'light'); App.setSetting('principal', false); App.setSetting('ellipse', false);
      const ex = Catalog.examples.find((e) => e.id === 'box');
      App.replaceDoc({ name: ex.name, unit: 'mm', shapes: ex.build() });
      Panels.showTab('props'); App.select([App.doc.shapes[1].id]);
    })()`,
  },
  {
    name: 'huecos',
    js: `(async () => {
      App.setSetting('hudMin', true);
      App.setSetting('theme', 'dark'); App.setSetting('principal', true); App.setSetting('ellipse', false);
      const ex = Catalog.examples.find((e) => e.id === 'hole');
      App.replaceDoc({ name: ex.name, unit: 'mm', shapes: ex.build() });
      Panels.showTab('table'); App.select([]);
    })()`,
  },
  {
    name: 'catalogo',
    js: `(async () => {
      App.setSetting('theme', 'dark'); App.setSetting('principal', false); App.setSetting('ellipse', false);
      const ex = Catalog.examples.find((e) => e.id === 'ipe300');
      App.replaceDoc({ name: ex.name, unit: 'mm', shapes: ex.build() });
      Panels.showTab('res'); App.select([]);
      UI.openCatalog();
      const inp = document.querySelector('.cat-search'); inp.value = 'HEB'; inp.dispatchEvent(new Event('input'));
    })()`,
  },
  {
    name: 'informe',
    js: `(async () => {
      App.setSetting('theme', 'light'); App.setSetting('principal', false); App.setSetting('ellipse', false);
      const ex = Catalog.examples.find((e) => e.id === 'plated');
      App.replaceDoc({ name: ex.name, unit: 'mm', shapes: ex.build() });
      Panels.showTab('res'); App.select([]);
      await new Promise((r) => setTimeout(r, 1500));
      Report.open();
    })()`,
  },
];

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1280, height: 800, show: true, useContentSize: true, enableLargerThanScreen: true, resizable: false, backgroundColor: '#1b1e21',
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false },
  });
  win.setContentSize(1280, 800);
  await win.loadFile(path.join(ROOT, 'index.html'));
  // densidad 2×: capturas nítidas en pantallas retina
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);
  for (const sc of SCENES) {
    await win.webContents.executeJavaScript('document.querySelectorAll(".modal-back").forEach((m) => m.remove()); 0');
    await win.webContents.executeJavaScript(sc.js);
    await sleep(2200);
    // captura a 2× con el protocolo de depuración (capturePage no escala en modo offscreen)
    const shot = await win.webContents.debugger.sendCommand('Page.captureScreenshot', {
      format: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1280, height: 800, scale: 2 },
    });
    fs.writeFileSync(path.join(OUT, sc.name + '.jpg'), Buffer.from(shot.data, 'base64'));
    console.log(sc.name, 'ok');
  }
  app.quit();
});
