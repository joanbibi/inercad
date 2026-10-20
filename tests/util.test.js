/* Tests de utilidades: node tests/util.test.js */
'use strict';
const U = require('../js/util.js');
let pass = 0, fail = 0;
const eq = (a, b, label) => { if (a === b || (Number.isNaN(a) && Number.isNaN(b))) pass++; else { fail++; console.log(`  ✗ ${label}: obtenido «${a}», esperado «${b}»`); } };
const near = (a, b, label) => eq(Math.abs(a - b) < 1e-9, true, label + ` (${a} vs ${b})`);

console.log('• Expresiones');
near(U.parseNum('12*5', 'mm'), 60, '12*5');
near(U.parseNum('2.5cm + 4mm', 'mm'), 29, '2.5cm + 4mm');
near(U.parseNum('1,5m', 'cm'), 150, '1,5m → cm');
near(U.parseNum('(3+4)/2', null), 3.5, 'paréntesis');
near(U.parseNum('2^3^2', null), 512, 'potencia asociativa a la derecha');
near(U.parseNum('-2^2', null), -4, 'menos unario');
near(U.parseNum('pi*2', null), 2 * Math.PI, 'pi');
near(U.parseNum('1 000,5', null), 1000.5, 'espacios y coma decimal');
near(U.parseNum('45°', null), 45, 'grados');
near(U.parseNum('2in', 'mm'), 50.8, 'pulgadas');
eq(U.parseNum('12abc', 'mm'), NaN, 'texto inválido');
eq(U.parseNum('', 'mm'), NaN, 'vacío');
eq(U.parseNum('3/0', null), NaN, 'división por cero');

console.log('• Formato');
eq(U.fmt(0), '0', 'cero');
eq(U.fmt(1234.5678, { sig: 6 }), '1234.57', '6 cifras');
eq(U.fmt(12345.678, { sig: 6 }), '12\u202F345.7', 'agrupación de miles');
eq(U.fmt(0.000123, { sig: 3 }), '1.23×10⁻⁴', 'científica pequeña');
eq(U.fmt(83561000, { sig: 5 }), '8.3561×10⁷', 'científica grande');
eq(U.fmt(-2.5, { sig: 3 }), '−2.5', 'signo menos tipográfico');
eq(U.fmt(1.5, { comma: true }), '1,5', 'coma decimal');
eq(U.fmt(5e-13, { zero: 1e-9 }), '0', 'ruido numérico a cero');
eq(U.fmt(NaN), '—', 'NaN');
eq(U.fmtInput(12.5), '12.5', 'campo editable');
eq(U.fmtInput(0.1 + 0.2), '0.3', 'campo editable sin ruido binario');
eq(U.unitLabel('cm', 'inertia'), 'cm⁴', 'etiqueta de unidad');
near(U.conv(1e6, 'cm', 'inertia'), 100, 'mm⁴ → cm⁴');
near(U.niceCeil(13), 20, 'niceCeil 13');
near(U.niceCeil(4.4), 5, 'niceCeil 4.4');

console.log(`\n${pass} correctos, ${fail} fallos`);
process.exit(fail ? 1 : 0);
