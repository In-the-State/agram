// Genera las copias importables de lo provisional (datos/provisional/tipos.js, lecturas.js y finales.js) desde sus JSON,
// para que src/provisional.js las importe sin fetch ni módulos JSON, igual en Node, en el navegador, en el WebView de la app de
// StateArk y en los servidores de AARPIA (Core AGRAM 18-11: el patrón de la casa, como datos/epocas/epocas.js). Los JSON
// mandan: se cambian ellos y se vuelve a generar con `node datos/provisional/generar.mjs`. test/provisional.test.js
// comprueba que cada copia está al día. Todo esto se borra de un golpe en la pasada única por la época 0.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CARPETA = dirname(fileURLToPath(import.meta.url));

/** Las copias: [JSON fuente, copia .js, nombre de lo que exporta]. */
export const COPIAS = Object.freeze([
  Object.freeze(['tipos.json', 'tipos.js', 'TIPOS_PROVISIONALES_DATOS']),
  Object.freeze(['lecturas.json', 'lecturas.js', 'LECTURAS_PROVISIONALES_DATOS']),
  Object.freeze(['finales.json', 'finales.js', 'FINALES_PROVISIONALES_DATOS']),
  Object.freeze(['cadenas.json', 'cadenas.js', 'CADENAS_PROVISIONALES_DATOS']),
  Object.freeze(['gestos.json', 'gestos.js', 'GESTOS_PROVISIONALES_DATOS']),
]);

/** El texto de una copia .js para su JSON. */
export function generar(fuente, nombre, carpeta = CARPETA) {
  const datos = JSON.parse(readFileSync(join(carpeta, fuente), 'utf8'));
  return [
    '// Generado por datos/provisional/generar.mjs desde datos/provisional/' + fuente + '.',
    '// No se edita a mano: se cambia el JSON y se ejecuta `node datos/provisional/generar.mjs`.',
    '',
    `export const ${nombre} = ${JSON.stringify(datos, null, 2)};`,
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [fuente, copia, nombre] of COPIAS) {
    writeFileSync(join(CARPETA, copia), generar(fuente, nombre));
    console.log('escrito ' + join(CARPETA, copia));
  }
}
