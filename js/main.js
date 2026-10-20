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
