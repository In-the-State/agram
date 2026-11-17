// Genera la época del libro de la guía (guia-libro-0.btml.json y guia-libro-0.ids.json) desde su fuente, en esta
// carpeta: guia-libro-0.raiz.json, plantillas/*.json y textos/{es,en}.json. Es una época hija de la 0 y su generador es el
// de toda hija (datos/epocas/hija.mjs, el mismo que el de la época de la clase state): cada plantilla es su propio
// registro; la época HEREDA de la época 0 (su 6 es [[procedencia…], ["hereda"], [id de la 0]] y lo que no fija lleva la
// marca { ref: <id de la 0> }); si la 0 cambia, esta época cambia de id (la prueba test/guia-libro.test.js lo vigila).
//
// La época NO viaja con el núcleo (#115): src/ no la importa. Se escribe en el libro de la guía al nacer
// (Eje.genesis({ epoca }) o node be.mjs epoca --publicar datos/epocas/guia-libro/guia-libro-0.btml.json). Sus lecturas
// (src/guia-libro.js) buscan sus plantillas por su nombre en la época del libro, así que siguen valiendo si pasan a la 0.
//
// Uso: npm run epoca:guia-libro  (o node datos/epocas/guia-libro/generar.mjs [--comprobar]: sin escribir, sale con 1 si
// los archivos no están al día).

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generadorDeHija } from '../hija.mjs';

const hija = generadorDeHija({ aqui: dirname(fileURLToPath(import.meta.url)), nombre: 'guia-libro-0' });

export const ARCHIVO = hija.ARCHIVO;
export const ARCHIVO_IDS = hija.ARCHIVO_IDS;

/** La época del libro de la guía, generada desde su fuente (sin escribir nada): { raiz, registros, id, hereda, reglas, plantillas, informe, fallos }. */
export const generar = () => hija.generar();

/** Lo que se escribe: la época escrita ({ id, hereda, raiz, registros }: la forma de be.mjs epoca --publicar) y sus ids. */
export const archivos = (g) => hija.archivos(g);

/** La época escrita tal como está en guia-libro-0.btml.json: { raiz, registros } para Eje.genesis({ epoca }). */
export const epocaGuiaLibro = () => hija.escrita();

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) hija.principal(process.argv);
