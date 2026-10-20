/* InerCAD · Motor de cálculo
 * ---------------------------------------------------------------
 * Propiedades geométricas de secciones planas mediante el teorema
 * de Green aplicado al contorno (segmentos rectos y arcos elípticos).
 * El resultado es exacto (precisión de máquina) para polígonos,
 * círculos, elipses, sectores, acuerdos, etc. No se discretizan las curvas.
 *
 * Convenciones:
 *   x → derecha, y → arriba (ejes cartesianos de ingeniería)
 *   Ix  = ∫ y² dA   (momento respecto al eje x)
 *   Iy  = ∫ x² dA   (momento respecto al eje y)
 *   Ixy = ∫ x·y dA  (producto de inercia)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PI = Math.PI;
  const TAU = 2 * PI;

  /* Cuadratura de Gauss-Legendre de 8 puntos en [-1, 1] */
  const GX = [
    -0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498,
    0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363,
  ];
  const GW = [
    0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
    0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
  ];

  /* ---------- Segmentos ---------- */
  const L = (x0, y0, x1, y1) => ({ k: 'L', x0, y0, x1, y1 });
  const A = (cx, cy, rx, ry, phi, t0, t1) => ({ k: 'A', cx, cy, rx, ry, phi, t0, t1 });

  function segPoint(g, t) {
    if (g.k === 'L') return { x: g.x0 + (g.x1 - g.x0) * t, y: g.y0 + (g.y1 - g.y0) * t };
    const c = Math.cos(t), s = Math.sin(t), cp = Math.cos(g.phi), sp = Math.sin(g.phi);
    return {
      x: g.cx + g.rx * c * cp - g.ry * s * sp,
      y: g.cy + g.rx * c * sp + g.ry * s * cp,
    };
  }
  const segStart = (g) => segPoint(g, g.k === 'L' ? 0 : g.t0);
  const segEnd = (g) => segPoint(g, g.k === 'L' ? 1 : g.t1);

  /* ---------- Integración del contorno ---------- */
  function loopIntegrals(segs, ox, oy) {
    let a = 0, sx = 0, sy = 0, ixx = 0, iyy = 0, ixy = 0;
    for (let n = 0; n < segs.length; n++) {
      const g = segs[n];
      const panels = g.k === 'A' ? Math.max(1, Math.ceil(Math.abs(g.t1 - g.t0) / (PI / 6))) : 1;
      let cp = 0, sp = 0;
      if (g.k === 'A') { cp = Math.cos(g.phi); sp = Math.sin(g.phi); }
      for (let p = 0; p < panels; p++) {
        let ta, tb;
        if (g.k === 'A') { ta = g.t0 + (g.t1 - g.t0) * p / panels; tb = g.t0 + (g.t1 - g.t0) * (p + 1) / panels; }
        else { ta = 0; tb = 1; }
        const half = (tb - ta) / 2, mid = (tb + ta) / 2;
        for (let i = 0; i < 8; i++) {
          const t = mid + half * GX[i];
          const w = GW[i] * half;
          let x, y, dy;
          if (g.k === 'L') {
            x = g.x0 + (g.x1 - g.x0) * t - ox;
            y = g.y0 + (g.y1 - g.y0) * t - oy;
            dy = g.y1 - g.y0;
          } else {
            const c = Math.cos(t), s = Math.sin(t);
            x = g.cx + g.rx * c * cp - g.ry * s * sp - ox;
            y = g.cy + g.rx * c * sp + g.ry * s * cp - oy;
            dy = -g.rx * s * sp + g.ry * c * cp;
          }
          const f = w * dy;
          a += x * f;
          sx += x * y * f;
          sy += 0.5 * x * x * f;
          ixx += x * y * y * f;
          iyy += (x * x * x / 3) * f;
          ixy += 0.5 * x * x * y * f;
        }
      }
    }
    return { A: a, Sx: sx, Sy: sy, Ixx: ixx, Iyy: iyy, Ixy: ixy };
  }

  /* ---------- Polígono con acuerdos (radio por vértice) ---------- */
  function filletPolygon(verts) {
    const n = verts.length;
    if (n < 3) return [];
    const info = new Array(n);
    for (let i = 0; i < n; i++) {
      const p0 = verts[(i - 1 + n) % n], p1 = verts[i], p2 = verts[(i + 1) % n];
      let ux = p0.x - p1.x, uy = p0.y - p1.y, vx = p2.x - p1.x, vy = p2.y - p1.y;
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      const r = Math.max(0, p1.r || 0);
      if (r <= 0 || lu < 1e-12 || lv < 1e-12) { info[i] = { d: 0 }; continue; }
      ux /= lu; uy /= lu; vx /= lv; vy /= lv;
      const th = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
      if (th < 1e-6 || th > PI - 1e-6) { info[i] = { d: 0 }; continue; }
      info[i] = { d: r / Math.tan(th / 2), r, th, ux, uy, vx, vy };
    }
    // Limitar los acuerdos para que quepan en cada arista
    const sc = new Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const len = Math.hypot(verts[j].x - verts[i].x, verts[j].y - verts[i].y);
      const s = info[i].d + info[j].d;
      if (s > len && s > 0) {
        const f = len / s;
        sc[i] = Math.min(sc[i], f);
        sc[j] = Math.min(sc[j], f);
      }
    }
    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
      const p1 = verts[i], f = info[i];
      if (f.d > 0) {
        const d = f.d * sc[i], r = f.r * sc[i];
        const t0 = { x: p1.x + f.ux * d, y: p1.y + f.uy * d };
        const t2 = { x: p1.x + f.vx * d, y: p1.y + f.vy * d };
        let bx = f.ux + f.vx, by = f.uy + f.vy;
        const lb = Math.hypot(bx, by);
        bx /= lb; by /= lb;
        const dist = r / Math.sin(f.th / 2);
        const cx = p1.x + bx * dist, cy = p1.y + by * dist;
        const a0 = Math.atan2(t0.y - cy, t0.x - cx), a1 = Math.atan2(t2.y - cy, t2.x - cx);
        let dl = a1 - a0;
        while (dl > PI) dl -= TAU;
        while (dl < -PI) dl += TAU;
        pts[i] = { inP: t0, outP: t2, arc: A(cx, cy, r, r, 0, a0, a0 + dl) };
      } else {
        pts[i] = { inP: { x: p1.x, y: p1.y }, outP: { x: p1.x, y: p1.y }, arc: null };
      }
    }
    const segs = [];
    for (let i = 0; i < n; i++) {
      if (pts[i].arc) segs.push(pts[i].arc);
      const a = pts[i].outP, b = pts[(i + 1) % n].inP;
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-12) segs.push(L(a.x, a.y, b.x, b.y));
    }
    return segs;
  }

  /* ---------- Transformaciones ---------- */
  /* T = { flip, rot (rad), x, y }: primero reflejo en x local, luego giro y traslación */
  function xformSegs(segs, T) {
    const rot = T.rot || 0;
    const c = Math.cos(rot), s = Math.sin(rot);
    const fl = T.flip ? -1 : 1;
    const tx = T.x || 0, ty = T.y || 0;
    return segs.map((g) => {
      if (g.k === 'L') {
        const ax = g.x0 * fl, bx = g.x1 * fl;
        return L(ax * c - g.y0 * s + tx, ax * s + g.y0 * c + ty, bx * c - g.y1 * s + tx, bx * s + g.y1 * c + ty);
      }
      let { cx, cy, phi, t0, t1 } = g;
      if (T.flip) { cx = -cx; phi = -phi; t0 = PI - t0; t1 = PI - t1; }
      return A(cx * c - cy * s + tx, cx * s + cy * c + ty, g.rx, g.ry, phi + rot, t0, t1);
    });
  }

  function bboxSegs(segs) {
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    const add = (p) => {
      if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x;
      if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y;
    };
    for (const g of segs) {
      if (g.k === 'L') { add({ x: g.x0, y: g.y0 }); add({ x: g.x1, y: g.y1 }); continue; }
      add(segPoint(g, g.t0)); add(segPoint(g, g.t1));
      const cp = Math.cos(g.phi), sp = Math.sin(g.phi);
      const tx = Math.atan2(-g.ry * sp, g.rx * cp);
      const ty = Math.atan2(g.ry * cp, g.rx * sp);
      const lo = Math.min(g.t0, g.t1), hi = Math.max(g.t0, g.t1);
      for (const b of [tx, tx + PI, ty, ty + PI]) {
        let t = lo + ((((b - lo) % TAU) + TAU) % TAU);
        if (t <= hi + 1e-12) add(segPoint(g, t));
      }
    }
    return { xmin, xmax, ymin, ymax };
  }

  function mergeBBox(a, b) {
    if (!a) return b;
    if (!b) return a;
    return {
      xmin: Math.min(a.xmin, b.xmin), xmax: Math.max(a.xmax, b.xmax),
      ymin: Math.min(a.ymin, b.ymin), ymax: Math.max(a.ymax, b.ymax),
    };
  }

  /* ---------- Discretización (dibujo, selección, módulo plástico) ---------- */
  function polygonize(segs, stepDeg) {
    const st = (stepDeg || 2) * PI / 180;
    const pts = [];
    for (const g of segs) {
      if (g.k === 'L') { pts.push({ x: g.x0, y: g.y0 }); continue; }
      const n = Math.max(2, Math.ceil(Math.abs(g.t1 - g.t0) / st));
      for (let i = 0; i < n; i++) pts.push(segPoint(g, g.t0 + (g.t1 - g.t0) * i / n));
    }
    return pts;
  }

  function polyArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  }

  function pointInPolys(polys, x, y) {
    let inside = false;
    for (const pts of polys) {
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
    }
    return inside;
  }

  function segsIntersect(p1, p2, p3, p4) {
    const d = (a, b, c) => (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
    const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
    return ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) &&
           ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12));
  }

  function selfIntersects(pts) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segsIntersect(a, b, pts[j], pts[(j + 1) % n])) return true;
      }
    }
    return false;
  }

  /* ---------- Sección completa ---------- */
  /* items: [{ id, sign (+1 material / -1 hueco), loops: [{ segs, hole }] }] */
  function computeSection(items) {
    const prepared = [];
    for (const it of items) {
      const loops = [];
      for (const l of it.loops) {
        const w = it.sign * (l.hole ? -1 : 1);
        loops.push({ segs: l.segs, w });
      }
      prepared.push({ id: it.id, sign: it.sign, loops });
    }
    // Pasada 1: área y centroide respecto al origen global
    let A1 = 0, Sx1 = 0, Sy1 = 0;
    for (const pr of prepared) {
      for (const l of pr.loops) {
        const I = loopIntegrals(l.segs, 0, 0);
        const s = I.A < 0 ? -1 : 1;
        A1 += l.w * s * I.A; Sx1 += l.w * s * I.Sx; Sy1 += l.w * s * I.Sy;
      }
    }
    if (!(A1 > 0)) return { valid: false, A: A1, items: [] };
    const ox = Sy1 / A1, oy = Sx1 / A1;

    // Pasada 2: momentos respecto a ejes paralelos por el centroide aproximado (evita cancelaciones)
    let a = 0, sx = 0, sy = 0, ixx = 0, iyy = 0, ixy = 0;
    const out = [];
    let bbox = null;
    for (const pr of prepared) {
      let ia = 0, isx = 0, isy = 0, iixx = 0, iiyy = 0, iixy = 0;
      for (const l of pr.loops) {
        const I = loopIntegrals(l.segs, ox, oy);
        const s = I.A < 0 ? -1 : 1;
        const k = l.w * s;
        ia += k * I.A; isx += k * I.Sx; isy += k * I.Sy;
        iixx += k * I.Ixx; iiyy += k * I.Iyy; iixy += k * I.Ixy;
        if (l.w > 0) bbox = mergeBBox(bbox, bboxSegs(l.segs));
      }
      a += ia; sx += isx; sy += isy; ixx += iixx; iyy += iiyy; ixy += iixy;
      const item = { id: pr.id, sign: pr.sign, A: ia, cx: ox, cy: oy, Ixo: 0, Iyo: 0, Ixyo: 0 };
      if (Math.abs(ia) > 1e-12) {
        const cxr = isy / ia, cyr = isx / ia;
        item.cx = ox + cxr; item.cy = oy + cyr;
        item.Ixo = iixx - ia * cyr * cyr;
        item.Iyo = iiyy - ia * cxr * cxr;
        item.Ixyo = iixy - ia * cxr * cyr;
      }
      out.push(item);
    }
    const cxr = sy / a, cyr = sx / a;
    const xc = ox + cxr, yc = oy + cyr;
    const res = {
      valid: a > 0,
      A: a, xc, yc,
      Ixc: ixx - a * cyr * cyr,
      Iyc: iyy - a * cxr * cxr,
      Ixyc: ixy - a * cxr * cyr,
      bbox, items: out,
    };
    // limpiar ruido numérico en secciones simétricas
    const sz = Math.max(bbox ? bbox.xmax - bbox.xmin : 0, bbox ? bbox.ymax - bbox.ymin : 0, 1e-300);
    if (Math.abs(res.Ixyc) < 1e-10 * (res.Ixc + res.Iyc)) res.Ixyc = 0;
    if (Math.abs(xc) < 1e-11 * sz) res.xc = 0;
    if (Math.abs(yc) < 1e-11 * sz) res.yc = 0;
    res.Ix0 = res.Ixc + a * res.yc * res.yc;
    res.Iy0 = res.Iyc + a * res.xc * res.xc;
    res.Ixy0 = res.Ixyc + a * res.xc * res.yc;
    return res;
  }

  /* ---------- Transformaciones del tensor de inercia ---------- */
  /* Momentos respecto a ejes girados θ (antihorario): u = eje girado, v = perpendicular */
  function rotateInertia(Ix, Iy, Ixy, th) {
    const c2 = Math.cos(2 * th), s2 = Math.sin(2 * th);
    const avg = (Ix + Iy) / 2, df = (Ix - Iy) / 2;
    return { Iu: avg + df * c2 - Ixy * s2, Iv: avg - df * c2 + Ixy * s2, Iuv: df * s2 + Ixy * c2 };
  }

  function principal(Ix, Iy, Ixy) {
    const avg = (Ix + Iy) / 2, df = (Ix - Iy) / 2;
    const rho = Math.hypot(df, Ixy);
    let th = 0.5 * Math.atan2(-Ixy, df);          // ángulo del eje con momento máximo, en (-90°, 90°]
    if (th <= -PI / 2 + 1e-9) th += PI;
    if (rho < 1e-12 * Math.max(1, Math.abs(avg))) th = 0;
    return { I1: avg + rho, I2: avg - rho, theta: th, avg, rho, delta: Math.atan2(Ixy, df) };
  }

  /* Momentos respecto a ejes (x0,y0,θ) cualesquiera, a partir de los centroidales */
  function aboutAxes(res, x0, y0, th) {
    const dx = res.xc - x0, dy = res.yc - y0;
    const Ix = res.Ixc + res.A * dy * dy;
    const Iy = res.Iyc + res.A * dx * dx;
    const Ixy = res.Ixyc + res.A * dx * dy;
    const r = rotateInertia(Ix, Iy, Ixy, th);
    return { Ix, Iy, Ixy, Iu: r.Iu, Iv: r.Iv, Iuv: r.Iuv };
  }

  /* ---------- Módulo plástico ---------- */
  function clipHalf(pts, ax, c) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const da = (ax === 'y' ? a.y : a.x) - c, db = (ax === 'y' ? b.y : b.x) - c;
      const ia = da >= 0, ib = db >= 0;
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = da / (da - db);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  }

  function polyMoments(pts) {
    let a = 0, sx = 0, sy = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const cr = p.x * q.y - q.x * p.y;
      a += cr; sx += (p.y + q.y) * cr; sy += (p.x + q.x) * cr;
    }
    return { A: a / 2, Sx: sx / 6, Sy: sy / 6 };
  }

  /* itemsPoly: [{ pts, w }] con coordenadas relativas al centroide.
   * axis 'x' → eje horizontal (flexión en y); 'y' → eje vertical */
  function plasticModulus(itemsPoly, Atot, axis) {
    const polys = itemsPoly.map((p) => {
      const ar = polyArea(p.pts);
      return { pts: ar < 0 ? p.pts.slice().reverse() : p.pts, w: p.w };
    });
    const key = axis === 'x' ? 'y' : 'x';
    // el área de referencia es la de los polígonos discretizados (evita el sesgo de las cuerdas)
    Atot = polys.reduce((s, p) => s + p.w * Math.abs(polyArea(p.pts)), 0);
    let lo = Infinity, hi = -Infinity;
    for (const p of polys) for (const q of p.pts) { lo = Math.min(lo, q[key]); hi = Math.max(hi, q[key]); }
    const above = (c) => {
      let a = 0, s = 0;
      for (const p of polys) {
        const cl = clipHalf(p.pts, key, c);
        if (cl.length < 3) continue;
        const m = polyMoments(cl);
        a += p.w * m.A;
        s += p.w * (key === 'y' ? m.Sx : m.Sy);
      }
      return { a, s };
    };
    const tot = above(lo - 1);
    for (let i = 0; i < 64; i++) {
      const mid = (lo + hi) / 2;
      if (above(mid).a > Atot / 2) lo = mid; else hi = mid;
    }
    const c = (lo + hi) / 2;
    const up = above(c);
    const Aab = up.a, Sab = up.s;
    const Abel = tot.a - Aab, Sbel = tot.s - Sab;
    const Z = (Sab - c * Aab) + (c * Abel - Sbel);
    return { Z, pna: c };
  }

  /* ---------- Magnitudes derivadas ---------- */
  function derive(res) {
    if (!res.valid) return res;
    const { A: a, Ixc, Iyc, Ixyc, bbox, xc, yc } = res;
    const pr = principal(Ixc, Iyc, Ixyc);
    const d = {
      J: Ixc + Iyc,
      rx: Math.sqrt(Math.max(Ixc, 0) / a),
      ry: Math.sqrt(Math.max(Iyc, 0) / a),
      rp: Math.sqrt(Math.max(Ixc + Iyc, 0) / a),
      I1: pr.I1, I2: pr.I2, theta1: pr.theta, mohrAvg: pr.avg, mohrR: pr.rho, mohrDelta: pr.delta,
      r1: Math.sqrt(Math.max(pr.I1, 0) / a),
      r2: Math.sqrt(Math.max(pr.I2, 0) / a),
      width: bbox.xmax - bbox.xmin,
      height: bbox.ymax - bbox.ymin,
      yt: bbox.ymax - yc, yb: yc - bbox.ymin,
      xl: xc - bbox.xmin, xr: bbox.xmax - xc,
    };
    d.Wxt = d.yt > 1e-12 ? Ixc / d.yt : NaN;
    d.Wxb = d.yb > 1e-12 ? Ixc / d.yb : NaN;
    d.Wyl = d.xl > 1e-12 ? Iyc / d.xl : NaN;
    d.Wyr = d.xr > 1e-12 ? Iyc / d.xr : NaN;
    return Object.assign(res, d);
  }

  return {
    PI, TAU, L, A, segPoint, segStart, segEnd,
    loopIntegrals, filletPolygon, xformSegs, bboxSegs, mergeBBox,
    polygonize, polyArea, pointInPolys, selfIntersects,
    computeSection, rotateInertia, principal, aboutAxes,
    plasticModulus, derive,
  };
});
