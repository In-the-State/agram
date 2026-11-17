// Genera la época de la clase `state` (state-0.btml.json y state-0.ids.json) desde su fuente, en esta carpeta:
// state-0.raiz.json, reglas/*.json, plantillas/*.json y textos/{es,en}.json. El generador es el de toda época hija de la 0
// (datos/epocas/hija.mjs, el mismo molde que la SIP 0 de StateArk y que datos/epocas/generar.mjs): cada regla y cada
// plantilla es su propio registro; la época HEREDA de la época 0 (su 6 es [[procedencia…], ["hereda"], [id de la 0]] y lo
// que no fija lleva la marca { ref: <id de la 0> }); si la 0 cambia, esta época cambia de id (la prueba
// test/epoca-state.test.js lo vigila).
//
// La época NO viaja con el núcleo (#115): src/ no la importa. Se escribe en el libro del eje del nodo al nacer
// (Eje.genesis({ epoca }) o node be.mjs epoca --publicar datos/epocas/state/state-0.btml.json).
//
// Uso: npm run epoca:state  (o node datos/epocas/state/generar.mjs [--comprobar]: sin escribir, sale con 1 si los
// archivos no están al día).

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generadorDeHija } from '../hija.mjs';

const hija = generadorDeHija({ aqui: dirname(fileURLToPath(import.meta.url)), nombre: 'state-0' });

export const ARCHIVO = hija.ARCHIVO;
export const ARCHIVO_IDS = hija.ARCHIVO_IDS;

/**
 * La época de la clase `state`, generada desde su fuente (sin escribir nada): { raiz, registros, id, hereda, reglas,
 * plantillas, informe, fallos }. `fallos` cuenta lo que no pasa (fórmulas que el BQL mínimo no analiza, registros que no
 * son BTML válido, 8 repetidos, una época que no carga).
 */
export const generar = () => hija.generar();

/** Lo que se escribe: la época escrita ({ id, hereda, raiz, registros }: la forma de be.mjs epoca --publicar) y sus ids. */
export const archivos = (g) => hija.archivos(g);

/** La época escrita tal como está en state-0.btml.json: { raiz, registros } para Eje.genesis({ epoca }). */
export const epocaState = () => hija.escrita();

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) hija.principal(process.argv);
