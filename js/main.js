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

  // Enlaces directos desde la web. Sustituyen el documento como un ejemplo: el trabajo anterior se recupera con Deshacer.
  //   app/?perfil=ipe-300                    un perfil del catálogo (fichas de perfiles)
  //   app/?forma=rect&w=150&h=300            una forma paramétrica con sus medidas en mm (páginas de fórmulas)
  const qs = new URLSearchParams(location.search);
  const perfil = qs.get('perfil'), forma = qs.get('forma');
  const item = perfil && Catalog.findBySlug(perfil);
  const type = forma && forma !== 'polygon' && Object.prototype.hasOwnProperty.call(Shapes.TYPES, forma) ? Shapes.TYPES[forma] : null;
  if (item) {
    App.replaceDoc({ name: item.n, unit: 'mm', shapes: [Catalog.makeShape(item, { color: Shapes.COLORS[0] })] });
    if (restored) UI.toast(`Perfil abierto: ${item.n}`, 'ok', { action: { label: 'Deshacer', run: App.undo } });
  } else if (type) {
    const p = {};
    for (const d of type.params) {   // solo los parámetros de la forma, y solo números; create() los ajusta a sus límites
      const v = parseFloat(qs.get(d.k));
      if (Number.isFinite(v)) p[d.k] = v;
    }
    App.replaceDoc({ name: type.label, unit: 'mm', shapes: [Shapes.create(forma, { p, color: Shapes.COLORS[0] })] });
    if (restored) UI.toast(`Sección abierta: ${type.label}`, 'ok', { action: { label: 'Deshacer', run: App.undo } });
  }
  if (perfil || forma) history.replaceState(null, '', location.pathname);

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
