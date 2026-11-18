// La época del libro de cuenta, conocida por el código (Carril F, 18-11; agram-equipo/LIBRO_DE_CUENTA_ALOJADO.md §6). El
// génesis de cuenta que firma la app al emparejar nombra esta época por su id y no la escribe (un solo registro): todo
// lector tiene que saber resolver ese id a la época de cuenta y no caer a la 0. Este módulo la carga de su copia generada
// (datos/epocas/cuenta/cuenta-0.js, npm run epoca:cuenta), la registra por su id (registrarEpoca) y la exporta. Lo importa
// src/eje.js, así que vale en la carta, en be.mjs y en las pruebas sin que nadie tenga que acordarse.
//
// Sigue siendo DATO: sus plantillas y sus lecturas son de la época y aquí no se nombra ninguna. Lo único que sabe el
// código es que existe una época más con id conocido, como sabe los ids anteriores de la 0.
//
// Tolerante: si su copia generada no carga (pasa mientras se regenera la época 0 y la base de la copia ya no es la 0
// que trae el código), no lanza al cargar el módulo y EPOCA_DE_CUENTA queda nula; un génesis que nombre su id se lee
// entonces con la 0, como cualquier id desconocido, y la carta no anuncia la época al emparejar.

import { EPOCA_DE_CUENTA_DATOS } from '../datos/epocas/cuenta/cuenta-0.js';
import { cargarEpocaEscrita, registrarEpoca } from './epocas.js';

function cargar() {
  try {
    return registrarEpoca(cargarEpocaEscrita(EPOCA_DE_CUENTA_DATOS));
  } catch {
    return null;
  }
}

/** La época del libro de cuenta, cargada y registrada por su id; null si su copia generada no carga. */
export const EPOCA_DE_CUENTA = cargar();

/** Su id (64 hex), o null. */
export const ID_EPOCA_DE_CUENTA = EPOCA_DE_CUENTA?.id ?? null;
