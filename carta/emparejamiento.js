// El emparejamiento por QR de la carta con la app de StateArk (SIP 0, «Emparejamiento», rama beta-emparejar del SIP;
// docs/notas/EMPAREJAMIENTO.md). Puro: sin DOM, sin libro, sin localStorage. Lo que guarda va a un ALMACÉN INYECTADO
// (en el navegador, IndexedDB con almacenIndexedDB; en las pruebas, almacenEnMemoria) y lo que habla va por un WEBSOCKET
// INYECTADO.
//
// La carta PROPONE y la app FIRMA: la carta nunca ve la clave de la cuenta. La app le da en un QR una clave de sesión que
// solo propone (alcance [13, 22242], 24 h como mucho, revocable). Con ella la carta solo firma dos cosas: el AUTH de
// NIP-42 (kind 22242, con la etiqueta «delegacion») y el sello (kind 13) de lo que manda. Este módulo no ofrece ninguna
// función que firme otra cosa con ella (firmarEventoDeSesion rechaza cualquier otro kind) ni la devuelve nunca.
//
// Todo va por el relé con gift wrap de NIP-59 (regalo 1059 → sello 13 → rumor con el mensaje) y NIP-44 v2
// (carta/nip44.js, carta/chacha20.js). Es código de seguridad: ante la duda rechaza, y acota los tamaños antes de
// decodificar.
//
//   leerQR(texto, { ahora, local })         comprueba el QR en el orden del SIP; lanza ErrorEmparejamiento con su code
//   huellaCorta(sesion)                     «a1b2-c3d4»
//   envolver / abrir                        el gift wrap (con los mensajes del SIP)
//   eventoAuth                              el AUTH de la sesión
//   ClienteRele                             NIP-42, suscripción a los 1059 de la sesión, envío y reconexión sobria
//   Emparejamiento                          el flujo: emparejar, proponer, recibir firma / rechazo / revocada, caducar

import { schnorr } from '../src/vendor/noble-secp256k1.js';
import { canonico, hash } from '../src/evento.js';
import { hashEtiquetado, verificarBip340 } from '../src/cripto.js';
import { publicaDe, clavePublicaValida } from '../src/autoridad.js';
import { claveDeConversacion, cifrar, descifrar, deHex, aHex, MAX_CLARO, MAX_PAYLOAD } from './nip44.js';

// ---------- constantes (los kinds, en un solo sitio) ----------

/** Los kinds de Nostr del emparejamiento. 7704 y 7705 los ha confirmado Core AARPIA (17-11). */
export const KINDS = Object.freeze({ SELLO: 13, REGALO: 1059, RUMOR: 7704, REVOCACION: 7705, AUTH: 22242 });
export const PREFIJO_QR = 'stateark:emparejar:1:';
export const ESQUEMA_QR = 'stateark.emparejamiento@1';
export const ESQUEMA_MENSAJE = 'stateark.emparejamiento.mensaje@1';
export const ESQUEMA_DELEGACION = 'stateark-sim/delegacion@1';
export const USO_SESION = 'StateArk/Sesion/v1';
export const ESQUEMA_REVOCACION = 'stateark-sim/revocacion@1';
export const USO_REVOCACION = 'StateArk/Sesion/Revocacion/v1';
/** El alcance exacto de la sesión, en orden. */
export const ALCANCE = Object.freeze([KINDS.SELLO, KINDS.AUTH]);
/** Lo que manda cada lado. */
export const DE_LA_CARTA = Object.freeze(['hola', 'propuesta']);
export const DE_LA_APP = Object.freeze(['emparejada', 'firma', 'rechazo', 'revocada']);
/** Los estados de una propuesta. */
export const ESTADOS = Object.freeze(['propuesto', 'firmado', 'rechazado', 'caducado', 'revocado']);

/** Límites (decisión de la carta; el SIP da unos 840 caracteres de QR y 24 h de sesión como mucho). */
export const LIMITES = Object.freeze({
  qr: 2048, // caracteres del texto del QR, antes de decodificar
  marco: 200_000, // caracteres de un mensaje del relé, antes de JSON.parse
  sesionMs: 24 * 3600 * 1000, // de desde a hasta
  agente: 200,
  nota: 2000,
  motivo: 2000,
  desafio: 512,
  cola: 100, // eventos esperando el OK del relé
  propuestas: 500, // registros de propuestas guardados (se tiran los terminados más viejos)
  vistos: 2000,
});
const ESPERAS_RECONEXION = Object.freeze([1000, 2000, 5000, 10_000, 30_000, 60_000]);

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const enc = new TextEncoder();
const esId = (x) => typeof x === 'string' && HEX64.test(x);
const esFirma = (x) => typeof x === 'string' && HEX128.test(x);
const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const clavesExactas = (o, ...k) => Object.keys(o).sort().join(',') === [...k].sort().join(',');
const textoCorto = (t, max) => typeof t === 'string' && t.length > 0 && t.length <= max;
const instante = (t) => (typeof t === 'string' && ISO.test(t) ? Date.parse(t) : NaN);
const segundos = (ms) => Math.floor(ms / 1000);

export class ErrorEmparejamiento extends Error {
  constructor(code, mensaje) {
    super(code + ': ' + mensaje);
    this.code = code;
  }
}
const fallo = (code, m) => new ErrorEmparejamiento(code, m);

// ---------- base64url ----------

function aBase64url(texto) {
  const b = enc.encode(texto);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64url(t) {
  if (!/^[A-Za-z0-9_-]+$/.test(t) || t.length % 4 === 1) throw new Error('no es base64url');
  const b64 = t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (t.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (aBase64url(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) !== t) throw new Error('base64url no canónico');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// ---------- firmas ----------

const aux32 = (aux) => (aux === undefined ? globalThis.crypto.getRandomValues(new Uint8Array(32)) : aux);

/** El id NIP-01 de un evento: SHA-256 de [0, pubkey, created_at, kind, tags, content]. */
export function idDeEvento({ pubkey, created_at, kind, tags, content }) {
  return hash(JSON.stringify([0, pubkey, created_at, kind, tags, content]));
}

/** Firma un evento NIP-01 con una privada (hex). Interna: solo la llaman las funciones de abajo, cada una con su kind. */
async function firmarEvento({ created_at, kind, tags, content }, privada, aux) {
  const pubkey = publicaDe(privada);
  const id = await idDeEvento({ pubkey, created_at, kind, tags, content });
  const sig = aHex(schnorr.sign(deHex(id), deHex(privada), aux32(aux)));
  return { id, pubkey, created_at, kind, tags, content, sig };
}

/**
 * Lo único que firma la clave de sesión: el AUTH (22242) y el sello (13). Cualquier otro kind se rechaza con
 * `scope_invalid`, sin firmar. `aux` (32 bytes) solo para los vectores; si no, al azar.
 */
export function firmarEventoDeSesion(evento, privada, { aux } = {}) {
  if (!esObjeto(evento) || !ALCANCE.includes(evento.kind)) return Promise.reject(fallo('scope_invalid', 'la clave de sesión solo firma los kinds 13 y 22242'));
  return firmarEvento(evento, privada, aux);
}

/** ¿Es un evento NIP-01 con sus siete campos, su id y su firma? Nunca lanza. */
export async function verificarEvento(ev) {
  try {
    if (!esObjeto(ev) || !clavesExactas(ev, 'id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig')) return false;
    if (!esId(ev.id) || !esId(ev.pubkey) || !esFirma(ev.sig)) return false;
    if (!Number.isSafeInteger(ev.created_at) || ev.created_at < 0 || !Number.isInteger(ev.kind) || ev.kind < 0 || ev.kind > 65535) return false;
    if (typeof ev.content !== 'string' || !Array.isArray(ev.tags)) return false;
    if (!ev.tags.every((t) => Array.isArray(t) && t.length > 0 && t.every((x) => typeof x === 'string'))) return false;
    if ((await idDeEvento(ev)) !== ev.id) return false;
    return verificarBip340(deHex(ev.sig), deHex(ev.id), deHex(ev.pubkey));
  } catch {
    return false;
  }
}

const etiquetas = (ev, nombre) => ev.tags.filter((t) => t[0] === nombre);

// ---------- el QR ----------

/** La huella corta de la sesión: los 8 primeros hex en dos grupos de 4. */
export function huellaCorta(sesion) {
  return typeof sesion === 'string' ? sesion.slice(0, 4) + '-' + sesion.slice(4, 8) : '';
}

/** El texto del QR de un objeto { rele, privada, delegacion } (lo usa la app; aquí, para las pruebas). */
export function textoDeQR({ rele, privada, delegacion }) {
  return PREFIJO_QR + aBase64url(canonico({ schema: ESQUEMA_QR, rele, privada, delegacion }));
}

/** ¿Es un relé aceptable? wss:// con host; con `local`, también ws://localhost y ws://127.0.0.1 (solo pruebas). */
export function releValido(u, { local = false } = {}) {
  if (typeof u !== 'string' || u.length > 512 || /\s/.test(u)) return false;
  const seguro = /^wss:\/\/[^/?#@:]+(:\d{1,5})?(\/[^?#]*)?$/.test(u);
  const enLocal = local && /^ws:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?(\/[^?#]*)?$/.test(u);
  if (!seguro && !enLocal) return false;
  try {
    const url = new URL(u);
    return (url.protocol === 'wss:' || (enLocal && url.protocol === 'ws:')) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Forma, plazo coherente y firma de una delegación (sin mirar el alcance ni la hora actual). */
function delegacionFirmada(d) {
  if (!esObjeto(d) || !clavesExactas(d, 'alcance', 'desde', 'firma', 'hasta', 'larga', 'schema', 'sesion', 'uso')) return false;
  if (d.schema !== ESQUEMA_DELEGACION || d.uso !== USO_SESION || !esId(d.larga) || !esId(d.sesion) || !esFirma(d.firma)) return false;
  if (!Array.isArray(d.alcance) || d.alcance.length > 16 || !d.alcance.every(Number.isInteger)) return false;
  const desde = instante(d.desde);
  const hasta = instante(d.hasta);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde || hasta - desde > LIMITES.sesionMs) return false;
  const { firma, ...cuerpo } = d;
  return verificarBip340(deHex(firma), hashEtiquetado(USO_SESION, enc.encode(canonico(cuerpo))), deHex(d.larga));
}

/**
 * Lee el texto de un QR (o pegado) y lo comprueba en el orden del SIP §1. Devuelve { rele, privada, delegacion, huella }.
 * Lanza ErrorEmparejamiento: qr_invalid, relay_invalid, delegation_invalid, session_mismatch, scope_invalid o
 * session_expired. No guarda nada.
 */
export function leerQR(texto, { ahora = Date.now(), local = false } = {}) {
  if (typeof texto !== 'string') throw fallo('qr_invalid', 'el QR es un texto');
  if (texto.length > LIMITES.qr) throw fallo('qr_invalid', 'el texto es demasiado largo');
  const t = texto.trim();
  if (!t.startsWith(PREFIJO_QR)) throw fallo('qr_invalid', 'el texto no empieza por ' + PREFIJO_QR);
  let json;
  let o;
  try {
    json = deBase64url(t.slice(PREFIJO_QR.length));
    o = JSON.parse(json);
  } catch {
    throw fallo('qr_invalid', 'no es base64url de un JSON');
  }
  if (!esObjeto(o) || o.schema !== ESQUEMA_QR) throw fallo('qr_invalid', 'el schema no es ' + ESQUEMA_QR);
  if (!clavesExactas(o, 'delegacion', 'privada', 'rele', 'schema')) throw fallo('qr_invalid', 'lleva campos de más o de menos');
  if (canonico(o) !== json) throw fallo('qr_invalid', 'el JSON no está en forma canónica');
  if (!releValido(o.rele, { local })) throw fallo('relay_invalid', 'el relé no es wss://');
  if (!delegacionFirmada(o.delegacion)) throw fallo('delegation_invalid', 'la delegación no tiene su forma o su firma no verifica');
  let publica = null;
  try { publica = typeof o.privada === 'string' && HEX64.test(o.privada) ? publicaDe(o.privada) : null; } catch { publica = null; }
  if (publica === null || publica !== o.delegacion.sesion) throw fallo('session_mismatch', 'la privada no es la de la sesión delegada');
  if (canonico(o.delegacion.alcance) !== canonico(ALCANCE)) throw fallo('scope_invalid', 'el alcance no es [13, 22242]');
  if (!(ahora >= instante(o.delegacion.desde) && ahora < instante(o.delegacion.hasta))) throw fallo('session_expired', 'fuera de plazo');
  return { rele: o.rele, privada: o.privada, delegacion: o.delegacion, huella: huellaCorta(o.delegacion.sesion) };
}

/** El AUTH de NIP-42 de la sesión (kind 22242, con relay, challenge y delegacion). */
export function eventoAuth(privada, { rele, challenge, delegacion, creadoEn, aux }) {
  const tags = [['relay', rele], ['challenge', challenge], ['delegacion', canonico(delegacion)]];
  return firmarEventoDeSesion({ created_at: creadoEn, kind: KINDS.AUTH, tags, content: '' }, privada, { aux });
}

// ---------- los mensajes y el gift wrap ----------

/** La forma de un mensaje del SIP §3: null si vale; si no, el motivo. */
export function formaDelMensaje(m) {
  if (!esObjeto(m) || m.schema !== ESQUEMA_MENSAJE) return 'el schema no es el del mensaje';
  const k = Object.keys(m);
  const exactas = (...extra) => clavesExactas(m, 'schema', 'tipo', ...extra);
  switch (m.tipo) {
    case 'hola': return exactas('agente') && textoCorto(m.agente, LIMITES.agente) ? null : '«hola» lleva solo «agente»';
    case 'emparejada': return exactas() ? null : '«emparejada» no lleva nada más';
    case 'propuesta': {
      const opcionales = k.filter((x) => x === 'nota' || x === 'libro');
      if (!exactas('publica', 'canonico', 'id', 'segundoFactor', ...opcionales)) return '«propuesta» lleva publica, canonico, id, segundoFactor y, si los hay, nota y libro';
      if (!esId(m.publica) || typeof m.canonico !== 'string' || m.canonico.length === 0 || !esId(m.id) || typeof m.segundoFactor !== 'boolean') return 'la propuesta tiene un campo con mala forma';
      if ('nota' in m && !textoCorto(m.nota, LIMITES.nota)) return 'la nota es un texto corto';
      if ('libro' in m && !esId(m.libro)) return 'el libro es el id de su génesis (64 hex)';
      return null;
    }
    case 'firma': return exactas('id', 'firma') && esId(m.id) && esFirma(m.firma) ? null : '«firma» lleva id y firma';
    case 'rechazo': return exactas('id', 'code', 'motivo') && esId(m.id) && typeof m.code === 'string' && CODE.test(m.code) && typeof m.motivo === 'string' && m.motivo.length <= LIMITES.motivo ? null : '«rechazo» lleva id, code y motivo';
    case 'revocada': return exactas('revocacion') && esObjeto(m.revocacion) ? null : '«revocada» lleva la revocación';
    default: return 'tipo desconocido';
  }
}

const bytesUtf8 = (t) => enc.encode(t).length;

/**
 * Envuelve un mensaje (NIP-59): rumor 7704 sin firma → sello 13 firmado por el remitente → regalo 1059 firmado por una
 * clave de usar y tirar, con ["p", para] y ["expiration", caduca]. `determinista` ({ efimera, nonces: [hex, hex], aux })
 * solo para los vectores: en uso real la clave de usar y tirar, los nonces y el azar de las firmas salen de
 * crypto.getRandomValues. Lanza message_invalid o message_too_large.
 */
export async function envolver(mensaje, { privada, para, creadoEn, caduca, determinista = null }) {
  const motivo = formaDelMensaje(mensaje);
  if (motivo) throw fallo('message_invalid', motivo);
  if (!esId(para) || !clavePublicaValida(para)) throw fallo('message_invalid', 'el destinatario es una clave x-only');
  if (!Number.isSafeInteger(creadoEn) || !Number.isSafeInteger(caduca) || caduca <= creadoEn) throw fallo('message_invalid', 'creadoEn y caduca son segundos, y caduca va después');
  const pubkey = publicaDe(privada);
  let efimera;
  if (determinista) {
    efimera = determinista.efimera;
    if (efimera === privada || publicaDe(efimera) === pubkey) throw fallo('message_invalid', 'la clave de usar y tirar no es la del remitente');
  } else {
    efimera = aHex(schnorr.utils.randomSecretKey());
  }
  const nonce = (i) => (determinista?.nonces?.[i] ? deHex(determinista.nonces[i]) : undefined);
  const rumor = { pubkey, created_at: creadoEn, kind: KINDS.RUMOR, tags: [], content: canonico(mensaje) };
  rumor.id = await idDeEvento(rumor);
  const textoRumor = JSON.stringify(rumor);
  if (bytesUtf8(textoRumor) > MAX_CLARO) throw fallo('message_too_large', 'el mensaje no cabe en NIP-44');
  const sello = await firmarEventoDeSesion({ created_at: creadoEn, kind: KINDS.SELLO, tags: [], content: await cifrar(textoRumor, await claveDeConversacion(privada, para), ...(nonce(0) ? [nonce(0)] : [])) }, privada, { aux: determinista?.aux });
  const textoSello = JSON.stringify(sello);
  if (bytesUtf8(textoSello) > MAX_CLARO) throw fallo('message_too_large', 'el mensaje sellado no cabe en NIP-44');
  const contenido = await cifrar(textoSello, await claveDeConversacion(efimera, para), ...(nonce(1) ? [nonce(1)] : []));
  return firmarEvento({ created_at: creadoEn, kind: KINDS.REGALO, tags: [['p', para], ['expiration', String(caduca)]], content: contenido }, efimera, determinista?.aux);
}

/**
 * Abre un regalo con la privada del destinatario y lo comprueba todo (SIP §3): el id y la firma del regalo y del sello,
 * un solo «p» que es el destinatario, sello sin etiquetas, sello.pubkey = rumor.pubkey, el id NIP-01 del rumor, kind
 * 7704 y el mensaje en JSON canónico. Devuelve { remitente, creadoEn, mensaje, motivo } (motivo null si el mensaje tiene
 * su forma) o null si el sobre no vale (se descarta sin respuesta). Nunca lanza.
 */
export async function abrir(regalo, privada) {
  try {
    const yo = publicaDe(privada);
    if (!esObjeto(regalo) || regalo.kind !== KINDS.REGALO || typeof regalo.content !== 'string' || regalo.content.length > MAX_PAYLOAD) return null;
    if (!(await verificarEvento(regalo))) return null;
    const p = etiquetas(regalo, 'p');
    if (p.length !== 1 || p[0][1] !== yo) return null;
    const sello = JSON.parse(await descifrar(regalo.content, await claveDeConversacion(privada, regalo.pubkey)));
    if (!esObjeto(sello) || sello.kind !== KINDS.SELLO || !Array.isArray(sello.tags) || sello.tags.length !== 0) return null;
    if (typeof sello.content !== 'string' || sello.content.length > MAX_PAYLOAD || !(await verificarEvento(sello))) return null;
    const rumor = JSON.parse(await descifrar(sello.content, await claveDeConversacion(privada, sello.pubkey)));
    if (!esObjeto(rumor) || !clavesExactas(rumor, 'id', 'pubkey', 'created_at', 'kind', 'tags', 'content')) return null;
    if (rumor.pubkey !== sello.pubkey || rumor.kind !== KINDS.RUMOR || typeof rumor.content !== 'string') return null;
    if (!Array.isArray(rumor.tags) || rumor.tags.length !== 0 || !Number.isSafeInteger(rumor.created_at)) return null;
    if (rumor.id !== (await idDeEvento(rumor))) return null;
    let mensaje = null;
    let motivo;
    try {
      mensaje = JSON.parse(rumor.content);
      motivo = canonico(mensaje) === rumor.content ? formaDelMensaje(mensaje) : 'el mensaje no está en forma canónica';
    } catch {
      motivo = 'el mensaje no es JSON';
    }
    return { remitente: sello.pubkey, creadoEn: sello.created_at, mensaje, motivo };
  } catch {
    return null;
  }
}

/** ¿Es una revocación de sesión firmada por su `larga`? (SIP §5; forma exacta). Nunca lanza. */
export function revocacionValida(r) {
  try {
    if (!esObjeto(r) || !clavesExactas(r, 'schema', 'uso', 'larga', 'sesion', 'instante', 'firma')) return false;
    if (r.schema !== ESQUEMA_REVOCACION || r.uso !== USO_REVOCACION || !esId(r.larga) || !esId(r.sesion) || !esFirma(r.firma) || !Number.isFinite(instante(r.instante))) return false;
    const { firma, ...cuerpo } = r;
    return verificarBip340(deHex(firma), hashEtiquetado(USO_REVOCACION, enc.encode(canonico(cuerpo))), deHex(r.larga));
  } catch {
    return false;
  }
}

// ---------- almacenes ----------

/**
 * Un almacén en memoria (pruebas): { obtener, poner, borrar, claves } asíncronos, con copia estructurada (lo guardado
 * no comparte referencias con quien lo pasa). `volcado()` da una copia de todo, para las pruebas.
 */
export function almacenEnMemoria() {
  const m = new Map();
  return {
    async obtener(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; },
    async poner(k, v) { m.set(k, structuredClone(v)); },
    async borrar(k) { m.delete(k); },
    async claves() { return [...m.keys()]; },
    volcado() { return structuredClone(Object.fromEntries(m)); },
  };
}

/**
 * El almacén del navegador: IndexedDB del origen, una base `nombre` con una tienda de pares clave → valor. Misma forma
 * que almacenEnMemoria. NO probado en las pruebas de Node (no hay IndexedDB): lo prueba el encargo de pantalla.
 */
export function almacenIndexedDB({ nombre = 'agram-emparejamiento', tienda = 'claves' } = {}) {
  let base = null;
  const abrirBase = () => base ?? (base = new Promise((ok, mal) => {
    const pet = globalThis.indexedDB.open(nombre, 1);
    pet.onupgradeneeded = () => pet.result.createObjectStore(tienda);
    pet.onsuccess = () => ok(pet.result);
    pet.onerror = () => mal(pet.error);
  }));
  const hacer = async (modo, f) => {
    const db = await abrirBase();
    return new Promise((ok, mal) => {
      const tx = db.transaction(tienda, modo);
      const pet = f(tx.objectStore(tienda));
      tx.oncomplete = () => ok(pet?.result);
      tx.onerror = () => mal(tx.error);
      tx.onabort = () => mal(tx.error);
    });
  };
  return {
    obtener: (k) => hacer('readonly', (s) => s.get(k)),
    poner: (k, v) => hacer('readwrite', (s) => s.put(v, k)).then(() => undefined),
    borrar: (k) => hacer('readwrite', (s) => s.delete(k)).then(() => undefined),
    claves: () => hacer('readonly', (s) => s.getAllKeys()).then((r) => (r ?? []).map(String)),
  };
}

const temporizadorDeSiempre = Object.freeze({
  poner: (f, ms) => setTimeout(f, ms),
  quitar: (h) => clearTimeout(h),
});

const avisoSeguro = (avisar, aviso) => {
  try { avisar?.(aviso); } catch { /* un oyente que falla no rompe el flujo */ }
};

// ---------- el cliente del relé ----------

/**
 * El cliente del relé sobre un WebSocket inyectado (`abrirSocket(url)` → objeto con send, close y los manejadores
 * onopen, onmessage, onclose, onerror, como el WebSocket del navegador). Hace NIP-42 con `firmarAuth(challenge)`, se
 * suscribe a `filtro` cuando el relé acepta el AUTH, publica (los eventos esperan en una cola acotada hasta su OK) y
 * reconecta con esperas crecientes (1 s … 60 s). Un AUTH rechazado no reintenta: avisa. `cerrar()` lo para todo.
 */
export class ClienteRele {
  #url; #abrirSocket; #temporizador; #firmarAuth; #filtro; #alEvento; #avisar;
  #ws = null;
  #autenticado = false;
  #idAuth = null;
  #cola = new Map(); // id → { evento, resolver, rechazar }
  #intentos = 0;
  #reintento = null;
  #cerrado = false;
  #sub;

  constructor({ url, abrirSocket, temporizador = temporizadorDeSiempre, firmarAuth, filtro, alEvento, avisar = () => {} }) {
    this.#url = url;
    this.#abrirSocket = abrirSocket;
    this.#temporizador = temporizador;
    this.#firmarAuth = firmarAuth;
    this.#filtro = filtro;
    this.#alEvento = alEvento;
    this.#avisar = avisar;
    this.#sub = 'agram-emparejamiento';
  }

  get autenticado() { return this.#autenticado; }

  conectar() {
    if (this.#cerrado || this.#ws) return;
    let ws;
    try { ws = this.#abrirSocket(this.#url); } catch { this.#programar(); return; }
    this.#ws = ws;
    this.#autenticado = false;
    this.#idAuth = null;
    ws.onmessage = (e) => { if (this.#ws === ws) this.#recibir(e?.data).catch(() => {}); };
    ws.onclose = () => { if (this.#ws === ws) { this.#ws = null; this.#autenticado = false; avisoSeguro(this.#avisar, { tipo: 'desconectado' }); this.#programar(); } };
    ws.onerror = () => {};
    ws.onopen = () => {};
  }

  #programar() {
    if (this.#cerrado || this.#reintento !== null) return;
    const espera = ESPERAS_RECONEXION[Math.min(this.#intentos, ESPERAS_RECONEXION.length - 1)];
    this.#intentos++;
    this.#reintento = this.#temporizador.poner(() => { this.#reintento = null; this.conectar(); }, espera);
  }

  #mandar(marco) {
    try { this.#ws?.send(JSON.stringify(marco)); } catch { /* el cierre llegará por onclose */ }
  }

  async #recibir(datos) {
    if (typeof datos !== 'string' || datos.length > LIMITES.marco) return;
    let m;
    try { m = JSON.parse(datos); } catch { return; }
    if (!Array.isArray(m) || typeof m[0] !== 'string') return;
    const [tipo] = m;
    if (tipo === 'AUTH' && typeof m[1] === 'string' && m[1].length > 0 && m[1].length <= LIMITES.desafio && !this.#autenticado) {
      const ev = await this.#firmarAuth(m[1]);
      this.#idAuth = ev.id;
      this.#mandar(['AUTH', ev]);
    } else if (tipo === 'OK' && esId(m[1]) && typeof m[2] === 'boolean') {
      const mensaje = typeof m[3] === 'string' ? m[3].slice(0, 300) : '';
      if (m[1] === this.#idAuth) {
        this.#idAuth = null;
        if (m[2]) {
          this.#autenticado = true;
          this.#intentos = 0;
          this.#mandar(['REQ', this.#sub, this.#filtro]);
          for (const { evento } of this.#cola.values()) this.#mandar(['EVENT', evento]);
          avisoSeguro(this.#avisar, { tipo: 'conectado' });
        } else {
          avisoSeguro(this.#avisar, { tipo: 'auth_rechazado', mensaje });
          this.cerrar();
        }
        return;
      }
      const e = this.#cola.get(m[1]);
      if (!e) return;
      this.#cola.delete(m[1]);
      if (m[2]) e.resolver({ ok: true });
      else e.rechazar(fallo('relay_refused', mensaje || 'el relé no lo guarda'));
    } else if (tipo === 'EVENT' && m[1] === this.#sub && this.#autenticado) {
      this.#alEvento(m[2]);
    }
  }

  /** Publica un evento: se manda en cuanto haya AUTH y se resuelve con el OK del relé. */
  publicar(evento) {
    if (this.#cerrado) return Promise.reject(fallo('relay_closed', 'el cliente está cerrado'));
    if (this.#cola.has(evento.id)) return this.#cola.get(evento.id).promesa;
    if (this.#cola.size >= LIMITES.cola) return Promise.reject(fallo('relay_queue_full', 'demasiados envíos sin respuesta'));
    let resolver;
    let rechazar;
    const promesa = new Promise((ok, mal) => { resolver = ok; rechazar = mal; });
    this.#cola.set(evento.id, { evento, resolver, rechazar, promesa });
    if (this.#autenticado) this.#mandar(['EVENT', evento]);
    else this.conectar();
    return promesa;
  }

  /** Lo para todo: sin reconexión, sin socket, y lo que esperaba OK se rechaza con relay_closed. */
  cerrar() {
    if (this.#cerrado) return;
    this.#cerrado = true;
    if (this.#reintento !== null) { this.#temporizador.quitar(this.#reintento); this.#reintento = null; }
    const ws = this.#ws;
    this.#ws = null;
    this.#autenticado = false;
    if (ws) {
      ws.onmessage = ws.onclose = ws.onerror = ws.onopen = null;
      try { ws.close(); } catch { /* ya cerrado */ }
    }
    for (const e of this.#cola.values()) { e.promesa.catch(() => {}); e.rechazar(fallo('relay_closed', 'el cliente se ha cerrado')); }
    this.#cola.clear();
  }
}

// ---------- el flujo ----------

const CLAVE_PROPUESTAS = 'propuestas';
const claveSesion = (sesion) => 'sesion:' + sesion;

/**
 * El emparejamiento de esta carta. Un solo emparejamiento vivo a la vez: leer otro QR sustituye al anterior.
 *
 *   new Emparejamiento({ almacen, abrirSocket, reloj, temporizador, agente, local, avisar })
 *   await e.cargar()                       recupera la sesión guardada (si sigue en plazo) y se conecta
 *   await e.emparejar(textoDelQR)          comprueba, guarda, conecta y manda «hola» → { sesion, huella, hasta, app, rele }
 *   e.estado()                             null o { sesion, huella, hasta, app, rele, aceptada, conectado }
 *   await e.proponer({ publica, canonico, id, segundoFactor, nota?, libro? })   → { id, firma } verificada, o lanza su code
 *   e.firmante({ publica, segundoFactor, nota?, libro? })                      el firmante del camino B: ({ canonico, id }) → { id, firma }
 *   await e.reenviar(id)  ·  e.propuestas()  ·  await e.descartar(id)  ·  await e.olvidar()  ·  e.cerrar()
 *
 * `avisar(aviso)` recibe { tipo: 'emparejada' | 'rechazada' | 'firma' | 'rechazo' | 'caducada' | 'revocada' |
 * 'firma_invalida' | 'conectado' | 'desconectado' | 'auth_rechazado', … }. Lo guardado: `sesion:<clave de sesión>` (el
 * objeto del QR con su privada, y si la app aceptó) y `propuestas` (las propuestas por id, con su sesión y su estado).
 */
export class Emparejamiento {
  #almacen; #abrirSocket; #reloj; #temporizador; #agente; #local; #avisar;
  #sesion = null; // { rele, privada, delegacion, aceptada, hola }
  #propuestas = {}; // id → registro
  #cliente = null;
  #esperas = new Map(); // id → [{ ok, mal }]
  #vistos = new Set();
  #alarma = null;
  #escritura = Promise.resolve();

  constructor({ almacen, abrirSocket = (url) => new globalThis.WebSocket(url), reloj = () => Date.now(), temporizador = temporizadorDeSiempre, agente = 'navegador', local = false, avisar = () => {} }) {
    if (!almacen || ['obtener', 'poner', 'borrar', 'claves'].some((f) => typeof almacen[f] !== 'function')) throw new TypeError('emparejamiento: falta el almacén');
    if (!textoCorto(agente, LIMITES.agente)) throw new TypeError('emparejamiento: el agente es un texto corto');
    this.#almacen = almacen;
    this.#abrirSocket = abrirSocket;
    this.#reloj = reloj;
    this.#temporizador = temporizador;
    this.#agente = agente;
    this.#local = local;
    this.#avisar = avisar;
  }

  /** Las escrituras en el almacén, de una en una y en orden. */
  #guardar(f) {
    const p = this.#escritura.then(f);
    this.#escritura = p.catch(() => {});
    return p;
  }

  #guardarSesion() {
    const s = this.#sesion;
    if (!s) return Promise.resolve();
    const copia = { rele: s.rele, privada: s.privada, delegacion: s.delegacion, aceptada: s.aceptada, hola: s.hola };
    return this.#guardar(() => this.#almacen.poner(claveSesion(s.delegacion.sesion), copia));
  }

  #guardarPropuestas() {
    const lista = Object.values(this.#propuestas);
    if (lista.length > LIMITES.propuestas) {
      const terminadas = lista.filter((p) => p.estado !== 'propuesto').sort((a, b) => a.propuestaEn - b.propuestaEn);
      for (const p of terminadas.slice(0, lista.length - LIMITES.propuestas)) delete this.#propuestas[p.id];
    }
    const copia = structuredClone(this.#propuestas);
    return this.#guardar(() => this.#almacen.poner(CLAVE_PROPUESTAS, copia));
  }

  #publica() {
    const s = this.#sesion;
    return s ? { sesion: s.delegacion.sesion, huella: huellaCorta(s.delegacion.sesion), hasta: s.delegacion.hasta, app: s.delegacion.larga, rele: s.rele } : null;
  }

  estado() {
    const p = this.#publica();
    return p && { ...p, aceptada: this.#sesion.aceptada, conectado: Boolean(this.#cliente?.autenticado) };
  }

  /** Recupera lo guardado: las propuestas y la sesión, si sigue en plazo (si no, la caduca). Se conecta. */
  async cargar() {
    const guardadas = await this.#almacen.obtener(CLAVE_PROPUESTAS);
    this.#propuestas = esObjeto(guardadas) ? guardadas : {};
    const claves = (await this.#almacen.claves()).filter((k) => typeof k === 'string' && k.startsWith('sesion:'));
    const sesiones = [];
    for (const k of claves) {
      const s = await this.#almacen.obtener(k);
      let ok = false;
      try { ok = esObjeto(s) && releValido(s.rele, { local: this.#local }) && delegacionFirmada(s.delegacion) && publicaDe(s.privada) === s.delegacion.sesion && claveSesion(s.delegacion.sesion) === k && canonico(s.delegacion.alcance) === canonico(ALCANCE); } catch { ok = false; }
      if (ok) sesiones.push(s);
      else await this.#guardar(() => this.#almacen.borrar(k));
    }
    sesiones.sort((a, b) => instante(b.delegacion.hasta) - instante(a.delegacion.hasta));
    for (const viejo of sesiones.slice(1)) await this.#terminarGuardada(viejo.delegacion.sesion, 'caducado', 'pairing_replaced', 'otro emparejamiento lo sustituye');
    const s = sesiones[0];
    if (!s) return null;
    this.#sesion = { rele: s.rele, privada: s.privada, delegacion: s.delegacion, aceptada: s.aceptada === true, hola: s.hola === true };
    if (this.#caducadaSiToca()) return null;
    this.#arrancar();
    if (!this.#sesion.hola) this.#mandarHola();
    return this.estado();
  }

  /** Lee el QR (si falla, lanza su code y no guarda nada), sustituye el emparejamiento anterior, guarda, conecta y manda «hola». */
  async emparejar(texto) {
    const leido = leerQR(texto, { ahora: this.#reloj(), local: this.#local });
    if (this.#sesion) await this.#terminar('caducado', 'pairing_replaced', 'otro emparejamiento lo sustituye', 'sustituida');
    this.#sesion = { rele: leido.rele, privada: leido.privada, delegacion: leido.delegacion, aceptada: false, hola: false };
    this.#vistos.clear();
    await this.#guardarSesion();
    this.#arrancar();
    this.#mandarHola();
    return this.#publica();
  }

  #arrancar() {
    const s = this.#sesion;
    const sesion = s.delegacion.sesion;
    this.#cliente = new ClienteRele({
      url: s.rele,
      abrirSocket: this.#abrirSocket,
      temporizador: this.#temporizador,
      filtro: { kinds: [KINDS.REGALO], '#p': [sesion] },
      firmarAuth: (challenge) => eventoAuth(s.privada, { rele: s.rele, challenge, delegacion: s.delegacion, creadoEn: segundos(this.#reloj()) }),
      alEvento: (ev) => { this.#alRegalo(ev, sesion).catch(() => {}); },
      avisar: (a) => avisoSeguro(this.#avisar, a),
    });
    const queda = instante(s.delegacion.hasta) - this.#reloj();
    this.#alarma = this.#temporizador.poner(() => { this.#alarma = null; this.#caducadaSiToca(); }, Math.max(0, Math.min(queda, LIMITES.sesionMs)));
    this.#cliente.conectar();
  }

  /** Si ha llegado `hasta`, caduca (propuesto → caducado, borra la sesión) y devuelve verdadero. */
  #caducadaSiToca() {
    if (!this.#sesion || this.#reloj() < instante(this.#sesion.delegacion.hasta)) return false;
    this.#terminar('caducado', 'session_expired', 'la sesión ha caducado sin firmar', 'caducada').catch(() => {});
    return true;
  }

  async #mandar(mensaje) {
    const s = this.#sesion;
    const regalo = await envolver(mensaje, { privada: s.privada, para: s.delegacion.larga, creadoEn: segundos(this.#reloj()), caduca: segundos(instante(s.delegacion.hasta)) });
    return { regalo, enviado: this.#cliente.publicar(regalo) };
  }

  #mandarHola() {
    const sesion = this.#sesion.delegacion.sesion;
    this.#mandar({ schema: ESQUEMA_MENSAJE, tipo: 'hola', agente: this.#agente })
      .then(({ enviado }) => enviado)
      .then(() => {
        if (this.#sesion?.delegacion.sesion !== sesion) return;
        this.#sesion.hola = true;
        return this.#guardarSesion();
      })
      .catch(() => {});
  }

  #requiereSesion() {
    if (!this.#sesion) throw fallo('no_pairing', 'no hay emparejamiento');
    if (this.#caducadaSiToca()) throw fallo('session_expired', 'la sesión ha caducado');
  }

  #esperar(id) {
    return new Promise((ok, mal) => {
      const l = this.#esperas.get(id) ?? [];
      l.push({ ok, mal });
      this.#esperas.set(id, l);
    });
  }

  #cumplir(id, error, valor) {
    const l = this.#esperas.get(id);
    if (!l) return;
    this.#esperas.delete(id);
    for (const e of l) (error ? e.mal(error) : e.ok(valor));
  }

  /**
   * Propone un registro SIN FIRMAR. Comprueba antes (id_mismatch, canonical_invalid, message_invalid,
   * message_too_large); lo deja en «propuesto», fuera del libro; lo manda y espera. Resuelve con { id, firma } cuando
   * llega una firma que verifica con `publica` sobre `id`; lanza con el code del rechazo, session_expired,
   * session_revoked, pairing_refused o pairing_replaced. Si ya está firmado, devuelve la firma guardada sin mandar nada;
   * si sigue «propuesto», lo reenvía (la app responde lo mismo).
   */
  async proponer({ publica, canonico: texto, id, segundoFactor = false, nota, libro }) {
    this.#requiereSesion();
    if (!esId(publica) || !clavePublicaValida(publica)) throw fallo('message_invalid', 'la pública de la cuenta es x-only');
    if (typeof texto !== 'string' || !esId(id)) throw fallo('message_invalid', 'falta el canónico o el id');
    if ((await hash(texto)) !== id) throw fallo('id_mismatch', 'el id no es el SHA-256 del canónico');
    let cuerpo;
    try { cuerpo = JSON.parse(texto); } catch { throw fallo('canonical_invalid', 'el canónico no es JSON'); }
    if (!esObjeto(cuerpo) || canonico(cuerpo) !== texto) throw fallo('canonical_invalid', 'el cuerpo no está en forma canónica');
    const mensaje = { schema: ESQUEMA_MENSAJE, tipo: 'propuesta', publica, canonico: texto, id, segundoFactor, ...(nota !== undefined ? { nota } : {}), ...(libro !== undefined ? { libro } : {}) };
    const motivo = formaDelMensaje(mensaje);
    if (motivo) throw fallo('message_invalid', motivo);
    const sesion = this.#sesion.delegacion.sesion;
    const ya = this.#propuestas[id];
    if (ya && ya.sesion === sesion) {
      if (ya.estado === 'firmado' && ya.publica === publica) return { id, firma: ya.firma };
      if (ya.estado === 'rechazado') throw fallo(ya.code, ya.motivo ?? '');
    }
    const { enviado } = await this.#mandar(mensaje); // envolver lanza message_too_large antes de guardar nada
    enviado.catch(() => {}); // si el relé no lo guarda, sigue «propuesto»: se puede reenviar
    if (!(ya && ya.sesion === sesion && ya.estado === 'propuesto')) {
      this.#propuestas[id] = { id, sesion, publica, canonico: texto, segundoFactor, ...(nota !== undefined ? { nota } : {}), ...(libro !== undefined ? { libro } : {}), estado: 'propuesto', propuestaEn: this.#reloj() };
      await this.#guardarPropuestas();
    }
    return this.#esperar(id);
  }

  /** El firmante del camino B (docs/ANFITRION.md): ({ canonico, id }) → { id, firma }, por este emparejamiento. */
  firmante({ publica, segundoFactor = false, nota, libro } = {}) {
    return ({ canonico: texto, id }) => this.proponer({ publica, canonico: texto, id, segundoFactor, nota, libro });
  }

  /** Vuelve a mandar una propuesta que sigue «propuesto» (la app responde lo mismo). */
  async reenviar(id) {
    this.#requiereSesion();
    const p = this.#propuestas[id];
    if (!p || p.estado !== 'propuesto' || p.sesion !== this.#sesion.delegacion.sesion) throw fallo('not_pending', 'no está en «propuesto»');
    const mensaje = { schema: ESQUEMA_MENSAJE, tipo: 'propuesta', publica: p.publica, canonico: p.canonico, id, segundoFactor: p.segundoFactor, ...(p.nota !== undefined ? { nota: p.nota } : {}), ...(p.libro !== undefined ? { libro: p.libro } : {}) };
    const { enviado } = await this.#mandar(mensaje);
    return enviado;
  }

  /** Las propuestas guardadas (copias): id, sesion, publica, canonico, estado y, según el estado, firma o code y motivo. */
  propuestas() {
    return Object.values(structuredClone(this.#propuestas));
  }

  /** Quita una propuesta de lo guardado (ya asentada en el libro, o vista y descartada). */
  async descartar(id) {
    if (!(id in this.#propuestas)) return;
    delete this.#propuestas[id];
    this.#cumplir(id, fallo('proposal_discarded', 'la propuesta se ha descartado'));
    await this.#guardarPropuestas();
  }

  /** «Olvidar el emparejamiento»: borra la sesión sin mandar nada. Lo «propuesto» queda «caducado». */
  async olvidar() {
    if (this.#sesion) await this.#terminar('caducado', 'pairing_forgotten', 'el emparejamiento se ha olvidado', 'olvidada');
  }

  /** Para el cliente y la alarma sin borrar nada (al cerrar la página, o en las pruebas). */
  cerrar() {
    this.#cliente?.cerrar();
    this.#cliente = null;
    if (this.#alarma !== null) { this.#temporizador.quitar(this.#alarma); this.#alarma = null; }
  }

  /** Termina la sesión viva: lo «propuesto» pasa a `final`, se rechazan las esperas, se borra la sesión y se cierra. */
  async #terminar(final, code, motivo, aviso) {
    const s = this.#sesion;
    if (!s) return;
    const sesion = s.delegacion.sesion;
    this.#sesion = null;
    this.cerrar();
    await this.#terminarGuardada(sesion, final, code, motivo);
    avisoSeguro(this.#avisar, { tipo: aviso, sesion, code });
  }

  async #terminarGuardada(sesion, final, code, motivo) {
    const error = fallo(code, motivo);
    for (const p of Object.values(this.#propuestas)) {
      if (p.sesion === sesion && p.estado === 'propuesto') {
        Object.assign(p, { estado: final, code, motivo });
        this.#cumplir(p.id, error);
      }
    }
    await this.#guardarPropuestas();
    await this.#guardar(() => this.#almacen.borrar(claveSesion(sesion)));
  }

  /** Un 1059 del relé para esta sesión: se abre, se comprueba que viene de su app y se atiende. */
  async #alRegalo(ev, sesion) {
    const s = this.#sesion;
    if (!s || s.delegacion.sesion !== sesion || this.#caducadaSiToca()) return;
    if (!esObjeto(ev) || !esId(ev.id) || this.#vistos.has(ev.id)) return;
    if (this.#vistos.size >= LIMITES.vistos) this.#vistos.clear();
    this.#vistos.add(ev.id);
    const a = await abrir(ev, s.privada);
    if (this.#sesion !== s) return;
    if (!a || a.motivo || a.remitente !== s.delegacion.larga || !DE_LA_APP.includes(a.mensaje.tipo)) return;
    const m = a.mensaje;
    if (m.tipo === 'emparejada') {
      if (!s.aceptada) { s.aceptada = true; await this.#guardarSesion(); }
      avisoSeguro(this.#avisar, { tipo: 'emparejada', sesion });
    } else if (m.tipo === 'firma') {
      const p = this.#propuestas[m.id];
      if (!p || p.sesion !== sesion || p.estado !== 'propuesto') return;
      if (!verificarBip340(deHex(m.firma), deHex(m.id), deHex(p.publica))) {
        avisoSeguro(this.#avisar, { tipo: 'firma_invalida', id: m.id });
        return;
      }
      Object.assign(p, { estado: 'firmado', firma: m.firma });
      await this.#guardarPropuestas();
      this.#cumplir(m.id, null, { id: m.id, firma: m.firma });
      avisoSeguro(this.#avisar, { tipo: 'firma', id: m.id });
    } else if (m.tipo === 'rechazo') {
      if (m.id === sesion && m.code === 'pairing_refused') {
        await this.#terminar('rechazado', 'pairing_refused', m.motivo, 'rechazada');
        return;
      }
      const p = this.#propuestas[m.id];
      if (!p || p.sesion !== sesion || p.estado !== 'propuesto') return;
      Object.assign(p, { estado: 'rechazado', code: m.code, motivo: m.motivo });
      await this.#guardarPropuestas();
      this.#cumplir(m.id, fallo(m.code, m.motivo));
      avisoSeguro(this.#avisar, { tipo: 'rechazo', id: m.id, code: m.code, motivo: m.motivo });
    } else if (m.tipo === 'revocada') {
      const r = m.revocacion;
      if (r.larga !== s.delegacion.larga || r.sesion !== sesion || !revocacionValida(r)) return;
      await this.#terminar('revocado', 'session_revoked', 'la app ha revocado el emparejamiento', 'revocada');
    }
  }
}
