/* Tests del motor de InerCAD: node tests/engine.test.js */
'use strict';
const E = require('../js/engine.js');
const S = require('../js/shapes.js');
const C = require('../js/profiles.js');

let pass = 0, fail = 0;
function close(actual, expected, tol, label) {
  const ref = Math.max(Math.abs(expected), 1e-12);
  const err = Math.abs(actual - expected) / ref;
  const ok = err <= tol || Math.abs(actual - expected) < 1e-9;
  if (ok) pass++; else { fail++; console.log(`  ✗ ${label}: obtenido ${actual}, esperado ${expected} (error rel. ${err.toExponential(2)})`); }
  return ok;
}
function group(name, fn) { console.log('• ' + name); fn(); }

const R = (w, h, o) => S.create('rect', Object.assign({ p: { w, h } }, o || {}));
const an = (shapes, o) => S.analyze(shapes, o);
const PI = Math.PI;

group('Rectángulo', () => {
  const r = an([R(200, 300)]);
  close(r.A, 60000, 1e-12, 'A');
  close(r.Ixc, 200 * 300 ** 3 / 12, 1e-12, 'Ix');
  close(r.Iyc, 300 * 200 ** 3 / 12, 1e-12, 'Iy');
  close(Math.abs(r.Ixyc) / r.Ixc + 1, 1, 1e-12, 'Ixy = 0');
  close(r.Zx, 200 * 300 ** 2 / 4, 1e-6, 'Zx plástico');
  close(r.Zy, 300 * 200 ** 2 / 4, 1e-6, 'Zy plástico');
});

group('Círculo, elipse, tubo', () => {
  const c = an([S.create('circle', { p: { d: 100 } })]);
  close(c.Ixc, PI * 100 ** 4 / 64, 1e-12, 'Ix círculo');
  close(c.A, PI * 2500, 1e-12, 'A círculo');
  close(c.Zx, 100 ** 3 / 6, 1e-5, 'Z plástico círculo');
  const e = an([S.create('ellipse', { p: { w: 200, h: 80 } })]);
  close(e.Ixc, PI * 100 * 40 ** 3 / 4, 1e-12, 'Ix elipse');
  close(e.Iyc, PI * 40 * 100 ** 3 / 4, 1e-12, 'Iy elipse');
  const t = an([S.create('ring', { p: { d: 100, t: 10 } })]);
  close(t.Ixc, PI * (100 ** 4 - 80 ** 4) / 64, 1e-12, 'Ix tubo');
  close(t.A, PI * (100 ** 2 - 80 ** 2) / 4, 1e-12, 'A tubo');
});

group('Triángulo, semicírculo, cuarto de círculo', () => {
  const tr = an([S.create('triangle', { p: { b: 120, h: 90, ox: 30 } })]);
  close(tr.A, 120 * 90 / 2, 1e-12, 'A triángulo');
  close(tr.Ixc, 120 * 90 ** 3 / 36, 1e-12, 'Ix triángulo');
  close(tr.yc, -45 + 30, 1e-12, 'ȳ triángulo (h/3 desde la base)');
  const sc = an([S.create('semicircle', { p: { d: 200 } })]);
  const r = 100;
  close(sc.Ixc, (PI / 8 - 8 / (9 * PI)) * r ** 4, 1e-12, 'Ix semicírculo');
  close(sc.Iyc, PI * r ** 4 / 8, 1e-12, 'Iy semicírculo');
  close(sc.yc - (-r / 2), 4 * r / (3 * PI), 1e-12, 'ȳ semicírculo');
  const q = an([S.create('quarter', { p: { r: 100 } })]);
  close(q.Ixc, (PI / 16 - 4 / (9 * PI)) * 100 ** 4, 1e-12, 'Ix cuarto');
  close(q.Ixyc, (1 / 8 - 4 / (9 * PI)) * 100 ** 4, 1e-12, 'Ixy cuarto (centroidal)');
});

group('Sector y segmento circular', () => {
  const a = 70 * PI / 180, r = 80;
  const sec = an([S.create('sector', { p: { r, a: 70 } })]);
  close(sec.A, r * r * a / 2, 1e-12, 'A sector');
  close(sec.Ix0, r ** 4 / 8 * (a - Math.sin(a)), 1e-12, 'Ix0 sector');
  close(sec.Iy0, r ** 4 / 8 * (a + Math.sin(a)), 1e-12, 'Iy0 sector');
  const seg = an([S.create('segment', { p: { r, a: 70 } })]);
  close(seg.A, r * r * (a - Math.sin(a)) / 2, 1e-12, 'A segmento');
  // Ix0 del segmento = sector − triángulo (vértice en el centro)
  const hh = a / 2;
  const IxSeg = r ** 4 / 8 * (a - Math.sin(a)) - r ** 4 * Math.cos(hh) * Math.sin(hh) ** 3 / 6;
  close(seg.Ix0, IxSeg, 1e-10, 'Ix0 segmento');
});

group('Compuestas y huecos', () => {
  // T: alas 300x60 sobre alma 60x240
  const t = an([R(300, 60, { x: 0, y: 270 }), R(60, 240, { x: 0, y: 120 })]);
  const A = 300 * 60 + 60 * 240;
  const yc = (300 * 60 * 270 + 60 * 240 * 120) / A;
  close(t.A, A, 1e-12, 'A T');
  close(t.yc, yc, 1e-12, 'ȳ T');
  const Ix = 300 * 60 ** 3 / 12 + 300 * 60 * (270 - yc) ** 2 + 60 * 240 ** 3 / 12 + 60 * 240 * (120 - yc) ** 2;
  close(t.Ixc, Ix, 1e-12, 'Ix T (Steiner)');
  // Placa con agujero
  const h = an([R(300, 200), S.create('circle', { mode: 'sub', x: 50, y: 25, p: { d: 90 } })]);
  close(h.A, 60000 - PI * 45 ** 2, 1e-12, 'A placa hueca');
  const IxH = 300 * 200 ** 3 / 12 - (PI * 90 ** 4 / 64 + PI * 45 ** 2 * 25 ** 2);
  close(h.Ix0, IxH, 1e-12, 'Ix0 placa hueca');
  const sum = h.items.reduce((s, i) => s + i.A, 0);
  close(sum, h.A, 1e-12, 'suma de áreas de ítems');
});

group('Rectángulo girado y ejes principales', () => {
  const th = 30 * PI / 180;
  const w = 200, hh = 60;
  const r = an([R(w, hh, { rot: 30 })]);
  const Ix = w * hh ** 3 / 12, Iy = hh * w ** 3 / 12;
  close(r.Ixc + r.Iyc, Ix + Iy, 1e-12, 'invariante Ix+Iy');
  close(r.I1, Iy, 1e-12, 'I1');
  close(r.I2, Ix, 1e-12, 'I2');
  close(r.Ixc, Ix * Math.cos(th) ** 2 + Iy * Math.sin(th) ** 2, 1e-12, 'Ix girada');
  close(r.Ixyc, (Iy - Ix) / 2 * Math.sin(2 * th), 1e-9, 'Ixy girada');
  // El eje con I máximo es perpendicular al lado largo: 30° + 90° ≡ -60°
  close(r.theta1 * 180 / PI, -60, 1e-9, 'ángulo del eje principal θ1');
  // I respecto al eje θ1 es I1 y el producto de inercia se anula
  const rr = E.rotateInertia(r.Ixc, r.Iyc, r.Ixyc, r.theta1);
  close(rr.Iu, r.I1, 1e-12, 'Iu(θ1) = I1');
  close(rr.Iuv, 0, 1e-9, 'Iuv(θ1) = 0');
});

group('Traslación lejana (precisión numérica)', () => {
  const far = an([R(200, 300, { x: 1e6, y: -2e6 })]);
  close(far.Ixc, 200 * 300 ** 3 / 12, 1e-9, 'Ix lejano');
  close(far.xc, 1e6, 1e-12, 'xc');
});

group('Acuerdos y esquinas redondeadas', () => {
  const rr = an([S.create('rect', { p: { w: 200, h: 100, r: 20 } })]);
  close(rr.A, 200 * 100 - (4 - PI) * 20 * 20, 1e-12, 'A rectángulo redondeado');
  const ring = an([S.create('rect', { p: { w: 100, h: 100, r: 50 } })]);
  close(ring.Ixc, PI * 100 ** 4 / 64, 1e-10, 'rectángulo con r=lado/2 → círculo');
  const rhs = an([S.create('rhs', { p: { w: 100, h: 100, t: 10, r: 0 } })]);
  close(rhs.Ixc, (100 ** 4 - 80 ** 4) / 12, 1e-12, 'Ix tubo cuadrado sin radios');
});

group('Catálogo frente a tablas de perfiles', () => {
  let worstA = 0, worstI = 0, worstName = '';
  for (const ser of C.series) {
    for (const it of ser.items) {
      if (!it.ref) continue;
      const r = an([C.makeShape(it)], { plastic: false });
      const eA = Math.abs(r.A / it.ref.A - 1), eI = Math.abs(r.Ixc / it.ref.Iy - 1);
      if (eA > worstA) worstA = eA;
      if (eI > worstI) { worstI = eI; worstName = it.n; }
      if (eA > 0.012 || eI > 0.012) {
        fail++;
        console.log(`  ✗ ${it.n}: A=${(r.A / 100).toFixed(2)} (tabla ${(it.ref.A / 100).toFixed(2)}), Iy=${(r.Ixc / 1e4).toFixed(1)} (tabla ${(it.ref.Iy / 1e4).toFixed(1)})`);
      } else pass++;
    }
  }
  console.log(`  peor desviación: A ${(worstA * 100).toFixed(2)} %, I ${(worstI * 100).toFixed(2)} % (${worstName})`);
});

group('Módulo plástico de un perfil I (sin acuerdos)', () => {
  const ib = an([S.create('ibeam', { p: { h: 300, b: 150, tf: 10, tw: 8, r: 0 } })]);
  const Zx = 150 * 10 * (300 - 10) + 8 * (300 / 2 - 10) ** 2;
  close(ib.Zx, Zx, 1e-5, 'Zx perfil I');
  close(ib.pnaY, 0, 1e-6, 'eje neutro plástico (simétrico)');
});

group('Espejo y giro conservan los momentos', () => {
  const s = S.create('angle', { p: { h: 150, b: 90, t: 12, r1: 12, r2: 6 }, x: 30, y: -10, rot: 20 });
  const a = an([s]);
  const m = S.clone(s, true);
  S.mirror(m, 'v', 5);
  const b = an([m]);
  close(b.A, a.A, 1e-12, 'A tras espejo');
  close(b.Ixc, a.Ixc, 1e-10, 'Ix tras espejo');
  close(b.Iyc, a.Iyc, 1e-10, 'Iy tras espejo');
  close(b.Ixyc, -a.Ixyc, 1e-9, 'Ixy cambia de signo');
  close(b.xc, 10 - a.xc, 1e-9, 'xc reflejado');
  const m2 = S.clone(s, true);
  S.mirror(m2, 'h', 7);
  const c = an([m2]);
  close(c.Ixyc, -a.Ixyc, 1e-9, 'Ixy cambia de signo (espejo horizontal)');
  close(c.yc, 14 - a.yc, 1e-9, 'yc reflejado');
  close(c.Ixc, a.Ixc, 1e-10, 'Ix invariante');
});

group('Ejes arbitrarios', () => {
  const r = an([R(100, 200)]);
  const t = E.aboutAxes(r, -50, -100, 0); // eje en la base del rectángulo
  close(t.Ix, 100 * 200 ** 3 / 3, 1e-12, 'Ix en la base = bh³/3');
  close(t.Iy, 200 * 100 ** 3 / 3, 1e-12, 'Iy en el borde = hb³/3');
  close(t.Ixy, (100 * 100 / 2) * (200 * 200 / 2) , 1e-12, 'Ixy respecto a la esquina = b²h²/4');
});

group('Asas de edición: lo que no se arrastra no se mueve', () => {
  const worldVerts = (s) => S.TYPES[s.type].verts(s.p).map((v) => S.toWorld(s, v.x, v.y));
  const dragH = (s, id, d) => {
    const h = S.TYPES[s.type].handles(s.p).find((q) => q.id === id);
    const r = h.apply({ type: s.type, p: s.p }, d, { snap: (v) => v, angleStep: 1 });
    const c = S.clone(s, false);
    c.p = S.normalize(s.type, r.p);
    const sh = S.vecToWorld(s, r.shift[0], r.shift[1]);
    c.x = s.x + sh.x; c.y = s.y + sh.y;
    return c;
  };
  const same = (a, b) => (Math.hypot(a.x - b.x, a.y - b.y) < 1e-9 ? 1 : 0);
  for (const pose of [{ rot: 0, flip: false }, { rot: 33, flip: true }]) {
    const tag = pose.flip ? ' (girado y reflejado)' : '';
    // Triángulo
    const tri = S.create('triangle', Object.assign({ p: { b: 120, h: 80, ox: 15 }, x: 10, y: -5 }, pose));
    const v0 = worldVerts(tri);
    let c = dragH(tri, 'bl', [-12, 0]);
    let v1 = worldVerts(c);
    close(same(v0[1], v1[1]) * same(v0[2], v1[2]), 1, 1e-12, 'triángulo: BR y vértice fijos al mover BL' + tag);
    close(Math.hypot(v1[0].x - v0[0].x, v1[0].y - v0[0].y), 12, 1e-9, 'triángulo: BL se mueve 12' + tag);
    c = dragH(tri, 'br', [9, 0]); v1 = worldVerts(c);
    close(same(v0[0], v1[0]) * same(v0[2], v1[2]), 1, 1e-12, 'triángulo: BL y vértice fijos al mover BR' + tag);
    c = dragH(tri, 'apex', [7, 11]); v1 = worldVerts(c);
    close(same(v0[0], v1[0]) * same(v0[1], v1[1]), 1, 1e-12, 'triángulo: la base queda fija al mover el vértice' + tag);
    // Trapecio: [id, índice del vértice que se mueve]
    const tz = S.create('trapezoid', Object.assign({ p: { b: 200, b2: 100, h: 60, ox: 20 }, x: -3, y: 8 }, pose));
    const w0 = worldVerts(tz);
    for (const [id, moved] of [['bl', 0], ['br', 1], ['tr', 2], ['tl', 3]]) {
      const w1 = worldVerts(dragH(tz, id, [6, 0]));
      const fixed = [0, 1, 2, 3].filter((i) => i !== moved).every((i) => same(w0[i], w1[i]));
      close(fixed ? 1 : 0, 1, 1e-12, 'trapecio: sólo se mueve el vértice ' + id + tag);
    }
    // Rectángulo: esquina NE arrastrada → SW fija
    const rc = S.create('rect', Object.assign({ p: { w: 100, h: 60 }, x: 4, y: 9 }, pose));
    const r0 = worldVerts(rc), r1 = worldVerts(dragH(rc, 'ne', [10, 7]));
    close(same(r0[0], r1[0]), 1, 1e-12, 'rectángulo: esquina SW fija' + tag);
    // Perfil I: el borde inferior no se mueve al estirar la altura
    const ib = S.create('ibeam', Object.assign({ p: { h: 200, b: 100, tf: 10, tw: 6, r: 8 } }, pose));
    const i0 = worldVerts(ib), icn = dragH(ib, 'n', [0, 15]), i1 = worldVerts(icn);
    close(same(i0[6], i1[6]) * same(i0[7], i1[7]), 1, 1e-12, 'perfil I: borde inferior fijo' + tag);
    close(icn.p.h, 215, 1e-12, 'perfil I: altura aumenta 15' + tag);
  }
});

console.log(`\n${pass} correctos, ${fail} fallos`);
process.exit(fail ? 1 : 0);
