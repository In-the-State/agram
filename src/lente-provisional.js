// Lo que la lente necesita saber de unas acciones y aún no está en la época (docs/notas/SITIOS_Y_PESOS.md §11; Core AGRAM
// 20-11): leído del dato provisional (datos/provisional/ajustes.json y antes-y-despues.json, src/provisional.js), para que
// la carta no conozca ninguna acción por su nombre. Se reexporta desde src/contrato.js. Se borra con lo provisional en la
// pasada única, cuando esas filas estén en su época.
//
//   accionesDeAjuste()   las acciones de «Ajustes de este elemento»: { padre, quitarPadre, defecto, clase, precio, minimo,
//                        rango } (cada una, su nombre o null)
//   antesDe(accion)      las acciones que van antes de `accion` (nombre): [] si nada
//   despuesDe(accion)    las acciones que van después de `accion` (nombre), sobre lo que escribió: [] si nada

import { AJUSTES_PROVISIONALES, ANTES_Y_DESPUES_PROVISIONALES } from './provisional.js';

const hoja = (x) => (Array.isArray(x) ? x[0] : x);
const texto = (x) => (typeof hoja(x) === 'string' ? hoja(x) : null);
const textos = (x) => (Array.isArray(x) ? x : [x]).filter((v) => typeof v === 'string');

/** Las posiciones de la décupla «element settings»: qué ajuste dice cada una. */
const POSICION_DEL_AJUSTE = Object.freeze({ padre: 1, quitarPadre: 2, defecto: 3, clase: 4, precio: 5, minimo: 6, rango: 7 });

const AJUSTES = (() => {
  const d = AJUSTES_PROVISIONALES.find((x) => texto(x?.[0]) === 'element settings') ?? [];
  return Object.freeze(Object.fromEntries(Object.entries(POSICION_DEL_AJUSTE).map(([que, k]) => [que, texto(d[k])])));
})();

/** Las acciones con que un elemento fija lo suyo (la pantalla «Ajustes de este elemento»), por lo que fijan. */
export const accionesDeAjuste = () => AJUSTES;

/** Las filas «goes before» o «goes after»: [{ acciones: Set, otras: [nombres] }]. */
const filas = (cabecera) => ANTES_Y_DESPUES_PROVISIONALES.filter((x) => texto(x?.[0]) === cabecera).map((x) => ({ acciones: new Set(textos(x[1])), otras: Object.freeze(textos(x[2])) }));
const ANTES = filas('goes before');
const DESPUES = filas('goes after');
const NADA = Object.freeze([]);
const de = (lista, accion) => (typeof accion === 'string' ? lista.find((f) => f.acciones.has(accion))?.otras ?? NADA : NADA);

/** Las acciones que van antes de `accion` (su nombre canónico): [] si no pide nada antes. */
export const antesDe = (accion) => de(ANTES, accion);

/** Las acciones que van después de `accion` (su nombre canónico), sobre lo que escribió: [] si nada. */
export const despuesDe = (accion) => de(DESPUES, accion);
