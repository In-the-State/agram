// Autoridad mínima: cada identidad puede tener una clave pública; quien la
// tiene firma sus eventos y el eje lo comprueba. Nadie mueve tokens ajenos:
// todo movimiento sale del autor. Firmas Schnorr sobre secp256k1 según
// BIP-340 (como Nostr y Taproot), con la librería vendorizada en
// src/vendor/noble-secp256k1.js (src/vendor/LEEME.md; docs/notas/FIRMAS_BIP340.md):
// el mismo archivo en Node, en el navegador y en Deno. Las claves privadas
// nunca entran en el eje.
//
// Formato (todo en hexadecimal en minúsculas, una sola escritura por valor):
//   clave pública  32 bytes, x-only (64 caracteres)
//   clave privada  32 bytes, 0 < d < n (64 caracteres)
//   firma          64 bytes (128 caracteres), del id del evento (los 32 bytes del SHA-256 del cuerpo canónico)
//
// UN FIRMANTE EN VEZ DE LA CLAVE (camino B del alta, VG 17-11; docs/ANFITRION.md): donde se firma con una clave
// privada (firmar, firmarPosesion, y todo lo que se la pasa: Eje.genesis, eje.escribir, invitar, aceptar,
// escribirDesde, escribirSalida, escribirBase, consolidar, registrar) puede ir una FUNCIÓN firmante, la misma forma
// que el firmante inyectable de acciones.autorizar:
//   firmar({ canonico, id }) → firma en hex | { id, firma }      (puede devolver una promesa)
// `canonico` es el cuerpo canónico del registro (su SHA-256 es `id`). El núcleo no se fía de lo que devuelve: una
// firma de 64 bytes en hex, el mismo id si lo trae y, si se conoce la clave pública que debe firmar, que verifica con
// ella; si no, o si el firmante lanza o rechaza, lanza (conservando el `code` del rechazo) y no se escribe nada.

import { schnorr } from './vendor/noble-secp256k1.js';
import { canonico, cuerpo } from './evento.js';

const HEX32 = /^[0-9a-f]{64}$/;
const HEX64 = /^[0-9a-f]{128}$/;

const aBytes = (hex) => Uint8Array.from(hex.match(/.{2}/g), (h) => parseInt(h, 16));
const aHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const aleatorio = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** La clave pública (x-only, hex) de una clave privada (hex). Lanza si la privada no vale. */
export function publicaDe(privada) {
  if (typeof privada !== 'string' || !HEX32.test(privada)) throw new Error('clave privada inválida: 32 bytes en hexadecimal (minúsculas)');
  return aHex(schnorr.getPublicKey(aBytes(privada)));
}

/** Genera un par de claves con el azar de Web Crypto. Devuelve { publica, privada }, las dos en hexadecimal. */
export async function generarClaves() {
  const privada = aHex(schnorr.utils.randomSecretKey());
  return { publica: publicaDe(privada), privada };
}

/**
 * La clave privada como se guarda en local (o se cifra en la copia): el mismo texto hexadecimal. importarPrivada la
 * comprueba (32 bytes, 0 < d < n) y la devuelve; lanza si no vale.
 */
export async function exportarPrivada(privada) {
  publicaDe(privada);
  return privada;
}

export async function importarPrivada(privada) {
  publicaDe(privada);
  return privada;
}

/** La firma BIP-340 (hex) del id con la privada; el azar auxiliar (aux_rand) sale de Web Crypto. */
function firmarId(id, privada) {
  if (typeof id !== 'string' || !HEX32.test(id)) throw new Error('el evento no tiene id');
  publicaDe(privada);
  return aHex(schnorr.sign(aBytes(id), aBytes(privada), aleatorio(32)));
}

/** ¿Es un firmante (una función) y no una clave privada? */
export function esFirmante(x) {
  return typeof x === 'function';
}

/**
 * La firma del id de `ev` que da un firmante ({ canonico, id }) → firma | { id, firma }, comprobada: firma de 64 bytes
 * en hex, el mismo id si lo trae y, con `publica`, que verifica con ella. Si el firmante lanza o rechaza, un Error que
 * conserva su `code` (y lo de fuera en `cause`). `que`: lo que se firma, para el mensaje.
 */
async function firmaDelFirmante(ev, firmante, publica, que) {
  if (typeof ev.id !== 'string' || !HEX32.test(ev.id)) throw new Error('el evento no tiene id');
  let dada;
  try {
    dada = await firmante({ canonico: canonico(cuerpo(ev)), id: ev.id });
  } catch (e) {
    const code = e !== null && typeof e === 'object' && typeof e.code === 'string' ? e.code : undefined;
    const error = new Error('el firmante no firmó ' + que + ' ' + ev.id.slice(0, 8) + ': ' + String(e?.message ?? e), { cause: e });
    if (code !== undefined) error.code = code;
    throw error;
  }
  const objeto = dada !== null && typeof dada === 'object';
  if (objeto && dada.id !== undefined && dada.id !== ev.id) throw new Error('el firmante firmó otro registro: ' + String(dada.id).slice(0, 8) + ', no ' + ev.id.slice(0, 8));
  const firma = typeof dada === 'string' ? dada : objeto ? dada.firma : undefined;
  if (typeof firma !== 'string' || !HEX64.test(firma)) throw new Error('el firmante no devolvió una firma de ' + que + ' ' + ev.id.slice(0, 8) + ' (64 bytes en hexadecimal)');
  if (publica !== undefined && publica !== null && !verificarFirma(firma, ev.id, publica)) {
    throw new Error('la firma del firmante no verifica con la clave ' + huella(publica) + ' (' + que + ' ' + ev.id.slice(0, 8) + ')');
  }
  return firma;
}

/** La clave pública que `ev` declara para `identidad` en su contexto (su alta, el génesis), si es una válida. */
function declarada(ev, identidad) {
  const c = ev?.contexto?.claves;
  const x = c && typeof c === 'object' && Object.hasOwn(c, identidad) ? c[identidad] : undefined;
  return clavePublicaValida(x) ? x : undefined;
}

/**
 * Firma el id de un evento (el hash de su cuerpo). Devuelve el evento con firmante y firma. `privada` es la clave
 * privada (hex) o un firmante ({ canonico, id }) → firma | { id, firma }; con un firmante, su firma se comprueba con
 * `opciones.publica` o, si no se da, con la clave que el propio evento declara para `firmante` (el génesis, un alta).
 */
export async function firmar(ev, privada, firmante = ev.autor, { publica } = {}) {
  if (!ev.id) throw new Error('el evento no tiene id');
  const firma = esFirmante(privada) ? await firmaDelFirmante(ev, privada, publica ?? declarada(ev, firmante), 'el registro') : firmarId(ev.id, privada);
  return Object.freeze({ ...ev, firmante, firma });
}

/**
 * El firmante de eventos que piden acciones.transaccion (`opciones.firmar`), autoejecutar, local.englobar y Sincronia
 * (`firmar`): (evento) → evento firmado, hecho de un firmante ({ canonico, id }) → firma | { id, firma } (o de una clave
 * privada). Firma con `firmar` de aquí, así que comprueba lo mismo; `publica`, la clave con que debe verificar.
 */
export function firmanteDeEventos(firmante, { publica } = {}) {
  return (ev) => firmar(ev, firmante, ev.autor, { publica });
}

/**
 * Comprueba la firma de un evento con la clave pública (x-only, hex) de su firmante. La firma debe ir en
 * hexadecimal en minúsculas, 64 bytes, tal como la escribe `firmar`: una sola escritura por firma.
 */
export async function verificar(ev, publica) {
  return verificarFirma(ev.firma, ev.id, publica);
}

/** Una firma (hex) del id con la clave pública (hex). false ante cualquier cosa rara, sin lanzar. */
function verificarFirma(firma, id, publica) {
  if (typeof firma !== 'string' || !HEX64.test(firma) || typeof id !== 'string' || !HEX32.test(id)) return false;
  if (typeof publica !== 'string' || !HEX32.test(publica)) return false;
  try {
    return schnorr.verify(aBytes(firma), aBytes(id), aBytes(publica));
  } catch {
    return false;
  }
}

/**
 * Prueba de posesión (R9, docs/notas/NEUTRALIDAD_IDENTIDAD.md §4): la clave
 * que un alta declara para `identidad` firma el id del propio evento del
 * alta. Va en `posesion` ({ identidad: firma }), fuera del cuerpo como la
 * firma del autor, así que no cambia el id. Devuelve el evento con la prueba.
 * `privada`: la clave privada o un firmante, como en `firmar`.
 */
export async function firmarPosesion(ev, identidad, privada, { publica } = {}) {
  if (!ev.id) throw new Error('el evento no tiene id');
  // Con un firmante, la firma ha de verificar con la clave que el alta declara para `identidad` (o la que se dé).
  const firma = esFirmante(privada) ? await firmaDelFirmante(ev, privada, publica ?? declarada(ev, identidad), 'la prueba de posesión del registro') : firmarId(ev.id, privada);
  return Object.freeze({ ...ev, posesion: { ...(ev.posesion ?? {}), [identidad]: firma } });
}

/** ¿Firma `posesion[identidad]` el id del evento con la clave pública declarada para ella? */
export async function verificarPosesion(ev, identidad, publica) {
  const p = ev.posesion;
  const firma = p && typeof p === 'object' && !Array.isArray(p) && Object.hasOwn(p, identidad) ? p[identidad] : undefined;
  return verificarFirma(firma, ev.id, publica);
}

/**
 * Una clave pública declarable: 32 bytes x-only en hexadecimal (minúsculas) cuya x es la de un punto de la curva
 * (lift_x de BIP-340). Si no, la identidad quedaría muda para siempre.
 */
export function clavePublicaValida(publica) {
  if (typeof publica !== 'string' || !HEX32.test(publica)) return false;
  try {
    schnorr.utils.lift_x(BigInt('0x' + publica));
    return true;
  } catch {
    return false;
  }
}

/** Huella corta de una clave pública, para mostrarla: sus ocho primeros caracteres. */
export function huella(publica) {
  return typeof publica === 'string' ? publica.slice(0, 8) : '';
}
