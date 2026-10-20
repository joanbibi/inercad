/* InerCAD · genera los recursos de marca a partir de assets/logo/source.jpg
 *
 *   assets/logo/mark.png / mark-dark.png            símbolo (líneas finas) con transparencia
 *   assets/logo/wordmark.png / wordmark-dark.png    nombre «InerCAD» con transparencia
 *   assets/logo/lockup.png / lockup-dark.png        símbolo + nombre
 *   assets/icon-32.png, assets/icon-192.png         favicon y PWA
 *   build/icon.png, build/icon.ico                  icono de la aplicación (16–256 px)
 *   build/installerSidebar.bmp                       barra lateral del instalador
 *
 * El JPEG se decodifica con Electron (nativeImage); el resto es JavaScript puro.
 * Uso: npm run brand   (equivale a: electron tools/make-brand.js)
 */
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'logo', 'source.jpg');
const LIGHT = [233, 236, 239];   // whiteout  #E9ECEF
const DARK = [33, 37, 41];       // blackstone #212529

/* ---------- PNG ---------- */
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { rows[y * (w * 4 + 1)] = 0; rgba.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
/* máscara alfa (Float32 0..1) → PNG de un solo color */
function maskPNG(alpha, w, h, rgb) {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; px[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, alpha[i])) * 255); }
  return encodePNG(w, h, px);
}

/* ---------- Remuestreo de una máscara alfa ---------- */
function resample(src, sw, sh, rx, ry, rw, rh, dw, dh) {
  const out = new Float32Array(dw * dh);
  const kx = rw / dw, ky = rh / dh;
  const bil = (x, y) => {
    x -= 0.5; y -= 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const g = (xx, yy) => (xx < 0 || yy < 0 || xx >= sw || yy >= sh ? 0 : src[yy * sw + xx]);
    return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
  };
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      if (kx <= 1 && ky <= 1) { out[y * dw + x] = bil(rx + (x + 0.5) * kx, ry + (y + 0.5) * ky); continue; }
      // reducción: promedio por área
      const x0 = rx + x * kx, x1 = x0 + kx, y0 = ry + y * ky, y1 = y0 + ky;
      let acc = 0, wsum = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          const v = xx < 0 || yy < 0 || xx >= sw || yy >= sh ? 0 : src[yy * sw + xx];
          acc += v * wx * wy; wsum += wx * wy;
        }
      }
      out[y * dw + x] = wsum ? acc / wsum : 0;
    }
  }
  return out;
}

/* engrosa las líneas (máximo en un disco de radio r) */
function dilate(a, w, h, r) {
  if (r < 0.5) return a;
  const R = Math.round(r), out = new Float32Array(a.length);
  const offs = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r * r + 0.5) offs.push([dx, dy]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (const [dx, dy] of offs) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const v = a[yy * w + xx];
        if (v > m) m = v;
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

const inRound = (x, y, w, h, r) => { const dx = Math.max(Math.abs(x - w / 2) - (w / 2 - r), 0), dy = Math.max(Math.abs(y - h / 2) - (h / 2 - r), 0); return dx * dx + dy * dy <= r * r; };

/* ---------- Icono con el símbolo real ----------
 * Tamaños grandes (≥ 128 px): el símbolo completo, con las líneas algo engrosadas.
 * Tamaños pequeños (< 128 px): el mismo símbolo reducido a sus trazos principales (viga, elipse y diagonal)
 * y muy engrosado, para que no se pierda al verlo a 16–64 px. */
function markIcon(size, markAlpha, mw, small) {
  const markSide = Math.round(size * (small ? 0.8 : 0.7));  // proporción del icono que ocupa el símbolo
  const scale = markSide / mw;
  const tSrc = 2.2;                                         // grosor aproximado de la línea original (px)
  let src = markAlpha, sw = mw;
  let r0;
  if (small) {
    // quedarse solo con los trazos fuertes y trabajar a 256 px para que el engrosado sea rápido
    const strong = markAlpha.map((a) => Math.min(1, Math.max(0, (a - 0.3) / 0.45)));
    sw = 256;
    src = resample(strong, mw, mw, 0, 0, mw, mw, sw, sw);
    const tTarget = size <= 24 ? 1.7 : 1.5;                 // grosor final deseado (px)
    r0 = Math.min(30, Math.max(0, (tTarget / (markSide / sw) - tSrc * (sw / mw)) / 2));
  } else {
    r0 = Math.min(6, Math.max(0, (1.3 / scale - tSrc) / 2)); // línea final ≥ 1,3 px
  }
  const thick = dilate(src, sw, sw, r0);
  const m = resample(thick, sw, sw, 0, 0, sw, sw, markSide, markSide);
  const off = Math.floor((size - markSide) / 2);
  const ss = 3, rad = size * 0.225, px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cov = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) if (inRound(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss, size, size, rad)) cov++;
      cov /= ss * ss;
      const mx = x - off, my = y - off;
      const a = mx >= 0 && my >= 0 && mx < markSide && my < markSide ? Math.min(1, m[my * markSide + mx] * 1.15) : 0;
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(DARK[c] * (1 - a) + LIGHT[c] * a);
      px[o + 3] = Math.round(cov * 255);
    }
  }
  return px;
}

/* Entrada de ICO en formato DIB de 32 bits con máscara AND (compatible con el Explorador y rcedit) */
function dibEntry(size, rgba) {
  const andRow = Math.ceil(size / 32) * 4, andSize = andRow * size, pixSize = size * size * 4;
  const hdr = Buffer.alloc(40);
  hdr.writeUInt32LE(40, 0); hdr.writeInt32LE(size, 4); hdr.writeInt32LE(size * 2, 8); hdr.writeUInt16LE(1, 12); hdr.writeUInt16LE(32, 14);
  hdr.writeUInt32LE(pixSize + andSize, 20);
  const pix = Buffer.alloc(pixSize);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const si = (y * size + x) * 4, di = ((size - 1 - y) * size + x) * 4;
      pix[di] = rgba[si + 2]; pix[di + 1] = rgba[si + 1]; pix[di + 2] = rgba[si]; pix[di + 3] = rgba[si + 3];
    }
  }
  return Buffer.concat([hdr, pix, Buffer.alloc(andSize)]);
}

/* ---------- BMP de 24 bits (imágenes del instalador NSIS) ---------- */
function encodeBMP(w, h, rgb) {
  const rowSize = Math.ceil((w * 3) / 4) * 4, data = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) {
    const dst = (h - 1 - y) * rowSize;
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; data[dst + x * 3] = rgb[i + 2]; data[dst + x * 3 + 1] = rgb[i + 1]; data[dst + x * 3 + 2] = rgb[i]; }
  }
  const head = Buffer.alloc(54);
  head.write('BM', 0); head.writeUInt32LE(54 + data.length, 2); head.writeUInt32LE(54, 10);
  head.writeUInt32LE(40, 14); head.writeInt32LE(w, 18); head.writeInt32LE(h, 22); head.writeUInt16LE(1, 26); head.writeUInt16LE(24, 28);
  head.writeUInt32LE(data.length, 34); head.writeInt32LE(2835, 38); head.writeInt32LE(2835, 42);
  return Buffer.concat([head, data]);
}

/* Barra lateral del instalador (164×314): símbolo arriba y nombre debajo, sobre blackstone */
function installerSidebar(markA, mw, wordA, ww, wh) {
  const W = 164, H = 314, rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { rgb[i * 3] = DARK[0]; rgb[i * 3 + 1] = DARK[1]; rgb[i * 3 + 2] = DARK[2]; }
  const put = (alpha, aw, ah, x0, y0) => {
    for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) {
      const a = Math.min(1, alpha[y * aw + x] * 1.15), px = x0 + x, py = y0 + y;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const o = (py * W + px) * 3;
      for (let c = 0; c < 3; c++) rgb[o + c] = Math.round(rgb[o + c] * (1 - a) + LIGHT[c] * a);
    }
  };
  const ms = 132;
  put(resample(dilate(resample(markA, mw, mw, 0, 0, mw, mw, 256, 256), 256, 256, 1.2), 256, 256, 0, 0, 256, 256, ms, ms), ms, ms, Math.round((W - ms) / 2), 46);
  const wwid = 118, whh = Math.round((wwid * wh) / ww);
  put(resample(wordA, ww, wh, 0, 0, ww, wh, wwid, whh), wwid, whh, Math.round((W - wwid) / 2), 200);
  return encodeBMP(W, H, rgb);
}

/* ---------- Programa principal ---------- */
function main() {
  const img = nativeImage.createFromPath(SRC);
  const { width: W, height: H } = img.getSize();
  if (!W) throw new Error('No se pudo leer ' + SRC);
  const bmp = img.toBitmap(); // BGRA
  const Y = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) Y[i] = 0.114 * bmp[i * 4] + 0.587 * bmp[i * 4 + 1] + 0.299 * bmp[i * 4 + 2];

  // Fondo: mediana por bloques + interpolación bilineal
  const B = 48, gw = Math.ceil(W / B), gh = Math.ceil(H / B), grid = new Float32Array(gw * gh);
  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      const vals = [];
      for (let y = by * B; y < Math.min(H, (by + 1) * B); y += 2) for (let x = bx * B; x < Math.min(W, (bx + 1) * B); x += 2) vals.push(Y[y * W + x]);
      vals.sort((a, b) => a - b);
      grid[by * gw + bx] = vals[Math.floor(vals.length * 0.4)];
    }
  }
  const bgAt = (x, y) => {
    const fx = Math.min(gw - 1, Math.max(0, x / B - 0.5)), fy = Math.min(gh - 1, Math.max(0, y / B - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    return (grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx) * (1 - ty) + (grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx) * ty;
  };

  // Alfa: cuánto se separa cada píxel del fondo hacia el blanco
  const T = 238, alpha = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const bg = bgAt(x, y);
      let a = (Y[y * W + x] - bg) / (T - bg);
      a = a < 0.07 ? 0 : (a - 0.07) / 0.93;
      alpha[y * W + x] = Math.min(1, a);
    }
  }
  // quitar la raya decorativa de la esquina superior derecha
  for (let y = 0; y < 90; y++) for (let x = 0; x < W; x++) alpha[y * W + x] = 0;

  // Cajas envolventes: símbolo (izquierda) y nombre (derecha)
  const bbox = (x0, x1) => {
    let xa = 1e9, xb = -1, ya = 1e9, yb = -1;
    for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) if (alpha[y * W + x] > 0.12) { if (x < xa) xa = x; if (x > xb) xb = x; if (y < ya) ya = y; if (y > yb) yb = y; }
    return { x0: xa, x1: xb + 1, y0: ya, y1: yb + 1 };
  };
  // el hueco entre símbolo y nombre: primera columna vacía tras el símbolo
  let gap = Math.round(W * 0.34);
  const colHas = (x) => { for (let y = 90; y < H; y++) if (alpha[y * W + x] > 0.12) return true; return false; };
  while (gap < W && colHas(gap)) gap++;
  const markBox = bbox(0, gap), wordBox = bbox(gap, W);
  console.log('símbolo', markBox, 'nombre', wordBox, 'imagen', W + 'x' + H);

  const out = (...p) => path.join(ROOT, ...p);
  fs.mkdirSync(out('assets', 'logo'), { recursive: true });
  fs.mkdirSync(out('build'), { recursive: true });

  // Símbolo cuadrado de 640 px
  const mw = markBox.x1 - markBox.x0, mh = markBox.y1 - markBox.y0, side = Math.max(mw, mh) * 1.1;
  const MS = 640;
  const markA = resample(alpha, W, H, (markBox.x0 + markBox.x1) / 2 - side / 2, (markBox.y0 + markBox.y1) / 2 - side / 2, side, side, MS, MS);
  fs.writeFileSync(out('assets', 'logo', 'mark.png'), maskPNG(markA, MS, MS, LIGHT));
  fs.writeFileSync(out('assets', 'logo', 'mark-dark.png'), maskPNG(markA, MS, MS, DARK));

  // Nombre, a resolución nativa con un pequeño margen
  const pad = Math.round((wordBox.y1 - wordBox.y0) * 0.12);
  const wx0 = wordBox.x0 - pad, wy0 = wordBox.y0 - pad, ww = wordBox.x1 - wordBox.x0 + 2 * pad, wh = wordBox.y1 - wordBox.y0 + 2 * pad;
  const wordA = resample(alpha, W, H, wx0, wy0, ww, wh, ww, wh);
  fs.writeFileSync(out('assets', 'logo', 'wordmark.png'), maskPNG(wordA, ww, wh, LIGHT));
  fs.writeFileSync(out('assets', 'logo', 'wordmark-dark.png'), maskPNG(wordA, ww, wh, DARK));
  console.log('wordmark', ww + 'x' + wh);

  // Composición símbolo + nombre tal como en el original
  const lx0 = markBox.x0 - pad, lx1 = wordBox.x1 + pad;
  const ly0 = Math.min(markBox.y0, wordBox.y0) - pad, ly1 = Math.max(markBox.y1, wordBox.y1) + pad;
  const lw = lx1 - lx0, lh = ly1 - ly0;
  const lockA = resample(alpha, W, H, lx0, ly0, lw, lh, lw, lh);
  fs.writeFileSync(out('assets', 'logo', 'lockup.png'), maskPNG(lockA, lw, lh, LIGHT));
  fs.writeFileSync(out('assets', 'logo', 'lockup-dark.png'), maskPNG(lockA, lw, lh, DARK));
  console.log('lockup', lw + 'x' + lh);

  // Iconos
  fs.writeFileSync(out('assets', 'icon-32.png'), encodePNG(32, 32, markIcon(32, markA, MS, true)));
  fs.writeFileSync(out('assets', 'icon-192.png'), encodePNG(192, 192, markIcon(192, markA, MS)));
  fs.writeFileSync(out('build', 'icon.png'), encodePNG(512, 512, markIcon(512, markA, MS)));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const raws = sizes.map((s) => markIcon(s, markA, MS, s < 128));
  const imgs = sizes.map((s, i) => (s === 256 ? encodePNG(256, 256, raws[i]) : dibEntry(s, raws[i])));
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const dir = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e[0] = s === 256 ? 0 : s; e[1] = s === 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(imgs[i].length, 8); e.writeUInt32LE(offset, 12);
    offset += imgs[i].length;
    return e;
  });
  fs.writeFileSync(out('build', 'icon.ico'), Buffer.concat([head, ...dir, ...imgs]));
  // imágenes del instalador
  fs.writeFileSync(out('build', 'installerSidebar.bmp'), installerSidebar(markA, MS, wordA, ww, wh));
  // hoja de contactos de los tamaños pequeños (para revisarlos; no se empaqueta)
  fs.writeFileSync(out('build', 'icon-small-preview.png'), encodePNG(32, 32, raws[2]));
  console.log('listo');
}

app.whenReady().then(() => {
  try { main(); } catch (e) { console.error(e); process.exitCode = 1; }
  app.quit();
});
