/* InerCAD · Biblioteca de formas paramétricas
 * Cada forma se define en coordenadas locales (origen = punto de anclaje) y se
 * coloca en el plano con: posición (x, y), giro (rot, grados) y reflejo (flip).
 * world = pivote + R(rot) · F(flip) · local
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.Shapes = factory(root.Engine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const PI = Math.PI;
  const D2R = PI / 180;
  const TYPES = {};
  const ORDER = [];

  const COLORS = ['#8f969d', '#e9a23b', '#db6a52', '#79ad68', '#b77db2', '#cdae7c', '#9da24a', '#c4cad0'];

  /* ---------- Definición de parámetros ---------- */
  const len = (k, label, sym, def, o) => Object.assign({ k, label, sym, kind: 'len', def, min: 0.001, max: null }, o || {});
  const ang = (k, label, sym, def, o) => Object.assign({ k, label, sym, kind: 'angle', def, min: 1, max: null }, o || {});
  const cnt = (k, label, sym, def, o) => Object.assign({ k, label, sym, kind: 'int', def, min: 3, max: null }, o || {});
  const M = (a, b) => Math.max(a, b);
  const m = Math.min;

  function define(t) {
    TYPES[t.id] = t;
    ORDER.push(t.id);
    return t;
  }

  const vloop = (verts) => [{ segs: E.filletPolygon(verts), hole: false }];
  const ellipseSegs = (rx, ry) => [E.A(0, 0, rx, ry, 0, 0, 2 * PI)];

  /* ---------- Asas (handles) de edición ---------- */
  function paramDef(type, key) { return TYPES[type].params.find((q) => q.k === key); }

  function clampParam(type, p, key, v) {
    const d = paramDef(type, key);
    if (!d) return v;
    if (!isFinite(v)) v = d.def;
    if (d.kind === 'int') v = Math.round(v);
    const hi = d.max ? d.max(p) : Infinity;
    const lo = typeof d.min === 'function' ? d.min(p) : d.min;
    if (v > hi) v = hi;
    if (v < lo) v = lo;
    return v;
  }

  function normalize(type, p) {
    for (const d of TYPES[type].params) p[d.k] = clampParam(type, p, d.k, p[d.k]);
    return p;
  }

  /* Cambio lineal de un parámetro: desplazar el asa s unidades a lo largo de dir
   * modifica el parámetro k·s y mueve el pivote sv·Δparam. */
  function lin(key, dir, k, sv) {
    return (s0, d, ctx) => {
      const s = d[0] * dir[0] + d[1] * dir[1];
      let v = s0.p[key] + k * s;
      if (ctx && ctx.snap) v = ctx.snap(v, paramDef(s0.type, key));
      v = clampParam(s0.type, s0.p, key, v);
      const dv = v - s0.p[key];
      return { p: Object.assign({}, s0.p, { [key]: v }), shift: [sv[0] * dv, sv[1] * dv] };
    };
  }

  function combine() {
    const fs = Array.prototype.slice.call(arguments);
    return (s0, d, ctx) => {
      let p = Object.assign({}, s0.p);
      const sh = [0, 0];
      for (const f of fs) {
        const r = f({ type: s0.type, p }, d, ctx);
        p = r.p; sh[0] += r.shift[0]; sh[1] += r.shift[1];
      }
      return { p, shift: sh };
    };
  }

  const H = (id, x, y, apply, cur, extra) => Object.assign({ id, x, y, apply, cur: cur || null }, extra || {});

  /* Atajos: asa de borde anclado (el borde opuesto no se mueve) */
  const anchored = (key, dir) => lin(key, dir, 1, [dir[0] * 0.5, dir[1] * 0.5]);
  const symmetric = (key, dir, k) => lin(key, dir, k || 2, [0, 0]);

  /* ---------- Formas básicas ---------- */
  define({
    id: 'rect', label: 'Rectángulo', group: 'basic',
    params: [
      len('w', 'Ancho', 'b', 200),
      len('h', 'Alto', 'h', 100),
      len('r', 'Radio de esquina', 'r', 0, { min: 0, max: (p) => m(p.w, p.h) / 2 }),
    ],
    verts(p) {
      const a = p.w / 2, b = p.h / 2, r = p.r;
      return [{ x: -a, y: -b, r }, { x: a, y: -b, r }, { x: a, y: b, r }, { x: -a, y: b, r }];
    },
    loops(p) { return vloop(this.verts(p)); },
    handles(p) {
      const a = p.w / 2, b = p.h / 2;
      const ew = (s) => anchored('w', [s, 0]);
      const ns = (s) => anchored('h', [0, s]);
      return [
        H('e', a, 0, ew(1), [1, 0]), H('w', -a, 0, ew(-1), [1, 0]),
        H('n', 0, b, ns(1), [0, 1]), H('s', 0, -b, ns(-1), [0, 1]),
        H('ne', a, b, combine(ew(1), ns(1)), [1, 1]), H('nw', -a, b, combine(ew(-1), ns(1)), [-1, 1]),
        H('se', a, -b, combine(ew(1), ns(-1)), [1, -1]), H('sw', -a, -b, combine(ew(-1), ns(-1)), [-1, -1]),
      ];
    },
  });

  define({
    id: 'circle', label: 'Círculo', group: 'basic', dimStyle: 'diam',
    params: [len('d', 'Diámetro', 'D', 150)],
    loops(p) { return [{ segs: ellipseSegs(p.d / 2, p.d / 2), hole: false }]; },
    handles(p) {
      const r = p.d / 2;
      return [
        H('e', r, 0, symmetric('d', [1, 0]), [1, 0]), H('w', -r, 0, symmetric('d', [-1, 0]), [1, 0]),
        H('n', 0, r, symmetric('d', [0, 1]), [0, 1]), H('s', 0, -r, symmetric('d', [0, -1]), [0, 1]),
      ];
    },
  });

  define({
    id: 'ellipse', label: 'Elipse', group: 'basic',
    params: [len('w', 'Ancho (eje mayor)', 'a', 200), len('h', 'Alto (eje menor)', 'b', 120)],
    loops(p) { return [{ segs: ellipseSegs(p.w / 2, p.h / 2), hole: false }]; },
    handles(p) {
      const a = p.w / 2, b = p.h / 2;
      return [
        H('e', a, 0, symmetric('w', [1, 0]), [1, 0]), H('w', -a, 0, symmetric('w', [-1, 0]), [1, 0]),
        H('n', 0, b, symmetric('h', [0, 1]), [0, 1]), H('s', 0, -b, symmetric('h', [0, -1]), [0, 1]),
      ];
    },
  });

  define({
    id: 'triangle', label: 'Triángulo', group: 'basic',
    params: [
      len('b', 'Base', 'b', 200),
      len('h', 'Altura', 'h', 150),
      len('ox', 'Desplazamiento del vértice', 'e', 0, { min: -1e9 }),
    ],
    verts(p) { return [{ x: -p.b / 2, y: -p.h / 2 }, { x: p.b / 2, y: -p.h / 2 }, { x: p.ox, y: p.h / 2 }]; },
    loops(p) { return vloop(this.verts(p)); },
    handles(p) {
      const baseV = (sgn) => (s0, d, ctx) => {
        let nb = s0.p.b + sgn * d[0];
        if (ctx && ctx.snap) nb = ctx.snap(nb, paramDef('triangle', 'b'));
        nb = clampParam('triangle', s0.p, 'b', nb);
        const mv = sgn * (nb - s0.p.b);
        return { p: Object.assign({}, s0.p, { b: nb, ox: s0.p.ox - mv / 2 }), shift: [mv / 2, 0] };
      };
      const apex = (s0, d, ctx) => {
        let ox = s0.p.ox + d[0], nh = s0.p.h + d[1];
        if (ctx && ctx.snap) { ox = ctx.snap(ox, { kind: 'len' }); nh = ctx.snap(nh, { kind: 'len' }); }
        nh = clampParam('triangle', s0.p, 'h', nh);
        return { p: Object.assign({}, s0.p, { ox, h: nh }), shift: [0, (nh - s0.p.h) / 2] };
      };
      return [
        H('bl', -p.b / 2, -p.h / 2, baseV(-1), [1, 0]),
        H('br', p.b / 2, -p.h / 2, baseV(1), [1, 0]),
        H('apex', p.ox, p.h / 2, apex, null, { free: true }),
      ];
    },
  });

  define({
    id: 'trapezoid', label: 'Trapecio', group: 'basic',
    params: [
      len('b', 'Base inferior', 'b', 240),
      len('b2', 'Base superior', 'b₂', 120),
      len('h', 'Altura', 'h', 120),
      len('ox', 'Desplazamiento superior', 'e', 0, { min: -1e9 }),
    ],
    verts(p) {
      return [
        { x: -p.b / 2, y: -p.h / 2 }, { x: p.b / 2, y: -p.h / 2 },
        { x: p.ox + p.b2 / 2, y: p.h / 2 }, { x: p.ox - p.b2 / 2, y: p.h / 2 },
      ];
    },
    loops(p) { return vloop(this.verts(p)); },
    handles(p) {
      const bot = (sgn) => (s0, d, ctx) => {
        let nb = s0.p.b + sgn * d[0];
        if (ctx && ctx.snap) nb = ctx.snap(nb, paramDef('trapezoid', 'b'));
        nb = clampParam('trapezoid', s0.p, 'b', nb);
        const mv = sgn * (nb - s0.p.b);
        return { p: Object.assign({}, s0.p, { b: nb, ox: s0.p.ox - mv / 2 }), shift: [mv / 2, 0] };
      };
      const top = (sgn) => (s0, d, ctx) => {
        let nb = s0.p.b2 + sgn * d[0];
        if (ctx && ctx.snap) nb = ctx.snap(nb, paramDef('trapezoid', 'b2'));
        nb = clampParam('trapezoid', s0.p, 'b2', nb);
        const mv = sgn * (nb - s0.p.b2);
        return { p: Object.assign({}, s0.p, { b2: nb, ox: s0.p.ox + mv / 2 }), shift: [0, 0] };
      };
      return [
        H('bl', -p.b / 2, -p.h / 2, bot(-1), [1, 0]), H('br', p.b / 2, -p.h / 2, bot(1), [1, 0]),
        H('tl', p.ox - p.b2 / 2, p.h / 2, top(-1), [1, 0]), H('tr', p.ox + p.b2 / 2, p.h / 2, top(1), [1, 0]),
        H('n', p.ox, p.h / 2, anchored('h', [0, 1]), [0, 1]),
        H('s', 0, -p.h / 2, anchored('h', [0, -1]), [0, 1]),
      ];
    },
  });

  define({
    id: 'ngon', label: 'Polígono regular', group: 'basic', dimStyle: 'none',
    params: [
      cnt('n', 'Número de lados', 'n', 6, { min: 3, max: () => 64 }),
      len('R', 'Radio circunscrito', 'R', 100),
      len('r', 'Radio de esquina', 'r', 0, { min: 0, max: (p) => p.R }),
    ],
    verts(p) {
      const out = [];
      for (let i = 0; i < p.n; i++) {
        const a = PI / 2 + (2 * PI * i) / p.n;
        out.push({ x: p.R * Math.cos(a), y: p.R * Math.sin(a), r: p.r });
      }
      return out;
    },
    loops(p) { return vloop(this.verts(p)); },
    handles(p) { return [H('r', 0, p.R, lin('R', [0, 1], 1, [0, 0]), [0, 1])]; },
  });

  define({
    id: 'semicircle', label: 'Semicírculo', group: 'basic',
    params: [len('d', 'Diámetro', 'D', 200)],
    loops(p) {
      const r = p.d / 2;
      return [{ segs: [E.L(-r, -r / 2, r, -r / 2), E.A(0, -r / 2, r, r, 0, 0, PI)], hole: false }];
    },
    handles(p) {
      const r = p.d / 2;
      return [
        H('e', r, -r / 2, anchored('d', [1, 0]), [1, 0]),
        H('w', -r, -r / 2, anchored('d', [-1, 0]), [1, 0]),
        H('n', 0, r / 2, lin('d', [0, 1], 2, [0, 0.25]), [0, 1]),
      ];
    },
  });

  define({
    id: 'quarter', label: 'Cuarto de círculo', group: 'basic',
    params: [len('r', 'Radio', 'r', 150)],
    loops(p) {
      const r = p.r, c = -r / 2;
      return [{ segs: [E.L(c, c, c + r, c), E.A(c, c, r, r, 0, 0, PI / 2), E.L(c, c + r, c, c)], hole: false }];
    },
    handles(p) {
      const r = p.r, c = -r / 2, k = Math.SQRT1_2;
      return [H('r', c + r * k, c + r * k, lin('r', [k, k], 1, [0.5, 0.5]), [1, 1])];
    },
  });

  const angleHandle = (type) => (s0, d, ctx) => {
    const r = s0.p.r, hA = (s0.p.a * D2R) / 2;
    const px = r * Math.cos(hA) + d[0], py = r * Math.sin(hA) + d[1];
    let a = 2 * Math.abs(Math.atan2(py, px)) / D2R;
    const st = ctx && ctx.angleStep ? ctx.angleStep : 1;
    a = Math.round(a / st) * st;
    a = clampParam(type, s0.p, 'a', a);
    return { p: Object.assign({}, s0.p, { a }), shift: [0, 0] };
  };

  define({
    id: 'sector', label: 'Sector circular', group: 'basic', anchorLabel: 'Centro del arco',
    params: [
      len('r', 'Radio', 'r', 150),
      ang('a', 'Ángulo de apertura', 'α', 90, { min: 1, max: () => 359 }),
    ],
    loops(p) {
      const h = (p.a * D2R) / 2, r = p.r;
      return [{
        segs: [E.L(0, 0, r * Math.cos(h), -r * Math.sin(h)), E.A(0, 0, r, r, 0, -h, h), E.L(r * Math.cos(h), r * Math.sin(h), 0, 0)],
        hole: false,
      }];
    },
    handles(p) {
      const h = (p.a * D2R) / 2;
      return [
        H('r', p.r, 0, lin('r', [1, 0], 1, [0, 0]), [1, 0]),
        H('a', p.r * Math.cos(h), p.r * Math.sin(h), angleHandle('sector'), null, { free: true, kind: 'angle' }),
      ];
    },
  });

  define({
    id: 'segment', label: 'Segmento circular', group: 'basic', anchorLabel: 'Centro del arco',
    params: [
      len('r', 'Radio', 'r', 150),
      ang('a', 'Ángulo central', 'α', 120, { min: 1, max: () => 359 }),
    ],
    loops(p) {
      const h = (p.a * D2R) / 2, r = p.r;
      return [{
        segs: [E.A(0, 0, r, r, 0, -h, h), E.L(r * Math.cos(h), r * Math.sin(h), r * Math.cos(h), -r * Math.sin(h))],
        hole: false,
      }];
    },
    handles(p) {
      const h = (p.a * D2R) / 2;
      return [
        H('r', p.r, 0, lin('r', [1, 0], 1, [0, 0]), [1, 0]),
        H('a', p.r * Math.cos(h), p.r * Math.sin(h), angleHandle('segment'), null, { free: true, kind: 'angle' }),
      ];
    },
  });

  define({
    id: 'polygon', label: 'Polígono libre', group: 'basic', isPolygon: true,
    params: [],
    loops(p) { return vloop(p.v); },
    handles() { return []; },
  });

  /* ---------- Perfiles ---------- */
  define({
    id: 'ibeam', label: 'Perfil I / H', group: 'profile',
    params: [
      len('h', 'Altura total', 'h', 300),
      len('b', 'Ancho del ala', 'b', 150),
      len('tf', 'Espesor del ala', 't<sub>f</sub>', 12, { max: (p) => p.h / 2 - 0.001 }),
      len('tw', 'Espesor del alma', 't<sub>w</sub>', 8, { max: (p) => p.b - 0.001 }),
      len('r', 'Radio de acuerdo', 'r', 12, { min: 0, max: (p) => m((p.b - p.tw) / 2, (p.h - 2 * p.tf) / 2) }),
    ],
    verts(p) {
      const Hh = p.h / 2, B = p.b / 2, W = p.tw / 2, y1 = Hh - p.tf, r = p.r;
      return [
        { x: B, y: Hh }, { x: -B, y: Hh }, { x: -B, y: y1 }, { x: -W, y: y1, r }, { x: -W, y: -y1, r }, { x: -B, y: -y1 },
        { x: -B, y: -Hh }, { x: B, y: -Hh }, { x: B, y: -y1 }, { x: W, y: -y1, r }, { x: W, y: y1, r }, { x: B, y: y1 },
      ];
    },
    loops(p) { return vloop(this.verts(p)); },
    handles(p) {
      const Hh = p.h / 2, B = p.b / 2;
      return [
        H('n', 0, Hh, anchored('h', [0, 1]), [0, 1]), H('s', 0, -Hh, anchored('h', [0, -1]), [0, 1]),
        H('b', B, Hh - p.tf / 2, symmetric('b', [1, 0]), [1, 0]),
        H('tf', B / 2, Hh - p.tf, lin('tf', [0, -1], 1, [0, 0]), [0, 1], { inner: true }),
        H('tw', p.tw / 2, 0, symmetric('tw', [1, 0]), [1, 0], { inner: true }),
      ];
    },
  });

  define({
    id: 'tee', label: 'Perfil T', group: 'profile',
    params: [
      len('h', 'Altura total', 'h', 200),
      len('b', 'Ancho del ala', 'b', 150),
      len('tf', 'Espesor del ala', 't<sub>f</sub>', 20, { max: (p) => p.h - 0.001 }),
      len('tw', 'Espesor del alma', 't<sub>w</sub>', 15, { max: (p) => p.b - 0.001 }),
      len('r', 'Radio de acuerdo', 'r', 0, { min: 0, max: (p) => m((p.b - p.tw) / 2, p.h - p.tf) }),
    ],
    verts(p) {
      const Hh = p.h / 2, B = p.b / 2, W = p.tw / 2, y1 = Hh - p.tf, r = p.r;
      return [
        { x: -B, y: Hh }, { x: -B, y: y1 }, { x: -W, y: y1, r }, { x: -W, y: -Hh },
        { x: W, y: -Hh }, { x: W, y: y1, r }, { x: B, y: y1 }, { x: B, y: Hh },
      ];
    },
    loops(p) { return vloop(this.verts(p)); },
    handles(p) {
      const Hh = p.h / 2, B = p.b / 2;
      return [
        H('n', 0, Hh, anchored('h', [0, 1]), [0, 1]), H('s', 0, -Hh, anchored('h', [0, -1]), [0, 1]),
        H('b', B, Hh - p.tf / 2, symmetric('b', [1, 0]), [1, 0]),
        H('tf', B / 2, Hh - p.tf, lin('tf', [0, -1], 1, [0, 0]), [0, 1], { inner: true }),
        H('tw', p.tw / 2, -Hh / 2, symmetric('tw', [1, 0]), [1, 0], { inner: true }),
      ];
    },
  });

  define({
    id: 'angle', label: 'Perfil L (ángulo)', group: 'profile',
    params: [
      len('h', 'Ala vertical', 'h', 100),
      len('b', 'Ala horizontal', 'b', 100),
      len('t', 'Espesor', 't', 10, { max: (p) => m(p.h, p.b) - 0.001 }),
      len('r1', 'Radio de acuerdo (raíz)', 'r<sub>1</sub>', 12, { min: 0, max: (p) => m(p.h, p.b) - p.t }),
      len('r2', 'Radio de punta', 'r<sub>2</sub>', 6, { min: 0, max: (p) => p.t }),
    ],
    verts(p) {
      const a = p.b / 2, c = p.h / 2, t = p.t;
      return [
        { x: -a, y: -c }, { x: a, y: -c }, { x: a, y: -c + t, r: p.r2 },
        { x: -a + t, y: -c + t, r: p.r1 }, { x: -a + t, y: c, r: p.r2 }, { x: -a, y: c },
      ];
    },
    loops(p) { return vloop(this.verts(p)); },
    handles(p) {
      const a = p.b / 2, c = p.h / 2;
      return [
        H('e', a, -c + p.t / 2, anchored('b', [1, 0]), [1, 0]), H('w', -a, 0, anchored('b', [-1, 0]), [1, 0]),
        H('n', -a + p.t / 2, c, anchored('h', [0, 1]), [0, 1]), H('s', 0, -c, anchored('h', [0, -1]), [0, 1]),
        H('t', a / 2, -c + p.t, lin('t', [0, 1], 1, [0, 0]), [0, 1], { inner: true }),
      ];
    },
  });

  define({
    id: 'channel', label: 'Perfil U (canal)', group: 'profile',
    params: [
      len('h', 'Altura total', 'h', 200),
      len('b', 'Ancho del ala', 'b', 80),
      len('tf', 'Espesor del ala', 't<sub>f</sub>', 12, { max: (p) => p.h / 2 - 0.001 }),
      len('tw', 'Espesor del alma', 't<sub>w</sub>', 8, { max: (p) => p.b - 0.001 }),
      len('r', 'Radio de acuerdo', 'r', 8, { min: 0, max: (p) => m(p.b - p.tw, (p.h - 2 * p.tf) / 2) }),
    ],
    verts(p) {
      const Hh = p.h / 2, B = p.b / 2, y1 = Hh - p.tf, x1 = -B + p.tw, r = p.r;
      return [
        { x: -B, y: -Hh }, { x: B, y: -Hh }, { x: B, y: -y1 }, { x: x1, y: -y1, r },
        { x: x1, y: y1, r }, { x: B, y: y1 }, { x: B, y: Hh }, { x: -B, y: Hh },
      ];
    },
    loops(p) { return vloop(this.verts(p)); },
    handles(p) {
      const Hh = p.h / 2, B = p.b / 2;
      return [
        H('n', 0, Hh, anchored('h', [0, 1]), [0, 1]), H('s', 0, -Hh, anchored('h', [0, -1]), [0, 1]),
        H('e', B, Hh - p.tf / 2, anchored('b', [1, 0]), [1, 0]), H('w', -B, 0, anchored('b', [-1, 0]), [1, 0]),
        H('tf', B / 2, Hh - p.tf, lin('tf', [0, -1], 1, [0, 0]), [0, 1], { inner: true }),
        H('tw', -B + p.tw, 0, lin('tw', [1, 0], 1, [0, 0]), [1, 0], { inner: true }),
      ];
    },
  });

  define({
    id: 'zed', label: 'Perfil Z', group: 'profile',
    params: [
      len('h', 'Altura total', 'h', 200),
      len('b', 'Ancho de ala (desde el alma)', 'b', 80, { min: (p) => p.tw + 0.001 }),
      len('tf', 'Espesor del ala', 't<sub>f</sub>', 10, { max: (p) => p.h / 2 - 0.001 }),
      len('tw', 'Espesor del alma', 't<sub>w</sub>', 8, { max: (p) => p.b - 0.001 }),
    ],
    verts(p) {
      const Hh = p.h / 2, hw = p.tw / 2, b = p.b, tf = p.tf;
      return [
        { x: hw - b, y: -Hh }, { x: hw, y: -Hh }, { x: hw, y: Hh - tf }, { x: b - hw, y: Hh - tf },
        { x: b - hw, y: Hh }, { x: -hw, y: Hh }, { x: -hw, y: -Hh + tf }, { x: hw - b, y: -Hh + tf },
      ];
    },
    loops(p) { return vloop(this.verts(p)); },
    handles(p) {
      const Hh = p.h / 2, hw = p.tw / 2;
      return [
        H('n', 0, Hh, anchored('h', [0, 1]), [0, 1]), H('s', 0, -Hh, anchored('h', [0, -1]), [0, 1]),
        H('b', p.b - hw, Hh - p.tf / 2, symmetric('b', [1, 0], 1), [1, 0]),
        H('tf', (p.b - hw) / 2 + hw, Hh - p.tf, lin('tf', [0, -1], 1, [0, 0]), [0, 1], { inner: true }),
        H('tw', hw, 0, symmetric('tw', [1, 0]), [1, 0], { inner: true }),
      ];
    },
  });

  define({
    id: 'cross', label: 'Cruz', group: 'profile',
    params: [
      len('w', 'Ancho total', 'b', 200),
      len('h', 'Alto total', 'h', 200),
      len('tv', 'Espesor del brazo vertical', 't<sub>v</sub>', 40, { max: (p) => p.w - 0.001 }),
      len('th', 'Espesor del brazo horizontal', 't<sub>h</sub>', 40, { max: (p) => p.h - 0.001 }),
      len('r', 'Radio de acuerdo', 'r', 0, { min: 0, max: (p) => m((p.w - p.tv) / 2, (p.h - p.th) / 2) }),
    ],
    verts(p) {
      const a = p.w / 2, c = p.h / 2, v = p.tv / 2, t = p.th / 2, r = p.r;
      return [
        { x: v, y: c }, { x: -v, y: c }, { x: -v, y: t, r }, { x: -a, y: t }, { x: -a, y: -t }, { x: -v, y: -t, r },
        { x: -v, y: -c }, { x: v, y: -c }, { x: v, y: -t, r }, { x: a, y: -t }, { x: a, y: t }, { x: v, y: t, r },
      ];
    },
    loops(p) { return vloop(this.verts(p)); },
    handles(p) {
      const a = p.w / 2, c = p.h / 2;
      return [
        H('n', 0, c, symmetric('h', [0, 1]), [0, 1]), H('e', a, 0, symmetric('w', [1, 0]), [1, 0]),
        H('tv', p.tv / 2, c / 2, symmetric('tv', [1, 0]), [1, 0], { inner: true }),
        H('th', a / 2, p.th / 2, symmetric('th', [0, 1]), [0, 1], { inner: true }),
      ];
    },
  });

  define({
    id: 'ring', label: 'Tubo circular', group: 'profile', dimStyle: 'diam',
    params: [
      len('d', 'Diámetro exterior', 'D', 200),
      len('t', 'Espesor', 't', 20, { max: (p) => p.d / 2 }),
    ],
    loops(p) {
      const R = p.d / 2, ri = R - p.t;
      const out = [{ segs: ellipseSegs(R, R), hole: false }];
      if (ri > 1e-9) out.push({ segs: ellipseSegs(ri, ri), hole: true });
      return out;
    },
    handles(p) {
      const R = p.d / 2, ri = R - p.t;
      return [
        H('e', R, 0, symmetric('d', [1, 0]), [1, 0]), H('n', 0, R, symmetric('d', [0, 1]), [0, 1]),
        H('t', -ri, 0, lin('t', [1, 0], 1, [0, 0]), [1, 0], { inner: true }),
      ];
    },
  });

  define({
    id: 'rhs', label: 'Tubo rectangular', group: 'profile',
    params: [
      len('w', 'Ancho exterior', 'b', 200),
      len('h', 'Alto exterior', 'h', 120),
      len('t', 'Espesor', 't', 10, { max: (p) => m(p.w, p.h) / 2 }),
      len('r', 'Radio exterior', 'r', 20, { min: 0, max: (p) => m(p.w, p.h) / 2 }),
    ],
    loops(p) {
      const a = p.w / 2, b = p.h / 2, r = p.r, t = p.t;
      const out = [{ segs: E.filletPolygon([{ x: -a, y: -b, r }, { x: a, y: -b, r }, { x: a, y: b, r }, { x: -a, y: b, r }]), hole: false }];
      const ai = a - t, bi = b - t;
      if (ai > 1e-9 && bi > 1e-9) {
        const ri = Math.max(r - t, 0);
        out.push({ segs: E.filletPolygon([{ x: -ai, y: -bi, r: ri }, { x: ai, y: -bi, r: ri }, { x: ai, y: bi, r: ri }, { x: -ai, y: bi, r: ri }]), hole: true });
      }
      return out;
    },
    handles(p) {
      const a = p.w / 2, b = p.h / 2;
      return [
        H('e', a, 0, anchored('w', [1, 0]), [1, 0]), H('w', -a, 0, anchored('w', [-1, 0]), [1, 0]),
        H('n', 0, b, anchored('h', [0, 1]), [0, 1]), H('s', 0, -b, anchored('h', [0, -1]), [0, 1]),
        H('t', -a + p.t, b / 2, lin('t', [1, 0], 1, [0, 0]), [1, 0], { inner: true }),
      ];
    },
  });

  /* ---------- Utilidades de pose ---------- */
  function poseOf(s) {
    const rot = (s.rot || 0) * D2R;
    return { rot, c: Math.cos(rot), s: Math.sin(rot), fl: s.flip ? -1 : 1, x: s.x || 0, y: s.y || 0 };
  }
  function toWorld(s, lx, ly) {
    const q = poseOf(s);
    const px = lx * q.fl;
    return { x: px * q.c - ly * q.s + q.x, y: px * q.s + ly * q.c + q.y };
  }
  function toLocal(s, wx, wy) {
    const q = poseOf(s);
    const dx = wx - q.x, dy = wy - q.y;
    return { x: (dx * q.c + dy * q.s) * q.fl, y: -dx * q.s + dy * q.c };
  }
  /* vector (sin traslación) local → mundo y viceversa */
  function vecToWorld(s, lx, ly) {
    const q = poseOf(s);
    const px = lx * q.fl;
    return { x: px * q.c - ly * q.s, y: px * q.s + ly * q.c };
  }
  function vecToLocal(s, wx, wy) {
    const q = poseOf(s);
    return { x: (wx * q.c + wy * q.s) * q.fl, y: -wx * q.s + wy * q.c };
  }

  /* ---------- Geometría con caché ---------- */
  function localLoops(s) { return TYPES[s.type].loops(s.p); }

  function geom(s) {
    const key = s.type + '|' + JSON.stringify(s.p) + '|' + s.x + '|' + s.y + '|' + s.rot + '|' + s.flip;
    if (s._g && s._g.key === key) return s._g;
    const T = { flip: !!s.flip, rot: (s.rot || 0) * D2R, x: s.x || 0, y: s.y || 0 };
    const loops = localLoops(s).map((l) => ({ segs: E.xformSegs(l.segs, T), hole: l.hole }));
    let bbox = null, polys = [];
    for (const l of loops) {
      const bb = E.bboxSegs(l.segs);
      if (!l.hole && isFinite(bb.xmin)) bbox = E.mergeBBox(bbox, bb);
      polys.push(E.polygonize(l.segs, 3));
    }
    const g = { key, loops, bbox, polys };
    Object.defineProperty(s, '_g', { value: g, writable: true, enumerable: false, configurable: true });
    return g;
  }

  function localBBox(s) {
    let bb = null;
    for (const l of localLoops(s)) {
      if (l.hole) continue;
      const b = E.bboxSegs(l.segs);
      if (isFinite(b.xmin)) bb = E.mergeBBox(bb, b);
    }
    return bb;
  }

  function hit(s, x, y) { return E.pointInPolys(geom(s).polys, x, y); }

  function polygonIssues(s) {
    if (s.type !== 'polygon') return null;
    const pts = s.p.v;
    if (pts.length < 3) return 'Un polígono necesita al menos 3 vértices';
    if (Math.abs(E.polyArea(pts)) < 1e-9) return 'El polígono tiene área nula';
    if (E.selfIntersects(pts)) return 'El contorno se cruza consigo mismo';
    return null;
  }

  /* ---------- Fábrica ---------- */
  function defaults(type, scale) {
    const p = {};
    const f = scale || 1;
    for (const d of TYPES[type].params) {
      p[d.k] = d.kind === 'len' ? (d.def === 0 ? 0 : d.def * f) : d.def;
    }
    return normalize(type, p);
  }

  let uidCounter = 0;
  function uid() {
    uidCounter += 1;
    return 's' + Date.now().toString(36) + uidCounter.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  function create(type, opts) {
    opts = opts || {};
    const t = TYPES[type];
    const s = {
      id: opts.id || uid(),
      type,
      name: opts.name || t.label,
      mode: opts.mode || 'add',
      x: Number.isFinite(+opts.x) ? +opts.x : 0,
      y: Number.isFinite(+opts.y) ? +opts.y : 0,
      rot: Number.isFinite(+opts.rot) ? +opts.rot : 0,
      flip: !!opts.flip,
      visible: opts.visible !== false,
      locked: !!opts.locked,
      color: opts.color || COLORS[0],
      p: opts.p ? normalize(type, Object.assign(defaults(type, 1), opts.p)) : defaults(type, opts.scale || 1),
    };
    if (type === 'polygon') {
      const v = opts.p && Array.isArray(opts.p.v) ? opts.p.v : [];
      s.p = { v: v.map((q) => ({ x: Number.isFinite(+q.x) ? +q.x : 0, y: Number.isFinite(+q.y) ? +q.y : 0, r: Math.max(0, Number.isFinite(+q.r) ? +q.r : 0) })) };
    }
    return s;
  }

  function clone(s, withNewId) {
    const c = JSON.parse(JSON.stringify(s));
    if (withNewId) c.id = uid();
    return c;
  }

  function setParam(s, key, v) {
    s.p[key] = clampParam(s.type, s.p, key, v);
    normalize(s.type, s.p);
  }

  /* Convierte una forma con vértices en polígono libre editable */
  function toPolygon(s) {
    const t = TYPES[s.type];
    if (!t.verts) return null;
    const c = clone(s, false);
    c.type = 'polygon';
    c.p = { v: t.verts(s.p).map((v) => ({ x: v.x, y: v.y, r: v.r || 0 })) };
    return c;
  }

  /* Recentra el pivote de un polígono en el centro de su caja envolvente */
  function recenterPolygon(s) {
    const bb = localBBox(s);
    if (!bb) return;
    const cx = (bb.xmin + bb.xmax) / 2, cy = (bb.ymin + bb.ymax) / 2;
    if (Math.abs(cx) < 1e-12 && Math.abs(cy) < 1e-12) return;
    const w = vecToWorld(s, cx, cy);
    s.x += w.x; s.y += w.y;
    for (const v of s.p.v) { v.x -= cx; v.y -= cy; }
  }

  /* ---------- Operaciones geométricas sobre formas ---------- */
  function normAngle(a) {
    a = ((a + 180) % 360 + 360) % 360 - 180;
    return a === -180 ? 180 : a;
  }

  /* Reflejo respecto a una recta vertical (axis 'v', x = value) u horizontal (axis 'h', y = value) */
  function mirror(s, axis, value) {
    if (axis === 'v') { s.x = 2 * value - s.x; s.rot = normAngle(-(s.rot || 0)); }
    else { s.y = 2 * value - s.y; s.rot = normAngle(180 - (s.rot || 0)); }
    s.flip = !s.flip;
  }

  function rotateAbout(s, deg, cx, cy) {
    const a = deg * D2R, c = Math.cos(a), sn = Math.sin(a);
    const dx = s.x - cx, dy = s.y - cy;
    s.x = cx + dx * c - dy * sn;
    s.y = cy + dx * sn + dy * c;
    s.rot = normAngle((s.rot || 0) + deg);
  }

  function scaleShape(s, f) {
    s.x *= f; s.y *= f;
    for (const d of TYPES[s.type].params) if (d.kind === 'len') s.p[d.k] *= f;
    if (s.type === 'polygon') for (const v of s.p.v) { v.x *= f; v.y *= f; v.r = (v.r || 0) * f; }
  }

  function label(type) { return TYPES[type].label; }

  /* ---------- Análisis de una sección completa ---------- */
  function sectionItems(shapes) {
    return shapes
      .filter((s) => s.visible !== false)
      .map((s) => ({ id: s.id, sign: s.mode === 'sub' ? -1 : 1, loops: geom(s).loops }));
  }

  function analyze(shapes, opts) {
    const items = sectionItems(shapes);
    const res = E.derive(E.computeSection(items));
    if (!res.valid) return res;
    if (!opts || opts.plastic !== false) {
      const polys = [];
      // paso angular adaptativo: 0.25° salvo que haya muchísimas curvas (coste)
      let arcDeg = 0;
      for (const it of items) for (const l of it.loops) for (const g of l.segs) if (g.k === 'A') arcDeg += Math.abs(g.t1 - g.t0) * 180 / Math.PI;
      const step = arcDeg / 0.25 > 9000 ? 0.5 : 0.25;
      for (const it of items) {
        for (const l of it.loops) {
          const pts = E.polygonize(l.segs, step).map((q) => ({ x: q.x - res.xc, y: q.y - res.yc }));
          polys.push({ pts, w: it.sign * (l.hole ? -1 : 1) });
        }
      }
      const zx = E.plasticModulus(polys, res.A, 'x');
      const zy = E.plasticModulus(polys, res.A, 'y');
      res.Zx = zx.Z; res.pnaY = zx.pna;
      res.Zy = zy.Z; res.pnaX = zy.pna;
      const wx = Math.min(res.Wxt, res.Wxb), wy = Math.min(res.Wyl, res.Wyr);
      res.shapeX = res.Zx / wx;
      res.shapeY = res.Zy / wy;
    }
    return res;
  }

  return {
    sectionItems, analyze,
    TYPES, ORDER, COLORS,
    paramDef, clampParam, normalize,
    poseOf, toWorld, toLocal, vecToWorld, vecToLocal,
    geom, localBBox, localLoops, hit, polygonIssues,
    defaults, create, clone, setParam, toPolygon, recenterPolygon,
    mirror, rotateAbout, scaleShape, normAngle, label, uid,
  };
});
