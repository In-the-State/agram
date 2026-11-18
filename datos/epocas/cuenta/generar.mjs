// Genera la época del libro de cuenta (cuenta-0.btml.json y cuenta-0.ids.json) desde su fuente, en esta carpeta:
// cuenta-0.raiz.json, reglas/*.json, plantillas/*.json, textos/{es,en}.json y prestadas.json (las dos plantillas de la
// guía y sus textos, leídos de la fuente de guia-libro sin copiarlos). Es una época hija de la 0 y su generador
// es el de toda hija (datos/epocas/hija.mjs, el mismo que el de la época state y el de la del libro de la guía): cada
// regla y cada plantilla es su propio registro; la época HEREDA de la época 0 (su 6 es [[procedencia…], ["hereda"], [id
// de la 0]] y lo que no fija lleva la marca { ref: <id de la 0> }); si la 0 cambia, esta época cambia de id (la prueba
// test/cuenta-libro.test.js lo vigila).
//
// La época NO viaja con el núcleo (#115): src/ no la importa. Se escribe en el libro de cuenta al nacer
// (Eje.genesis({ epoca }) o node be.mjs epoca --publicar datos/epocas/cuenta/cuenta-0.btml.json). Ningún archivo de src/
// ni de carta/ conoce sus plantillas: la lente enseña lo anclado en el 1 y el 3 de mi alta, y sus lecturas con nombre
// («my books», «my pending invitations», «my pairings») son BQL de la época.
//
// Uso: npm run epoca:cuenta  (o node datos/epocas/cuenta/generar.mjs [--comprobar]: sin escribir, sale con 1 si los
// archivos no están al día).

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generadorDeHija } from '../hija.mjs';

const hija = generadorDeHija({ aqui: dirname(fileURLToPath(import.meta.url)), nombre: 'cuenta-0' });

export const ARCHIVO = hija.ARCHIVO;
export const ARCHIVO_IDS = hija.ARCHIVO_IDS;

/** La época del libro de cuenta, generada desde su fuente (sin escribir nada): { raiz, registros, id, hereda, reglas, plantillas, informe, fallos }. */
export const generar = () => hija.generar();

/** Lo que se escribe: la época escrita ({ id, hereda, raiz, registros }: la forma de be.mjs epoca --publicar) y sus ids. */
export const archivos = (g) => hija.archivos(g);

/** La época escrita tal como está en cuenta-0.btml.json: { raiz, registros } para Eje.genesis({ epoca }). */
export const epocaCuenta = () => hija.escrita();

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) hija.principal(process.argv);
