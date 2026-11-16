// Un solo lenguaje (retirada de BQL V0, #113): ningún archivo del repositorio vuelve a importar el BQL V0
// (src/bql.js) ni la web antigua (antigua/), y no vuelven a existir.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const FUERA = new Set(['.git', 'node_modules']);
const CODIGO = /\.(m?js|html)$/;

function archivos(dir, fuera = []) {
  for (const nombre of readdirSync(dir)) {
    if (FUERA.has(nombre)) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, fuera);
    else if (CODIGO.test(nombre)) fuera.push(ruta);
  }
  return fuera;
}

// Lo que se importa (import … from '…', import('…'), export … from '…', <script src="…">), sin los comentarios.
const IMPORTA = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|<script[^>]*\bsrc=)\s*['"]([^'"]+)['"]/g;
const prohibido = (ruta) => /(^|\/)bql\.js$/.test(ruta) || /(^|\/)antigua(\/|$)/.test(ruta);

test('ningún archivo importa src/bql.js ni la web antigua', () => {
  const malos = [];
  const esta = fileURLToPath(import.meta.url);
  for (const ruta of archivos(RAIZ).filter((r) => r !== esta)) { // esta prueba nombra lo prohibido en sus ejemplos
    const texto = readFileSync(ruta, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
    for (const [, destino] of texto.matchAll(IMPORTA)) if (prohibido(destino)) malos.push(relative(RAIZ, ruta) + ' → ' + destino);
  }
  assert.deepEqual(malos, []);
});

test('src/bql.js, docs/BQL.md y antigua/ ya no existen; src/index.js exporta bqlm y no bql', async () => {
  for (const r of ['src/bql.js', 'docs/BQL.md', 'antigua']) assert.equal(existsSync(join(RAIZ, r)), false, r);
  const nucleo = await import('../src/index.js');
  assert.equal('bql' in nucleo, false);
  assert.equal(typeof nucleo.bqlm.leerFormula, 'function');
});

test('la prueba se da cuenta: una importación de bql.js o de antigua/ se ve, en cualquier forma', () => {
  const vistos = (texto) => [...texto.matchAll(IMPORTA)].map((m) => m[1]).filter(prohibido);
  assert.deepEqual(vistos("import { evaluar } from '../src/bql.js';"), ['../src/bql.js']);
  assert.deepEqual(vistos('const m = await import("./antigua/ui/ejemplos.js");'), ['./antigua/ui/ejemplos.js']);
  assert.deepEqual(vistos("export * as bql from './bql.js';"), ['./bql.js']);
  assert.deepEqual(vistos('<script type="module" src="./antigua/app.js"></script>'), ['./antigua/app.js']);
  assert.deepEqual(vistos("import { leerFormula } from './bqlm.js';"), []);
});
