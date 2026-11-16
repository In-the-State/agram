// NIP-44 v2 (el cifrado de Nostr) sin librerías nuevas, para el emparejamiento por QR (carta/emparejamiento.js;
// docs/notas/EMPAREJAMIENTO.md):
//
//   - el secreto compartido, con la curva de la única librería que hay dentro (src/vendor/noble-secp256k1.js):
//     la x de privada·lift_x(pública), con la multiplicación de tiempo constante de noble (`multiply`);
//   - HMAC-SHA256 con crypto.subtle (Node y navegador); HKDF-Extract es un HMAC y HKDF-Expand se arma con HMAC (RFC 5869):
//     subtle no ofrece el Expand suelto sobre una PRK dada;
//   - ChaCha20 de carta/chacha20.js;
//   - el relleno de NIP-44 y la comparación del MAC en tiempo que no depende de dónde difieren.
//
// El azar sale de crypto.getRandomValues. Todo lo que llega de fuera se acota de tamaño ANTES de decodificar.

import { schnorr } from '../src/vendor/noble-secp256k1.js';
import { chacha20 } from './chacha20.js';

const sutil = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HEX64 = /^[0-9a-f]{64}$/;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

export const VERSION = 2;
export const MIN_CLARO = 1;
export const MAX_CLARO = 65535;
/** Los límites de NIP-44 v2 del payload en base64 y de sus bytes. */
export const MIN_PAYLOAD = 132;
export const MAX_PAYLOAD = 87472;
const MIN_DATOS = 99;
const MAX_DATOS = 65603;

export class ErrorNip44 extends Error {}
const fallo = (m) => new ErrorNip44('nip44: ' + m);

export function unir(...partes) {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let k = 0;
  for (const p of partes) { out.set(p, k); k += p.length; }
  return out;
}

export const deHex = (h) => Uint8Array.from(h.match(/.{2}/g) ?? [], (x) => parseInt(x, 16));
export const aHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

/** Iguales en tiempo que no depende de dónde difieren (sí del largo, que es público). */
export function igualesTiempoConstante(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/** HMAC-SHA256(clave, datos) con crypto.subtle → 32 bytes. */
export async function hmacSha256(clave, datos) {
  const k = await sutil().importKey('raw', clave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await sutil().sign('HMAC', k, datos));
}

/** HKDF-Expand (RFC 5869) sobre una PRK: `largo` bytes (como mucho 255·32). */
export async function hkdfExpand(prk, info, largo) {
  if (!Number.isInteger(largo) || largo < 1 || largo > 255 * 32) throw fallo('largo de HKDF no válido');
  const trozos = [];
  let t = new Uint8Array(0);
  for (let i = 1; trozos.length * 32 < largo; i++) {
    t = await hmacSha256(prk, unir(t, info, Uint8Array.of(i)));
    trozos.push(t);
  }
  return unir(...trozos).slice(0, largo);
}

const escalar = (privadaHex) => {
  if (typeof privadaHex !== 'string' || !HEX64.test(privadaHex)) throw fallo('la privada son 32 bytes en hex');
  const d = BigInt('0x' + privadaHex);
  if (d <= 0n || d >= N) throw fallo('la privada no es un escalar de la curva');
  return d;
};

/**
 * La clave de conversación de NIP-44 v2: HKDF-Extract(sal = «nip44-v2», ikm = x(privada·lift_x(pública))) → 32 bytes.
 * Lanza si la privada no es un escalar o la pública no es la x de un punto de la curva.
 */
export async function claveDeConversacion(privadaHex, publicaHex) {
  const d = escalar(privadaHex);
  if (typeof publicaHex !== 'string' || !HEX64.test(publicaHex)) throw fallo('la pública es x-only, 32 bytes en hex');
  let punto;
  try { punto = schnorr.utils.lift_x(BigInt('0x' + publicaHex)); } catch { throw fallo('la pública no es un punto de la curva'); }
  const s = punto.multiply(d);
  if (s.is0()) throw fallo('el secreto compartido es el infinito');
  const x = s.toAffine().x;
  const compartido = deHex(x.toString(16).padStart(64, '0'));
  const conversacion = await hmacSha256(enc.encode('nip44-v2'), compartido);
  compartido.fill(0);
  return conversacion;
}

/** Las claves de un mensaje: HKDF-Expand(conversación, nonce, 76) → { chacha (32), nonceChacha (12), hmac (32) }. */
export async function clavesDeMensaje(conversacion, nonce) {
  if (!(conversacion instanceof Uint8Array) || conversacion.length !== 32) throw fallo('la clave de conversación son 32 bytes');
  if (!(nonce instanceof Uint8Array) || nonce.length !== 32) throw fallo('el nonce son 32 bytes');
  const k = await hkdfExpand(conversacion, nonce, 76);
  return { chacha: k.slice(0, 32), nonceChacha: k.slice(32, 44), hmac: k.slice(44, 76) };
}

/** El largo con relleno de NIP-44 v2 (calc_padded_len). */
export function largoConRelleno(n) {
  if (!Number.isSafeInteger(n) || n < MIN_CLARO) throw fallo('largo no válido');
  if (n <= 32) return 32;
  const siguiente = 2 ** (Math.floor(Math.log2(n - 1)) + 1);
  const trozo = siguiente <= 256 ? 32 : siguiente / 8;
  return trozo * (Math.floor((n - 1) / trozo) + 1);
}

function rellenar(claro) {
  const n = claro.length;
  const out = new Uint8Array(2 + largoConRelleno(n));
  out[0] = n >> 8;
  out[1] = n & 0xff;
  out.set(claro, 2);
  return out;
}

function quitarRelleno(r) {
  if (r.length < 2) throw fallo('relleno no válido');
  const n = (r[0] << 8) | r[1];
  if (n < MIN_CLARO || r.length !== 2 + largoConRelleno(n)) throw fallo('relleno no válido');
  return r.slice(2, 2 + n);
}

const aBase64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const deBase64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

/**
 * Cifra un texto (1 a 65535 bytes en UTF-8) con una clave de conversación. `nonce` (32 bytes) solo para vectores; si no
 * se da, sale de crypto.getRandomValues. Devuelve el payload en base64.
 */
export async function cifrar(texto, conversacion, nonce = globalThis.crypto.getRandomValues(new Uint8Array(32))) {
  if (typeof texto !== 'string') throw fallo('se cifra un texto');
  if (texto.length > MAX_CLARO) throw fallo('el texto tiene de 1 a 65535 bytes'); // cada unidad de UTF-16 da al menos un byte
  const claro = enc.encode(texto);
  if (claro.length < MIN_CLARO || claro.length > MAX_CLARO) throw fallo('el texto tiene de 1 a 65535 bytes');
  const k = await clavesDeMensaje(conversacion, nonce);
  const relleno = rellenar(claro);
  const cifrado = chacha20(k.chacha, k.nonceChacha, 0, relleno);
  const mac = await hmacSha256(k.hmac, unir(nonce, cifrado));
  relleno.fill(0); k.chacha.fill(0); k.hmac.fill(0);
  return aBase64(unir(Uint8Array.of(VERSION), nonce, cifrado, mac));
}

/**
 * Descifra un payload. Acota el largo antes de decodificar, comprueba la versión, el MAC (antes de descifrar, en tiempo
 * constante) y el relleno. Lanza ErrorNip44 si algo no cuadra.
 */
export async function descifrar(payload, conversacion) {
  if (typeof payload !== 'string' || payload.length === 0 || payload[0] === '#') throw fallo('versión de cifrado desconocida');
  if (payload.length < MIN_PAYLOAD || payload.length > MAX_PAYLOAD) throw fallo('largo de payload no válido');
  if (!B64.test(payload) || payload.length % 4 !== 0) throw fallo('base64 no válido');
  let d;
  try { d = deBase64(payload); } catch { throw fallo('base64 no válido'); }
  if (d.length < MIN_DATOS || d.length > MAX_DATOS) throw fallo('largo de datos no válido');
  if (d[0] !== VERSION) throw fallo('versión ' + d[0] + ' desconocida');
  const nonce = d.slice(1, 33);
  const cifrado = d.slice(33, d.length - 32);
  const mac = d.slice(d.length - 32);
  const k = await clavesDeMensaje(conversacion, nonce);
  const esperado = await hmacSha256(k.hmac, unir(nonce, cifrado));
  if (!igualesTiempoConstante(esperado, mac)) throw fallo('MAC no válida');
  const relleno = chacha20(k.chacha, k.nonceChacha, 0, cifrado);
  k.chacha.fill(0); k.hmac.fill(0);
  const claro = quitarRelleno(relleno);
  relleno.fill(0);
  try { return dec.decode(claro); } catch { throw fallo('el texto no es UTF-8'); }
}
