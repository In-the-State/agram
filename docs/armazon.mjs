// Qué archivos carga la carta y no están en el ARMAZON del service worker (sw.js). Solo lo imprime: no falla ni toca sw.js.
// Desde la raíz del repositorio:
//
//   node docs/armazon.mjs
//
// Parte de index.html y carta/app.js y sigue los `import` y `export … from` estáticos, los `import('…')` con la ruta escrita
// y las URL de `new URL('…', import.meta.url)`. Un `import(ruta)` con la ruta en una variable (los ejemplos de carta/ejemplos.js)
// se sigue por las cadenas «./…js» o «../…mjs» que el mismo archivo trae escritas, y se marca como «ruta calculada»: es una
// suposición, no una certeza. Los especificadores sin ruta (`node:…`, nombres sueltos) y lo que hay bajo `vendor/` (ya empaquetado,
// no se recorre por dentro) no se siguen. Lo que carga el navegador por una URL absoluta (otro origen) no entra.
//
// Lo que sale: los archivos cargados que no están en el ARMAZON (lo que habría que añadir a mano a sw.js y, al hacerlo, subir su
// VERSION) y, aparte, los que sí están.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aRuta = (absoluta) => path.relative(raiz, absoluta).split(path.sep).join('/');

/** Lo que ARMAZON de sw.js lista, como rutas desde la raíz («./» es index.html). */
function armazonDeSw() {
  const texto = readFileSync(path.join(raiz, 'sw.js'), 'utf8');
  const m = texto.match(/const ARMAZON\s*=\s*\[([\s\S]*?)\]/);
  if (!m) throw new Error('no encuentro ARMAZON en sw.js');
  return new Set([...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => (x[1] === './' ? 'index.html' : x[1].replace(/^\.\//, ''))));
}

/** El texto sin comentarios (de línea y de bloque; no toca lo que está entre comillas con «//» dentro, como las URL). */
function sinComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Las rutas relativas que un archivo JavaScript carga: { ruta, como }. */
function cargasDe(archivo) {
  const texto = sinComentarios(readFileSync(archivo, 'utf8'));
  const dir = path.dirname(archivo);
  const fuera = [];
  const anota = (especificador, como) => {
    if (!/^\.{1,2}\//.test(especificador)) return; // node:, nombres sueltos y URL absolutas no se siguen
    fuera.push({ ruta: path.resolve(dir, especificador.split(/[?#]/)[0]), como });
  };
  for (const m of texto.matchAll(/\b(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g)) anota(m[1], 'import estático');
  for (const m of texto.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) anota(m[1], 'import dinámico');
  for (const m of texto.matchAll(/new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) anota(m[1], 'URL junto al módulo');
  // import(ruta) con la ruta en una variable: se siguen las rutas de módulo que el archivo trae escritas.
  if (/\bimport\s*\(\s*[^'"\s)]/.test(texto)) {
    for (const m of texto.matchAll(/['"](\.{1,2}\/[^'"\s]+\.m?js)['"]/g)) anota(m[1], 'ruta calculada (import(ruta))');
  }
  return fuera;
}

/** Los archivos que index.html pide por una ruta relativa (hoja de estilos, manifiesto, iconos, scripts). */
function cargasDeHtml(archivo) {
  const texto = readFileSync(archivo, 'utf8');
  const dir = path.dirname(archivo);
  return [...texto.matchAll(/\b(?:href|src)\s*=\s*["']([^"'#?]+)/g)]
    .filter((m) => /^\.{1,2}\//.test(m[1]))
    .map((m) => ({ ruta: path.resolve(dir, m[1]), como: 'index.html' }));
}

const vistos = new Map(); // ruta desde la raíz → cómo se llegó
const faltan = []; // rutas que se nombran y no existen
const cola = [];
const entra = (absoluta, como) => {
  const r = aRuta(absoluta);
  if (vistos.has(r)) return;
  if (!existsSync(absoluta)) { faltan.push({ ruta: r, como }); return; }
  vistos.set(r, como);
  if (/\/vendor\//.test('/' + r)) return; // empaquetado: no se recorre por dentro
  if (/\.m?js$/.test(r)) cola.push(absoluta);
};

const inicio = path.join(raiz, 'index.html');
vistos.set('index.html', 'inicio');
for (const c of cargasDeHtml(inicio)) entra(c.ruta, c.como);
entra(path.join(raiz, 'carta/app.js'), 'inicio');
while (cola.length) {
  const archivo = cola.shift();
  for (const c of cargasDe(archivo)) entra(c.ruta, c.como + ' desde ' + aRuta(archivo));
}

const armazon = armazonDeSw();
const cargados = [...vistos.keys()].sort();
const sinGuardar = cargados.filter((r) => !armazon.has(r));
const guardados = cargados.filter((r) => armazon.has(r));
const sobran = [...armazon].filter((r) => !vistos.has(r)).sort();

console.log(`Cargados desde index.html y carta/app.js: ${cargados.length} archivos. En el ARMAZON de sw.js: ${guardados.length}. Faltan en el ARMAZON: ${sinGuardar.length}.`);
console.log('\nSe cargan y no están en el ARMAZON (candidatos a añadir):');
for (const r of sinGuardar) console.log('  ./' + r);
if (!sinGuardar.length) console.log('  (ninguno)');
if (sobran.length) {
  console.log('\nEstán en el ARMAZON y esta pasada no los alcanza:');
  for (const r of sobran) console.log('  ./' + r);
}
if (faltan.length) {
  console.log('\nSe nombran y no existen en el repositorio:');
  for (const f of faltan) console.log('  ' + f.ruta + '  (' + f.como + ')');
}
const calculadas = [...vistos].filter(([, como]) => como.startsWith('ruta calculada'));
if (calculadas.length) {
  console.log('\nAlcanzados solo por una ruta calculada (suposición, mira si de verdad se cargan):');
  for (const [r, como] of calculadas) console.log('  ./' + r + '  (' + como + ')');
}
