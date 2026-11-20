/* InerCAD · páginas de fórmulas por tipo de sección para el sitio web (las usa tools/build-site.js)
 *
 *   secciones/index.html        resumen de fórmulas, qué es el momento de inercia, Steiner y unidades
 *   secciones/<seccion>.html    una página por sección: fórmulas, de dónde salen, ejemplo resuelto paso a paso,
 *                               errores frecuentes y botón para abrir el ejemplo en la app (app/?forma=…)
 *
 * Cada sección define sus fórmulas cerradas (f) y un ejemplo. Al generar la web, el ejemplo se calcula también con
 * el motor de InerCAD y, si alguna fórmula no coincide con él, la generación se detiene: la web no puede publicar
 * una fórmula equivocada. Las mismas comprobaciones están en tests/sections.test.js.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'js', 'shapes.js'));
const C = require(path.join(ROOT, 'js', 'profiles.js'));
const { R, esc, num, page: basePage } = require('./site-template.js');

const page = (o) => basePage(Object.assign({ active: 'secciones/' }, o));
const PI = Math.PI;
const sq = Math.sqrt;

/* ---------- Números para el texto (coma decimal, 4 cifras significativas) ---------- */
// sin ceros sobrantes (200 mm, no 200,0 mm), con el signo menos tipográfico y los miles separados por un espacio fino
// que no se parte al saltar de línea
const N = (v, sig) => {
  let s = num(v, sig || 4);
  if (s.includes(',')) s = s.replace(/0+$/, '').replace(/,$/, '');
  return s.replace(/^-/, '−').replace(/ /g, ' ');
};
const cm2 = (v) => N(v / 1e2), cm3 = (v) => N(v / 1e3), cm4 = (v) => N(v / 1e4);
const pct = (v) => N(v * 100, 2) + ' %';
const deg = (rad) => N(rad * 180 / PI, 4) + '°';
// una línea de cálculo: puede saltar de línea en los espacios, pero nunca entre un número y su unidad
const calc = (s) => `<p class="calc">${s.replace(/(\d) (mm|cm)/g, '$1&nbsp;$2')}</p>`;
const sub = (s, k) => `${s}<sub>${k}</sub>`;

/* ---------- Comparación con el motor de InerCAD ---------- */
function engine(type, p) {
  const shape = S.create(type, { p });
  const r = S.analyze([shape]);
  const bb = S.geom(shape).bbox;
  return {
    shape, r, bb,
    v: {
      A: r.A, xG: r.xc - bb.xmin, yG: r.yc - bb.ymin,
      Ix: r.Ixc, Iy: r.Iyc, Ixy: r.Ixyc, Ip: r.J, I1: r.I1, I2: r.I2, th: r.theta1,
      Wx: Math.min(r.Wxt, r.Wxb), Wxs: r.Wxt, Wxi: r.Wxb, Wy: Math.min(r.Wyl, r.Wyr), Wyl: r.Wyl, Wyr: r.Wyr,
      ix: r.rx, iy: r.ry, i2: r.r2, Zx: r.Zx, Zy: r.Zy,
    },
  };
}
// el módulo plástico se calcula sobre polígonos muy finos: tolerancia algo mayor
const TOL = { Zx: 1e-4, Zy: 1e-4 };

/* Compara las fórmulas cerradas de una sección con el motor para unos parámetros. Devuelve las discrepancias. */
function check(sec, p) {
  const f = sec.f(p), e = engine(sec.type, Object.assign({}, sec.fixed, p)).v, bad = [];
  for (const k of Object.keys(f)) {
    if (!(k in e)) continue;
    const a = f[k], b = e[k], tol = TOL[k] || 1e-7;
    const scale = Math.max(Math.abs(a), Math.abs(b), k === 'Ixy' || k === 'th' ? Math.abs(f.Ix || 1) * 1e-12 + 1e-9 : 1e-12);
    if (!(Math.abs(a - b) / scale <= tol)) bad.push(`${sec.slug} ${k}: fórmula ${a} · InerCAD ${b}`);
  }
  return bad;
}

/* ---------- Dibujo acotado de la sección (SVG en milímetros) ---------- */
const label = (s) => esc(s).replace(/_(\w+)/, '<tspan dy="0.3em" font-size="72%">$1</tspan>');

function drawing(sec, p, opts) {
  opts = opts || {};
  const { shape, r, bb } = engine(sec.type, Object.assign({}, sec.fixed, p));
  const g = S.geom(shape);
  const w = bb.xmax - bb.xmin, h = bb.ymax - bb.ymin, size = Math.max(w, h);
  const thumb = !!opts.thumb, pad = size * (thumb ? 0.08 : 0.34);
  const X = (x) => +(x - bb.xmin + pad).toFixed(2), Y = (y) => +(bb.ymax - y + pad).toFixed(2);
  const d = g.polys.map((poly) => 'M' + poly.map((pt) => `${X(pt.x)} ${Y(pt.y)}`).join('L') + 'Z').join('');
  const W = +(w + 2 * pad).toFixed(2), H = +(h + 2 * pad).toFixed(2);
  const parts = [`<path class="sec" d="${d}"/>`];
  if (!thumb) {
    const fs = +(size * 0.062).toFixed(2), tk = size * 0.022, xc = r.xc, yc = r.yc, ax = pad * 0.85;
    parts.push(
      `<line class="ax" x1="${X(bb.xmin - ax)}" y1="${Y(yc)}" x2="${X(bb.xmax + ax)}" y2="${Y(yc)}"/>`,
      `<line class="ax" x1="${X(xc)}" y1="${Y(bb.ymin - ax)}" x2="${X(xc)}" y2="${Y(bb.ymax + ax)}"/>`,
      `<text class="axl" x="${X(bb.xmax + ax) + fs * 0.3}" y="${Y(yc) + fs * 0.32}" font-size="${fs}">x</text>`,
      `<text class="axl" x="${X(xc)}" y="${Y(bb.ymax + ax) - fs * 0.35}" font-size="${fs}" text-anchor="middle">y</text>`,
    );
    if (opts.principal) {   // ejes principales u (máximo) y v (mínimo)
      const L = size * 0.62, c = Math.cos(r.theta1), s = Math.sin(r.theta1);
      parts.push(
        `<line class="pax" x1="${X(xc - L * c)}" y1="${Y(yc - L * s)}" x2="${X(xc + L * c)}" y2="${Y(yc + L * s)}"/>`,
        `<line class="pax" x1="${X(xc + L * s)}" y1="${Y(yc - L * c)}" x2="${X(xc - L * s)}" y2="${Y(yc + L * c)}"/>`,
        `<text class="paxl" x="${X(xc + (L + fs * 0.5) * c)}" y="${Y(yc + (L + fs * 0.5) * s) + fs * 0.32}" font-size="${fs}" text-anchor="middle">u</text>`,
        `<text class="paxl" x="${X(xc - (L + fs * 0.5) * s)}" y="${Y(yc + (L + fs * 0.5) * c) + fs * 0.32}" font-size="${fs}" text-anchor="middle">v</text>`,
      );
    }
    parts.push(`<circle class="g" cx="${X(xc)}" cy="${Y(yc)}" r="${+(size * 0.013).toFixed(2)}"/>`,
      `<text class="gl" x="${X(xc) + fs * 0.35}" y="${Y(yc) - fs * 0.35}" font-size="${fs}">G</text>`);
    for (const dm of sec.dims(p, r, size)) parts.push(dimSvg(dm, { X, Y, fs, tk, gap: size * 0.012 }));
  }
  const alt = `${sec.short}${thumb ? '' : ' acotada, con el centroide G y los ejes x e y'}`;
  return `<svg class="sec-svg${thumb ? ' thumb' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}">${parts.join('')}</svg>`;
}

/* Cota alineada entre p1 y p2, desplazada «off» hacia la izquierda del sentido p1→p2 (en coordenadas de la sección).
 * place: 'mid' (texto sobre la línea), 'side' (texto horizontal al lado) o 'end' (texto tras p2, para espesores);
 * inner: prolonga la línea más allá de las marcas; e1/e2: origen de las líneas de referencia; no1/no2: sin ellas. */
function dimSvg(dm, { X, Y, fs, tk, gap }) {
  const [x1, y1] = dm.p1, [x2, y2] = dm.p2, L = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux, o = dm.off || 0, sg = o < 0 ? -1 : 1;
  const ext = dm.inner ? tk * 2.4 : 0;
  const a = [x1 + nx * o, y1 + ny * o], b = [x2 + nx * o, y2 + ny * o];
  const P = (q) => `${+X(q[0]).toFixed(2)} ${+Y(q[1]).toFixed(2)}`;
  let path = `M${P([a[0] - ux * ext, a[1] - uy * ext])}L${P([b[0] + ux * ext, b[1] + uy * ext])}`;
  for (const q of [a, b]) path += `M${P([q[0] - nx * tk, q[1] - ny * tk])}L${P([q[0] + nx * tk, q[1] + ny * tk])}`;
  if (o) {
    [[dm.e1 || dm.p1, a, dm.no1], [dm.e2 || dm.p2, b, dm.no2]].forEach(([e, q, skip]) => {
      if (!skip) path += `M${P([e[0] + nx * sg * gap, e[1] + ny * sg * gap])}L${P([q[0] + nx * sg * tk * 1.4, q[1] + ny * sg * tk * 1.4])}`;
    });
  }
  let tx, ty, rot = 0, anchor = 'middle';
  const place = dm.place || 'mid';
  if (place === 'end') {
    tx = b[0] + ux * (ext + fs * 0.4); ty = b[1] + uy * (ext + fs * 0.4);
    anchor = ux > 0.5 ? 'start' : ux < -0.5 ? 'end' : 'middle';
    if (anchor === 'middle') ty += uy * fs * 0.25;
  } else {
    const s = place === 'side' ? 0.45 : 0.62;
    tx = (a[0] + b[0]) / 2 + nx * sg * fs * s; ty = (a[1] + b[1]) / 2 + ny * sg * fs * s;
    if (place === 'side') anchor = Math.abs(nx) > 0.5 ? (nx * sg > 0 ? 'start' : 'end') : 'middle';
    else {
      let th = Math.atan2(uy, ux) * 180 / PI;
      if (th > 90.001) th -= 180;
      if (th <= -90) th += 180;
      rot = -th;
    }
  }
  const sx = +X(tx).toFixed(2), sy = +Y(ty).toFixed(2);
  return `<path class="dim" d="${path}"/><text class="sym" x="${sx}" y="${sy}" font-size="${fs}" text-anchor="${anchor}" dominant-baseline="central"${rot ? ` transform="rotate(${+rot.toFixed(2)} ${sx} ${sy})"` : ''}>${label(dm.label)}</text>`;
}

/* ---------- Filas de la tabla de resultados ---------- */
const PROPS = {
  A: ['A', 'Área', 2], xG: ['x<sub>G</sub>', 'Centroide, desde el borde izquierdo', 1], yG: ['y<sub>G</sub>', 'Centroide, desde la base', 1],
  Ix: ['I<sub>x</sub>', 'Momento de inercia respecto al eje x (horizontal, por G)', 4], Iy: ['I<sub>y</sub>', 'Momento de inercia respecto al eje y (vertical, por G)', 4],
  Ixy: ['I<sub>xy</sub>', 'Producto de inercia', 4], Ip: ['I<sub>p</sub>', 'Momento polar de inercia', 4],
  I1: ['I<sub>u</sub>', 'Momento principal máximo', 4], I2: ['I<sub>v</sub>', 'Momento principal mínimo', 4], th: ['θ', 'Giro del eje principal u respecto a x', 0],
  Wx: ['W<sub>x</sub>', 'Módulo resistente elástico, eje x', 3], Wxs: ['W<sub>x,sup</sub>', 'Módulo resistente, fibra superior', 3], Wxi: ['W<sub>x,inf</sub>', 'Módulo resistente, fibra inferior', 3],
  Wy: ['W<sub>y</sub>', 'Módulo resistente elástico, eje y', 3], Wyl: ['W<sub>y,izq</sub>', 'Módulo resistente, borde izquierdo', 3], Wyr: ['W<sub>y,der</sub>', 'Módulo resistente, borde derecho', 3],
  ix: ['i<sub>x</sub>', 'Radio de giro, eje x', 1], iy: ['i<sub>y</sub>', 'Radio de giro, eje y', 1], i2: ['i<sub>v</sub>', 'Radio de giro mínimo (eje v)', 1],
  Zx: ['W<sub>pl,x</sub>', 'Módulo resistente plástico, eje x', 3], Zy: ['W<sub>pl,y</sub>', 'Módulo resistente plástico, eje y', 3],
};
const UNIT = { 1: ['mm', 'cm', 10], 2: ['mm²', 'cm²', 1e2], 3: ['mm³', 'cm³', 1e3], 4: ['mm⁴', 'cm⁴', 1e4] };
function resultsTable(keys, v) {
  return `<div class="tscroll"><table class="kv kv2"><tbody>
      ${keys.map((k) => {
        const [sym, name, dim] = PROPS[k];
        if (!dim) return `<tr><td><i>${sym}</i></td><td>${name}</td><td>${deg(v[k])}</td><td></td></tr>`;
        const [u1, u2, f] = UNIT[dim];
        return `<tr><td><i>${sym}</i></td><td>${name}</td><td>${N(v[k])} ${u1}</td><td>${N(v[k] / f)} ${u2}</td></tr>`;
      }).join('\n      ')}
    </tbody></table></div>`;
}

/* Tabla de Steiner: filas [nombre, A, brazo, Ipropio] respecto a una referencia; devuelve html y totales */
function steiner(rows, axis) {
  const A = rows.reduce((s, q) => s + q[1], 0);
  const c = rows.reduce((s, q) => s + q[1] * q[2], 0) / A;
  const I = rows.reduce((s, q) => s + q[3] + q[1] * (q[2] - c) ** 2, 0);
  const z = axis === 'x' ? 'y' : 'x';   // brazo medido según la otra coordenada
  const html = `<div class="tscroll"><table class="ptable">
      <thead><tr><th>Parte</th><th><i>A<sub>i</sub></i> (mm²)</th><th><i>${z}<sub>i</sub></i> (mm)</th><th><i>A<sub>i</sub>·${z}<sub>i</sub></i> (mm³)</th><th><i>I<sub>${axis},i</sub></i> propio (mm⁴)</th><th><i>d<sub>i</sub> = ${z}<sub>i</sub> − ${z}<sub>G</sub></i> (mm)</th><th><i>A<sub>i</sub>·d<sub>i</sub>²</i> (mm⁴)</th></tr></thead>
      <tbody>
        ${rows.map((q) => `<tr><td>${q[0]}</td><td>${N(q[1])}</td><td>${N(q[2])}</td><td>${N(q[1] * q[2])}</td><td>${N(q[3])}</td><td>${N(q[2] - c)}</td><td>${N(q[1] * (q[2] - c) ** 2)}</td></tr>`).join('\n        ')}
        <tr class="tot"><td>Suma</td><td>${N(A)}</td><td></td><td>${N(rows.reduce((s, q) => s + q[1] * q[2], 0))}</td><td>${N(rows.reduce((s, q) => s + q[3], 0))}</td><td></td><td>${N(rows.reduce((s, q) => s + q[1] * (q[2] - c) ** 2, 0))}</td></tr>
      </tbody>
    </table></div>`;
  return { A, c, I, html };
}

/* ---------- Secciones ---------- */
const SECTIONS = [
  {
    slug: 'rectangular', type: 'rect', fixed: { r: 0 }, short: 'Sección rectangular', menu: 'Rectángulo',
    title: 'Momento de inercia de un rectángulo: fórmula y ejemplo · InerCAD',
    h1: 'Momento de inercia de una sección rectangular',
    desc: 'Momento de inercia de un rectángulo: I = b·h³/12 respecto al centroide y b·h³/3 respecto a la base. Fórmulas de área, módulo resistente y radio de giro, de dónde salen y un ejemplo resuelto paso a paso.',
    sum: { A: 'b·h', c: 'h/2', Ix: 'b·h³/12', Iy: 'h·b³/12' },
    ex: { w: 150, h: 300 },
    f: ({ w: b, h }) => ({ A: b * h, xG: b / 2, yG: h / 2, Ix: b * h ** 3 / 12, Iy: h * b ** 3 / 12, Ixy: 0, Ip: b * h * (b * b + h * h) / 12, Wx: b * h * h / 6, Wy: h * b * b / 6, ix: h / sq(12), iy: b / sq(12), Zx: b * h * h / 4, Zy: h * b * b / 4 }),
    dims: ({ w: b, h }, r, s) => [
      { p1: [-b / 2, h / 2], p2: [b / 2, h / 2], off: 0.13 * s, label: 'b' },
      { p1: [-b / 2, -h / 2], p2: [-b / 2, h / 2], off: 0.13 * s, label: 'h' },
    ],
    formulas: [
      ['A', 'Área', 'A = b·h'],
      ['y<sub>G</sub>', 'Centroide (desde la base)', 'y<sub>G</sub> = h/2'],
      ['I<sub>x</sub>', 'Momento de inercia, eje x por G', 'I<sub>x</sub> = b·h³/12'],
      ['I<sub>y</sub>', 'Momento de inercia, eje y por G', 'I<sub>y</sub> = h·b³/12'],
      ['I<sub>base</sub>', 'Respecto al eje de la base', 'I<sub>base</sub> = b·h³/3'],
      ['I<sub>p</sub>', 'Momento polar respecto a G', 'I<sub>p</sub> = b·h·(b² + h²)/12'],
      ['W<sub>x</sub>', 'Módulo resistente elástico', 'W<sub>x</sub> = b·h²/6'],
      ['W<sub>pl,x</sub>', 'Módulo resistente plástico', 'W<sub>pl,x</sub> = b·h²/4'],
      ['i<sub>x</sub>', 'Radio de giro', 'i<sub>x</sub> = h/√12 ≈ 0,289·h'],
    ],
    intro: `<p>El rectángulo es la sección más habitual: vigas de madera, vigas y losas de hormigón, pletinas y chapas. Su momento de inercia respecto al eje horizontal que pasa por el centroide es <strong>I<sub>x</sub> = b·h³/12</strong>, donde <i>b</i> es el ancho y <i>h</i> el canto, es decir, la dimensión perpendicular al eje respecto al que flecta la pieza.</p>`,
    derive: () => `<p>Se divide la sección en franjas horizontales de ancho <i>b</i> y espesor d<i>y</i>, situadas a una distancia <i>y</i> del eje x que pasa por el centroide. Cada franja aporta <i>y</i>²·d<i>A</i> = <i>y</i>²·<i>b</i>·d<i>y</i>, y al sumar desde −h/2 hasta h/2:</p>
    <div class="formula">I<sub>x</sub> = ∫ y² dA = ∫<sub>−h/2</sub><sup>h/2</sup> b·y² dy = b·h³/12</div>
    <p>El cubo explica por qué el canto importa tanto: si se duplica <i>h</i>, I<sub>x</sub> se multiplica por 8; si se duplica <i>b</i>, solo por 2. Por eso las vigas se colocan «de canto».</p>
    <p>Respecto a un eje que pasa por la base, el <a href="./#steiner">teorema de Steiner</a> añade el término A·d², con d = h/2: I<sub>base</sub> = b·h³/12 + b·h·(h/2)² = b·h³/3. El módulo resistente es el momento de inercia dividido por la distancia a la fibra más alejada: W<sub>x</sub> = I<sub>x</sub>/(h/2) = b·h²/6.</p>`,
    example: (p, f) => `<p>Una viga de madera de <strong>${N(p.w)} × ${N(p.h)} mm</strong> colocada de canto (b = ${N(p.w)} mm, h = ${N(p.h)} mm).</p>
    <ol class="steps-x">
      <li><b>Área.</b>${calc(`A = b·h = ${N(p.w)} · ${N(p.h)} = ${N(f.A)} mm² = ${cm2(f.A)} cm²`)}</li>
      <li><b>Centroide.</b> Está en el centro: y<sub>G</sub> = h/2 = ${N(f.yG)} mm.</li>
      <li><b>Momento de inercia respecto al eje x.</b>${calc(`I<sub>x</sub> = b·h³/12 = ${N(p.w)} · ${N(p.h)}³ / 12 = ${N(f.Ix)} mm⁴ = ${cm4(f.Ix)} cm⁴`)}</li>
      <li><b>Respecto al eje y.</b>${calc(`I<sub>y</sub> = h·b³/12 = ${N(p.h)} · ${N(p.w)}³ / 12 = ${N(f.Iy)} mm⁴ = ${cm4(f.Iy)} cm⁴`)}</li>
      <li><b>Módulo resistente y radio de giro.</b>${calc(`W<sub>x</sub> = b·h²/6 = ${N(f.Wx)} mm³ = ${cm3(f.Wx)} cm³ &nbsp;·&nbsp; i<sub>x</sub> = h/√12 = ${N(f.ix)} mm`)}</li>
    </ol>
    <p>Colocada de canto, la viga tiene un I<sub>x</sub> ${N(f.Ix / f.Iy, 3)} veces mayor que tumbada (I<sub>x</sub>/I<sub>y</sub> = (h/b)²): con la misma madera es ${N(f.Ix / f.Iy, 3)} veces más rígida y resiste ${N(f.Wx / f.Wy, 3)} veces más momento flector (W<sub>x</sub>/W<sub>y</sub> = h/b).</p>`,
    show: ['A', 'Ix', 'Iy', 'Wx', 'Wy', 'ix', 'iy', 'Zx'],
    errors: [
      'Intercambiar b y h. El exponente 3 va siempre en la dimensión perpendicular al eje: para I<sub>x</sub>, el canto h.',
      'Usar b·h³/3, que es respecto a la base, cuando se necesita el valor respecto al centroide (o al revés). La diferencia es de 4 veces.',
      'Mezclar unidades: 1 cm⁴ = 10 000 mm⁴ y 1 m⁴ = 10⁸ cm⁴. Un error aquí da resultados 10 000 veces mayores o menores.',
      'Restar módulos resistentes para descontar un hueco. W no es aditivo; I sí: primero se restan los momentos de inercia y después se divide por la distancia a la fibra extrema.',
    ],
    related: ['rectangular-hueca', 'seccion-t', 'doble-t'],
  },
  {
    slug: 'rectangular-hueca', type: 'rhs', fixed: { r: 0 }, short: 'Sección rectangular hueca', menu: 'Rectangular hueca',
    title: 'Momento de inercia de una sección rectangular hueca (tubo) · InerCAD',
    h1: 'Momento de inercia de una sección rectangular hueca',
    desc: 'Momento de inercia de un tubo rectangular o viga cajón: I = [b·h³ − (b−2t)(h−2t)³]/12. Fórmulas, módulo resistente, ejemplo resuelto y comparación con un tubo RHS laminado.',
    sum: { A: 'b·h − b<sub>i</sub>·h<sub>i</sub>', c: 'h/2', Ix: '(b·h³ − b<sub>i</sub>·h<sub>i</sub>³)/12', Iy: '(h·b³ − h<sub>i</sub>·b<sub>i</sub>³)/12' },
    ex: { w: 100, h: 200, t: 8 },
    f: ({ w: b, h, t }) => {
      const bi = b - 2 * t, hi = h - 2 * t;
      return { A: b * h - bi * hi, xG: b / 2, yG: h / 2, Ix: (b * h ** 3 - bi * hi ** 3) / 12, Iy: (h * b ** 3 - hi * bi ** 3) / 12, Ixy: 0, Wx: (b * h ** 3 - bi * hi ** 3) / (6 * h), Wy: (h * b ** 3 - hi * bi ** 3) / (6 * b), Zx: (b * h * h - bi * hi * hi) / 4, Zy: (h * b * b - hi * bi * bi) / 4 };
    },
    dims: ({ w: b, h, t }, r, s) => [
      { p1: [-b / 2, h / 2], p2: [b / 2, h / 2], off: 0.13 * s, label: 'b' },
      { p1: [-b / 2, -h / 2], p2: [-b / 2, h / 2], off: 0.13 * s, label: 'h' },
      { p1: [b / 2 - t, -h / 4], p2: [b / 2, -h / 4], inner: true, place: 'end', label: 't' },
    ],
    formulas: [
      ['b<sub>i</sub>, h<sub>i</sub>', 'Dimensiones del hueco', 'b<sub>i</sub> = b − 2t, h<sub>i</sub> = h − 2t'],
      ['A', 'Área', 'A = b·h − b<sub>i</sub>·h<sub>i</sub>'],
      ['I<sub>x</sub>', 'Momento de inercia, eje x por G', 'I<sub>x</sub> = (b·h³ − b<sub>i</sub>·h<sub>i</sub>³)/12'],
      ['I<sub>y</sub>', 'Momento de inercia, eje y por G', 'I<sub>y</sub> = (h·b³ − h<sub>i</sub>·b<sub>i</sub>³)/12'],
      ['W<sub>x</sub>', 'Módulo resistente elástico', 'W<sub>x</sub> = 2·I<sub>x</sub>/h'],
      ['W<sub>pl,x</sub>', 'Módulo resistente plástico', 'W<sub>pl,x</sub> = (b·h² − b<sub>i</sub>·h<sub>i</sub>²)/4'],
      ['i<sub>x</sub>', 'Radio de giro', 'i<sub>x</sub> = √(I<sub>x</sub>/A)'],
    ],
    intro: `<p>Tubos rectangulares y cuadrados, vigas cajón de chapa soldada y secciones de hormigón aligeradas. La sección hueca coloca el material lejos del centroide, donde más aporta al momento de inercia, y además resiste muy bien la torsión. Con esquinas vivas se calcula <strong>restando el hueco al rectángulo exterior</strong>.</p>`,
    derive: () => `<p>El momento de inercia es aditivo: el de la sección hueca es el del rectángulo exterior <i>b × h</i> menos el del hueco <i>(b − 2t) × (h − 2t)</i>. Como los dos rectángulos tienen el mismo centroide, no hace falta el teorema de Steiner:</p>
    <div class="formula">I<sub>x</sub> = b·h³/12 − (b − 2t)·(h − 2t)³/12</div>
    <p>El mismo razonamiento vale para el área y para el módulo plástico, W<sub>pl,x</sub> = [b·h² − (b − 2t)·(h − 2t)²]/4. Si las paredes tienen espesores distintos (alas t<sub>f</sub> y almas t<sub>w</sub>, como en una viga cajón soldada), basta con usar b − 2t<sub>w</sub> y h − 2t<sub>f</sub>. El módulo resistente elástico <em>no</em> se resta: se calcula al final, W<sub>x</sub> = I<sub>x</sub>/(h/2).</p>`,
    example: (p, f) => {
      const bi = p.w - 2 * p.t, hi = p.h - 2 * p.t;
      const it = C.series.find((s) => s.id === 'RHS').items.find((i) => i.p.w === p.w && i.p.h === p.h && i.p.t === p.t);
      const real = it && S.analyze([C.makeShape(it)]);
      const heq = f.A / p.w, Isolid = p.w * heq ** 3 / 12;
      return `<p>Un tubo de <strong>${N(p.h)} × ${N(p.w)} mm</strong> con paredes de <strong>${N(p.t)} mm</strong> y esquinas vivas, con el lado largo en vertical (h = ${N(p.h)}, b = ${N(p.w)}, t = ${N(p.t)}).</p>
    <ol class="steps-x">
      <li><b>Hueco.</b>${calc(`b<sub>i</sub> = ${N(p.w)} − 2·${N(p.t)} = ${N(bi)} mm &nbsp;·&nbsp; h<sub>i</sub> = ${N(p.h)} − 2·${N(p.t)} = ${N(hi)} mm`)}</li>
      <li><b>Área.</b>${calc(`A = ${N(p.w)}·${N(p.h)} − ${N(bi)}·${N(hi)} = ${N(p.w * p.h)} − ${N(bi * hi)} = ${N(f.A)} mm² = ${cm2(f.A)} cm²`)}</li>
      <li><b>Momento de inercia respecto al eje x.</b>${calc(`I<sub>x</sub> = (${N(p.w)}·${N(p.h)}³ − ${N(bi)}·${N(hi)}³)/12 = (${N(p.w * p.h ** 3)} − ${N(bi * hi ** 3)})/12 = ${N(f.Ix)} mm⁴ = ${cm4(f.Ix)} cm⁴`)}</li>
      <li><b>Respecto al eje y.</b>${calc(`I<sub>y</sub> = (${N(p.h)}·${N(p.w)}³ − ${N(hi)}·${N(bi)}³)/12 = ${N(f.Iy)} mm⁴ = ${cm4(f.Iy)} cm⁴`)}</li>
      <li><b>Módulos resistentes.</b>${calc(`W<sub>x</sub> = I<sub>x</sub>/(h/2) = ${N(f.Wx)} mm³ = ${cm3(f.Wx)} cm³ &nbsp;·&nbsp; W<sub>pl,x</sub> = ${N(f.Zx)} mm³ = ${cm3(f.Zx)} cm³`)}</li>
    </ol>
    <p>Para ver lo que aporta el hueco: con los mismos ${N(f.A)} mm² de acero, una pletina maciza de ${N(p.w)} mm de ancho tendría ${N(heq, 3)} mm de canto e I<sub>x</sub> = ${cm4(Isolid)} cm⁴, ${N(f.Ix / Isolid, 3)} veces menos que el tubo.</p>
    ${real ? `<p>La ficha del tubo <a href="${R}perfiles/${C.slug(it.n)}.html">${esc(it.n)}</a> tiene las mismas medidas pero esquinas redondeadas (radio exterior ${N(it.p.r)} mm). Su momento de inercia respecto al eje fuerte es ${cm4(real.Ixc)} cm⁴, un ${pct(1 - real.Ixc / f.Ix)} menor que con esquinas vivas. Como cada norma y cada fabricante usan radios algo distintos, para un tubo comercial concreto conviene usar su catálogo o dibujar su radio en InerCAD.</p>` : ''}`;
    },
    show: ['A', 'Ix', 'Iy', 'Wx', 'Wy', 'ix', 'iy', 'Zx', 'Zy'],
    errors: [
      'Restar el espesor una sola vez: el hueco mide b − 2t y h − 2t, no b − t.',
      'Restar módulos resistentes en lugar de momentos de inercia. Primero se restan las I y después W = I/(h/2).',
      'Ignorar los radios de las esquinas en tubos laminados o conformados: con radio exterior de 2t, el momento de inercia real es unos puntos porcentuales menor.',
      'Olvidar que un tubo esbelto puede abollar localmente: el momento de inercia no lo detecta. Para la clase de sección, compara b/t y h/t con los límites de la norma.',
    ],
    related: ['rectangular', 'tubo-circular', 'doble-t'],
  },
  {
    slug: 'circular', type: 'circle', fixed: {}, short: 'Sección circular', menu: 'Círculo',
    title: 'Momento de inercia de un círculo: fórmula π·D⁴/64 y ejemplo · InerCAD',
    h1: 'Momento de inercia de una sección circular',
    desc: 'Momento de inercia de un círculo: I = π·D⁴/64 = π·r⁴/4, y momento polar π·D⁴/32. Módulo resistente, radio de giro, de dónde sale la fórmula y un ejemplo resuelto de un eje macizo.',
    sum: { A: 'π·D²/4', c: 'D/2', Ix: 'π·D⁴/64', Iy: 'π·D⁴/64' },
    ex: { d: 60 },
    f: ({ d: D }) => ({ A: PI * D * D / 4, xG: D / 2, yG: D / 2, Ix: PI * D ** 4 / 64, Iy: PI * D ** 4 / 64, Ixy: 0, Ip: PI * D ** 4 / 32, Wx: PI * D ** 3 / 32, Wy: PI * D ** 3 / 32, ix: D / 4, iy: D / 4, Zx: D ** 3 / 6, Zy: D ** 3 / 6 }),
    dims: ({ d: D }, r, s) => [{ p1: [-D / 2, 0], p2: [D / 2, 0], off: D / 2 + 0.13 * s, label: 'D' }],
    formulas: [
      ['A', 'Área', 'A = π·D²/4 = π·r²'],
      ['I<sub>x</sub> = I<sub>y</sub>', 'Momento de inercia, cualquier diámetro', 'I = π·D⁴/64 = π·r⁴/4'],
      ['I<sub>p</sub>', 'Momento polar respecto al centro', 'I<sub>p</sub> = π·D⁴/32 = π·r⁴/2'],
      ['W', 'Módulo resistente elástico', 'W = π·D³/32'],
      ['W<sub>pl</sub>', 'Módulo resistente plástico', 'W<sub>pl</sub> = D³/6'],
      ['i', 'Radio de giro', 'i = D/4'],
    ],
    intro: `<p>Ejes, barras macizas, pernos, pilotes y pilares circulares. Por simetría, el momento de inercia es el mismo respecto a cualquier eje que pase por el centro: <strong>I = π·D⁴/64</strong>, o lo que es lo mismo, π·r⁴/4. El momento polar, que interviene en la torsión de ejes, es el doble: <strong>I<sub>p</sub> = π·D⁴/32</strong>.</p>`,
    derive: () => `<p>Lo más cómodo es calcular primero el momento polar, sumando anillos de radio ρ y espesor dρ, cuya área es 2πρ·dρ:</p>
    <div class="formula">I<sub>p</sub> = ∫ ρ² dA = ∫<sub>0</sub><sup>r</sup> ρ²·2πρ dρ = π·r⁴/2</div>
    <p>Como ρ² = x² + y², el momento polar es la suma I<sub>p</sub> = I<sub>x</sub> + I<sub>y</sub>, y por simetría los dos sumandos son iguales: I<sub>x</sub> = I<sub>y</sub> = π·r⁴/4 = π·D⁴/64. Dividiendo por la distancia a la fibra extrema (D/2) sale el módulo resistente, W = π·D³/32, y el radio de giro es i = √(I/A) = D/4.</p>`,
    example: (p, f) => `<p>Un eje macizo de <strong>${N(p.d)} mm</strong> de diámetro.</p>
    <ol class="steps-x">
      <li><b>Área.</b>${calc(`A = π·${N(p.d)}²/4 = ${N(f.A)} mm² = ${cm2(f.A)} cm²`)}</li>
      <li><b>Momento de inercia.</b>${calc(`I = π·${N(p.d)}⁴/64 = π·${N(p.d ** 4)}/64 = ${N(f.Ix)} mm⁴ = ${cm4(f.Ix)} cm⁴`)}</li>
      <li><b>Momento polar</b> (para torsión).${calc(`I<sub>p</sub> = 2·I = ${N(f.Ip)} mm⁴ = ${cm4(f.Ip)} cm⁴`)}</li>
      <li><b>Módulo resistente y radio de giro.</b>${calc(`W = π·${N(p.d)}³/32 = ${N(f.Wx)} mm³ = ${cm3(f.Wx)} cm³ &nbsp;·&nbsp; i = D/4 = ${N(f.ix)} mm`)}</li>
    </ol>
    <p>El diámetro manda: con ${N(p.d + 10)} mm de diámetro (un ${pct(10 / p.d)} más), I crece un ${pct(((p.d + 10) / p.d) ** 4 - 1)} y W un ${pct(((p.d + 10) / p.d) ** 3 - 1)}. El módulo plástico, W<sub>pl</sub> = D³/6 = ${cm3(f.Zx)} cm³, es ${N(f.Zx / f.Wx, 3)} veces el elástico: es el factor de forma del círculo.</p>`,
    show: ['A', 'Ix', 'Ip', 'Wx', 'ix', 'Zx'],
    errors: [
      'Confundir radio y diámetro: π·r⁴/4 y π·D⁴/64 son la misma fórmula, pero π·D⁴/4 da un valor 16 veces mayor.',
      'Usar I en lugar del momento polar I<sub>p</sub> para la torsión, o al revés para la flexión.',
      'Confundirlo con el momento de inercia de masa de un disco (m·r²/2, en kg·m²), que se usa en dinámica de rotación y es otra magnitud.',
      'Aproximar el círculo con un polígono de pocos lados. InerCAD integra los arcos de forma exacta, sin convertirlos en polígonos.',
    ],
    related: ['tubo-circular', 'semicirculo', 'rectangular'],
  },
  {
    slug: 'tubo-circular', type: 'ring', fixed: {}, short: 'Tubo circular', menu: 'Tubo circular',
    title: 'Momento de inercia de un tubo circular: fórmula y ejemplo · InerCAD',
    h1: 'Momento de inercia de un tubo circular',
    desc: 'Momento de inercia de un tubo o sección anular: I = π·(D⁴ − d⁴)/64. Momento polar, módulo resistente, aproximación de pared delgada y ejemplo resuelto con un tubo CHS 114,3×4,5.',
    sum: { A: 'π·(D² − d²)/4', c: 'D/2', Ix: 'π·(D⁴ − d⁴)/64', Iy: 'π·(D⁴ − d⁴)/64' },
    ex: { d: 114.3, t: 4.5 },
    f: ({ d: D, t }) => {
      const d = D - 2 * t;
      return { A: PI * (D * D - d * d) / 4, xG: D / 2, yG: D / 2, Ix: PI * (D ** 4 - d ** 4) / 64, Iy: PI * (D ** 4 - d ** 4) / 64, Ixy: 0, Ip: PI * (D ** 4 - d ** 4) / 32, Wx: PI * (D ** 4 - d ** 4) / (32 * D), Wy: PI * (D ** 4 - d ** 4) / (32 * D), ix: sq(D * D + d * d) / 4, iy: sq(D * D + d * d) / 4, Zx: (D ** 3 - d ** 3) / 6, Zy: (D ** 3 - d ** 3) / 6 };
    },
    dims: ({ d: D, t }, r, s) => {
      const c = Math.cos(PI / 4);
      return [
        { p1: [-D / 2, 0], p2: [D / 2, 0], off: D / 2 + 0.13 * s, label: 'D' },
        { p1: [(D / 2 - t) * c, -(D / 2 - t) * c], p2: [D / 2 * c, -D / 2 * c], inner: true, place: 'end', label: 't' },
      ];
    },
    formulas: [
      ['d', 'Diámetro interior', 'd = D − 2t'],
      ['A', 'Área', 'A = π·(D² − d²)/4'],
      ['I', 'Momento de inercia, cualquier diámetro', 'I = π·(D⁴ − d⁴)/64'],
      ['I<sub>p</sub>', 'Momento polar', 'I<sub>p</sub> = π·(D⁴ − d⁴)/32'],
      ['W', 'Módulo resistente elástico', 'W = π·(D⁴ − d⁴)/(32·D)'],
      ['W<sub>pl</sub>', 'Módulo resistente plástico', 'W<sub>pl</sub> = (D³ − d³)/6'],
      ['i', 'Radio de giro', 'i = √(D² + d²)/4'],
      ['I ≈', 'Pared delgada (r<sub>m</sub> = (D − t)/2)', 'I ≈ π·r<sub>m</sub>³·t'],
    ],
    intro: `<p>Tubos estructurales (CHS), ejes huecos, postes, barandillas y pilotes de acero. La sección anular es muy eficiente: con poco material consigue un momento de inercia alto y el mismo en todas las direcciones, por eso se usa en pilares, celosías y ejes de transmisión. Su momento de inercia es <strong>I = π·(D⁴ − d⁴)/64</strong>.</p>`,
    derive: () => `<p>El tubo es un círculo de diámetro <i>D</i> al que se le quita otro concéntrico de diámetro interior <i>d = D − 2t</i>. Al tener el mismo centro, los momentos de inercia se restan directamente:</p>
    <div class="formula">I = π·D⁴/64 − π·d⁴/64 = π·(D⁴ − d⁴)/64</div>
    <p>Cuando la pared es delgada frente al diámetro, todo el material está prácticamente a la distancia del radio medio r<sub>m</sub>, y la fórmula se simplifica a I ≈ π·r<sub>m</sub>³·t. Es útil para estimar a mano, pero su error crece con el espesor. Como en el círculo, el momento polar es el doble: I<sub>p</sub> = 2·I.</p>`,
    example: (p, f) => {
      const d = p.d - 2 * p.t, rm = (p.d - p.t) / 2, Ia = PI * rm ** 3 * p.t;
      const it = C.series.find((s) => s.id === 'CHS').items.find((i) => i.p.d === p.d && i.p.t === p.t);
      const Deq = sq(4 * f.A / PI), Isol = PI * Deq ** 4 / 64;
      return `<p>Un tubo de <strong>${N(p.d)} mm</strong> de diámetro exterior y <strong>${N(p.t)} mm</strong> de espesor, las medidas del ${it ? `<a href="${R}perfiles/${C.slug(it.n)}.html">${esc(it.n)}</a>` : 'tubo'}.</p>
    <ol class="steps-x">
      <li><b>Diámetro interior.</b>${calc(`d = D − 2t = ${N(p.d)} − 2·${N(p.t)} = ${N(d)} mm`)}</li>
      <li><b>Área.</b>${calc(`A = π·(${N(p.d)}² − ${N(d)}²)/4 = ${N(f.A)} mm² = ${cm2(f.A)} cm²`)}</li>
      <li><b>Momento de inercia.</b>${calc(`I = π·(${N(p.d)}⁴ − ${N(d)}⁴)/64 = π·(${N(p.d ** 4)} − ${N(d ** 4)})/64 = ${N(f.Ix)} mm⁴ = ${cm4(f.Ix)} cm⁴`)}</li>
      <li><b>Módulo resistente y radio de giro.</b>${calc(`W = 2·I/D = ${N(f.Wx)} mm³ = ${cm3(f.Wx)} cm³ &nbsp;·&nbsp; i = √(D² + d²)/4 = ${N(f.ix)} mm`)}</li>
      <li><b>Comprobación con la fórmula de pared delgada.</b>${calc(`r<sub>m</sub> = (${N(p.d)} − ${N(p.t)})/2 = ${N(rm)} mm &nbsp;·&nbsp; I ≈ π·${N(rm)}³·${N(p.t)} = ${cm4(Ia)} cm⁴`)} Error: ${pct(Math.abs(Ia / f.Ix - 1))}, despreciable con D/t = ${N(p.d / p.t, 3)}.</li>
    </ol>
    <p>Con la misma cantidad de acero, una barra maciza tendría ${N(Deq, 3)} mm de diámetro e I = ${cm4(Isol)} cm⁴: el tubo es ${N(f.Ix / Isol, 3)} veces más rígido a flexión con el mismo peso.</p>`;
    },
    show: ['A', 'Ix', 'Ip', 'Wx', 'ix', 'Zx'],
    errors: [
      'Usar el espesor en lugar del diámetro interior: en la fórmula va d = D − 2t.',
      'Aplicar la aproximación de pared delgada a tubos gruesos o a ejes huecos con agujero pequeño: ahí hay que usar la fórmula exacta.',
      'Restar módulos resistentes en vez de momentos de inercia: π·(D³ − d³)/32 no es el módulo resistente del tubo.',
      'Tomar el diámetro nominal de tubería (DN) como diámetro exterior: un tubo DN 100 mide 114,3 mm por fuera.',
    ],
    related: ['circular', 'rectangular-hueca', 'semicirculo'],
  },
  {
    slug: 'triangular', type: 'triangle', fixed: { ox: 0 }, short: 'Sección triangular', menu: 'Triángulo',
    title: 'Momento de inercia de un triángulo: b·h³/36 y ejemplo · InerCAD',
    h1: 'Momento de inercia de una sección triangular',
    desc: 'Momento de inercia de un triángulo: b·h³/36 respecto al centroide y b·h³/12 respecto a la base. Posición del centroide, módulos resistentes, demostración y ejemplo resuelto.',
    sum: { A: 'b·h/2', c: 'h/3', Ix: 'b·h³/36', Iy: 'h·b³/48 <small>(isósceles)</small>' },
    ex: { b: 120, h: 180 },
    f: ({ b, h }) => ({ A: b * h / 2, xG: b / 2, yG: h / 3, Ix: b * h ** 3 / 36, Iy: h * b ** 3 / 48, Ixy: 0, Wxs: b * h * h / 24, Wxi: b * h * h / 12, Wy: h * b * b / 24, ix: h / sq(18), iy: b / sq(24) }),
    dims: ({ b, h }, r, s) => [
      { p1: [b / 2, -h / 2], p2: [-b / 2, -h / 2], off: 0.13 * s, label: 'b' },
      { p1: [-b / 2, -h / 2], p2: [-b / 2, h / 2], off: 0.13 * s, e2: [0, h / 2], label: 'h' },
      { p1: [b / 2, r.yc], p2: [b / 2, -h / 2], off: 0.13 * s, e1: [r.xc, r.yc], no1: true, place: 'side', label: 'y_G' },
    ],
    formulas: [
      ['A', 'Área', 'A = b·h/2'],
      ['y<sub>G</sub>', 'Centroide (desde la base)', 'y<sub>G</sub> = h/3'],
      ['I<sub>x</sub>', 'Momento de inercia, eje x por G', 'I<sub>x</sub> = b·h³/36'],
      ['I<sub>base</sub>', 'Respecto al eje de la base', 'I<sub>base</sub> = b·h³/12'],
      ['I<sub>y</sub>', 'Eje y por G (triángulo isósceles)', 'I<sub>y</sub> = h·b³/48'],
      ['W<sub>x,sup</sub>', 'Módulo resistente, vértice', 'W<sub>x,sup</sub> = b·h²/24'],
      ['W<sub>x,inf</sub>', 'Módulo resistente, base', 'W<sub>x,inf</sub> = b·h²/12'],
    ],
    intro: `<p>Aparece en cartelas, rigidizadores, nervios y muros, y como pieza de secciones compuestas. Respecto al eje horizontal que pasa por su centroide, situado a <strong>h/3 de la base</strong>, el momento de inercia de cualquier triángulo de base <i>b</i> y altura <i>h</i> es <strong>I<sub>x</sub> = b·h³/36</strong>.</p>`,
    derive: () => `<p>Una franja horizontal a una altura <i>y</i> sobre la base tiene un ancho que disminuye linealmente hasta el vértice: b(y) = b·(1 − y/h). Respecto a la base:</p>
    <div class="formula">I<sub>base</sub> = ∫<sub>0</sub><sup>h</sup> y²·b·(1 − y/h) dy = b·h³/3 − b·h³/4 = b·h³/12</div>
    <p>El centroide está a y<sub>G</sub> = h/3 de la base. Aplicando el <a href="./#steiner">teorema de Steiner</a> a la inversa, I<sub>x</sub> = I<sub>base</sub> − A·y<sub>G</sub>² = b·h³/12 − (b·h/2)·(h/3)² = b·h³/36.</p>
    <p>Este resultado no depende de dónde esté el vértice superior: vale igual para triángulos isósceles, rectángulos u oblicuos con la misma base y altura, porque desplazar las franjas en horizontal no cambia su distancia al eje x. I<sub>y</sub>, en cambio, sí depende de la forma: h·b³/48 si es isósceles y h·b³/36 si es rectángulo.</p>`,
    example: (p, f) => `<p>Una cartela triangular isósceles de <strong>${N(p.b)} mm</strong> de base y <strong>${N(p.h)} mm</strong> de altura.</p>
    <ol class="steps-x">
      <li><b>Área.</b>${calc(`A = b·h/2 = ${N(p.b)}·${N(p.h)}/2 = ${N(f.A)} mm² = ${cm2(f.A)} cm²`)}</li>
      <li><b>Centroide.</b>${calc(`y<sub>G</sub> = h/3 = ${N(f.yG)} mm desde la base (${N(p.h - f.yG)} mm hasta el vértice)`)}</li>
      <li><b>Momento de inercia respecto al eje x.</b>${calc(`I<sub>x</sub> = b·h³/36 = ${N(p.b)}·${N(p.h)}³/36 = ${N(f.Ix)} mm⁴ = ${cm4(f.Ix)} cm⁴`)}</li>
      <li><b>Respecto al eje y</b> (isósceles).${calc(`I<sub>y</sub> = h·b³/48 = ${N(p.h)}·${N(p.b)}³/48 = ${N(f.Iy)} mm⁴ = ${cm4(f.Iy)} cm⁴`)}</li>
      <li><b>Módulos resistentes.</b> Hay dos, uno por cada fibra extrema:${calc(`W<sub>x,sup</sub> = I<sub>x</sub>/(2h/3) = ${N(f.Wxs)} mm³ &nbsp;·&nbsp; W<sub>x,inf</sub> = I<sub>x</sub>/(h/3) = ${N(f.Wxi)} mm³`)}</li>
    </ol>
    <p>El vértice está al doble de distancia del centroide que la base, así que con el mismo momento flector su tensión es el doble: σ<sub>máx</sub> = M/W<sub>x,sup</sub>. Respecto a la base, el momento de inercia sería b·h³/12 = ${cm4(p.b * p.h ** 3 / 12)} cm⁴, tres veces más.</p>`,
    show: ['A', 'yG', 'Ix', 'Iy', 'Wxs', 'Wxi', 'Wy', 'ix', 'iy'],
    errors: [
      'Usar b·h³/12, que es respecto a la base, en lugar de b·h³/36, que es respecto al centroide.',
      'Medir y<sub>G</sub> desde el vértice: el centroide está a h/3 de la base y a 2h/3 del vértice.',
      'Usar un único módulo resistente. En secciones sin simetría respecto al eje x hay dos, y el de la fibra más alejada es el menor.',
      'Aplicar h·b³/48 a un triángulo que no es isósceles: para uno rectángulo es h·b³/36, y en general hay que calcular I<sub>y</sub> e I<sub>xy</sub>.',
    ],
    related: ['trapecio', 'rectangular', 'semicirculo'],
  },
  {
    slug: 'trapecio', type: 'trapezoid', fixed: { ox: 0 }, short: 'Sección trapezoidal', menu: 'Trapecio',
    title: 'Momento de inercia de un trapecio: fórmula y ejemplo · InerCAD',
    h1: 'Momento de inercia de un trapecio',
    desc: 'Momento de inercia de una sección trapezoidal: centroide y_G = h(b + 2b₂)/[3(b + b₂)] e I = h³(b² + 4b·b₂ + b₂²)/[36(b + b₂)]. Demostración, ejemplo resuelto y errores frecuentes.',
    sum: { A: '(b + b₂)·h/2', c: 'h(b + 2b₂)/[3(b + b₂)]', Ix: 'h³(b² + 4b·b₂ + b₂²)/[36(b + b₂)]', Iy: 'h(b + b₂)(b² + b₂²)/48' },
    ex: { b: 300, b2: 150, h: 200 },
    f: ({ b, b2, h }) => {
      const A = (b + b2) * h / 2, yG = h * (b + 2 * b2) / (3 * (b + b2)), Ix = h ** 3 * (b * b + 4 * b * b2 + b2 * b2) / (36 * (b + b2));
      const Iy = h * (b + b2) * (b * b + b2 * b2) / 48;
      return { A, xG: Math.max(b, b2) / 2, yG, Ix, Iy, Ixy: 0, Wxi: Ix / yG, Wxs: Ix / (h - yG), Wy: Iy / (Math.max(b, b2) / 2), ix: sq(Ix / A), iy: sq(Iy / A) };
    },
    dims: ({ b, b2, h }, r, s) => [
      { p1: [b / 2, -h / 2], p2: [-b / 2, -h / 2], off: 0.13 * s, label: 'b' },
      { p1: [-b2 / 2, h / 2], p2: [b2 / 2, h / 2], off: 0.13 * s, label: 'b_2' },
      { p1: [-b / 2, -h / 2], p2: [-b / 2, h / 2], off: 0.13 * s, e2: [-b2 / 2, h / 2], label: 'h' },
      { p1: [b / 2, r.yc], p2: [b / 2, -h / 2], off: 0.13 * s, no1: true, place: 'side', label: 'y_G' },
    ],
    formulas: [
      ['A', 'Área', 'A = (b + b₂)·h/2'],
      ['y<sub>G</sub>', 'Centroide (desde la base b)', 'y<sub>G</sub> = h·(b + 2b₂) / [3·(b + b₂)]'],
      ['I<sub>x</sub>', 'Momento de inercia, eje x por G', 'I<sub>x</sub> = h³·(b² + 4b·b₂ + b₂²) / [36·(b + b₂)]'],
      ['I<sub>y</sub>', 'Eje y por G (trapecio isósceles)', 'I<sub>y</sub> = h·(b + b₂)·(b² + b₂²)/48'],
      ['W<sub>x,inf</sub>', 'Módulo resistente, base b', 'W<sub>x,inf</sub> = I<sub>x</sub>/y<sub>G</sub>'],
      ['W<sub>x,sup</sub>', 'Módulo resistente, base b₂', 'W<sub>x,sup</sub> = I<sub>x</sub>/(h − y<sub>G</sub>)'],
    ],
    intro: `<p>Muros de contención, zapatas, cajeros de canales, presas y nervios con caras inclinadas. Para un trapecio de base inferior <i>b</i>, base superior <i>b₂</i> y altura <i>h</i>, el centroide y el momento de inercia tienen fórmulas cerradas que generalizan las del <a href="rectangular.html">rectángulo</a> (b₂ = b) y las del <a href="triangular.html">triángulo</a> (b₂ = 0).</p>`,
    derive: () => `<p>Se puede descomponer en un rectángulo de ancho b₂ y dos triángulos laterales y aplicar Steiner a cada parte, o integrar directamente franjas de ancho variable b(y) = b + (b₂ − b)·y/h. Las dos vías llevan a:</p>
    <div class="formula">y<sub>G</sub> = h·(b + 2b₂) / [3·(b + b₂)] &nbsp;&nbsp; I<sub>x</sub> = h³·(b² + 4b·b₂ + b₂²) / [36·(b + b₂)]</div>
    <p>Comprobación rápida: con b₂ = b sale y<sub>G</sub> = h/2 e I<sub>x</sub> = b·h³/12, el rectángulo; con b₂ = 0, y<sub>G</sub> = h/3 e I<sub>x</sub> = b·h³/36, el triángulo. Igual que en el triángulo, I<sub>x</sub> no depende de cómo estén desplazadas las bases en horizontal; I<sub>y</sub> sí, y la fórmula de la tabla corresponde al trapecio isósceles.</p>`,
    example: (p, f) => {
      const bm = (p.b + p.b2) / 2, Ir = bm * p.h ** 3 / 12;
      return `<p>Un trapecio isósceles de <strong>${N(p.b)} mm</strong> de base inferior, <strong>${N(p.b2)} mm</strong> de base superior y <strong>${N(p.h)} mm</strong> de altura.</p>
    <ol class="steps-x">
      <li><b>Área.</b>${calc(`A = (${N(p.b)} + ${N(p.b2)})·${N(p.h)}/2 = ${N(f.A)} mm² = ${cm2(f.A)} cm²`)}</li>
      <li><b>Centroide.</b>${calc(`y<sub>G</sub> = ${N(p.h)}·(${N(p.b)} + 2·${N(p.b2)}) / [3·(${N(p.b)} + ${N(p.b2)})] = ${N(f.yG)} mm desde la base mayor`)}</li>
      <li><b>Momento de inercia respecto al eje x.</b>${calc(`I<sub>x</sub> = ${N(p.h)}³·(${N(p.b)}² + 4·${N(p.b)}·${N(p.b2)} + ${N(p.b2)}²) / [36·(${N(p.b)} + ${N(p.b2)})] = ${N(f.Ix)} mm⁴ = ${cm4(f.Ix)} cm⁴`)}</li>
      <li><b>Respecto al eje y.</b>${calc(`I<sub>y</sub> = ${N(p.h)}·(${N(p.b)} + ${N(p.b2)})·(${N(p.b)}² + ${N(p.b2)}²)/48 = ${N(f.Iy)} mm⁴ = ${cm4(f.Iy)} cm⁴`)}</li>
      <li><b>Módulos resistentes.</b>${calc(`W<sub>x,inf</sub> = I<sub>x</sub>/y<sub>G</sub> = ${N(f.Wxi)} mm³ &nbsp;·&nbsp; W<sub>x,sup</sub> = I<sub>x</sub>/(h − y<sub>G</sub>) = ${N(f.Wxs)} mm³`)}</li>
    </ol>
    <p>Un atajo habitual es sustituir el trapecio por un rectángulo de ancho medio (${N(bm)} mm). Da el área correcta, pero I = ${cm4(Ir)} cm⁴, un ${pct(Math.abs(Ir / f.Ix - 1))} ${Ir > f.Ix ? 'más' : 'menos'} que el valor exacto, y sitúa mal el centroide (a ${N(p.h / 2)} mm en vez de ${N(f.yG)} mm).</p>`;
    },
    show: ['A', 'yG', 'Ix', 'Iy', 'Wxi', 'Wxs', 'Wy'],
    errors: [
      'Medir y<sub>G</sub> desde la base pequeña. Con la fórmula de esta página se mide desde la base b; si la base mayor está arriba, basta con intercambiar b y b₂.',
      'Sustituir el trapecio por un rectángulo de ancho medio: el área coincide, pero el centroide y el momento de inercia no.',
      'Aplicar la I<sub>y</sub> del trapecio isósceles a un trapecio rectángulo u oblicuo.',
      'Olvidar que hay dos módulos resistentes distintos, uno por cada base.',
    ],
    related: ['triangular', 'rectangular', 'seccion-t'],
  },
  {
    slug: 'semicirculo', type: 'semicircle', fixed: {}, short: 'Semicírculo', menu: 'Semicírculo',
    title: 'Momento de inercia de un semicírculo: fórmula y ejemplo · InerCAD',
    h1: 'Momento de inercia de un semicírculo',
    desc: 'Momento de inercia de un semicírculo: (π/8 − 8/9π)·r⁴ ≈ 0,1098·r⁴ respecto al centroide y π·r⁴/8 respecto al diámetro. Centroide a 4r/3π, demostración y ejemplo resuelto.',
    sum: { A: 'π·r²/2', c: '4r/(3π)', Ix: '(π/8 − 8/9π)·r⁴', Iy: 'π·r⁴/8' },
    ex: { d: 200 },
    f: ({ d }) => {
      const r = d / 2, A = PI * r * r / 2, yG = 4 * r / (3 * PI), Ix = (PI / 8 - 8 / (9 * PI)) * r ** 4, Iy = PI * r ** 4 / 8;
      return { A, xG: r, yG, Ix, Iy, Ixy: 0, Wxi: Ix / yG, Wxs: Ix / (r - yG), Wy: Iy / r, ix: sq(Ix / A), iy: sq(Iy / A) };
    },
    dims: ({ d }, r, s) => [
      { p1: [d / 2, -d / 4], p2: [-d / 2, -d / 4], off: 0.13 * s, label: 'D = 2r' },
      { p1: [d / 2, r.yc], p2: [d / 2, -d / 4], off: 0.13 * s, no1: true, place: 'side', label: 'y_G' },
    ],
    formulas: [
      ['A', 'Área', 'A = π·r²/2'],
      ['y<sub>G</sub>', 'Centroide (desde el diámetro)', 'y<sub>G</sub> = 4r/(3π) ≈ 0,4244·r'],
      ['I<sub>x</sub>', 'Momento de inercia, eje x por G', 'I<sub>x</sub> = (π/8 − 8/(9π))·r⁴ ≈ 0,1098·r⁴'],
      ['I<sub>diám</sub>', 'Respecto al diámetro', 'I<sub>diám</sub> = π·r⁴/8'],
      ['I<sub>y</sub>', 'Eje de simetría (vertical)', 'I<sub>y</sub> = π·r⁴/8'],
      ['W<sub>x,inf</sub>', 'Módulo resistente, lado recto', 'W<sub>x,inf</sub> = I<sub>x</sub>/y<sub>G</sub>'],
      ['W<sub>x,sup</sub>', 'Módulo resistente, punto más alto', 'W<sub>x,sup</sub> = I<sub>x</sub>/(r − y<sub>G</sub>)'],
    ],
    intro: `<p>Aparece en bordes redondeados, conductos, arcos y como parte de secciones compuestas, por ejemplo un rectángulo rematado en semicírculos. Su centroide no está en el diámetro ni a media altura, sino a <strong>4r/(3π) ≈ 0,424·r</strong> del lado recto, y su momento de inercia respecto al eje horizontal que pasa por él es <strong>≈ 0,1098·r⁴</strong>.</p>`,
    derive: () => `<p>Respecto al diámetro, el semicírculo tiene exactamente la mitad del momento de inercia del <a href="circular.html">círculo</a> completo, porque cada mitad aporta lo mismo: I<sub>diám</sub> = π·r⁴/8. Para llevarlo al eje paralelo que pasa por el centroide se resta A·y<sub>G</sub>² (el <a href="./#steiner">teorema de Steiner</a> a la inversa):</p>
    <div class="formula">I<sub>x</sub> = π·r⁴/8 − (π·r²/2)·(4r/3π)² = (π/8 − 8/(9π))·r⁴ ≈ 0,1098·r⁴</div>
    <p>Respecto al eje vertical de simetría no hay que trasladar nada, porque ya pasa por el centroide: I<sub>y</sub> = π·r⁴/8. La posición del centroide sale de y<sub>G</sub> = (1/A)·∫ y dA = (2/3)·r³ / (π·r²/2) = 4r/(3π).</p>`,
    example: (p, f) => {
      const r = p.d / 2, Id = PI * r ** 4 / 8;
      return `<p>Un semicírculo de <strong>${N(p.d)} mm</strong> de diámetro (r = ${N(r)} mm).</p>
    <ol class="steps-x">
      <li><b>Área.</b>${calc(`A = π·${N(r)}²/2 = ${N(f.A)} mm² = ${cm2(f.A)} cm²`)}</li>
      <li><b>Centroide.</b>${calc(`y<sub>G</sub> = 4·${N(r)}/(3π) = ${N(f.yG)} mm desde el diámetro`)}</li>
      <li><b>Respecto al diámetro.</b>${calc(`I<sub>diám</sub> = π·${N(r)}⁴/8 = ${N(Id)} mm⁴`)}</li>
      <li><b>Traslado al centroide.</b>${calc(`I<sub>x</sub> = ${N(Id)} − ${N(f.A)}·${N(f.yG)}² = ${N(f.Ix)} mm⁴ = ${cm4(f.Ix)} cm⁴`)}</li>
      <li><b>Módulos resistentes.</b>${calc(`W<sub>x,inf</sub> = I<sub>x</sub>/y<sub>G</sub> = ${N(f.Wxi)} mm³ &nbsp;·&nbsp; W<sub>x,sup</sub> = I<sub>x</sub>/(r − y<sub>G</sub>) = ${N(f.Wxs)} mm³`)}</li>
    </ol>
    <p>El momento de inercia respecto al diámetro es ${N(Id / f.Ix, 3)} veces el que corresponde al centroide: confundirlos es el error más habitual con esta forma.</p>`;
    },
    show: ['A', 'yG', 'Ix', 'Iy', 'Wxi', 'Wxs', 'ix'],
    errors: [
      'Usar π·r⁴/8 como momento de inercia respecto al centroide: es respecto al diámetro, unas 3,6 veces mayor.',
      'Situar el centroide a r/2 del diámetro: está a 4r/(3π) ≈ 0,424·r.',
      'Al combinarlo con otras formas, aplicar Steiner desde el diámetro con I<sub>x</sub> del centroide (o al revés). La distancia d de Steiner siempre se mide desde el centroide de la pieza.',
    ],
    related: ['circular', 'tubo-circular', 'triangular'],
  },
  {
    slug: 'seccion-t', type: 'tee', fixed: { r: 0 }, short: 'Sección en T', menu: 'Sección en T',
    title: 'Momento de inercia de una sección en T: cálculo paso a paso · InerCAD',
    h1: 'Momento de inercia de una sección en T',
    desc: 'Cómo calcular el momento de inercia de una sección en T: centroide, teorema de Steiner con tabla paso a paso, módulos resistentes superior e inferior y errores frecuentes. Con ejemplo resuelto.',
    sum: { A: 'b·t<sub>f</sub> + t<sub>w</sub>·(h − t<sub>f</sub>)', c: 'Σ A<sub>i</sub>·y<sub>i</sub> / A', Ix: 'Σ (I<sub>i</sub> + A<sub>i</sub>·d<sub>i</sub>²)', Iy: '[t<sub>f</sub>·b³ + (h − t<sub>f</sub>)·t<sub>w</sub>³]/12' },
    ex: { b: 150, tf: 20, h: 200, tw: 12 },
    f: ({ b, tf, h, tw }) => {
      const hw = h - tf, A1 = b * tf, y1 = h - tf / 2, A2 = tw * hw, y2 = hw / 2, A = A1 + A2, yG = (A1 * y1 + A2 * y2) / A;
      const Ix = b * tf ** 3 / 12 + A1 * (y1 - yG) ** 2 + tw * hw ** 3 / 12 + A2 * (y2 - yG) ** 2, Iy = (tf * b ** 3 + hw * tw ** 3) / 12;
      return { A, xG: b / 2, yG, Ix, Iy, Ixy: 0, Wxs: Ix / (h - yG), Wxi: Ix / yG, Wy: 2 * Iy / b, ix: sq(Ix / A), iy: sq(Iy / A) };
    },
    dims: ({ b, tf, h, tw }, r, s) => [
      { p1: [-b / 2, h / 2], p2: [b / 2, h / 2], off: 0.13 * s, label: 'b' },
      { p1: [-b / 2, -h / 2], p2: [-b / 2, h / 2], off: 0.13 * s, e1: [-tw / 2, -h / 2], label: 'h' },
      { p1: [b / 2, h / 2], p2: [b / 2, h / 2 - tf], off: 0.1 * s, place: 'side', inner: true, label: 't_f' },
      { p1: [-tw / 2, -h / 4], p2: [tw / 2, -h / 4], inner: true, place: 'end', label: 't_w' },
      { p1: [b / 2, r.yc], p2: [b / 2, -h / 2], off: 0.1 * s, e2: [tw / 2, -h / 2], no1: true, place: 'side', label: 'y_G' },
    ],
    formulas: [
      ['A', 'Área (ala + alma)', 'A = b·t<sub>f</sub> + t<sub>w</sub>·(h − t<sub>f</sub>)'],
      ['y<sub>G</sub>', 'Centroide (desde la base del alma)', 'y<sub>G</sub> = [b·t<sub>f</sub>·(h − t<sub>f</sub>/2) + t<sub>w</sub>·(h − t<sub>f</sub>)²/2] / A'],
      ['I<sub>x</sub>', 'Momento de inercia, eje x por G', 'I<sub>x</sub> = Σ [I<sub>i</sub> + A<sub>i</sub>·(y<sub>i</sub> − y<sub>G</sub>)²]'],
      ['I<sub>y</sub>', 'Momento de inercia, eje y', 'I<sub>y</sub> = [t<sub>f</sub>·b³ + (h − t<sub>f</sub>)·t<sub>w</sub>³]/12'],
      ['W<sub>x,sup</sub>', 'Módulo resistente, cara del ala', 'W<sub>x,sup</sub> = I<sub>x</sub>/(h − y<sub>G</sub>)'],
      ['W<sub>x,inf</sub>', 'Módulo resistente, extremo del alma', 'W<sub>x,inf</sub> = I<sub>x</sub>/y<sub>G</sub>'],
    ],
    intro: `<p>Vigas en T de hormigón (con la losa como ala), perfiles T laminados o soldados y chapas con un nervio rigidizador. La T no es simétrica respecto al eje horizontal, así que <strong>primero hay que localizar el centroide</strong> y después sumar la contribución de cada rectángulo con el <a href="./#steiner">teorema de Steiner</a>.</p>`,
    derive: () => `<p>El cálculo a mano sigue cuatro pasos, y es el mismo para cualquier sección compuesta de rectángulos:</p>
    <ol>
      <li>Dividir la sección en partes simples sin solaparlas: el ala (b × t<sub>f</sub>) y el alma (t<sub>w</sub> × (h − t<sub>f</sub>)).</li>
      <li>Calcular el área A<sub>i</sub> de cada parte y la posición y<sub>i</sub> de su centroide, todas medidas desde la misma referencia (aquí, la base del alma).</li>
      <li>Hallar el centroide de la sección: y<sub>G</sub> = Σ A<sub>i</sub>·y<sub>i</sub> / Σ A<sub>i</sub>.</li>
      <li>Sumar el momento de inercia propio de cada parte más su término de Steiner, A<sub>i</sub>·d<sub>i</sub>², con d<sub>i</sub> = y<sub>i</sub> − y<sub>G</sub>.</li>
    </ol>
    <div class="formula">I<sub>x</sub> = Σ (b<sub>i</sub>·h<sub>i</sub>³/12 + A<sub>i</sub>·d<sub>i</sub>²)</div>
    <p>Para I<sub>y</sub> no hace falta Steiner: el ala y el alma están centradas en el eje vertical de simetría, así que basta con sumar t<sub>f</sub>·b³/12 y (h − t<sub>f</sub>)·t<sub>w</sub>³/12.</p>`,
    example: (p, f) => {
      const hw = p.h - p.tf;
      const st = steiner([
        [`Ala ${N(p.b)} × ${N(p.tf)}`, p.b * p.tf, p.h - p.tf / 2, p.b * p.tf ** 3 / 12],
        [`Alma ${N(p.tw)} × ${N(hw)}`, p.tw * hw, hw / 2, p.tw * hw ** 3 / 12],
      ], 'x');
      return `<p>Una T de <strong>${N(p.h)} mm</strong> de canto con un ala de <strong>${N(p.b)} × ${N(p.tf)} mm</strong> y un alma de <strong>${N(p.tw)} mm</strong> de espesor (b = ${N(p.b)}, t<sub>f</sub> = ${N(p.tf)}, h = ${N(p.h)}, t<sub>w</sub> = ${N(p.tw)}). Las distancias y<sub>i</sub> se miden desde la base del alma.</p>
    ${st.html}
    <ol class="steps-x">
      <li><b>Centroide.</b>${calc(`y<sub>G</sub> = Σ A<sub>i</sub>·y<sub>i</sub> / Σ A<sub>i</sub> = ${N(st.c * st.A)} / ${N(st.A)} = ${N(f.yG)} mm desde la base (${N(p.h - f.yG)} mm hasta la cara superior del ala)`)}</li>
      <li><b>Momento de inercia respecto al eje x.</b> Es la suma de las dos últimas columnas:${calc(`I<sub>x</sub> = Σ I<sub>x,i</sub> + Σ A<sub>i</sub>·d<sub>i</sub>² = ${N(f.Ix)} mm⁴ = ${cm4(f.Ix)} cm⁴`)}</li>
      <li><b>Respecto al eje y.</b>${calc(`I<sub>y</sub> = (${N(p.tf)}·${N(p.b)}³ + ${N(hw)}·${N(p.tw)}³)/12 = ${N(f.Iy)} mm⁴ = ${cm4(f.Iy)} cm⁴`)}</li>
      <li><b>Módulos resistentes.</b>${calc(`W<sub>x,sup</sub> = I<sub>x</sub>/(h − y<sub>G</sub>) = ${N(f.Wxs)} mm³ &nbsp;·&nbsp; W<sub>x,inf</sub> = I<sub>x</sub>/y<sub>G</sub> = ${N(f.Wxi)} mm³`)}</li>
    </ol>
    <p>El término de Steiner aporta el ${pct(st.I ? (st.I - p.b * p.tf ** 3 / 12 - p.tw * hw ** 3 / 12) / st.I : 0)} del total: sin él, el resultado sería completamente erróneo. Y como el extremo del alma está más lejos del centroide que la cara del ala, W<sub>x,inf</sub> es el menor: con un momento que comprime el ala, la tracción máxima aparece en el borde inferior del alma.</p>`;
    },
    show: ['A', 'yG', 'Ix', 'Iy', 'Wxs', 'Wxi', 'Wy', 'ix', 'Zx'],
    errors: [
      'Sumar los momentos de inercia propios sin el término A·d² de Steiner.',
      'Contar dos veces la zona de unión: si el ala mide b × t<sub>f</sub>, el alma mide h − t<sub>f</sub> de alto, no h.',
      'Medir los y<sub>i</sub> desde referencias distintas. Todos deben medirse desde la misma línea.',
      'Tomar h/2 como distancia a la fibra extrema: el centroide no está a media altura y hay dos módulos resistentes.',
    ],
    related: ['doble-t', 'canal-u', 'angular-l'],
  },
  {
    slug: 'doble-t', type: 'ibeam', fixed: { r: 0 }, short: 'Perfil en I (doble T)', menu: 'Perfil en I',
    title: 'Momento de inercia de un perfil en I (doble T): fórmula y ejemplo · InerCAD',
    h1: 'Momento de inercia de un perfil en I (doble T)',
    desc: 'Momento de inercia de una viga en I o doble T: I = [b·h³ − (b − t_w)(h − 2t_f)³]/12. Eje fuerte y débil, módulo resistente plástico, ejemplo con las medidas de un IPE 300 y efecto de los acuerdos.',
    sum: { A: '2b·t<sub>f</sub> + t<sub>w</sub>·h<sub>w</sub>', c: 'h/2', Ix: '[b·h³ − (b − t<sub>w</sub>)·h<sub>w</sub>³]/12', Iy: '(2t<sub>f</sub>·b³ + h<sub>w</sub>·t<sub>w</sub>³)/12' },
    ex: { h: 300, b: 150, tf: 10.7, tw: 7.1 },
    f: ({ h, b, tf, tw }) => {
      const hw = h - 2 * tf, Ix = (b * h ** 3 - (b - tw) * hw ** 3) / 12, Iy = (2 * tf * b ** 3 + hw * tw ** 3) / 12, A = 2 * b * tf + tw * hw;
      return { A, xG: b / 2, yG: h / 2, Ix, Iy, Ixy: 0, Wx: 2 * Ix / h, Wy: 2 * Iy / b, ix: sq(Ix / A), iy: sq(Iy / A), Zx: b * tf * (h - tf) + tw * hw * hw / 4, Zy: tf * b * b / 2 + hw * tw * tw / 4 };
    },
    dims: ({ h, b, tf, tw }, r, s) => [
      { p1: [-b / 2, h / 2], p2: [b / 2, h / 2], off: 0.13 * s, label: 'b' },
      { p1: [-b / 2, -h / 2], p2: [-b / 2, h / 2], off: 0.13 * s, label: 'h' },
      { p1: [b / 2, h / 2], p2: [b / 2, h / 2 - tf], off: 0.1 * s, place: 'side', inner: true, label: 't_f' },
      { p1: [-tw / 2, -h / 4], p2: [tw / 2, -h / 4], inner: true, place: 'end', label: 't_w' },
    ],
    formulas: [
      ['h<sub>w</sub>', 'Altura del alma entre alas', 'h<sub>w</sub> = h − 2t<sub>f</sub>'],
      ['A', 'Área', 'A = 2·b·t<sub>f</sub> + t<sub>w</sub>·h<sub>w</sub>'],
      ['I<sub>x</sub>', 'Eje fuerte (horizontal)', 'I<sub>x</sub> = [b·h³ − (b − t<sub>w</sub>)·h<sub>w</sub>³]/12'],
      ['I<sub>y</sub>', 'Eje débil (vertical)', 'I<sub>y</sub> = (2·t<sub>f</sub>·b³ + h<sub>w</sub>·t<sub>w</sub>³)/12'],
      ['W<sub>x</sub>', 'Módulo resistente elástico', 'W<sub>x</sub> = 2·I<sub>x</sub>/h'],
      ['W<sub>pl,x</sub>', 'Módulo resistente plástico', 'W<sub>pl,x</sub> = b·t<sub>f</sub>·(h − t<sub>f</sub>) + t<sub>w</sub>·h<sub>w</sub>²/4'],
      ['W<sub>pl,y</sub>', 'Plástico, eje débil', 'W<sub>pl,y</sub> = t<sub>f</sub>·b²/2 + h<sub>w</sub>·t<sub>w</sub>²/4'],
    ],
    intro: `<p>Las vigas en I o doble T (IPE, HEA, HEB y vigas armadas) concentran el material en las alas, lejos del eje neutro, lo que les da el mayor momento de inercia por kilo de acero para flexión respecto al eje fuerte. Como la sección es doblemente simétrica, el centroide está en el centro y el cálculo se reduce a <strong>restar dos huecos a un rectángulo</strong>.</p>`,
    derive: () => `<p>El camino más corto es el rectángulo exterior <i>b × h</i> menos los dos huecos laterales entre las alas. Juntos forman un rectángulo de (b − t<sub>w</sub>) × (h − 2t<sub>f</sub>) centrado en el mismo punto, así que no hace falta Steiner:</p>
    <div class="formula">I<sub>x</sub> = b·h³/12 − (b − t<sub>w</sub>)·(h − 2t<sub>f</sub>)³/12</div>
    <p>Respecto al eje débil se suman las tres piezas, todas centradas en el eje vertical: I<sub>y</sub> = 2·t<sub>f</sub>·b³/12 + (h − 2t<sub>f</sub>)·t<sub>w</sub>³/12. El módulo plástico se obtiene como la suma de cada área por la distancia de su centroide al eje neutro plástico, que en esta sección coincide con el elástico: W<sub>pl,x</sub> = b·t<sub>f</sub>·(h − t<sub>f</sub>) + t<sub>w</sub>·h<sub>w</sub>²/4.</p>`,
    example: (p, f) => {
      const hw = p.h - 2 * p.tf;
      const it = C.series.find((s) => s.id === 'IPE').items.find((i) => i.p.h === p.h && i.p.b === p.b && i.p.tf === p.tf && i.p.tw === p.tw);
      const real = it && S.analyze([C.makeShape(it)]);
      const Ifl = 2 * (p.b * p.tf ** 3 / 12 + p.b * p.tf * ((p.h - p.tf) / 2) ** 2);
      return `<p>Una viga con las medidas de un <strong>${it ? esc(it.n) : 'perfil en I'}</strong> pero sin los acuerdos entre alma y alas: h = ${N(p.h)}, b = ${N(p.b)}, t<sub>f</sub> = ${N(p.tf)} y t<sub>w</sub> = ${N(p.tw)} mm.</p>
    <ol class="steps-x">
      <li><b>Altura del alma y área.</b>${calc(`h<sub>w</sub> = ${N(p.h)} − 2·${N(p.tf)} = ${N(hw)} mm &nbsp;·&nbsp; A = 2·${N(p.b)}·${N(p.tf)} + ${N(p.tw)}·${N(hw)} = ${N(f.A)} mm² = ${cm2(f.A)} cm²`)}</li>
      <li><b>Eje fuerte.</b>${calc(`I<sub>x</sub> = [${N(p.b)}·${N(p.h)}³ − ${N(p.b - p.tw)}·${N(hw)}³]/12 = ${N(f.Ix)} mm⁴ = ${cm4(f.Ix)} cm⁴`)}</li>
      <li><b>Eje débil.</b>${calc(`I<sub>y</sub> = (2·${N(p.tf)}·${N(p.b)}³ + ${N(hw)}·${N(p.tw)}³)/12 = ${N(f.Iy)} mm⁴ = ${cm4(f.Iy)} cm⁴`)}</li>
      <li><b>Módulos resistentes.</b>${calc(`W<sub>x</sub> = 2·I<sub>x</sub>/h = ${cm3(f.Wx)} cm³ &nbsp;·&nbsp; W<sub>pl,x</sub> = ${N(p.b)}·${N(p.tf)}·${N(p.h - p.tf)} + ${N(p.tw)}·${N(hw)}²/4 = ${cm3(f.Zx)} cm³`)}</li>
    </ol>
    <p>Las dos alas aportan el ${pct(Ifl / f.Ix)} de I<sub>x</sub> con solo el ${pct(2 * p.b * p.tf / f.A)} del área: por eso el perfil en I es tan eficiente a flexión. En cambio, respecto al eje débil, I<sub>y</sub> es ${N(f.Ix / f.Iy, 3)} veces menor, y el pandeo lateral o respecto a ese eje suele ser lo que limita.</p>
    ${real ? `<p>El ${esc(it.n)} laminado tiene además acuerdos de r = ${N(it.p.r)} mm entre alma y alas. Según su <a href="${R}perfiles/${C.slug(it.n)}.html">ficha</a>, A = ${cm2(real.A)} cm² e I<sub>x</sub> = ${cm4(real.Ixc)} cm⁴: los acuerdos añaden un ${pct(real.A / f.A - 1)} de área y un ${pct(real.Ixc / f.Ix - 1)} de momento de inercia. Para perfiles comerciales, usa las <a href="${R}perfiles/ipe.html">tablas de perfiles</a>.</p>` : ''}`;
    },
    show: ['A', 'Ix', 'Iy', 'Wx', 'Wy', 'ix', 'iy', 'Zx', 'Zy'],
    errors: [
      'Restar un hueco de altura h − t<sub>f</sub> en vez de h − 2t<sub>f</sub>, o de ancho b − t<sub>w</sub>/2 (solo un lado).',
      'Usar las medidas nominales sin acuerdos para comprobar un perfil laminado: los acuerdos cambian el área y la inercia en unos puntos porcentuales.',
      'Confundir los ejes: en el Eurocódigo 3 el eje fuerte se llama y–y y el débil z–z; aquí y en InerCAD son x e y.',
      'Aplicar W<sub>pl</sub> sin comprobar la clase de la sección: solo las secciones de clase 1 y 2 pueden usar el módulo plástico.',
    ],
    related: ['seccion-t', 'canal-u', 'rectangular-hueca'],
  },
  {
    slug: 'angular-l', type: 'angle', fixed: { r1: 0, r2: 0 }, short: 'Perfil L (angular)', menu: 'Angular L',
    title: 'Momento de inercia de un perfil L (angular): ejes principales · InerCAD',
    h1: 'Momento de inercia de un perfil L (angular)',
    desc: 'Cómo calcular el momento de inercia de un angular L: centroide, I_x, I_y, producto de inercia I_xy, momentos y ejes principales, radio de giro mínimo. Ejemplo resuelto con un L 120×80×10.',
    sum: { A: 't·(h + b − t)', c: 'Σ A<sub>i</sub>·y<sub>i</sub> / A', Ix: 'Σ (I<sub>i</sub> + A<sub>i</sub>·d<sub>i</sub>²)', Iy: 'Σ (I<sub>i</sub> + A<sub>i</sub>·d<sub>i</sub>²)' },
    ex: { h: 120, b: 80, t: 10 },
    f: ({ h, b, t }) => {
      const A1 = t * h, x1 = t / 2, y1 = h / 2, A2 = (b - t) * t, x2 = t + (b - t) / 2, y2 = t / 2, A = A1 + A2;
      const xG = (A1 * x1 + A2 * x2) / A, yG = (A1 * y1 + A2 * y2) / A;
      const Ix = t * h ** 3 / 12 + A1 * (y1 - yG) ** 2 + (b - t) * t ** 3 / 12 + A2 * (y2 - yG) ** 2;
      const Iy = h * t ** 3 / 12 + A1 * (x1 - xG) ** 2 + t * (b - t) ** 3 / 12 + A2 * (x2 - xG) ** 2;
      const Ixy = A1 * (x1 - xG) * (y1 - yG) + A2 * (x2 - xG) * (y2 - yG);
      const avg = (Ix + Iy) / 2, rho = Math.hypot((Ix - Iy) / 2, Ixy), th = 0.5 * Math.atan2(-Ixy, (Ix - Iy) / 2);
      return { A, xG, yG, Ix, Iy, Ixy, I1: avg + rho, I2: avg - rho, th, Wxs: Ix / (h - yG), Wxi: Ix / yG, Wyl: Iy / xG, Wyr: Iy / (b - xG), ix: sq(Ix / A), iy: sq(Iy / A), i2: sq((avg - rho) / A) };
    },
    principal: true,
    dims: ({ h, b, t }, r, s) => [
      { p1: [b / 2, -h / 2], p2: [-b / 2, -h / 2], off: 0.13 * s, label: 'b' },
      { p1: [-b / 2, -h / 2], p2: [-b / 2, h / 2], off: 0.13 * s, label: 'h' },
      { p1: [-b / 2, h / 2], p2: [-b / 2 + t, h / 2], off: 0.06 * s, inner: true, place: 'end', label: 't' },
      { p1: [b / 2, r.yc], p2: [b / 2, -h / 2], off: 0.13 * s, no1: true, place: 'side', label: 'y_G' },
      { p1: [r.xc, -h / 2], p2: [-b / 2, -h / 2], off: 0.25 * s, no1: true, place: 'mid', label: 'x_G' },
    ],
    formulas: [
      ['A', 'Área', 'A = t·(h + b − t)'],
      ['x<sub>G</sub>, y<sub>G</sub>', 'Centroide (desde la esquina exterior)', 'x<sub>G</sub> = Σ A<sub>i</sub>·x<sub>i</sub> / A, &nbsp;y<sub>G</sub> = Σ A<sub>i</sub>·y<sub>i</sub> / A'],
      ['I<sub>x</sub>, I<sub>y</sub>', 'Momentos de inercia por G', 'Σ (I<sub>i</sub> + A<sub>i</sub>·d<sub>i</sub>²)'],
      ['I<sub>xy</sub>', 'Producto de inercia', 'I<sub>xy</sub> = Σ A<sub>i</sub>·(x<sub>i</sub> − x<sub>G</sub>)·(y<sub>i</sub> − y<sub>G</sub>)'],
      ['I<sub>u</sub>, I<sub>v</sub>', 'Momentos principales', '(I<sub>x</sub> + I<sub>y</sub>)/2 ± √[((I<sub>x</sub> − I<sub>y</sub>)/2)² + I<sub>xy</sub>²]'],
      ['θ', 'Giro de los ejes principales', 'tan 2θ = −2·I<sub>xy</sub> / (I<sub>x</sub> − I<sub>y</sub>)'],
      ['i<sub>v</sub>', 'Radio de giro mínimo', 'i<sub>v</sub> = √(I<sub>v</sub>/A)'],
    ],
    intro: `<p>Los angulares se usan en celosías, arriostramientos, dinteles, marcos y uniones. Un angular no tiene ningún eje de simetría paralelo a sus alas, así que además de I<sub>x</sub> e I<sub>y</sub> hay que calcular el <strong>producto de inercia I<sub>xy</sub></strong>: los ejes de máxima y mínima inercia están girados, y el pandeo de un angular suelto se produce respecto al <strong>eje principal débil v</strong>.</p>`,
    derive: () => `<p>Se divide en dos rectángulos sin solaparlos: el ala vertical completa (t × h) y el resto del ala horizontal ((b − t) × t). Con el origen en la esquina exterior se calcula el centroide, y con el <a href="./#steiner">teorema de Steiner</a>, I<sub>x</sub> e I<sub>y</sub>. El producto de inercia se obtiene igual, pero solo con los términos de traslado, porque el de cada rectángulo respecto a sus propios ejes de simetría es nulo.</p>
    <p>Con I<sub>x</sub>, I<sub>y</sub> e I<sub>xy</sub> se obtienen los momentos principales y el giro θ de sus ejes, que es lo mismo que dibuja el <a href="${R}guia.html#ejes">círculo de Mohr</a>:</p>
    <div class="formula">I<sub>u,v</sub> = (I<sub>x</sub> + I<sub>y</sub>)/2 ± √[((I<sub>x</sub> − I<sub>y</sub>)/2)² + I<sub>xy</sub>²] &nbsp;&nbsp; tan 2θ = −2·I<sub>xy</sub>/(I<sub>x</sub> − I<sub>y</sub>)</div>
    <p>Con alas iguales, I<sub>x</sub> = I<sub>y</sub> y los ejes principales están siempre a 45°.</p>`,
    example: (p, f) => {
      const A1 = p.t * p.h, A2 = (p.b - p.t) * p.t, x1 = p.t / 2, y1 = p.h / 2, x2 = p.t + (p.b - p.t) / 2, y2 = p.t / 2;
      const sx = steiner([[`Ala vertical ${N(p.t)} × ${N(p.h)}`, A1, y1, p.t * p.h ** 3 / 12], [`Ala horizontal ${N(p.b - p.t)} × ${N(p.t)}`, A2, y2, (p.b - p.t) * p.t ** 3 / 12]], 'x');
      const sy = steiner([[`Ala vertical ${N(p.t)} × ${N(p.h)}`, A1, x1, p.h * p.t ** 3 / 12], [`Ala horizontal ${N(p.b - p.t)} × ${N(p.t)}`, A2, x2, p.t * (p.b - p.t) ** 3 / 12]], 'y');
      return `<p>Un angular de alas desiguales <strong>L ${N(p.h)}×${N(p.b)}×${N(p.t)}</strong> sin radios de acuerdo, con el ala larga en vertical (h = ${N(p.h)}, b = ${N(p.b)}, t = ${N(p.t)} mm). Las distancias se miden desde la esquina exterior.</p>
    <h3>Centroide e I<sub>x</sub></h3>
    ${sx.html}
    ${calc(`y<sub>G</sub> = ${N(sx.c * sx.A)} / ${N(sx.A)} = ${N(f.yG)} mm &nbsp;·&nbsp; I<sub>x</sub> = ${N(f.Ix)} mm⁴ = ${cm4(f.Ix)} cm⁴`)}
    <h3>I<sub>y</sub></h3>
    ${sy.html}
    ${calc(`x<sub>G</sub> = ${N(sy.c * sy.A)} / ${N(sy.A)} = ${N(f.xG)} mm &nbsp;·&nbsp; I<sub>y</sub> = ${N(f.Iy)} mm⁴ = ${cm4(f.Iy)} cm⁴`)}
    <h3>Producto de inercia y ejes principales</h3>
    ${calc(`I<sub>xy</sub> = ${N(A1)}·(${N(x1 - f.xG)})·(${N(y1 - f.yG)}) + ${N(A2)}·(${N(x2 - f.xG)})·(${N(y2 - f.yG)}) = ${N(f.Ixy)} mm⁴`)}
    ${calc(`I<sub>u</sub> = ${N(f.I1)} mm⁴ = ${cm4(f.I1)} cm⁴ &nbsp;·&nbsp; I<sub>v</sub> = ${N(f.I2)} mm⁴ = ${cm4(f.I2)} cm⁴ &nbsp;·&nbsp; θ = ${deg(f.th)}`)}
    <p>I<sub>xy</sub> es negativo porque, vistas desde el centroide, las alas quedan en los cuadrantes segundo y cuarto; el eje de máxima inercia u está girado ${deg(f.th)} en sentido antihorario respecto al eje x. El radio de giro mínimo es i<sub>v</sub> = √(I<sub>v</sub>/A) = ${N(f.i2)} mm, frente a i<sub>x</sub> = ${N(f.ix)} mm e i<sub>y</sub> = ${N(f.iy)} mm: es el que manda en el pandeo de un angular aislado. Los angulares de alas iguales con sus radios están en las <a href="${R}perfiles/l.html">tablas de angulares</a>.</p>`;
    },
    show: ['A', 'xG', 'yG', 'Ix', 'Iy', 'Ixy', 'I1', 'I2', 'th', 'i2'],
    errors: [
      'Tomar I<sub>x</sub> e I<sub>y</sub> como momentos principales: en un angular no lo son, porque I<sub>xy</sub> ≠ 0.',
      'Solapar los dos rectángulos y contar dos veces el cuadrado t × t de la esquina.',
      'Equivocar el signo de I<sub>xy</sub>, que depende de la orientación del angular: con las alas hacia arriba y a la derecha (como en la figura) es negativo.',
      'Comprobar el pandeo de un angular suelto con i<sub>x</sub> o i<sub>y</sub> en vez del radio de giro mínimo i<sub>v</sub>.',
    ],
    related: ['seccion-t', 'canal-u', 'rectangular'],
  },
  {
    slug: 'canal-u', type: 'channel', fixed: { r: 0 }, short: 'Perfil en U', menu: 'Perfil en U',
    title: 'Momento de inercia de un perfil en U (canal): fórmula y ejemplo · InerCAD',
    h1: 'Momento de inercia de un perfil en U',
    desc: 'Momento de inercia de un perfil en U o canal: I_x = [b·h³ − (b − t_w)(h − 2t_f)³]/12, centroide desde el alma e I_y con Steiner. Ejemplo resuelto, módulos resistentes y centro de esfuerzos cortantes.',
    sum: { A: '2b·t<sub>f</sub> + t<sub>w</sub>·h<sub>w</sub>', c: 'x<sub>G</sub> = (b²·t<sub>f</sub> + h<sub>w</sub>·t<sub>w</sub>²/2)/A', Ix: '[b·h³ − (b − t<sub>w</sub>)·h<sub>w</sub>³]/12', Iy: 'Σ (I<sub>i</sub> + A<sub>i</sub>·d<sub>i</sub>²)' },
    ex: { h: 200, b: 75, tf: 11.5, tw: 8.5 },
    f: ({ h, b, tf, tw }) => {
      const hw = h - 2 * tf, A = 2 * b * tf + tw * hw, xG = (b * b * tf + hw * tw * tw / 2) / A;
      const Ix = (b * h ** 3 - (b - tw) * hw ** 3) / 12;
      const Iy = 2 * (tf * b ** 3 / 12 + b * tf * (b / 2 - xG) ** 2) + hw * tw ** 3 / 12 + tw * hw * (tw / 2 - xG) ** 2;
      return { A, xG, yG: h / 2, Ix, Iy, Ixy: 0, Wx: 2 * Ix / h, Wyl: Iy / xG, Wyr: Iy / (b - xG), ix: sq(Ix / A), iy: sq(Iy / A), Zx: b * tf * (h - tf) + tw * hw * hw / 4 };
    },
    dims: ({ h, b, tf, tw }, r, s) => [
      { p1: [-b / 2, h / 2], p2: [b / 2, h / 2], off: 0.13 * s, label: 'b' },
      { p1: [-b / 2, -h / 2], p2: [-b / 2, h / 2], off: 0.13 * s, label: 'h' },
      { p1: [b / 2, h / 2], p2: [b / 2, h / 2 - tf], off: 0.1 * s, place: 'side', inner: true, label: 't_f' },
      { p1: [-b / 2, -h / 4], p2: [-b / 2 + tw, -h / 4], inner: true, place: 'end', label: 't_w' },
      { p1: [r.xc, -h / 2], p2: [-b / 2, -h / 2], off: 0.13 * s, no1: true, place: 'mid', label: 'x_G' },
    ],
    formulas: [
      ['h<sub>w</sub>', 'Altura del alma entre alas', 'h<sub>w</sub> = h − 2t<sub>f</sub>'],
      ['A', 'Área', 'A = 2·b·t<sub>f</sub> + t<sub>w</sub>·h<sub>w</sub>'],
      ['x<sub>G</sub>', 'Centroide (desde el dorso del alma)', 'x<sub>G</sub> = (b²·t<sub>f</sub> + h<sub>w</sub>·t<sub>w</sub>²/2) / A'],
      ['I<sub>x</sub>', 'Eje x (de simetría)', 'I<sub>x</sub> = [b·h³ − (b − t<sub>w</sub>)·h<sub>w</sub>³]/12'],
      ['I<sub>y</sub>', 'Eje y por G', 'I<sub>y</sub> = 2·[t<sub>f</sub>·b³/12 + b·t<sub>f</sub>·(b/2 − x<sub>G</sub>)²] + h<sub>w</sub>·t<sub>w</sub>³/12 + t<sub>w</sub>·h<sub>w</sub>·(t<sub>w</sub>/2 − x<sub>G</sub>)²'],
      ['W<sub>y</sub>', 'Módulos resistentes, eje y', 'W<sub>y,alma</sub> = I<sub>y</sub>/x<sub>G</sub>, &nbsp;W<sub>y,alas</sub> = I<sub>y</sub>/(b − x<sub>G</sub>)'],
    ],
    intro: `<p>Los perfiles en U o canales (UPN, UPE y perfiles conformados en frío) se usan como correas, largueros, zancas, cercos y bastidores. Son simétricos respecto al eje horizontal, pero no respecto al vertical: <strong>el centroide queda desplazado hacia el alma</strong> y hay que localizarlo antes de calcular I<sub>y</sub>.</p>`,
    derive: () => `<p>I<sub>x</sub> se calcula como en el <a href="doble-t.html">perfil en I</a>, restando el hueco (b − t<sub>w</sub>) × (h − 2t<sub>f</sub>) al rectángulo exterior, porque los dos comparten el eje x de simetría:</p>
    <div class="formula">I<sub>x</sub> = b·h³/12 − (b − t<sub>w</sub>)·(h − 2t<sub>f</sub>)³/12</div>
    <p>Para I<sub>y</sub> hay que localizar primero el centroide, medido desde el dorso del alma: las dos alas tienen su centroide en b/2 y el alma en t<sub>w</sub>/2, de modo que x<sub>G</sub> = (b²·t<sub>f</sub> + h<sub>w</sub>·t<sub>w</sub>²/2)/A. Después se aplica el <a href="./#steiner">teorema de Steiner</a> a las tres piezas respecto a ese eje vertical.</p>`,
    example: (p, f) => {
      const hw = p.h - 2 * p.tf;
      const st = steiner([[`Ala superior ${N(p.b)} × ${N(p.tf)}`, p.b * p.tf, p.b / 2, p.tf * p.b ** 3 / 12], [`Ala inferior ${N(p.b)} × ${N(p.tf)}`, p.b * p.tf, p.b / 2, p.tf * p.b ** 3 / 12], [`Alma ${N(p.tw)} × ${N(hw)}`, p.tw * hw, p.tw / 2, hw * p.tw ** 3 / 12]], 'y');
      const bp = p.b - p.tw / 2, hp = p.h - p.tf, e = 3 * bp * bp * p.tf / (6 * bp * p.tf + hp * p.tw);
      return `<p>Un canal de <strong>${N(p.h)} × ${N(p.b)} mm</strong> con alas de <strong>${N(p.tf)} mm</strong> y alma de <strong>${N(p.tw)} mm</strong>, de espesor constante y sin acuerdos (h = ${N(p.h)}, b = ${N(p.b)}, t<sub>f</sub> = ${N(p.tf)}, t<sub>w</sub> = ${N(p.tw)}).</p>
    <ol class="steps-x">
      <li><b>Área.</b>${calc(`h<sub>w</sub> = ${N(p.h)} − 2·${N(p.tf)} = ${N(hw)} mm &nbsp;·&nbsp; A = 2·${N(p.b)}·${N(p.tf)} + ${N(p.tw)}·${N(hw)} = ${N(f.A)} mm² = ${cm2(f.A)} cm²`)}</li>
      <li><b>Eje x.</b>${calc(`I<sub>x</sub> = [${N(p.b)}·${N(p.h)}³ − ${N(p.b - p.tw)}·${N(hw)}³]/12 = ${N(f.Ix)} mm⁴ = ${cm4(f.Ix)} cm⁴ &nbsp;·&nbsp; W<sub>x</sub> = ${cm3(f.Wx)} cm³`)}</li>
      <li><b>Centroide y eje y</b>, con las distancias x<sub>i</sub> medidas desde el dorso del alma:</li>
    </ol>
    ${st.html}
    ${calc(`x<sub>G</sub> = ${N(st.c * st.A)} / ${N(st.A)} = ${N(f.xG)} mm &nbsp;·&nbsp; I<sub>y</sub> = ${N(f.Iy)} mm⁴ = ${cm4(f.Iy)} cm⁴`)}
    ${calc(`W<sub>y,alma</sub> = I<sub>y</sub>/x<sub>G</sub> = ${N(f.Wyl)} mm³ &nbsp;·&nbsp; W<sub>y,alas</sub> = I<sub>y</sub>/(b − x<sub>G</sub>) = ${N(f.Wyr)} mm³`)}
    <p>El módulo resistente que manda respecto al eje y es el del borde libre de las alas, ${cm3(f.Wyr)} cm³, ${N(f.Wyl / f.Wyr, 3)} veces menor que el del dorso.</p>
    <h3>Ojo con la torsión</h3>
    <p>El centro de esfuerzos cortantes de una U no coincide con el centroide: está fuera de la sección, por detrás del alma. Con la aproximación de pared delgada (medidas a ejes de las chapas), e ≈ 3·b′²·t<sub>f</sub>/(6·b′·t<sub>f</sub> + h′·t<sub>w</sub>) = ${N(e, 3)} mm desde el eje del alma, mientras que el centroide está ${N(f.xG - p.tw / 2, 3)} mm hacia el otro lado. Una carga vertical que pase por el centroide hace girar el perfil; por eso las correas en U se arriostran o se colocan de forma que la carga no las retuerza.</p>`;
    },
    show: ['A', 'xG', 'Ix', 'Iy', 'Wx', 'Wyl', 'Wyr', 'ix', 'iy', 'Zx'],
    errors: [
      'Aplicar a la U la fórmula de I<sub>y</sub> del perfil en I, que supone el alma en el centro.',
      'Usar un solo módulo resistente para el eje y: hay uno para el dorso del alma y otro, menor, para el borde de las alas.',
      'Olvidar que los UPN laminados tienen alas de espesor variable (con pendiente) y acuerdos: para valores de proyecto conviene usar tablas o dibujar la sección real.',
      'Cargar una U por su centroide sin considerar la torsión que aparece porque el centro de esfuerzos cortantes está detrás del alma.',
    ],
    related: ['doble-t', 'seccion-t', 'angular-l'],
  },
];
const BY = Object.fromEntries(SECTIONS.map((s) => [s.slug, s]));
const appLink = (sec, p) => `${R}app/?forma=${sec.type}&amp;${Object.entries(Object.assign({}, sec.fixed, p)).map(([k, v]) => `${k}=${+v.toFixed(4)}`).join('&amp;')}`;

/* ---------- Generación ---------- */
module.exports = function sectionPages() {
  const out = [];
  const errors = [].concat(...SECTIONS.map((sec) => check(sec, sec.ex)));
  if (errors.length) throw new Error('Las fórmulas de las secciones no coinciden con el motor de InerCAD:\n  ' + errors.join('\n  '));

  for (const sec of SECTIONS) {
    const p = sec.ex, f = sec.f(p), e = engine(sec.type, Object.assign({}, sec.fixed, p)).v;
    const url = `secciones/${sec.slug}.html`, link = appLink(sec, p);
    const body = `
  <article class="prose sheet">
    <div class="sheet-head">
      <div>
        <p class="eyebrow">Fórmulas de secciones</p>
        <h1>${sec.h1}</h1>
        ${sec.intro}
        <p class="sheet-cta"><a class="btn primary" href="${link}">Abrir el ejemplo en InerCAD</a> <a class="btn" href="#ejemplo">Ver el ejemplo resuelto</a></p>
      </div>
      <figure class="sheet-fig">${drawing(sec, p, { principal: sec.principal })}</figure>
    </div>

    <h2 id="formulas">Fórmulas</h2>
    <div class="tscroll"><table class="ftable"><thead><tr><th>Símbolo</th><th>Magnitud</th><th>Fórmula</th></tr></thead><tbody>
      ${sec.formulas.map((x) => `<tr><td>${x[0]}</td><td>${x[1]}</td><td>${x[2]}</td></tr>`).join('\n      ')}
    </tbody></table></div>
    <p class="fine">Ejes x (horizontal) e y (vertical) por el centroide G, como en el dibujo y en InerCAD. El radio de giro es i = √(I/A) y el módulo resistente elástico, W = I/c, con c la distancia del eje a la fibra más alejada.</p>

    <h2 id="de-donde-sale">De dónde sale</h2>
    ${sec.derive()}

    <h2 id="ejemplo">Ejemplo resuelto</h2>
    ${sec.example(p, f)}
    <h3>Comprobación con InerCAD</h3>
    <p>Estos son los resultados que da InerCAD para la misma sección, calculados de forma exacta a partir de su contorno. Coinciden con los del cálculo a mano.</p>
    ${resultsTable(sec.show, e)}
    <p><a class="btn primary" href="${link}">Abrir este ejemplo en InerCAD</a></p>
    <p>En la aplicación puedes cambiar las medidas arrastrando la sección o escribiendo valores, añadirle otras formas o huecos, y ver al instante los ejes principales, el círculo de Mohr y la tabla de Steiner. También puedes exportar un informe en PDF con todo el cálculo.</p>

    <h2 id="errores">Errores frecuentes</h2>
    <ul>
      ${sec.errors.map((x) => `<li>${x}</li>`).join('\n      ')}
    </ul>

    <h2 id="otras">Otras secciones</h2>
    <p class="chips">${sec.related.map((s) => BY[s]).concat(SECTIONS.filter((s) => s !== sec && !sec.related.includes(s.slug))).map((s) => `<a href="${s.slug}.html">${esc(s.menu)}</a>`).join(' ')} <a href="./">Todas las fórmulas</a> <a href="${R}perfiles/">Perfiles normalizados</a></p>
  </article>`;
    out.push({
      file: url, url,
      html: page({
        title: sec.title, desc: sec.desc, url, body,
        ogTitle: sec.h1,
        crumbs: [['Inicio', ''], ['Fórmulas', 'secciones/'], [sec.menu, url]],
      }),
    });
  }

  // índice
  const body = `
  <article class="prose wide">
    <p class="eyebrow">Fórmulas de secciones</p>
    <h1>Fórmulas del momento de inercia de las secciones más comunes</h1>
    <p class="lead-p">Área, centroide y momentos de inercia del rectángulo, el círculo, los tubos, el triángulo, el trapecio, el semicírculo y los perfiles en T, I, L y U. Cada sección tiene su página con la deducción de la fórmula, un ejemplo resuelto paso a paso, los errores más frecuentes y un botón para abrir el ejemplo en la calculadora.</p>
    <div class="sec-grid">
      ${SECTIONS.map((s) => `<a class="card" href="${s.slug}.html">${drawing(s, s.ex, { thumb: true })}<b>${esc(s.menu)}</b><span>I<sub>x</sub> = ${s.sum.Ix}</span></a>`).join('\n      ')}
    </div>

    <h2 id="tabla">Tabla resumen</h2>
    <div class="tscroll"><table class="ftable sum">
      <thead><tr><th>Sección</th><th>Área A</th><th>Centroide</th><th>I<sub>x</sub> (eje horizontal por G)</th><th>I<sub>y</sub> (eje vertical por G)</th></tr></thead>
      <tbody>
        ${SECTIONS.map((s) => `<tr><td><a href="${s.slug}.html">${esc(s.menu)}</a></td><td>${s.sum.A}</td><td>${s.sum.c}</td><td>${s.sum.Ix}</td><td>${s.sum.Iy}</td></tr>`).join('\n        ')}
      </tbody>
    </table></div>
    <p class="fine">b: ancho; h: canto; D y d: diámetros exterior e interior; t: espesor; t<sub>f</sub> y t<sub>w</sub>: espesores de ala y alma; h<sub>w</sub> = h − 2t<sub>f</sub>; b<sub>i</sub> y h<sub>i</sub>: medidas del hueco. Los centroides se miden desde la base (o desde el dorso del alma en la U).</p>

    <div class="prose">
    <h2 id="que-es">Qué es el momento de inercia de una sección</h2>
    <p>El momento de inercia de una superficie (también llamado <em>segundo momento de área</em>) mide cómo está repartido el material respecto a un eje: I<sub>x</sub> = ∫ y² dA. Cada trozo de la sección cuenta por su área multiplicada por el cuadrado de su distancia al eje, de modo que el material alejado pesa mucho más que el cercano. Se mide en unidades de longitud a la cuarta (mm⁴, cm⁴, m⁴).</p>
    <p>Es la propiedad que gobierna la rigidez a flexión de una viga (la flecha es inversamente proporcional a E·I), la tensión de flexión (σ = M·y/I) y la carga crítica de pandeo (proporcional a E·I/L²). No hay que confundirlo con el momento de inercia de masa (en kg·m²), que interviene en la dinámica de los cuerpos que giran.</p>

    <h2 id="steiner">Secciones compuestas y teorema de Steiner</h2>
    <p>Para una sección formada por varias piezas se usa el teorema de los ejes paralelos, o teorema de Steiner: el momento de inercia respecto a un eje es el momento respecto al eje paralelo que pasa por el centroide más el área por el cuadrado de la distancia entre ambos.</p>
    <div class="formula">I<sub>x</sub> = Σ (I<sub>x,i</sub> + A<sub>i</sub>·d<sub>i</sub>²) &nbsp;&nbsp; con &nbsp; d<sub>i</sub> = y<sub>i</sub> − y<sub>G</sub> &nbsp; e &nbsp; y<sub>G</sub> = Σ A<sub>i</sub>·y<sub>i</sub> / Σ A<sub>i</sub></div>
    <p>Los huecos se restan con su área y su momento de inercia en negativo. En la <a href="seccion-t.html">sección en T</a>, la <a href="canal-u.html">U</a> y el <a href="angular-l.html">angular L</a> hay ejemplos resueltos con la tabla completa, y InerCAD genera esa misma tabla para cualquier sección que dibujes.</p>

    <h2 id="modulo">Módulo resistente y radio de giro</h2>
    <p>El <strong>módulo resistente</strong> W = I/c relaciona el momento flector con la tensión máxima, σ<sub>máx</sub> = M/W, siendo c la distancia del eje a la fibra más alejada. Si la sección no es simétrica respecto al eje, hay dos fibras extremas a distinta distancia y, por tanto, dos módulos. El <strong>módulo plástico</strong> W<sub>pl</sub> corresponde a la sección totalmente plastificada y se usa en el cálculo de acero con secciones de clase 1 y 2.</p>
    <p>El <strong>radio de giro</strong> i = √(I/A) es la distancia a la que habría que concentrar toda el área para obtener el mismo momento de inercia. Interviene en la esbeltez de las piezas comprimidas (λ = L<sub>k</sub>/i).</p>

    <h2 id="unidades">Unidades</h2>
    <p>Las tablas de perfiles suelen dar los momentos de inercia en cm⁴ y los módulos resistentes en cm³; en el cálculo a mano es cómodo trabajar en mm. Las conversiones son: 1 cm⁴ = 10<sup>4</sup> mm⁴, 1 m⁴ = 10<sup>8</sup> cm⁴ = 10<sup>12</sup> mm⁴, y 1 cm³ = 10<sup>3</sup> mm³. InerCAD trabaja en la unidad que elijas y convierte los resultados automáticamente.</p>

    <h2 id="calculadora">Cualquier otra sección</h2>
    <p>Si tu sección no es ninguna de estas, o combina varias, dibújala en <a href="${R}app/">InerCAD</a>: suma y resta formas, perfiles normalizados y polígonos libres, y obtén el área, el centroide, los momentos de inercia, los ejes principales y los módulos resistentes al instante. Para perfiles laminados, consulta las <a href="${R}perfiles/">tablas de perfiles IPE, HEA, HEB, L y tubos</a>.</p>
    </div>
  </article>`;
  out.push({
    file: 'secciones/index.html', url: 'secciones/',
    html: page({
      title: 'Fórmulas del momento de inercia de secciones: rectángulo, círculo, T, I, L, U · InerCAD',
      ogTitle: 'Fórmulas del momento de inercia de las secciones más comunes',
      desc: 'Fórmulas del momento de inercia, área y centroide del rectángulo, círculo, tubos, triángulo, trapecio, semicírculo y perfiles en T, I, L y U, con ejemplos resueltos y el teorema de Steiner.',
      url: 'secciones/', body, crumbs: [['Inicio', ''], ['Fórmulas', 'secciones/']],
    }),
  });
  return out;
};

module.exports.SECTIONS = SECTIONS;
module.exports.check = check;
module.exports.engine = engine;
