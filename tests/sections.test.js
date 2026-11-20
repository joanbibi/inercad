/* Tests de las fórmulas de las páginas de secciones contra el motor: node tests/sections.test.js
 * Cada fórmula cerrada publicada en secciones/ debe coincidir con InerCAD para el ejemplo de la página
 * y para medidas distintas (incluidas proporciones extremas). */
'use strict';
const P = require('../tools/section-pages.js');
let pass = 0, fail = 0;

// varias medidas por sección, además del ejemplo publicado
const CASES = {
  rectangular: [{ w: 40, h: 10 }, { w: 7, h: 300 }],
  'rectangular-hueca': [{ w: 300, h: 120, t: 12 }, { w: 50, h: 50, t: 2 }],
  circular: [{ d: 1 }, { d: 1234 }],
  'tubo-circular': [{ d: 500, t: 200 }, { d: 21.3, t: 2.6 }],
  triangular: [{ b: 400, h: 30 }, { b: 10, h: 90 }],
  trapecio: [{ b: 100, b2: 260, h: 80 }, { b: 500, b2: 20, h: 300 }],
  semicirculo: [{ d: 10 }, { d: 900 }],
  'seccion-t': [{ b: 1200, tf: 150, h: 600, tw: 300 }, { b: 60, tf: 6, h: 60, tw: 6 }],
  'doble-t': [{ h: 500, b: 300, tf: 28, tw: 14.5 }, { h: 100, b: 100, tf: 10, tw: 6 }],
  'angular-l': [{ h: 100, b: 100, t: 10 }, { h: 50, b: 150, t: 8 }, { h: 200, b: 100, t: 30 }],
  'canal-u': [{ h: 300, b: 100, tf: 16, tw: 10 }, { h: 80, b: 45, tf: 8, tw: 6 }],
};

for (const sec of P.SECTIONS) {
  const cases = [sec.ex].concat(CASES[sec.slug] || []);
  if (!CASES[sec.slug]) { fail++; console.log(`  ✗ ${sec.slug}: sin casos de prueba adicionales`); }
  for (const p of cases) {
    const bad = P.check(sec, p);
    if (bad.length) { fail++; console.log(`  ✗ ${JSON.stringify(p)}\n    ${bad.join('\n    ')}`); } else pass++;
  }
}

// las páginas se generan y cada una enlaza la app con su forma
const pages = P();
for (const sec of P.SECTIONS) {
  const pg = pages.find((x) => x.url === `secciones/${sec.slug}.html`);
  if (pg && pg.html.includes(`app/?forma=${sec.type}&amp;`)) pass++; else { fail++; console.log(`  ✗ ${sec.slug}: falta la página o el enlace a la app`); }
}
if (pages.some((x) => x.url === 'secciones/')) pass++; else { fail++; console.log('  ✗ falta el índice secciones/'); }

console.log(`• Fórmulas de secciones: ${pass} correctos, ${fail} fallos`);
process.exit(fail ? 1 : 0);
