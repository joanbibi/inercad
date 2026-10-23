/* InerCAD · arranque */
(function () {
  'use strict';
  UI.init();
  View.init(document.getElementById('cv'), document.getElementById('stage'));
  Panels.init();

  const restored = App.restoreAutosave();
  if (!restored) {
    App.touch();
    View.fit(null, true);
  }
  App.resetHistory();

  // Enlace directo a un perfil del catálogo (app/?perfil=ipe-300, desde las fichas de la web).
  // Sustituye el documento como un ejemplo: el trabajo anterior se recupera con Deshacer.
  const perfil = new URLSearchParams(location.search).get('perfil');
  const item = perfil && Catalog.findBySlug(perfil);
  if (item) {
    App.replaceDoc({ name: item.n, unit: 'mm', shapes: [Catalog.makeShape(item, { color: Shapes.COLORS[0] })] });
    if (restored) UI.toast(`Perfil abierto: ${item.n}`, 'ok', { action: { label: 'Deshacer', run: App.undo } });
  }
  if (perfil) history.replaceState(null, '', location.pathname);

  document.getElementById('projName').value = App.doc.name;
  document.getElementById('unitSel').value = App.doc.unit;
  document.getElementById('cv').focus();

  // Versión de escritorio (Electron): abrir archivos .inercad desde el sistema
  if (window.inercadDesktop) {
    document.documentElement.classList.add('desktop');
    window.inercadDesktop.onOpenDoc((p) => UI.openText(p.text, p.name));
    window.inercadDesktop.ready();
  }
})();
