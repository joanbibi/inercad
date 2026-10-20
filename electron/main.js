/* InerCAD · proceso principal de Electron (versión de escritorio).
 * La interfaz es exactamente la misma que la versión web: se carga index.html. */
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'build', 'icon.png');
let win = null;
let pendingFile = null;
let rendererReady = false;

const fileFromArgs = (argv) => argv.slice(1).find((a) => /\.(inercad)$/i.test(a) && fs.existsSync(a)) || null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const f = fileFromArgs(argv);
    if (f) openFile(f);
  });
}

function openFile(file) {
  if (!rendererReady || !win) { pendingFile = file; return; }
  try {
    const text = fs.readFileSync(file, 'utf8');
    win.webContents.send('open-doc', { name: path.basename(file), text });
  } catch (err) {
    dialog.showErrorBox('InerCAD', `No se pudo abrir el archivo:\n${file}\n\n${err.message}`);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: 'InerCAD', backgroundColor: '#1b1e21', show: false, icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(ROOT, 'index.html'));

  // Prueba de humo (npm run desktop:smoke): carga la app, calcula un IPE 300 y sale con código 0/1
  if (process.argv.includes('--smoke-test')) {
    win.webContents.on('console-message', (e) => { if (e.level === 'error') console.error('[renderer error]', e.message); });
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const out = await win.webContents.executeJavaScript(`(async () => {
          const ex = Catalog.examples.find((e) => e.id === 'ipe300');
          App.replaceDoc({ name: 'smoke', unit: 'mm', shapes: ex.build() });
          await new Promise((r) => setTimeout(r, 600));
          Report.open();
          await new Promise((r) => setTimeout(r, 500));
          return JSON.stringify({ desktop: !!window.inercadDesktop, A: App.res.A, Ix: App.res.Ixc, Zx: App.res.Zx, canvas: !!document.getElementById('cv') });
        })()`);
        const r = JSON.parse(out);
        const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
        const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
        try {
          win.setBackgroundColor('#ffffff'); // el PDF sale sobre papel blanco: se simula para la captura
          win.webContents.debugger.attach('1.3');
          await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
          await new Promise((r) => setTimeout(r, 400));
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(require('os').tmpdir(), 'inercad-print-media.png'), img.toPNG());
        } catch (err) { console.error('print-media capture failed', err.message); }
        const pdfPath = path.join(require('os').tmpdir(), 'inercad-smoke.pdf');
        fs.writeFileSync(pdfPath, pdf);
        console.log('SMOKE', out, 'pdfBytes=' + pdf.length, 'pdfPages=' + pages, pdfPath);
        process.exit(r.desktop && Math.abs(r.Ix / 8.356e7 - 1) < 0.002 && pdf.length > 20000 ? 0 : 1);
      } catch (err) { console.error('SMOKE FAIL', err); process.exit(1); }
    });
  }

  // Nada de navegar fuera de la aplicación: los enlaces externos se abren en el navegador del sistema
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.on('closed', () => { win = null; rendererReady = false; });
}

function buildMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [{ role: 'quit', label: 'Salir' }],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño de la interfaz: 100 %' },
        { role: 'zoomIn', label: 'Ampliar interfaz', accelerator: 'CommandOrControl+Shift+=' },
        { role: 'zoomOut', label: 'Reducir interfaz', accelerator: 'CommandOrControl+Shift+-' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Sitio web de InerCAD', click: () => shell.openExternal('https://inercad.es/') },
        { label: 'Apoyar InerCAD…', click: () => shell.openExternal('https://inercad.es/#apoyar') },
        { type: 'separator' },
        {
          label: 'Acerca de InerCAD',
          click: () => dialog.showMessageBox(win, {
            type: 'info', title: 'InerCAD', message: `InerCAD ${app.getVersion()}`,
            detail: 'Calculadora interactiva de propiedades geométricas y momentos de inercia de secciones planas.\n\nCálculo exacto por el teorema de Green.',
            buttons: ['Cerrar'], icon: ICON,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* PDF directo del informe (usa los estilos de impresión de la página) */
ipcMain.handle('print-pdf', async (e, suggested) => {
  if (!win) return { ok: false };
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Guardar informe como PDF', defaultPath: suggested || 'informe.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  const data = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(filePath, data);
  return { ok: true, filePath };
});

ipcMain.on('renderer-ready', () => {
  rendererReady = true;
  if (pendingFile) { const f = pendingFile; pendingFile = null; openFile(f); }
});

app.whenReady().then(() => {
  buildMenu();
  pendingFile = fileFromArgs(process.argv);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
