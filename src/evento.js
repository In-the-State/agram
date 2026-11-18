// Evento: la unidad de información. Es una transición de tokens con un payload
// BTML encima. Se anida sobre el registro en foco (hijo → padre); los hilos son
// cadenas de eventos encadenados por esa referencia.

import { ARIDAD, validarPayload, esDireccion, esHoja } from './btml.js';
import { validarMovimiento, ESCALAS_INFORMATIVAS } from './tokens.js';
import { esInstante } from './instante.js';

/** Posición raíz del foco: el registro entero. */
export const RAIZ = '0000000000';

/**
 * JSON canónico: claves ordenadas, sin espacios, con la semántica de JSON
 * (lo que se hashea es lo que se guarda): una clave con undefined o con una
 * función no está, un undefined en un array es null y toJSON se respeta. Así
 * el id de un evento no cambia al pasar por JSON.
 */
export function canonico(valor) {
  return ordenado(aJSON(valor));
}

function ordenado(valor) {
  if (Array.isArray(valor)) return '[' + valor.map(ordenado).join(',') + ']';
  if (valor !== null && typeof valor === 'object') {
    const claves = Object.keys(valor).sort();
    return '{' + claves.map((k) => JSON.stringify(k) + ':' + ordenado(valor[k])).join(',') + '}';
  }
  return JSON.stringify(valor);
}

/** El valor tal como queda tras guardarlo en JSON. Lanza si no cabe en JSON (ciclos, BigInt). */
export function aJSON(valor) {
  const texto = JSON.stringify(valor);
  return texto === undefined ? null : JSON.parse(texto);
}

/**
 * Congela en profundidad un valor JSON propio (una copia: no toca lo que pasó
 * quien escribe): payload, movimientos y contexto incluidos. No existe
 * modificar en sitio: corregir es añadir un ocupante, también en memoria.
 * Devuelve el mismo objeto.
 */
export function congelar(x) {
  if (x !== null && typeof x === 'object') {
    for (const v of Object.values(x)) congelar(v);
    Object.freeze(x);
  }
  return x;
}

/**
 * Copia de un evento tal como se guarda: solo sus campos (los del cuerpo, el
 * id y, si va firmado, firmante y firma; en un alta, las pruebas de posesión
 * de las claves que declara, `posesion`), con `en` y `contexto` por defecto,
 * pasada por JSON y congelada en profundidad. El eje guarda esta copia y no
 * el objeto que le pasan: lo que llegue de más no entra, y mutar lo pasado
 * después no cambia nada. Lanza si no cabe en JSON.
 */
export function normalizarEvento(ev) {
  if (!ev || typeof ev !== 'object') return ev;
  const { autor, sobre, en, t, movimientos, payload, contexto, id, firmante, firma, posesion } = ev;
  // El mismo orden de campos que crearEvento y firmar: guardar y restaurar da los mismos bytes.
  return congelar(aJSON({ autor, sobre, en: en === undefined ? RAIZ : en, t, movimientos, payload, contexto: contexto ?? {}, id, firmante, firma, posesion }));
}

/** SHA-256 en hexadecimal, igual en Node y en el navegador. */
export async function hash(texto) {
  const bytes = new TextEncoder().encode(texto);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cuerpo del evento sin su id: lo que se firma y lo que se hashea. */
export function cuerpo(ev) {
  return {
    autor: ev.autor,
    sobre: ev.sobre,
    en: ev.en ?? RAIZ,
    t: ev.t,
    movimientos: ev.movimientos,
    payload: ev.payload,
    contexto: ev.contexto ?? {},
  };
}

/**
 * Ruta y motivo del primer array del payload que no cabe, o null. Mira la
 * longitud sin recorrerla ni pasar por JSON: JSON.stringify recorre la
 * longitud entera, y un array disperso puede declarar 2^32 − 1 posiciones
 * vacías. La raíz y las décuplas tienen como mucho diez posiciones; una
 * lista (fuera de la raíz, solo hojas: VG, 7-11 noche, por hojas) puede
 * pasar de diez, pero sin huecos: se cuentan sus claves presentes, que no
 * cuestan más que su contenido real. Solo baja por las posiciones presentes
 * de los arrays que caben.
 */
function arrayDemasiadoLargo(x, ruta = '', ancestros = new Set()) {
  if (!Array.isArray(x) || ancestros.has(x)) return null;
  if (x.length > ARIDAD) {
    const aqui = ruta || 'raíz';
    if (!ruta) return aqui + ': más de ' + ARIDAD + ' posiciones';
    if (Object.keys(x).length !== x.length || x.some((h) => h === null || h === undefined)) return aqui + ': hueco en la lista';
    return x.every(esHoja) ? null : aqui + ': más de ' + ARIDAD + ' posiciones';
  }
  ancestros.add(x);
  for (let i = 0; i < x.length; i++) {
    if (!(i in x)) continue;
    const r = arrayDemasiadoLargo(x[i], ruta + i, ancestros);
    if (r !== null) return r;
  }
  ancestros.delete(x);
  return null;
}

/**
 * Crea un evento con su id = hash del cuerpo canónico.
 * autor: identidad que escribe. sobre: id del registro en foco (null solo en génesis).
 * en: posición del foco donde se anida lo escrito (dirección de diez dígitos; raíz por defecto).
 * Lo escrito va en el PV donde se escribe (VG, 6-11-2026).
 * t: instante ISO. movimientos: lista de movimientos de tokens. payload: BTML.
 * Se valida, se hashea y se devuelve la copia en JSON de lo pasado (lo que se
 * guardará), congelada en profundidad: quien lo crea puede seguir usando sus
 * arrays, y el evento no cambia. Un array de más de diez posiciones en el
 * payload (salvo una lista de hojas) se rechaza antes de copiar, sin
 * recorrer su longitud.
 */
export async function crearEvento({ autor, sobre = null, en = RAIZ, t, movimientos, payload, contexto = {} }) {
  const largo = arrayDemasiadoLargo(payload);
  if (largo !== null) throw new Error('evento mal formado: payload ' + largo);
  let ev;
  try {
    ev = aJSON({ autor, sobre, en, t, movimientos, payload, contexto });
  } catch (e) {
    throw new Error('evento mal formado: no cabe en JSON (' + e.message + ')');
  }
  const errores = validarForma(ev);
  if (errores.length) throw new Error('evento mal formado: ' + errores.join('; '));
  ev.id = await hash(canonico(cuerpo(ev)));
  return congelar(ev);
}

/**
 * Validación de forma, sin mirar el eje. `t` es un instante ISO-8601 estricto
 * con zona explícita (src/instante.js). Con `tLaxo` basta con que Date.parse
 * lo lea: solo para los eventos de un eje guardado con la versión 2, que se
 * validan con las reglas de entonces (`v2`, que por defecto sigue a `tLaxo`:
 * entonces bastaba con que el autor moviese T, y T se daba a otros).
 */
export function validarForma(ev, { tLaxo = false, v2 = tLaxo } = {}) {
  if (!ev || typeof ev !== 'object') return ['evento no es objeto'];
  const errores = [];
  if (typeof ev.autor !== 'string' || !ev.autor) errores.push('autor obligatorio');
  if (ev.sobre !== null && typeof ev.sobre !== 'string') errores.push('sobre debe ser id o null');
  if (ev.en !== undefined && !esDireccion(ev.en)) errores.push('en debe ser una dirección de diez dígitos');
  if (ev.sobre === null && ev.en !== undefined && ev.en !== RAIZ) errores.push('el génesis solo se anida en la raíz');
  if (tLaxo ? typeof ev.t !== 'string' || Number.isNaN(Date.parse(ev.t)) : !esInstante(ev.t)) {
    errores.push('t debe ser instante ISO-8601 con zona explícita (AAAA-MM-DDThh:mm[:ss[.fff]] y Z o ±hh:mm)');
  }
  // Un registro de la época (VG, 14-11, #107: la época vive en el eje) es parte de la apertura del génesis: no mueve
  // nada, con la misma exención de coste (src/eje.js, Eje.genesis). Solo un génesis que escribe su época los admite.
  const deLaEpoca = ev.contexto?.registroDeEpoca === true && !v2;
  if (deLaEpoca && Array.isArray(ev.movimientos) && ev.movimientos.length) errores.push('un registro de la época no mueve tokens: es parte de la apertura del génesis');
  if (deLaEpoca && ev.sobre === null) errores.push('un registro de la época se ancla en el génesis');
  if (deLaEpoca && Array.isArray(ev.movimientos)) {
    // nada más que pedir a sus movimientos: no lleva
  } else if (!Array.isArray(ev.movimientos) || (ev.movimientos.length === 0 && !(ev.contexto?.genesis === true && !v2))) {
    // El génesis puede no emitir nada (VG, 8-11: no emite T; E, P y R, si quiere).
    errores.push('todo evento mueve tokens');
  } else {
    ev.movimientos.forEach((m, i) => validarMovimiento(m).forEach((e) => errores.push('movimiento ' + i + ': ' + e)));
    // El evento mínimo mueve T: lo CONSUME (VG, 7-11 noche): de = autor, a =
    // null, sin estado. Ni dárselo a uno mismo cuenta como escribir: no cuesta
    // nada. El consumo queda anotado en el registro que soporta, `sobre`
    // (eje.tiempoSobre). El génesis no emite T (VG, 8-11: no hay T
    // acumulable): su autor vive de su asignación del día; solo en la versión
    // 2 el génesis tenía que emitir T a su autor.
    const esGenesis = ev.contexto?.genesis === true;
    // La FORMA solo pide un consumo de T del autor (cualquiera); que sea T real y llegue al coste lo exige la condición
    // «writing burns today's T» de la época (VG, 13-11, #76): el T informativo (pasado, futuro, inventado) ya no paga la
    // escritura, es contenido del registro. Aquí no se distingue (la forma no sabe de la época).
    const cuenta = (m) => (esGenesis ? m.a === ev.autor : v2 ? m.de === ev.autor : esConsumoT(m, ev.autor));
    const mueveT = ev.movimientos.some((m) => m && m.token === 'T' && cuenta(m));
    if (!mueveT && !(esGenesis && !v2)) {
      errores.push(esGenesis ? 'el génesis debe emitir T al autor'
        : v2 ? 'el autor debe mover T' : 'escribir consume T del autor: un movimiento de T con de = ' + ev.autor + ' y a = null (VG, 7-11 noche)');
    }
    // T no cruza de persona (VG, 7-11 noche) lo comprueban las reglas del
    // ciclo (src/ciclo.js), que saben de qué tipo es quien lo recibe: una
    // persona sí puede dar su T a una cosa (Core, 8-11).
  }
  if (ev.contexto !== undefined && ev.contexto !== null && (typeof ev.contexto !== 'object' || Array.isArray(ev.contexto))) {
    errores.push('contexto debe ser un objeto');
  }
  // Pruebas de posesión de un alta (R9): { identidad: firma de su clave nueva sobre el id }.
  if (ev.posesion !== undefined && (ev.posesion === null || typeof ev.posesion !== 'object' || Array.isArray(ev.posesion)
    || Object.values(ev.posesion).some((f) => typeof f !== 'string'))) {
    errores.push('posesion debe ser un objeto { identidad: firma }');
  }
  const p = validarPayload(ev.payload);
  if (!p.ok) errores.push(...p.errores.map((e) => 'payload ' + e));
  return errores;
}

/**
 * ¿Es `m` un consumo de T de `autor`? De = autor, a = null y sin estado: lo
 * único que cuenta como «escribir consume T» (VG, 7-11 noche).
 */
export function esConsumoT(m, autor) {
  return Boolean(m) && m.token === 'T' && m.de === autor && m.a === null && m.estado === undefined;
}

/**
 * ¿Es `ev` un registro presente? Sí si su autor consume T real (una escala no
 * informativa) o si es el génesis. Un evento que solo quemara T informativo
 * (pasado, futuro, inventado) no es presente (VG, 8-11). Desde VG 13-11 (#76: «recordar
 * algo o planear algo consume tiempo en el presente») la época 0 ya no admite uno
 * así: la condición «writing burns today's T» exige el coste en T real de hoy a todo
 * registro, así que todo registro del libro es presente; la función queda como la
 * lectura pura del evento. Se deriva del evento, no se guarda: no cambia su id.
 */
export function esPresente(ev) {
  if (!ev || typeof ev !== 'object' || ev.contexto?.genesis === true) return true;
  return (Array.isArray(ev.movimientos) ? ev.movimientos : []).some((m) => esConsumoT(m, ev.autor) && !ESCALAS_INFORMATIVAS.includes(m.escala));
}

/** Comprueba que el id corresponde al cuerpo. */
export async function verificarId(ev) {
  return ev.id === (await hash(canonico(cuerpo(ev))));
}

// ---------- la tanda: varios registros que entran todos o ninguno (agram-equipo/CONTRATO_TANDA.md) ----------
//
// VG, 18-11: lo que se compone en la bandeja se lanza de una vez, todo o nada. Cada miembro lleva en su contexto
// (dentro del cuerpo: entra en el id y en la firma) la marca `contexto.tanda = { n, de, anterior }`: `de` cuántos son
// (entero de 2 a 32), `n` su sitio (de 1 a `de`) y `anterior` el id del miembro n − 1 (falta solo en el 1). La tanda
// se identifica por el id de su miembro 1. Un registro suelto no lleva la marca; no hay tandas de uno. Lo que se exige
// aquí es solo lo que dice el contrato: no pide un mismo autor (aceptar una invitación son dos registros de dos autores).

/** El tamaño de una tanda: de 2 a 32 registros (CONTRATO_TANDA: los topes de escrituras por minuto y de cuerpo de hoy). */
export const TANDA_MINIMA = 2;
export const TANDA_MAXIMA = 32;

const ID_HEX = /^[0-9a-f]{64}$/;

/** ¿Lleva `ev` la marca de tanda (`contexto.tanda`, con cualquier valor)? Solo mira si está, no si vale. */
export function esMiembroDeTanda(ev) {
  const c = ev !== null && typeof ev === 'object' ? ev.contexto : undefined;
  return c !== null && typeof c === 'object' && Object.hasOwn(c, 'tanda') && c.tanda !== undefined;
}

/** Por qué la marca de tanda de `ev` no tiene forma, o [] si la tiene (no mira a los demás miembros). */
export function erroresDeMarca(ev) {
  if (!esMiembroDeTanda(ev)) return ['no lleva la marca de tanda (contexto.tanda)'];
  const m = ev.contexto.tanda;
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return ['la marca de tanda es un objeto { n, de, anterior }'];
  const errores = [];
  const deVale = Number.isSafeInteger(m.de) && m.de >= TANDA_MINIMA && m.de <= TANDA_MAXIMA;
  if (!deVale) errores.push('la marca de tanda: «de» es un entero de ' + TANDA_MINIMA + ' a ' + TANDA_MAXIMA + ' (no hay tandas de uno)');
  if (!Number.isSafeInteger(m.n) || m.n < 1 || (deVale && m.n > m.de)) errores.push('la marca de tanda: «n» es un entero de 1 a «de»');
  if (m.n === 1) {
    if (m.anterior !== undefined) errores.push('la marca de tanda: el miembro 1 no lleva «anterior»');
  } else if (typeof m.anterior !== 'string' || !ID_HEX.test(m.anterior)) {
    errores.push('la marca de tanda: «anterior» es el id (64 hexadecimales) del miembro n − 1');
  }
  return errores;
}

/**
 * Los fallos de forma de una tanda, sin mirar el libro: [{ indice, texto }] (vacío si está bien formada). Una tanda
 * es una lista de 2 a 32 registros, todos con la marca bien formada, con `de` = la longitud de la lista, `n` = su sitio
 * (1, 2…) y `anterior` = el id del de antes. `indice` (desde 0) es el miembro que falla; un fallo de la lista entera
 * (su longitud) va con el índice 0. Que cada id sea el hash de su cuerpo y su firma la de su autor lo comprueba el eje
 * al validarlos (eje.anadirTanda), no esto.
 */
export function fallosDeTanda(eventos) {
  if (!Array.isArray(eventos)) return [{ indice: 0, texto: 'una tanda es una lista de registros' }];
  const fallos = [];
  if (eventos.length < TANDA_MINIMA || eventos.length > TANDA_MAXIMA) {
    fallos.push({ indice: 0, texto: 'una tanda lleva de ' + TANDA_MINIMA + ' a ' + TANDA_MAXIMA + ' registros, y esta lleva ' + eventos.length + (eventos.length === 1 ? ' (no hay tandas de uno)' : '') });
  }
  eventos.forEach((ev, k) => {
    const marca = erroresDeMarca(ev);
    if (marca.length) {
      for (const texto of marca) fallos.push({ indice: k, texto: 'miembro ' + (k + 1) + ': ' + texto });
      return;
    }
    const m = ev.contexto.tanda;
    if (m.de !== eventos.length) fallos.push({ indice: k, texto: 'miembro ' + (k + 1) + ': dice que la tanda es de ' + m.de + ' y llegan ' + eventos.length });
    if (m.n !== k + 1) fallos.push({ indice: k, texto: 'miembro ' + (k + 1) + ': está en el sitio ' + (k + 1) + ' y dice ser el ' + m.n + ' (los miembros van en orden)' });
    else if (k > 0 && m.anterior !== eventos[k - 1]?.id) fallos.push({ indice: k, texto: 'miembro ' + (k + 1) + ': su «anterior» no es el id del miembro ' + k });
  });
  return fallos;
}

/** Los textos de fallosDeTanda: [] si `eventos` es una tanda bien formada (completa, en orden y encadenada). */
export function erroresDeTanda(eventos) {
  return fallosDeTanda(eventos).map((f) => f.texto);
}

/** El id de una tanda: el de su miembro 1 (null si no lo hay). */
export function idDeTanda(eventos) {
  const id = Array.isArray(eventos) ? eventos[0]?.id : undefined;
  return typeof id === 'string' ? id : null;
}

/**
 * Parte una lista de registros (la de un libro, en su orden) en lo que entra junto: cada registro suelto solo y cada
 * tanda entera. Devuelve, en el orden de la lista, [{ eventos, marcada, tanda, errores, alFinal }]:
 * - suelto: { eventos: [ev], marcada: false, tanda: null, errores: [] };
 * - tanda: desde su miembro 1 se toman, hacia delante, los que siguen su cadena (n = 1, 2… y `anterior` = el id del de
 *   antes), hasta `de`. Si no son `de`, si no van seguidos en la lista o si la tanda no está bien formada, `errores`
 *   dice por qué y la tanda se rechaza ENTERA (todos los que se tomaron). `alFinal`: le faltan miembros solo porque la
 *   lista se acaba (los que hay van seguidos hasta el final): quien baja por páginas puede esperar al resto en vez de
 *   rechazarla (CONTRATO_TANDA, «Bajar»);
 * - un miembro con la marca sin su miembro 1 delante (o con la marca mal formada): { eventos: [ev], marcada: true,
 *   tanda: null, errores }. Un miembro nunca entra suelto.
 */
export function partirTandas(lista) {
  const tomados = new Set();
  const partes = [];
  for (let i = 0; i < lista.length; i++) {
    if (tomados.has(i)) continue;
    const ev = lista[i];
    if (!esMiembroDeTanda(ev)) {
      partes.push({ eventos: [ev], marcada: false, tanda: null, errores: [], alFinal: false });
      continue;
    }
    tomados.add(i);
    const marca = erroresDeMarca(ev);
    if (marca.length || ev.contexto.tanda.n !== 1) {
      const errores = marca.length ? marca : ['miembro ' + ev.contexto.tanda.n + ' de una tanda sin su miembro 1 delante: un miembro nunca entra suelto'];
      partes.push({ eventos: [ev], marcada: true, tanda: null, errores, alFinal: false });
      continue;
    }
    const de = ev.contexto.tanda.de;
    const indices = [i];
    for (let j = i + 1; j < lista.length && indices.length < de; j++) {
      if (tomados.has(j)) continue;
      const x = lista[j];
      const m = esMiembroDeTanda(x) ? x.contexto.tanda : null;
      if (m && typeof m === 'object' && m.n === indices.length + 1 && m.anterior === lista[indices[indices.length - 1]].id) indices.push(j);
    }
    for (const k of indices) tomados.add(k);
    const eventos = indices.map((k) => lista[k]);
    const seguidos = indices.every((k, p) => k === i + p);
    const errores = [...(seguidos ? [] : ['sus miembros no van seguidos en la lista']), ...erroresDeTanda(eventos)];
    const alFinal = seguidos && eventos.length < de && i + eventos.length === lista.length;
    partes.push({ eventos, marcada: true, tanda: typeof ev.id === 'string' ? ev.id : null, errores, alFinal });
  }
  return partes;
}

/** Copia de `x` con cada texto que es una clave de `cambios` (Map) cambiado por su valor, en profundidad. */
function cambiarIds(x, cambios) {
  if (typeof x === 'string') return cambios.has(x) ? cambios.get(x) : x;
  if (Array.isArray(x)) return x.map((v) => cambiarIds(v, cambios));
  if (x !== null && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, cambiarIds(v, cambios)]));
  return x;
}

/**
 * Pone la marca de tanda a unos candidatos ya compuestos (los `evento` de acciones.transaccion, sin marca), en su
 * orden: el miembro k lleva { n: k, de, anterior: el id nuevo del k − 1 }. La marca entra en el cuerpo, así que cada id
 * cambia; donde un candidato nombra el id entero de uno anterior (su `sobre`, una referencia del payload, un
 * movimiento, su contexto), se cambia por el id nuevo. Devuelve los eventos nuevos SIN firmar (sin firmante, firma ni
 * pruebas de posesión: firmaban el id de antes): quien lanza firma cada uno, y rehace las pruebas de posesión sobre el
 * id nuevo. Lanza si no son de 2 a 32 o si alguno ya lleva marca.
 */
export async function marcarTanda(candidatos) {
  if (!Array.isArray(candidatos) || candidatos.length < TANDA_MINIMA || candidatos.length > TANDA_MAXIMA) {
    throw new Error('marcarTanda: una tanda lleva de ' + TANDA_MINIMA + ' a ' + TANDA_MAXIMA + ' registros');
  }
  const cambios = new Map();
  const marcados = [];
  for (let k = 0; k < candidatos.length; k++) {
    const c = candidatos[k];
    if (!c || typeof c !== 'object') throw new Error('marcarTanda: el candidato ' + (k + 1) + ' no es un registro');
    if (esMiembroDeTanda(c)) throw new Error('marcarTanda: el candidato ' + (k + 1) + ' ya lleva marca de tanda');
    const datos = cambiarIds(aJSON({ autor: c.autor, sobre: c.sobre ?? null, en: c.en, t: c.t, movimientos: c.movimientos, payload: c.payload, contexto: c.contexto ?? {} }), cambios);
    const tanda = { n: k + 1, de: candidatos.length, ...(k ? { anterior: marcados[k - 1].id } : {}) };
    const ev = await crearEvento({ ...datos, contexto: { ...datos.contexto, tanda } });
    if (typeof c.id === 'string') cambios.set(c.id, ev.id);
    marcados.push(ev);
  }
  return marcados;
}
