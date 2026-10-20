/* Puente mínimo y seguro entre la interfaz web y el proceso principal */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('inercadDesktop', {
  isDesktop: true,
  printPDF: (suggestedName) => ipcRenderer.invoke('print-pdf', suggestedName),
  onOpenDoc: (cb) => ipcRenderer.on('open-doc', (e, payload) => cb(payload)),
  ready: () => ipcRenderer.send('renderer-ready'),
});
