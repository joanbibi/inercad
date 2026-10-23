/* InerCAD · Catálogo de perfiles normalizados y ejemplos
 * Las dimensiones son nominales (mm). Los valores "ref" son los de tablas
 * (A en mm², I en mm⁴) y se usan en los tests para validar el motor.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shapes.js'));
  else root.Catalog = factory(root.Shapes);
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  /* [nombre, h, b, tw, tf, r, A(cm²), Iy(cm⁴)] */
  const IPE = [
    ['IPE 80', 80, 46, 3.8, 5.2, 5, 7.64, 80.1], ['IPE 100', 100, 55, 4.1, 5.7, 7, 10.3, 171],
    ['IPE 120', 120, 64, 4.4, 6.3, 7, 13.2, 318], ['IPE 140', 140, 73, 4.7, 6.9, 7, 16.4, 541],
    ['IPE 160', 160, 82, 5.0, 7.4, 9, 20.1, 869], ['IPE 180', 180, 91, 5.3, 8.0, 9, 23.9, 1317],
    ['IPE 200', 200, 100, 5.6, 8.5, 12, 28.5, 1943], ['IPE 220', 220, 110, 5.9, 9.2, 12, 33.4, 2772],
    ['IPE 240', 240, 120, 6.2, 9.8, 15, 39.1, 3892], ['IPE 270', 270, 135, 6.6, 10.2, 15, 45.9, 5790],
    ['IPE 300', 300, 150, 7.1, 10.7, 15, 53.8, 8356], ['IPE 330', 330, 160, 7.5, 11.5, 18, 62.6, 11770],
    ['IPE 360', 360, 170, 8.0, 12.7, 18, 72.7, 16270], ['IPE 400', 400, 180, 8.6, 13.5, 21, 84.5, 23130],
    ['IPE 450', 450, 190, 9.4, 14.6, 21, 98.8, 33740], ['IPE 500', 500, 200, 10.2, 16.0, 21, 116, 48200],
    ['IPE 550', 550, 210, 11.1, 17.2, 24, 134, 67120], ['IPE 600', 600, 220, 12.0, 19.0, 24, 156, 92080],
  ];
  const HEA = [
    ['HEA 100', 96, 100, 5, 8, 12, 21.2, 349.2], ['HEA 120', 114, 120, 5, 8, 12, 25.3, 606.2],
    ['HEA 140', 133, 140, 5.5, 8.5, 12, 31.4, 1033], ['HEA 160', 152, 160, 6, 9, 15, 38.8, 1673],
    ['HEA 180', 171, 180, 6, 9.5, 15, 45.3, 2510], ['HEA 200', 190, 200, 6.5, 10, 18, 53.8, 3692],
    ['HEA 220', 210, 220, 7, 11, 18, 64.3, 5410], ['HEA 240', 230, 240, 7.5, 12, 21, 76.8, 7763],
    ['HEA 260', 250, 260, 7.5, 12.5, 24, 86.8, 10450], ['HEA 280', 270, 280, 8, 13, 24, 97.3, 13670],
    ['HEA 300', 290, 300, 8.5, 14, 27, 112.5, 18260], ['HEA 320', 310, 300, 9, 15.5, 27, 124.4, 22930],
    ['HEA 340', 330, 300, 9.5, 16.5, 27, 133.5, 27690], ['HEA 360', 350, 300, 10, 17.5, 27, 142.8, 33090],
    ['HEA 400', 390, 300, 11, 19, 27, 159, 45070], ['HEA 450', 440, 300, 11.5, 21, 27, 178, 63720],
    ['HEA 500', 490, 300, 12, 23, 27, 197.5, 86970], ['HEA 600', 590, 300, 13, 25, 27, 226.5, 141200],
  ];
  const HEB = [
    ['HEB 100', 100, 100, 6, 10, 12, 26.0, 449.5], ['HEB 120', 120, 120, 6.5, 11, 12, 34.0, 864.4],
    ['HEB 140', 140, 140, 7, 12, 12, 43.0, 1509], ['HEB 160', 160, 160, 8, 13, 15, 54.3, 2492],
    ['HEB 180', 180, 180, 8.5, 14, 15, 65.3, 3831], ['HEB 200', 200, 200, 9, 15, 18, 78.1, 5696],
    ['HEB 220', 220, 220, 9.5, 16, 18, 91.0, 8091], ['HEB 240', 240, 240, 10, 17, 21, 106, 11260],
    ['HEB 260', 260, 260, 10, 17.5, 24, 118.4, 14920], ['HEB 280', 280, 280, 10.5, 18, 24, 131.4, 19270],
    ['HEB 300', 300, 300, 11, 19, 27, 149.1, 25170], ['HEB 320', 320, 300, 11.5, 20.5, 27, 161.3, 30820],
    ['HEB 340', 340, 300, 12, 21.5, 27, 170.9, 36660], ['HEB 360', 360, 300, 12.5, 22.5, 27, 180.6, 43190],
    ['HEB 400', 400, 300, 13.5, 24, 27, 197.8, 57680], ['HEB 450', 450, 300, 14, 26, 27, 218, 79890],
    ['HEB 500', 500, 300, 14.5, 28, 27, 238.6, 107200], ['HEB 600', 600, 300, 15.5, 30, 27, 270, 171000],
  ];
  /* Angulares de alas iguales [nombre, a, t, r1, r2, A(cm²), I(cm⁴)] */
  const LEQ = [
    ['L 40×40×4', 40, 4, 6, 3, 3.08, 4.47], ['L 50×50×5', 50, 5, 7, 3.5, 4.80, 11.0],
    ['L 60×60×6', 60, 6, 8, 4, 6.91, 22.8], ['L 70×70×7', 70, 7, 9, 4.5, 9.40, 42.4],
    ['L 80×80×8', 80, 8, 10, 5, 12.3, 72.3], ['L 90×90×9', 90, 9, 11, 5.5, 15.5, 116],
    ['L 100×100×10', 100, 10, 12, 6, 19.2, 177], ['L 120×120×12', 120, 12, 13, 6.5, 27.5, 368],
    ['L 150×150×15', 150, 15, 16, 8, 43.0, 898], ['L 200×200×20', 200, 20, 18, 9, 76.3, 2850],
  ];
  const CHS = [
    [33.7, 3.2], [42.4, 3.2], [48.3, 3.2], [60.3, 3.2], [76.1, 3.2], [88.9, 4], [114.3, 4.5],
    [139.7, 5], [168.3, 5], [193.7, 6.3], [219.1, 6.3], [273, 8], [323.9, 8],
  ];
  const SHS = [[40, 3], [50, 4], [60, 4], [80, 5], [100, 5], [120, 6.3], [150, 8], [200, 10]];
  const RHS = [[80, 40, 4], [100, 50, 5], [120, 60, 5], [150, 100, 6.3], [200, 100, 8], [250, 150, 10]];

  const fmt = (v) => String(v).replace('.', ',');

  function iSeries(id, label, rows) {
    return {
      id, label, type: 'ibeam',
      items: rows.map((r) => ({
        n: r[0], type: 'ibeam',
        p: { h: r[1], b: r[2], tw: r[3], tf: r[4], r: r[5] },
        ref: { A: r[6] * 100, Iy: r[7] * 1e4 },
      })),
    };
  }

  const series = [
    iSeries('IPE', 'IPE · Viga europea', IPE),
    iSeries('HEA', 'HEA · Ala ancha (ligera)', HEA),
    iSeries('HEB', 'HEB · Ala ancha (normal)', HEB),
    {
      id: 'L', label: 'L · Angular de alas iguales', type: 'angle',
      items: LEQ.map((r) => ({
        n: r[0], type: 'angle',
        p: { h: r[1], b: r[1], t: r[2], r1: r[3], r2: r[4] },
        ref: { A: r[5] * 100, Iy: r[6] * 1e4 },
      })),
    },
    {
      id: 'CHS', label: 'CHS · Tubo circular', type: 'ring',
      items: CHS.map((r) => ({ n: `CHS ${fmt(r[0])}×${fmt(r[1])}`, type: 'ring', p: { d: r[0], t: r[1] } })),
    },
    {
      id: 'SHS', label: 'SHS · Tubo cuadrado (r ext. = 2t)', type: 'rhs',
      items: SHS.map((r) => ({ n: `SHS ${r[0]}×${r[0]}×${fmt(r[1])}`, type: 'rhs', p: { w: r[0], h: r[0], t: r[1], r: 2 * r[1] } })),
    },
    {
      id: 'RHS', label: 'RHS · Tubo rectangular (r ext. = 2t)', type: 'rhs',
      // designación h×b×t: el canto (h) en vertical, como en las tablas
      items: RHS.map((r) => ({ n: `RHS ${r[0]}×${r[1]}×${fmt(r[2])}`, type: 'rhs', p: { w: r[1], h: r[0], t: r[2], r: 2 * r[2] } })),
    },
  ];

  function makeShape(item, opts) {
    return S.create(item.type, Object.assign({ name: item.n, p: item.p }, opts || {}));
  }

  /* Identificador para URL: «IPE 300» → ipe-300, «CHS 48,3×3,2» → chs-48-3x3-2 */
  const slug = (n) => n.toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9x]+/g, '-').replace(/^-+|-+$/g, '');
  function findBySlug(s) {
    for (const ser of series) for (const it of ser.items) if (slug(it.n) === s) return it;
    return null;
  }

  /* ---------- Ejemplos ---------- */
  const R = (name, w, h, x, y, extra) => S.create('rect', Object.assign({ name, x, y, p: { w, h } }, extra || {}));

  const examples = [
    {
      id: 'ipe300', name: 'Viga IPE 300', desc: 'Perfil laminado en I con acuerdos',
      build() { return [makeShape(series[0].items.find((i) => i.n === 'IPE 300'), { color: S.COLORS[0] })]; },
    },
    {
      id: 'tee', name: 'Sección en T compuesta', desc: 'Dos rectángulos: ala y alma',
      build() {
        return [
          R('Ala', 300, 60, 0, 270, { color: S.COLORS[0] }),
          R('Alma', 60, 240, 0, 120, { color: S.COLORS[1] }),
        ];
      },
    },
    {
      id: 'plated', name: 'IPE 300 con platabanda', desc: 'Perfil I reforzado con una placa superior',
      build() {
        return [
          makeShape(series[0].items.find((i) => i.n === 'IPE 300'), { color: S.COLORS[0] }),
          R('Platabanda', 200, 15, 0, 157.5, { color: S.COLORS[2] }),
        ];
      },
    },
    {
      id: 'box', name: 'Cajón con refuerzo superior', desc: 'Tubo rectangular y placa',
      build() {
        return [
          S.create('rhs', { name: 'Cajón', p: { w: 300, h: 200, t: 12, r: 24 }, color: S.COLORS[3] }),
          R('Placa', 400, 20, 0, 110, { color: S.COLORS[2] }),
        ];
      },
    },
    {
      id: 'hole', name: 'Placa con agujero excéntrico', desc: 'Rectángulo menos un círculo (hueco)',
      build() {
        return [
          R('Placa', 300, 200, 0, 0, { color: S.COLORS[0] }),
          S.create('circle', { name: 'Agujero', mode: 'sub', x: 50, y: 25, p: { d: 90 } }),
        ];
      },
    },
    {
      id: 'built', name: 'Viga armada en I', desc: 'Dos alas y un alma soldadas',
      build() {
        return [
          R('Ala superior', 300, 20, 0, 260, { color: S.COLORS[0] }),
          R('Alma', 12, 500, 0, 0, { color: S.COLORS[1] }),
          R('Ala inferior', 200, 20, 0, -260, { color: S.COLORS[4] }),
        ];
      },
    },
    {
      id: 'angle', name: 'Angular desigual 150×90×12', desc: 'Sección sin ejes de simetría (ejes principales girados)',
      build() { return [S.create('angle', { name: 'L 150×90×12', p: { h: 150, b: 90, t: 12, r1: 12, r2: 6 }, color: S.COLORS[5] })]; },
    },
  ];

  return { series, examples, makeShape, slug, findBySlug };
});
