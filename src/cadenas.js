// Las dependencias entre tareas como cadenas, para el 7 del libro del roadmap (Core AGRAM 17-11, decidido con VG): la
// lectura, pura y sin DOM. Documentación: docs/CONTRATO.md §12.10 y docs/notas/CADENAS.md.
//
//   cadenas(eje, X)   las tareas bajo X repartidas en cadenas (una fila por secuencia) e independientes, con su estado
//
// La relación es un registro «this goes after» del autor de la tarea, anclado en su 2.6 (la condición que viene de otros
// registros): su 6 son las referencias a las tareas de las que va después; manda la última. Una tarea es un registro con
// el tipo «task» en su 5. La plantilla vive hoy en la época hija del libro del roadmap (datos/epocas/roadmap/; este
// módulo no la importa) y se busca POR SU NOMBRE en la época del libro: en un libro cuya época no la tiene, la lectura
// da vacío. Nada de esto escribe ni firma.

import { direccion, esReferencia } from './btml.js';
import { plantillaDeTransaccion, estacionDeAnuncio } from './acciones.js';
import { cerrado, FINES } from './motor.js';

/** Los nombres canónicos que lee esta lectura: la plantilla de la relación y el tipo de una tarea. */
export const NOMBRES_DE_LAS_CADENAS = Object.freeze({ relacion: 'this goes after', tarea: 'task', cierre: 'close' });

/**
 * Los finales de una anterior que dejan pasar a la siguiente (motor.cerrado, su `fin`). Un valor por defecto de Core
 * AGRAM (17-11) que VG puede cambiar AQUÍ, y solo aquí: una anterior cumplida o cerrada por decisión desbloquea; una
 * cerrada con error («error») o caducada («caducado») no: la siguiente sigue en espera y dice por cuál.
 */
export const FINES_QUE_DESBLOQUEAN = Object.freeze(['cumplido', 'decidido']);

/** Los cuatro estados de un paso: hecho (cerrado), en curso (con su anuncio), listo (nada lo espera) y espera (por cuáles). */
export const ESTADOS_DE_PASO = Object.freeze({ hecho: 'hecho', enCurso: 'en curso', listo: 'listo', espera: 'espera' });

/** Los motivos de una arista descartada. */
export const MOTIVOS_DE_DESCARTE = Object.freeze({ ciclo: 'ciclo', aSiMisma: 'a sí misma', noEsTarea: 'no es una tarea', noEsta: 'no está' });

const EN_LA_CONDICION = direccion([2, 6]);
const EN_EL_CUATRO = direccion([4]);
const EN_EL_ANUNCIO = direccion([4, 1]);
const RE_ID = /^[0-9a-f]{64}$/;
const hoja = (x) => (Array.isArray(x) ? x[0] : x);
const hojas = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const dice = (r, i, nombre) => Array.isArray(r?.payload) && hojas(r.payload[i]).map(hoja).includes(nombre);
const vacio = () => ({ cadenas: [], independientes: [], descartadas: [] });

/** ¿Es una tarea? El tipo «task» en su 5. */
const esTarea = (r) => dice(r, 5, NOMBRES_DE_LAS_CADENAS.tarea);

/** Los registros que cierran un proceso por su nombre (en su 4): «close» y los otros finales del motor (motor.FINES). */
const CIERRES = Object.freeze([NOMBRES_DE_LAS_CADENAS.cierre, ...FINES.map((f) => f.accion)]);

/**
 * Cómo está una tarea por sí misma: { hecho, fin, estacion }. Hecha si su autor escribió un cierre en su 4 y el motor la
 * da por cerrada (motor.cerrado: una tarea sin nada anunciado se lee cerrada, así que sin cierre escrito no lo está; como
 * el volcado, ejemplos/volcado/volcar.mjs, estacionDe); `fin`, el del motor (cumplido, error, caducado, decidido).
 * `estacion`, la de su último anuncio en el 4.1 (acciones.estacionDeAnuncio) o null.
 */
function comoEsta(eje, t) {
  const autor = new Set([t.autor]);
  const cierre = eje.sobreDe(t.id, EN_EL_CUATRO, autor).some((r) => CIERRES.some((n) => dice(r, 4, n)));
  let c = null;
  try { c = cierre ? cerrado(eje, t.id) : null; } catch { c = null; }
  const anuncio = eje.sobreDe(t.id, EN_EL_ANUNCIO, autor).at(-1) ?? null;
  let estacion = null;
  try { estacion = anuncio ? estacionDeAnuncio(eje, anuncio.id) ?? null : null; } catch { estacion = null; }
  return { hecho: c?.cerrado === true, fin: c?.cerrado === true ? c.fin ?? null : null, estacion };
}

/**
 * Las cadenas de X (un proyecto, una casa, el libro: su génesis): las tareas que cuelgan de X, a cualquier profundidad,
 * y sus relaciones «this goes after», repartidas así:
 *
 * - el grafo: de cada tarea, la última relación de su autor en su 2.6; cada referencia de su 6 es una arista de la
 *   anterior a ella. Las anteriores que no cuelgan de X entran como contexto (`fuera: true`; de ellas no se siguen sus
 *   propias anteriores). Se descarta, y se dice en `descartadas`, la arista a sí misma, a lo que no es una tarea y la que
 *   cierra un ciclo (escrito a mano: las aristas se añaden por llegada de su relación y, dentro de ella, en su orden);
 * - el orden: por dependencias, con los empates por llegada al libro (estable);
 * - las cadenas: cada tarea continúa la cadena de su primera anterior (por llegada) que todavía termina en ella; si
 *   ninguna, abre una cadena nueva, y si tenía anteriores, la cadena dice de cuál `sale` (una bifurcación). Las demás
 *   anteriores de la tarea van en su `une` (una unión). Independiente: una tarea sin anteriores ni siguientes;
 * - el estado de cada paso: «hecho» (cerrado: su autor escribió un cierre y el motor lo da por cerrado; `fin` dice
 *   cómo), «espera» (alguna anterior no está hecha con un final de FINES_QUE_DESBLOQUEAN; `espera` dice cuáles), «en
 *   curso» (tiene un anuncio en su 4.1; `estacion` dice cuál) o «listo».
 *
 * → { cadenas: [{ sale, pasos: [paso], primeroSinHacer }], independientes: [paso], descartadas: [{ de, a, relacion,
 * motivo }] }, con paso = { id, estado, fin, estacion, espera: [ids], une: [ids], fuera }. `primeroSinHacer` es el
 * índice del primer paso que no está hecho (null si todos lo están): lo que la carta enseña al compactar. Vacío si la
 * época del libro no tiene la plantilla de la relación o X no está.
 */
export function cadenas(eje, X) {
  const id = typeof X === 'string' ? X : X?.id;
  const ev = typeof id === 'string' ? eje?.obtener?.(id) : null;
  if (!ev || typeof eje.epoca !== 'function' || !plantillaDeTransaccion(NOMBRES_DE_LAS_CADENAS.relacion, { epoca: eje.epoca() })) return vacio();
  const llegada = new Map((eje.orden ?? []).map((x, i) => [x, i]));
  const porLlegada = (a, b) => (llegada.get(a) ?? -1) - (llegada.get(b) ?? -1);

  // Las tareas que cuelgan de X (X incluida si lo es).
  const dentro = (eje.orden ?? []).filter((x) => !eje.esDeLaEpoca?.(x)).map((x) => eje.obtener(x)).filter((r) => esTarea(r) && eje.hilo(r.id).some((a) => a.id === ev.id));
  const nodos = new Map(dentro.map((t) => [t.id, { t, fuera: false }]));

  // Las aristas, por llegada de su relación (y en su orden dentro de ella); las que no valen, descartadas.
  const descartadas = [];
  const candidatas = [];
  for (const t of dentro) {
    const relacion = eje.sobreDe(t.id, EN_LA_CONDICION, new Set([t.autor])).filter((r) => dice(r, 4, NOMBRES_DE_LAS_CADENAS.relacion)).at(-1);
    if (!relacion) continue;
    const vistos = new Set();
    for (const h of hojas(relacion.payload[6])) {
      const de = esReferencia(h) ? h.ref : typeof h === 'string' && RE_ID.test(h) ? h : null;
      if (!de || vistos.has(de)) continue;
      vistos.add(de);
      const anterior = eje.obtener(de);
      const motivo = de === t.id ? MOTIVOS_DE_DESCARTE.aSiMisma : !anterior ? MOTIVOS_DE_DESCARTE.noEsta : !esTarea(anterior) ? MOTIVOS_DE_DESCARTE.noEsTarea : null;
      if (motivo) descartadas.push({ de, a: t.id, relacion: relacion.id, motivo });
      else candidatas.push({ de, a: t.id, relacion: relacion.id });
    }
  }
  candidatas.sort((x, y) => porLlegada(x.relacion, y.relacion));
  const siguientes = new Map();
  const anteriores = new Map();
  const alcanza = (desde, hasta) => {
    const pila = [desde];
    const visto = new Set();
    while (pila.length) {
      const n = pila.pop();
      if (n === hasta) return true;
      if (visto.has(n)) continue;
      visto.add(n);
      pila.push(...(siguientes.get(n) ?? []));
    }
    return false;
  };
  for (const a of candidatas) {
    if (alcanza(a.a, a.de)) { descartadas.push({ ...a, motivo: MOTIVOS_DE_DESCARTE.ciclo }); continue; }
    if (!nodos.has(a.de)) nodos.set(a.de, { t: eje.obtener(a.de), fuera: true });
    siguientes.set(a.de, [...(siguientes.get(a.de) ?? []), a.a]);
    anteriores.set(a.a, [...(anteriores.get(a.a) ?? []), a.de]);
  }
  for (const [n, l] of anteriores) anteriores.set(n, [...l].sort(porLlegada));

  // El estado de cada tarea por sí misma, una vez.
  const estados = new Map([...nodos.keys()].map((n) => [n, comoEsta(eje, nodos.get(n).t)]));
  const desbloquea = (n) => estados.get(n).hecho && FINES_QUE_DESBLOQUEAN.includes(estados.get(n).fin);
  const paso = (n, une = []) => {
    const e = estados.get(n);
    const fuera = nodos.get(n).fuera;
    const espera = fuera ? [] : (anteriores.get(n) ?? []).filter((p) => !desbloquea(p));
    const estado = e.hecho ? ESTADOS_DE_PASO.hecho : espera.length ? ESTADOS_DE_PASO.espera : e.estacion ? ESTADOS_DE_PASO.enCurso : ESTADOS_DE_PASO.listo;
    return { id: n, estado, fin: e.fin, estacion: e.estacion, espera, une, fuera };
  };

  // El orden por dependencias, con los empates por llegada.
  const faltan = new Map([...nodos.keys()].map((n) => [n, (anteriores.get(n) ?? []).length]));
  const listos = [...nodos.keys()].filter((n) => faltan.get(n) === 0);
  const orden = [];
  while (listos.length) {
    listos.sort(porLlegada);
    const n = listos.shift();
    orden.push(n);
    for (const s of siguientes.get(n) ?? []) {
      faltan.set(s, faltan.get(s) - 1);
      if (faltan.get(s) === 0) listos.push(s);
    }
  }

  // Las cadenas.
  const filas = [];
  const independientes = [];
  const colaDe = new Map(); // el último paso de una cadena → su índice
  for (const n of orden) {
    const antes = anteriores.get(n) ?? [];
    if (!antes.length && !(siguientes.get(n) ?? []).length) { independientes.push(paso(n)); continue; }
    const sigue = antes.find((p) => colaDe.has(p));
    if (sigue !== undefined) {
      const k = colaDe.get(sigue);
      colaDe.delete(sigue);
      filas[k].pasos.push(paso(n, antes.filter((p) => p !== sigue)));
      colaDe.set(n, k);
    } else {
      filas.push({ sale: antes[0] ?? null, pasos: [paso(n, antes.slice(1))] });
      colaDe.set(n, filas.length - 1);
    }
  }
  for (const f of filas) {
    const k = f.pasos.findIndex((p) => p.estado !== ESTADOS_DE_PASO.hecho);
    f.primeroSinHacer = k < 0 ? null : k;
  }
  return { cadenas: filas, independientes, descartadas };
}
