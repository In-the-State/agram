// El motor de versiones de la época (A23; agram-equipo/DISENO_GOBIERNO_Y_MOTOR.md §6.1, con las comprobaciones de núcleo
// de §3.1 y §3.4 y el suelo de §5; docs/notas/MOTOR.md). Un cambio de reglas es una época hija escrita dentro del libro
// (la raíz y sus registros, en el payload de un «propose a change»). Cuando el eje acepta un «put a change in force» y la
// versión vigente trae esa plantilla, el cambio se funde sobre ella con la misma maquinaria con que una época hija se
// funde sobre su base (fusionarRaices y cargarEpocaBtml) y sale la versión siguiente. El id de la época no cambia.
// Aquí no hay eje: el eje (src/eje.js) guarda las versiones y llama a esto al validar y al aplicar.

import { fusionarRaices, cargarEpocaBtml, erroresDeEpocaEscrita, heredaDe, idDeRegistro, EPOCAS_POR_ID } from './epocas.js';
import { erroresDelSuelo } from './suelo.js';
import { RAIZ } from './evento.js';

export { GOBIERNO, UMBRAL_CORRIENTE, UMBRAL_DE_GOBIERNO, NOMBRES, PRESION_MAXIMA, SUELO, PIEZAS_DE_GOBIERNO, CLASE_CORRIENTE, CLASE_DE_GOBIERNO, PREFIJO_DE_POSICION, erroresDelSuelo, presionDeLosNombres, sueloDe, piezasDeGobiernoDe } from './suelo.js';

// ---------- Constantes: las posiciones de las plantillas del gobierno de la época 0 (docs/notas/GOBIERNO.md §3; una
// prueba, test/versiones.test.js, vigila que casan con la época 0 real). Las del 7.9 (umbrales, nombres, suelo, piezas de
// gobierno) son las del diseño §4.1 y viven en src/suelo.js. ----------

/** Los nombres de las plantillas del gobierno que mira el núcleo (diseño §3; el 0 de cada plantilla). */
export const PROPONER = 'propose a change';
export const APROBAR = 'enact a change';
export const PONER_EN_VIGOR = 'put a change in force';
export const RETIRAR = 'withdraw a change';
/** Dónde dice un registro su acción: su payload 4, el parámetro «actions» de toda plantilla de la época. */
export const ACCION_EN = 4;
/** Dónde lleva «propose a change» la raíz de la época hija del cambio: su payload 1.1 (el 1.0, la explicación). */
export const CAMBIO_EN = Object.freeze([1, 1]);
/** Dónde lleva los registros del cambio (reglas, plantillas…): su payload 1.2, una décupla o una lista de décuplas. */
export const REGISTROS_EN = Object.freeze([1, 2]);
/** Dónde declara la clase («ordinary» o «governance»): su payload 2. */
export const CLASE_EN = Object.freeze([2]);
/** Dónde ancla una propuesta: el 9.7 del génesis del libro, «changes» (diseño §3.1). */
export const ANCLA_DE_PROPUESTAS = '9700000000';

// ---------- lecturas de un registro ----------

const en = (nodo, camino) => camino.reduce((n, k) => (Array.isArray(n) ? n[k] : undefined), nodo);
const primera = (x) => {
  let n = x;
  while (Array.isArray(n)) n = n[0];
  return n;
};

/** ¿Dice el registro `ev` la acción `accion` en su payload 4? */
export function dice(ev, accion) {
  const x = ev?.payload?.[ACCION_EN];
  return Array.isArray(x) ? x.includes(accion) : x === accion;
}

const NOMBRES = new WeakMap();
/** ¿Trae la época (la versión) la plantilla de transacción `nombre` en su 9.6? */
export function traePlantilla(epoca, nombre) {
  if (!epoca || typeof epoca !== 'object') return false;
  if (!NOMBRES.has(epoca)) NOMBRES.set(epoca, new Set((Array.isArray(epoca.transacciones) ? epoca.transacciones : []).map((x) => primera(x.plantilla?.[0]))));
  return NOMBRES.get(epoca).has(nombre);
}

/** ¿Es `x` una décupla de registro (todas sus posiciones son arrays)? ¿Y una lista de ellas? */
const esRegistro = (x) => Array.isArray(x) && x.length > 0 && x.every(Array.isArray);
const esListaDeRegistros = (x) => Array.isArray(x) && x.length > 0 && x.every(esRegistro);

/** El cambio que lleva una propuesta: { raiz, registros } (CAMBIO_EN y REGISTROS_EN), o null si no lleva raíz. */
export function cambioDe(propuesta) {
  const raiz = en(propuesta?.payload, CAMBIO_EN);
  if (!Array.isArray(raiz)) return null;
  const r = en(propuesta.payload, REGISTROS_EN);
  const registros = r === undefined ? [] : esListaDeRegistros(r) ? r : esRegistro(r) ? [r] : null;
  if (!registros) return { raiz, registros: [], malos: true };
  return { raiz, registros };
}

/** La clase que declara una propuesta (CLASE_EN), o undefined. */
export function claseDe(propuesta) {
  return primera(en(propuesta?.payload, CLASE_EN));
}

/** Los ids de los registros que lleva el cambio de una propuesta: los que su raíz puede referenciar sin estar en el eje. */
export function idsDelCambio(ev, epoca) {
  if (!dice(ev, PROPONER) || !traePlantilla(epoca, PROPONER)) return new Set();
  const c = cambioDe(ev);
  if (!c) return new Set();
  const ids = new Set();
  for (const r of c.registros) {
    try {
      ids.add(idDeRegistro(r));
    } catch {
      // un registro que no se serializa lo dice la forma del cambio
    }
  }
  return ids;
}

// ---------- fundir un cambio sobre una versión ----------

/** Lo fundido, por versión de partida y por cambio: fundir es una lectura pura, y restaurar o reordenar lo vuelve a pedir. */
const FUNDIDAS = new WeakMap();

/** Los ids que nombran la versión `epoca` como base de un cambio: el suyo y los de su cadena (y los anteriores de la 0). */
function nombresDe(epoca) {
  const nacimiento = epoca.nacimiento ?? epoca;
  const ids = new Set([epoca.id, ...(epoca.ids ?? [])]);
  for (const [id, e] of EPOCAS_POR_ID) if (e === nacimiento) ids.add(id);
  return ids;
}

/**
 * Funde el cambio `{ raiz, registros }` sobre la versión `epoca` y devuelve { version } o { motivo } (en llano). La raíz
 * del cambio es una época hija como las de hoy: su 6 dice «hereda» con el id de la época del libro (o uno de su cadena) y
 * marca con { ref } cada posición que no cambia. Su 0 (el nombre del cambio) y su 6 (su procedencia) son del cambio y no
 * pasan a la versión: la versión conserva el nombre y la procedencia de la época. La versión es la época de partida con
 * el cambio encima: el mismo id, sus registros y los del cambio, y `anterior` (la de partida) y `nacimiento` (la primera).
 */
export function fundirCambio(epoca, cambio) {
  if (!cambio || cambio.malos) return { motivo: 'los registros del cambio (payload 1.2) no son décuplas' };
  let llave;
  try {
    llave = idDeRegistro(cambio.raiz) + ':' + cambio.registros.map(idDeRegistro).join(',');
  } catch (e) {
    return { motivo: 'el cambio no cabe en JSON: ' + e.message };
  }
  if (!FUNDIDAS.has(epoca)) FUNDIDAS.set(epoca, new Map());
  const memo = FUNDIDAS.get(epoca);
  if (!memo.has(llave)) memo.set(llave, fundir(epoca, cambio));
  return memo.get(llave);
}

function fundir(epoca, { raiz, registros }) {
  const errores = erroresDeEpocaEscrita({ raiz, registros });
  if (errores.length) return { motivo: 'el cambio no tiene forma de época hija: ' + errores.join('; ') };
  const hereda = heredaDe(raiz);
  const nombres = nombresDe(epoca);
  if (!hereda || !nombres.has(hereda)) {
    return { motivo: 'el cambio no hereda de la época de este libro: su 6 ha de decir «hereda» con el id ' + epoca.id.slice(0, 8) + (hereda ? ' (dice ' + String(hereda).slice(0, 8) + ')' : '') };
  }
  const marca = { ref: hereda };
  const propia = raiz.map((x, i) => (i === 0 || i === 6 ? marca : x));
  const todos = new Map(epoca.registros);
  for (const r of registros) todos.set(idDeRegistro(r), r);
  let fusion;
  try {
    fusion = fusionarRaices(epoca.registro, propia, { registroDe: (ref) => todos.get(ref), ids: new Set([...nombres, ...(epoca.ids ?? [])]) });
  } catch (e) {
    return { motivo: 'el cambio no se funde sobre la versión vigente: ' + e.message };
  }
  let cargada;
  try {
    const lista = [...todos].map(([id, registro]) => ({ id, registro }));
    cargada = cargarEpocaBtml(fusion, { registros: lista, plantillas: lista, id: epoca.id, validar: false });
  } catch (e) {
    return { motivo: 'el cambio, fundido sobre la versión vigente, no se carga: ' + e.message };
  }
  const version = Object.freeze({
    ...cargada,
    escrita: epoca.escrita,
    hereda: epoca.hereda ?? null,
    base: epoca.base ?? null,
    ids: Object.freeze([...(epoca.ids ?? [epoca.id])]),
    anterior: epoca,
    nacimiento: epoca.nacimiento ?? epoca,
  });
  return { version };
}

/**
 * Lo que el núcleo comprueba de un cambio sobre la versión `epoca` (diseño §3.1 y §3.4): que tiene forma de época hija,
 * que fundido carga, que no toca el suelo y que su clase no se queda corta. → { version, motivos: [] } o { motivos }.
 */
export function comprobarCambio(epoca, cambio, clase) {
  if (!cambio) return { motivos: ['la propuesta no lleva el cambio (payload 1.1): una raíz de época hija'] };
  const f = fundirCambio(epoca, cambio);
  if (f.motivo) return { motivos: [f.motivo] };
  const suelo = erroresDelSuelo(epoca, f.version, { clase: clase ?? null });
  if (suelo.length) return { motivos: suelo.map((m) => 'el cambio ' + m) };
  return { version: f.version, motivos: [] };
}

// ---------- lo que el eje pregunta al validar ----------

/**
 * Los motivos con que el núcleo rechaza `ev` al proponer (diseño §3.1), [] si no hay: solo si `ev` dice «propose a change»
 * y la versión vigente trae esa plantilla (si no, es un registro cualquiera).
 */
export function motivosAlProponer(epoca, ev) {
  if (!dice(ev, PROPONER) || !traePlantilla(epoca, PROPONER)) return [];
  return comprobarCambio(epoca, cambioDe(ev), claseDe(ev)).motivos;
}

/**
 * La entrada en vigor de `ev` (diseño §3.4 y §6.1): null si `ev` no dice «put a change in force» o la versión vigente no
 * trae esa plantilla (entonces es un registro cualquiera y no cambia nada); si no, { motivos: [] , version, propuesta } o
 * { motivos } con el porqué. `libro` es lo que hace falta del eje de antes de `ev`: { obtener(id), sobre(id),
 * genesisId, enVigor (Map id de la propuesta → id del registro que la puso en vigor) }. El cambio se busca siguiendo el
 * sobre: «put a change in force» → «enact a change» → «propose a change» (en el 9.7 del génesis), que lleva el cambio.
 */
export function entradaEnVigor(libro, epoca, ev) {
  if (!dice(ev, PONER_EN_VIGOR) || !traePlantilla(epoca, PONER_EN_VIGOR)) return null;
  const no = (motivo) => ({ motivos: [motivo] });
  const aprobacion = libro.obtener(ev.sobre);
  if (!aprobacion || !dice(aprobacion, APROBAR)) return no('«' + PONER_EN_VIGOR + '» va sobre un «' + APROBAR + '», y el registro sobre el que se escribe no lo es: no hay cambio que poner en vigor');
  const propuesta = libro.obtener(aprobacion.sobre);
  if (!propuesta || !dice(propuesta, PROPONER)) return no('el «' + APROBAR + '» sobre el que se escribe no va sobre un «' + PROPONER + '»: no hay cambio que poner en vigor');
  if (propuesta.sobre !== libro.genesisId || (propuesta.en ?? RAIZ) !== ANCLA_DE_PROPUESTAS) return no('la propuesta ' + propuesta.id.slice(0, 8) + ' no está anclada en el 9.7 del génesis de este libro: no es un cambio de este libro');
  const ya = libro.enVigor.get(propuesta.id);
  if (ya) return no('el cambio de la propuesta ' + propuesta.id.slice(0, 8) + ' ya está en vigor desde el registro ' + ya.slice(0, 8) + ': un cambio entra en vigor una sola vez');
  const retirada = libro.sobre(propuesta.id).find((h) => dice(h, RETIRAR) && h.autor === propuesta.autor);
  if (retirada) return no('la propuesta ' + propuesta.id.slice(0, 8) + ' se retiró (registro ' + retirada.id.slice(0, 8) + '): no entra en vigor');
  const r = comprobarCambio(epoca, cambioDe(propuesta), claseDe(propuesta));
  if (r.motivos.length) return { motivos: r.motivos.map((m) => 'en este punto, sobre la versión vigente: ' + m) };
  return { motivos: [], version: r.version, propuesta: propuesta.id };
}
