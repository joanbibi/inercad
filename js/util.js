/* InerCAD · Utilidades: unidades, formato numérico, expresiones, iconos */
const U = (function () {
  'use strict';

  /* ---------- Unidades (factor respecto al milímetro) ---------- */
  const UNITS = {
    mm: { f: 1, name: 'mm', label: 'Milímetros (mm)' },
    cm: { f: 10, name: 'cm', label: 'Centímetros (cm)' },
    m: { f: 1000, name: 'm', label: 'Metros (m)' },
    in: { f: 25.4, name: 'in', label: 'Pulgadas (in)' },
    ft: { f: 304.8, name: 'ft', label: 'Pies (ft)' },
  };
  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '' };
  const sup = (s) => String(s).replace(/[0-9+-]/g, (c) => SUP[c]);

  /* Magnitudes: potencia de la longitud */
  const QUANT = {
    len: { pow: 1 }, area: { pow: 2 }, mod: { pow: 3 }, inertia: { pow: 4 },
    angle: { pow: 0 }, none: { pow: 0 },
  };
  function unitLabel(unit, q) {
    const p = QUANT[q].pow;
    if (!p) return q === 'angle' ? '°' : '';
    return UNITS[unit].name + (p > 1 ? sup(p) : '');
  }
  /* mm^pow → unidad */
  function conv(v, unit, q) {
    const p = QUANT[q].pow;
    return p ? v / Math.pow(UNITS[unit].f, p) : v;
  }

  /* ---------- Formato numérico ---------- */
  function group(intStr) {
    return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function fmt(v, o) {
    o = o || {};
    if (v === undefined || v === null || Number.isNaN(v)) return '—';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    const sig = o.sig || 6;
    const comma = !!o.comma;
    if (v === 0 || Math.abs(v) < (o.zero || 1e-300)) return '0';
    const a = Math.abs(v);
    const sciMode = o.sci === 'always';
    let out;
    if (sciMode || a >= 1e7 || a < 1e-3) {
      const e = v.toExponential(sig - 1);
      const [mant, ex] = e.split('e');
      let m = mant.includes('.') ? mant.replace(/0+$/, '').replace(/\.$/, '') : mant;
      out = m + '×10' + sup(parseInt(ex, 10));
    } else {
      const r = Number(v.toPrecision(sig));
      const dec = Math.max(0, Math.min(12, sig - 1 - Math.floor(Math.log10(Math.abs(r)))));
      let s = r.toFixed(dec);
      if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
      const neg = s[0] === '-';
      if (neg) s = s.slice(1);
      const [ip, fp] = s.split('.');
      out = (neg ? '−' : '') + (ip.length >= 5 ? group(ip) : ip) + (fp ? '.' + fp : '');
    }
    if (out[0] === '-') out = '−' + out.slice(1);
    return comma ? out.replace('.', ',') : out;
  }

  /* Para campos editables: sin agrupar, hasta 6 decimales */
  function fmtInput(v) {
    if (!isFinite(v)) return '';
    if (Math.abs(v) < 1e-9) return '0';
    let s = Number(v.toPrecision(10)).toString();
    if (s.includes('e')) s = v.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    else if (s.includes('.') && s.split('.')[1].length > 6) s = v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  /* Texto plano de máxima precisión para copiar (punto decimal) */
  function fmtCopy(v) {
    if (!isFinite(v)) return '';
    return String(Number(v.toPrecision(12)));
  }

  /* ---------- Expresiones: 12.5*2, (3+4)/2, 10cm + 5mm, 2^3, pi ---------- */
  function parseNum(str, unitName) {
    if (typeof str === 'number') return str;
    let s = String(str).replace(/[\s  ]/g, '').replace(/,/g, '.').replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
    if (s === '') return NaN;
    const base = unitName ? UNITS[unitName].f : 1;
    let i = 0;
    const peek = () => s[i];
    function number() {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) return NaN;
      i += m[0].length;
      let v = parseFloat(m[0]);
      const u = /^(mm|cm|ft|in|m|º|°|deg)/i.exec(s.slice(i));
      if (u) {
        i += u[0].length;
        const k = u[0].toLowerCase();
        if (unitName && UNITS[k]) v = (v * UNITS[k].f) / base;
      }
      return v;
    }
    function atom() {
      if (peek() === '(') {
        i++;
        const v = expr();
        if (peek() !== ')') return NaN;
        i++;
        return v;
      }
      if (s.slice(i, i + 2).toLowerCase() === 'pi') { i += 2; return Math.PI; }
      return number();
    }
    function power() {
      let b = atom();
      if (peek() === '^') { i++; b = Math.pow(b, factor()); }
      return b;
    }
    function factor() {
      if (peek() === '-') { i++; return -factor(); }
      if (peek() === '+') { i++; return factor(); }
      return power();
    }
    function term() {
      let v = factor();
      while (peek() === '*' || peek() === '/') {
        const op = s[i++];
        const r = factor();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') {
        const op = s[i++];
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    const v = expr();
    return i === s.length && isFinite(v) ? v : NaN;
  }

  /* ---------- Escalas "agradables" 1-2-5 ---------- */
  function niceCeil(x) {
    if (!(x > 0)) return 1;
    const e = Math.floor(Math.log10(x));
    const m = x / Math.pow(10, e);
    const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
    return n * Math.pow(10, e);
  }
  function niceRound(x) {
    if (!(x > 0)) return 1;
    const e = Math.floor(Math.log10(x));
    const m = x / Math.pow(10, e);
    const n = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
    return n * Math.pow(10, e);
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function debounce(fn, ms) {
    let t;
    return function () {
      const a = arguments, c = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(c, a), ms);
    };
  }

  /* ---------- Iconos (24×24, trazo) ---------- */
  const P = {
    // formas
    rect: '<rect x="3.5" y="6" width="17" height="12" rx="1"/>',
    circle: '<circle cx="12" cy="12" r="8.5"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="9.5" ry="6"/>',
    triangle: '<path d="M3.5 19h17L9 5z"/>',
    trapezoid: '<path d="M3 18h18l-4-12H7z"/>',
    ngon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>',
    semicircle: '<path d="M3 16h18a9 9 0 0 0-18 0z"/>',
    quarter: '<path d="M5 19h14A14 14 0 0 0 5 5z"/>',
    sector: '<path d="M6 18h14A14 14 0 0 0 13 5.9z"/>',
    segment: '<path d="M4.5 7h15a10.5 10.5 0 0 1-15 0z"/>',
    polygon: '<path d="M4 17l4-11 8-2 4 9-8 7z"/><circle cx="4" cy="17" r="1.1"/><circle cx="8" cy="6" r="1.1"/><circle cx="16" cy="4" r="1.1"/><circle cx="20" cy="13" r="1.1"/><circle cx="12" cy="20" r="1.1"/>',
    ibeam: '<path d="M5 4h14v3.5h-5.5v9H19V20H5v-3.5h5.5v-9H5z"/>',
    tee: '<path d="M4 4h16v4h-6v12h-4V8H4z"/>',
    angle: '<path d="M5 4h4v11h10v4H5z"/>',
    channel: '<path d="M5 4h14v4h-9v8h9v4H5z"/>',
    zed: '<path d="M9 4h12v3.5h-8V20H3v-3.5h6z"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    ring: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/>',
    rhs: '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><rect x="7" y="9.5" width="10" height="5" rx="1"/>',
    // herramientas
    select: '<path d="M6 3l12 8.5-5.3 1.2 3 5.8-2.4 1.2-3-5.8L6 17z"/>',
    pan: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    grid: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
    snap: '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3zM6 7h4M14 7h4"/>',
    dims: '<path d="M3 7v10M21 7v10M3 12h18M6 9.5L3 12l3 2.5M18 9.5l3 2.5-3 2.5"/>',
    centroid: '<circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
    axes: '<path d="M5 19V5M5 19h14M5 5L3 8M5 5l2 3M19 19l-3-2M19 19l-3 2"/>',
    principal: '<path d="M4 18L18 4M7 8l9 9"/><path d="M15 4h3v3M16 17l3-1"/>',
    ellipseI: '<ellipse cx="12" cy="12" rx="9.5" ry="4.8" transform="rotate(-32 12 12)"/>',
    undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"/>',
    save: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M6 3h8l5 5v13H6zM14 3v5h5"/>',
    export: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    report: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    mirrorH: '<path d="M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z"/>',
    mirrorV: '<path d="M3 12h18M7 8l5-5 5 5zM7 16l5 5 5-5z"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.7A17 17 0 0 0 2 12s4 7 10 7a9.5 9.5 0 0 0 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    alignL: '<path d="M4 3v18M8 7h12M8 14h8"/>',
    alignCH: '<path d="M12 3v18M5 7h14M8 14h8"/>',
    alignR: '<path d="M20 3v18M4 7h12M8 14h8"/>',
    alignT: '<path d="M3 4h18M7 8v12M14 8v8"/>',
    alignCV: '<path d="M3 12h18M7 5v14M14 8v8"/>',
    alignB: '<path d="M3 20h18M7 4v12M14 8v8"/>',
    warn: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20V5M9 8h6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 9"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
    sigma: '<path d="M18 5H6l6 7-6 7h12"/>',
    rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    hole: '<rect x="3.5" y="5" width="17" height="14" rx="1"/><circle cx="12" cy="12" r="3.5" stroke-dasharray="2.2 2"/>',
    csv: '<path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6"/>',
    dxf: '<path d="M4 20V4l16 16V4"/>',
  };

  function icon(name, size) {
    const s = size || 18;
    return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  }

  return { UNITS, QUANT, unitLabel, conv, fmt, fmtInput, fmtCopy, parseNum, niceCeil, niceRound, clamp, deg, rad, esc, debounce, icon, sup };
})();
if (typeof module === 'object' && module.exports) module.exports = U;
