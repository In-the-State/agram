// Lo que la lente necesita saber de unas acciones y aún no está en la época (docs/notas/SITIOS_Y_PESOS.md §11; Core AGRAM
// 20-11): leído del dato provisional (datos/provisional/ajustes.json y antes-y-despues.json, src/provisional.js), para que
// la carta no conozca ninguna acción por su nombre. Se reexporta desde src/contrato.js. Se borra con lo provisional en la
// pasada única, cuando esas filas estén en su época.
//
//   accionesDeAjuste()   las acciones de «Ajustes de este elemento»: { padre, quitarPadre, defecto, clase, precio, minimo,
//                        rango } (cada una, su nombre o null)
//   antesDe(accion)      las acciones que van antes de `accion` (nombre): [] si nada
//   despuesDe(accion)    las acciones que van después de `accion` (nombre), sobre lo que escribió: [] si nada
//   nivelesDeLosHitos()  los diez niveles nivel.grado de los hitos, en su orden (datos/provisional/hitos.json)
//   nombreDelHito(nivel, idioma)  el nombre de un hito en un idioma (si no lo hay, en inglés, el canónico); sin idioma, en
//                        español, como hasta hoy (supuesto: la pasada única decide si el canónico sin idioma pasa a ser el inglés)

import { AJUSTES_PROVISIONALES, ANTES_Y_DESPUES_PROVISIONALES } from './provisional.js';
import { HITOS_PROVISIONALES_DATOS } from '../datos/provisional/hitos.js';

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

// ---------- los nombres de los hitos ----------

const HITOS_DATO = Array.isArray(HITOS_PROVISIONALES_DATOS) ? HITOS_PROVISIONALES_DATOS : [];
const NIVELES = Object.freeze(textos(HITOS_DATO.find((x) => texto(x?.[0]) === 'milestones')?.[1] ?? []));
/** Los textos de cada idioma, con la forma de los registros de epoch.9.4: idioma → Map(«milestone <nivel>» → nombre). */
const NOMBRES = new Map(HITOS_DATO.filter((x) => texto(x?.[0]) !== 'milestones').map((x) => [texto(x?.[0]), new Map(textos(x?.[1]).map((h) => {
  const i = h.indexOf(': ');
  return i > 0 ? [h.slice(0, i), h.slice(i + 2)] : [h, null];
}))]));
/** La clave de un hito en los textos de un idioma (la que tendrá en epoch.9.4). */
const claveDelHito = (nivel) => 'milestone ' + nivel;
/** El idioma de los nombres cuando no se pide ninguno: el de siempre (src/bases.js los tenía en español). */
const SIN_IDIOMA = 'es';

/** Los diez niveles nivel.grado de los hitos, en su orden. */
export const nivelesDeLosHitos = () => NIVELES;

/** El nombre del hito de `nivel` («0.3») en `idioma`; si ese idioma no lo tiene, en inglés; null si no es un hito. */
export function nombreDelHito(nivel, idioma = SIN_IDIOMA) {
  const clave = claveDelHito(String(nivel));
  for (const i of [idioma ?? SIN_IDIOMA, 'en']) {
    const n = NOMBRES.get(i)?.get(clave);
    if (typeof n === 'string') return n;
  }
  return null;
}
