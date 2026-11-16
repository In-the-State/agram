// ChaCha20 (RFC 8439 §2.1 a §2.4), escrito a mano y sin dependencias: lo usa el cifrado NIP-44 v2 del emparejamiento
// por QR (carta/nip44.js; docs/notas/EMPAREJAMIENTO.md). Solo el flujo de cifra, sin Poly1305: NIP-44 autentica con
// HMAC-SHA256. Las operaciones son sumas, rotaciones y xor de 32 bits, sin tablas ni ramas que dependan de la clave.
// Pruebas: test/chacha20.test.js (vectores del RFC 8439 y cotejo con el chacha20 de node:crypto).

const CONSTANTES = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]; // «expand 32-byte k»

const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

/** El cuarto de vuelta (RFC 8439 §2.1) sobre cuatro palabras de 32 bits: devuelve [a, b, c, d]. */
export function cuartoDeVuelta(a, b, c, d) {
  a = (a + b) >>> 0; d = rotl(d ^ a, 16);
  c = (c + d) >>> 0; b = rotl(b ^ c, 12);
  a = (a + b) >>> 0; d = rotl(d ^ a, 8);
  c = (c + d) >>> 0; b = rotl(b ^ c, 7);
  return [a, b, c, d];
}

function cuarto(s, a, b, c, d) {
  [s[a], s[b], s[c], s[d]] = cuartoDeVuelta(s[a], s[b], s[c], s[d]);
}

const palabrasLE = (u8) => {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const out = [];
  for (let i = 0; i < u8.length; i += 4) out.push(v.getUint32(i, true));
  return out;
};

function comprobar(clave, nonce, contador) {
  if (!(clave instanceof Uint8Array) || clave.length !== 32) throw new RangeError('chacha20: la clave son 32 bytes');
  if (!(nonce instanceof Uint8Array) || nonce.length !== 12) throw new RangeError('chacha20: el nonce son 12 bytes');
  if (!Number.isInteger(contador) || contador < 0 || contador > 0xffffffff) throw new RangeError('chacha20: el contador es un entero de 32 bits');
}

/** Un bloque de ChaCha20 (RFC 8439 §2.3): 64 bytes de clave de flujo para (clave 32, contador u32, nonce 12). */
export function bloque(clave, contador, nonce) {
  comprobar(clave, nonce, contador);
  const inicial = [...CONSTANTES, ...palabrasLE(clave), contador, ...palabrasLE(nonce)];
  const s = inicial.slice();
  for (let i = 0; i < 10; i++) {
    cuarto(s, 0, 4, 8, 12); cuarto(s, 1, 5, 9, 13); cuarto(s, 2, 6, 10, 14); cuarto(s, 3, 7, 11, 15);
    cuarto(s, 0, 5, 10, 15); cuarto(s, 1, 6, 11, 12); cuarto(s, 2, 7, 8, 13); cuarto(s, 3, 4, 9, 14);
  }
  const out = new Uint8Array(64);
  const v = new DataView(out.buffer);
  for (let i = 0; i < 16; i++) v.setUint32(4 * i, (s[i] + inicial[i]) >>> 0, true);
  s.fill(0);
  inicial.fill(0);
  return out;
}

/**
 * ChaCha20 (RFC 8439 §2.4): cifra o descifra `datos` (Uint8Array) con la clave (32), el nonce (12) y el contador
 * inicial. Devuelve bytes nuevos; no toca los de entrada. Lanza si el contador se desbordaría.
 */
export function chacha20(clave, nonce, contador, datos) {
  comprobar(clave, nonce, contador);
  if (!(datos instanceof Uint8Array)) throw new TypeError('chacha20: los datos son bytes');
  const bloques = Math.ceil(datos.length / 64);
  if (contador + bloques - 1 > 0xffffffff) throw new RangeError('chacha20: el contador se desborda');
  const out = new Uint8Array(datos.length);
  for (let i = 0; i < bloques; i++) {
    const k = bloque(clave, contador + i, nonce);
    const base = 64 * i;
    const fin = Math.min(64, datos.length - base);
    for (let j = 0; j < fin; j++) out[base + j] = datos[base + j] ^ k[j];
    k.fill(0);
  }
  return out;
}
