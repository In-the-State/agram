// Genera la época de ensayo de P (ensayo-p-0.btml.json y ensayo-p-0.ids.json) desde su fuente, en esta carpeta:
// ensayo-p-0.raiz.json, reglas/*.json y textos/{es,en}.json. Es una época hija de la 0 y su generador es el de toda hija
// (datos/epocas/hija.mjs): hereda de la época 0 definitiva y no la cambia; si la 0 cambia, esta época cambia de id.
//
// La época NO viaja con el núcleo (#115): src/ no la importa. Se escribe en un libro al nacer (Eje.genesis({ epoca })).
//
// Uso: node datos/epocas/ensayo-p/generar.mjs [--comprobar]: sin escribir, sale con 1 si los archivos no están al día.

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generadorDeHija } from '../hija.mjs';

// Con su copia importable (ensayo-p-0.js, EPOCA_DE_ENSAYO_P_DATOS): el ejemplo «criterio» de la carta la importa (el navegador no lee JSON).
const hija = generadorDeHija({ aqui: dirname(fileURLToPath(import.meta.url)), nombre: 'ensayo-p-0', importable: 'EPOCA_DE_ENSAYO_P_DATOS' });

export const ARCHIVO = hija.ARCHIVO;
export const ARCHIVO_IDS = hija.ARCHIVO_IDS;
export const ARCHIVO_IMPORTABLE = hija.ARCHIVO_IMPORTABLE;

/** La época de ensayo de P, generada desde su fuente (sin escribir nada): { raiz, registros, id, hereda, reglas, plantillas, informe, fallos }. */
export const generar = () => hija.generar();

/** Lo que se escribe: la época escrita ({ id, hereda, raiz, registros }) y sus ids. */
export const archivos = (g) => hija.archivos(g);

/** La época escrita tal como está en ensayo-p-0.btml.json: { raiz, registros } para Eje.genesis({ epoca }). */
export const epocaEnsayoP = () => hija.escrita();

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) hija.principal(process.argv);
