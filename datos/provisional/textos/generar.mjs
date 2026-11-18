// Genera src/provisional-textos.js desde datos/provisional/textos/{en,es}.json (Core AGRAM 18-11; docs/notas/
// NUCLEO_6_7_8.md §8, el porqué de un «no»): las frases «why …» que unen el porqué en llano y el glosario «position …»
// de las vistas del contexto, con la forma exacta de un registro de idioma de epoch.9.4 ([[código], [«clave: texto», …]]),
// que es lo que serán en la época 0 tras su pasada única. El JSON manda: se cambia él y se vuelve a generar con
// `node datos/provisional/textos/generar.mjs`. test/porque-no.test.js comprueba que el módulo está al día.
// Es una copia importable (sin `import … with { type: 'json' }`), igual en Node que en el navegador, como datos/lente/lente-0.js.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CARPETA = dirname(fileURLToPath(import.meta.url));
export const IDIOMAS = Object.freeze(['en', 'es']);
export const SALIDA = join(CARPETA, '..', '..', '..', 'src', 'provisional-textos.js');

/** Texto de src/provisional-textos.js para los JSON de los idiomas. */
export function generar(carpeta = CARPETA) {
  const registros = IDIOMAS.map((i) => JSON.parse(readFileSync(join(carpeta, i + '.json'), 'utf8')));
  return [
    '// Generado por datos/provisional/textos/generar.mjs desde datos/provisional/textos/{en,es}.json.',
    '// No se edita a mano: se cambian los JSON y se ejecuta `node datos/provisional/textos/generar.mjs`.',
    '// Lo provisional (NUCLEO_6_7_8 §8, decisión 13): las frases «why …» y el glosario «position …», como registros de idioma',
    '// de epoch.9.4. Se leen detrás de los textos de la época 0, nunca delante; un libro no los retoca (decisión 10).',
    '',
    `export const TEXTOS_PROVISIONALES_DATOS = ${JSON.stringify(registros, null, 2)};`,
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(SALIDA, generar());
  console.log('escrito ' + SALIDA);
}
