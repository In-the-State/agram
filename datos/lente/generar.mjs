// Genera datos/lente/lente-0.js desde datos/lente/lente-0.json, para que src/sitios.js lo importe sin fetch, igual en
// Node que en el navegador (como datos/efectos.js). El JSON manda: se cambia él y se vuelve a generar con
// `node datos/lente/generar.mjs`. test/lente-lector.test.js comprueba que lente-0.js está al día.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CARPETA = dirname(fileURLToPath(import.meta.url));
const ENTRADA = join(CARPETA, 'lente-0.json');
const SALIDA = join(CARPETA, 'lente-0.js');

/** Texto de lente-0.js para el JSON de la lente. */
export function generar(entrada = ENTRADA) {
  const datos = JSON.parse(readFileSync(entrada, 'utf8'));
  return [
    '// Generado por datos/lente/generar.mjs desde datos/lente/lente-0.json.',
    '// No se edita a mano: se cambia el JSON y se ejecuta `node datos/lente/generar.mjs`.',
    '',
    `export const LENTE_0_DATOS = ${JSON.stringify(datos, null, 2)};`,
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(SALIDA, generar());
  console.log('escrito ' + SALIDA);
}
