/* Copia las fuentes IBM Plex (SIL OFL 1.1) desde node_modules a fonts/ y genera css/fonts.css.
 * Solo se usan los subconjuntos latin, latin-ext y greek (español + símbolos de ingeniería) en woff2.
 * Uso: node tools/fonts.js */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'fonts');
fs.mkdirSync(out, { recursive: true });

const WANT = [
  { pkg: 'ibm-plex-sans', weights: [300, 400, 500, 600], styles: ['normal'] },
  { pkg: 'ibm-plex-mono', weights: [300, 400, 500], styles: ['normal'] },
  { pkg: 'ibm-plex-serif', weights: [400], styles: ['italic'] },
];
const SUBSETS = ['latin', 'latin-ext', 'greek'];

let css = `/* IBM Plex Sans / Mono / Serif — © IBM Corp., SIL Open Font License 1.1 (fonts/OFL.txt). Generado por tools/fonts.js */\n`;
let copied = 0;

for (const f of WANT) {
  const dir = path.join(root, 'node_modules', '@fontsource', f.pkg);
  for (const style of f.styles) {
    for (const w of f.weights) {
      for (const sub of SUBSETS) {
        const name = `${f.pkg}-${sub}-${w}-${style}`;
        const src = path.join(dir, 'files', name + '.woff2');
        if (!fs.existsSync(src)) continue; // p. ej. serif italic sin subset greek
        fs.copyFileSync(src, path.join(out, name + '.woff2'));
        copied++;
        // intervalo unicode tomado del CSS oficial de fontsource
        const cssFile = fs.readFileSync(path.join(dir, `${w}${style === 'italic' ? '-italic' : ''}.css`), 'utf8');
        const block = cssFile.split('/* ').find((b) => b.startsWith(name + ' */')) || '';
        const range = /unicode-range:\s*([^;]+);/.exec(block);
        const family = f.pkg === 'ibm-plex-sans' ? 'IBM Plex Sans' : f.pkg === 'ibm-plex-mono' ? 'IBM Plex Mono' : 'IBM Plex Serif';
        css += `@font-face { font-family: '${family}'; font-style: ${style}; font-weight: ${w}; font-display: swap; src: url(../fonts/${name}.woff2) format('woff2');${range ? ` unicode-range: ${range[1]};` : ''} }\n`;
      }
    }
  }
}
fs.copyFileSync(path.join(root, 'node_modules', '@fontsource', 'ibm-plex-sans', 'LICENSE'), path.join(out, 'OFL.txt'));
fs.writeFileSync(path.join(root, 'css', 'fonts.css'), css);
console.log(`${copied} archivos woff2 copiados a fonts/ y css/fonts.css generado`);
