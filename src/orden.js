// El orden firmado (docs/notas/ORDEN_FIRMADO.md; SIP 0, «La llegada encadenada»): el recibo que el servidor del libro firma
// por cada registro que entra (`stateark.recibo@1` de clase «llegada», o «aceptación» con autoridad) lleva su «orden» en la
// cadena de ese libro (en decimal y como texto, desde '0') y su «anterior» (el id del recibo de orden − 1; falta solo en el
// 0). Una cadena por emisor y universo («relé <clave> · eje <nombre>» en AARPIA). Quien fija el orden lo sigue eligiendo,
// pero no puede dar dos distintos sin firmar dos recibos que se contradicen: esa pareja es la prueba («dos recibos con el
// mismo orden», como la bifurcación de cabeceras de src/sello.js).
//
// Funciones puras, sin red y sin libro: comprobarRecibo (forma, id, firma, «orden» y «anterior», sujeto), comprobarEslabon
// (el «anterior» del n es el id del n − 1 que se tiene) y ordenDoble (si dos recibos son la prueba de contradicción).
// Va aparte de src/sello.js porque no es del sello de tiempo: es del recibo del transporte; src/sincronia.js lo usa al
// recibir cada recibo y nada de esto entra en las reglas del libro ni en ningún id.

import { sha256, aHex, deHex, verificarBip340 } from './cripto.js';
import { canonico } from './evento.js';

/** El esquema del recibo único de las tres casas (SIP 0, B19). */
export const ESQUEMA_DEL_RECIBO = 'stateark.recibo@1';

/** Las clases de recibo que se encadenan (Correcciones del 17-11): el 7701 sin autoridad y con ella. El rechazo (7703), no. */
export const CLASES_ENCADENABLES = Object.freeze(['llegada', 'aceptación']);

/** La clase de la contradicción del orden (provisional: StateArk la añadirá a la SIP con su nombre y sus vectores). */
export const CLASE_DE_ORDEN_DOBLE = 'contradicción en la cadena de recibos';

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const bytesDe = (texto) => new TextEncoder().encode(texto);

/** El id de un recibo único: SHA-256 de canonico({ schema, emisor, t, recibo }). */
export const idDeRecibo = ({ schema, emisor, t, recibo }) => aHex(sha256(bytesDe(canonico({ schema, emisor, t, recibo }))));

/**
 * Comprueba un recibo de orden SIN FIARSE: que es un recibo único bien formado de una clase encadenable; que su id es el
 * hash de su cuerpo y su firma (BIP-340) es del emisor sobre ese id; que lleva «universo» y un «orden» en decimal (sin
 * ceros a la izquierda) y, solo si no es el 0, un «anterior» de 64 hex; y, con `registro`, que el sujeto es ese registro
 * (su primer id). Con `firma: false` no se comprueba la firma (lo ya comprobado al llegar, al restaurarlo). «eje» no se
 * exige: el vector de StateArk no lo lleva; la cadena la da el par emisor y universo.
 * → { ok: true, clase, emisor, universo, registro, orden (texto), anterior?, id } o { ok: false, motivo }.
 */
export function comprobarRecibo(sobre, { registro, firma: conFirma = true } = {}) {
  const no = (motivo) => ({ ok: false, motivo });
  if (!sobre || typeof sobre !== 'object' || sobre.schema !== ESQUEMA_DEL_RECIBO) return no('no es un recibo único');
  const { emisor, t, recibo, id, firma } = sobre;
  if (typeof emisor !== 'string' || !HEX64.test(emisor) || typeof t !== 'string' || typeof id !== 'string' || !HEX64.test(id) || typeof firma !== 'string' || !HEX128.test(firma)) return no('no es un recibo único');
  if (!Array.isArray(recibo) || recibo.length < 4 || !Array.isArray(recibo[0]) || recibo[0][0] !== 'recibo' || !Array.isArray(recibo[1])) return no('no es un recibo único');
  const [cero, sujeto, claves, valores] = recibo;
  if (!Array.isArray(claves) || !Array.isArray(valores) || claves.length !== valores.length) return no('no es un recibo único');
  const clase = cero[1];
  if (!CLASES_ENCADENABLES.includes(clase)) return no('no es de una clase que se encadena');
  const todos = (n) => valores.filter((_, i) => claves[i] === n);
  const ordenes = todos('orden');
  const anteriores = todos('anterior');
  const universos = todos('universo');
  if (ordenes.length !== 1 || typeof ordenes[0] !== 'string' || !DECIMAL.test(ordenes[0]) || !Number.isSafeInteger(Number(ordenes[0]))) return no('sin «orden»');
  const orden = ordenes[0];
  if (orden === '0' ? anteriores.length !== 0 : anteriores.length !== 1 || typeof anteriores[0] !== 'string' || !HEX64.test(anteriores[0])) return no('«anterior» falta solo en el 0');
  if (universos.length !== 1 || typeof universos[0] !== 'string' || !universos[0]) return no('sin «universo»');
  if (typeof sujeto[0] !== 'string' || (registro !== undefined && sujeto[0] !== registro)) return no('el sujeto no es el registro');
  let calculado;
  try {
    calculado = idDeRecibo(sobre);
  } catch {
    return no('no es un recibo único');
  }
  if (calculado !== id) return no('el id no es el de su cuerpo');
  if (conFirma && !verificarBip340(deHex(firma), deHex(id), deHex(emisor))) return no('la firma no es del emisor');
  return { ok: true, clase, emisor, universo: universos[0], registro: sujeto[0], orden, ...(orden === '0' ? {} : { anterior: anteriores[0] }), id };
}

/** La cadena de un recibo comprobado: emisor y universo. */
export const cadenaDe = (c) => c.emisor + ' ' + c.universo;

/**
 * El eslabón: ¿es el «anterior» de `recibo` el id de `previo`, el recibo de orden − 1 de la misma cadena que se tiene?
 * → { ok: true }, { ok: false, motivo } o null si no se puede decir (alguno no vale, son de otra cadena o `previo` no es el
 * de orden − 1). Comprueba los dos recibos.
 */
export function comprobarEslabon(recibo, previo) {
  const r = comprobarRecibo(recibo);
  const p = comprobarRecibo(previo);
  if (!r.ok || !p.ok || cadenaDe(r) !== cadenaDe(p) || Number(r.orden) !== Number(p.orden) + 1) return null;
  return r.anterior === p.id ? { ok: true } : { ok: false, motivo: '«anterior» no es el id del recibo de orden ' + p.orden };
}

const copia = (x) => JSON.parse(JSON.stringify(x));

/**
 * LA CONTRADICCIÓN DEL ORDEN («contradicción en la cadena de recibos»): dos recibos válidos (comprobarRecibo) del mismo emisor y
 * el mismo universo que no pueden ser los dos verdad: el mismo «orden» con distinto registro; el mismo registro con dos
 * «orden»; el mismo «orden» y registro con distinto «anterior»; o, en órdenes seguidos, un «anterior» que no es el recibo
 * de ese sitio. Dos recibos iguales (o el mismo recibo vuelto a firmar con todo igual menos su t) no lo son. Se le dan
 * los dos recibos (`ordenDoble(a, b)`) o una prueba ya guardada (`ordenDoble({ a, b })`); clase, motivo y lo demás se
 * derivan (no se creen). → la prueba { clase, motivo, emisor, universo, ordenes: [de a, de b], registros: [de a, de b],
 * a, b, id } (a y b, los dos recibos enteros, copiados; id = SHA-256(canonico({ clase, ids: [id menor, id mayor] }))) o null.
 */
export function ordenDoble(a, b) {
  if (b === undefined && a && typeof a === 'object' && a.a && a.b) return ordenDoble(a.a, a.b);
  const x = comprobarRecibo(a);
  const y = comprobarRecibo(b);
  if (!x.ok || !y.ok || x.id === y.id || x.emisor !== y.emisor || x.universo !== y.universo) return null;
  let motivo = null;
  if (x.orden === y.orden) {
    if (x.registro !== y.registro) motivo = 'el mismo orden con dos registros';
    else if (x.anterior !== y.anterior) motivo = 'el mismo orden con dos anteriores';
  } else if (x.registro === y.registro) motivo = 'el mismo registro con dos órdenes';
  else {
    const [p, s] = Number(x.orden) < Number(y.orden) ? [x, y] : [y, x];
    if (Number(s.orden) === Number(p.orden) + 1 && s.anterior !== p.id) motivo = 'un «anterior» que no es el recibo de ese sitio';
  }
  if (!motivo) return null;
  const id = aHex(sha256(bytesDe(canonico({ clase: CLASE_DE_ORDEN_DOBLE, ids: [x.id, y.id].sort() }))));
  return { clase: CLASE_DE_ORDEN_DOBLE, motivo, emisor: x.emisor, universo: x.universo, ordenes: [x.orden, y.orden], registros: [x.registro, y.registro], a: copia(a), b: copia(b), id };
}
