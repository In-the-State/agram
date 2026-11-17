// Genera la época del libro del roadmap (roadmap-0.btml.json y roadmap-0.ids.json) desde su fuente, en esta carpeta:
// roadmap-0.raiz.json, reglas/*.json, plantillas/*.json y textos/{es,en}.json. Es una época hija de la 0 y su generador
// es el de toda hija (datos/epocas/hija.mjs, el mismo que el de la época state y el de la del libro de la guía): cada
// regla y cada plantilla es su propio registro; la época HEREDA de la época 0 (su 6 es [[procedencia…], ["hereda"], [id
// de la 0]] y lo que no fija lleva la marca { ref: <id de la 0> }); si la 0 cambia, esta época cambia de id (la prueba
// test/cadenas.test.js lo vigila).
//
// La época NO viaja con el núcleo (#115): src/ no la importa. Se escribe en el libro del roadmap al nacer
// (Eje.genesis({ epoca }) o node be.mjs epoca --publicar datos/epocas/roadmap/roadmap-0.btml.json). Su lectura
// (src/cadenas.js) busca la plantilla por su nombre en la época del libro, así que sigue valiendo si pasa a la 0.
//
// Uso: npm run epoca:roadmap  (o node datos/epocas/roadmap/generar.mjs [--comprobar]: sin escribir, sale con 1 si los
// archivos no están al día).

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generadorDeHija } from '../hija.mjs';

const hija = generadorDeHija({ aqui: dirname(fileURLToPath(import.meta.url)), nombre: 'roadmap-0' });

export const ARCHIVO = hija.ARCHIVO;
export const ARCHIVO_IDS = hija.ARCHIVO_IDS;

/** La época del libro del roadmap, generada desde su fuente (sin escribir nada): { raiz, registros, id, hereda, reglas, plantillas, informe, fallos }. */
export const generar = () => hija.generar();

/** Lo que se escribe: la época escrita ({ id, hereda, raiz, registros }: la forma de be.mjs epoca --publicar) y sus ids. */
export const archivos = (g) => hija.archivos(g);

/** La época escrita tal como está en roadmap-0.btml.json: { raiz, registros } para Eje.genesis({ epoca }). */
export const epocaRoadmap = () => hija.escrita();

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) hija.principal(process.argv);
