// ChaCha20 escrito a mano (carta/chacha20.js), para NIP-44 v2 del emparejamiento por QR: los vectores del RFC 8439
// (§2.1.1, §2.3.2, §2.4.2 y A.1 #1) y el cotejo con el chacha20 de node:crypto (OpenSSL) sobre largos variados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import { cuartoDeVuelta, bloque, chacha20 } from '../carta/chacha20.js';

const hex = (h) => Uint8Array.from(h.replace(/[\s:]/g, '').match(/.{2}/g) ?? [], (x) => parseInt(x, 16));
const aHex = (u8) => Buffer.from(u8).toString('hex');
const clave0a31 = Uint8Array.from({ length: 32 }, (_, i) => i);

test('RFC 8439 §2.1.1: el cuarto de vuelta', () => {
  assert.deepEqual(cuartoDeVuelta(0x11111111, 0x01020304, 0x9b8d6f43, 0x01234567), [0xea2a92f4, 0xcb1cf8ce, 0x4581472e, 0x5881c4bb]);
});

test('RFC 8439 §2.3.2: el bloque', () => {
  const k = bloque(clave0a31, 1, hex('000000090000004a00000000'));
  assert.equal(aHex(k), '10f1e7e4d13b5915500fdd1fa32071c4c7d1f4c733c068030422aa9ac3d46c4e'
    + 'd2826446079faa0914c2d705d98b02a2b5129cd1de164eb9cbd083e8a2503c4e');
});

test('RFC 8439 §2.4.2: el cifrado del «sunscreen»', () => {
  const claro = new TextEncoder().encode("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
  const c = chacha20(clave0a31, hex('000000000000004a00000000'), 1, claro);
  assert.equal(aHex(c), '6e2e359a2568f98041ba0728dd0d6981e97e7aec1d4360c20a27afccfd9fae0b'
    + 'f91b65c5524733ab8f593dabcd62b3571639d624e65152ab8f530c359f0861d8'
    + '07ca0dbf500d6a6156a38e088a22b65e52bc514d16ccf806818ce91ab7793736'
    + '5af90bbf74a35be6b40b8eedf2785e42874d');
  assert.deepEqual(chacha20(clave0a31, hex('000000000000004a00000000'), 1, c), claro, 'descifrar es cifrar otra vez');
});

test('RFC 8439 A.1 #1: clave, nonce y contador a cero', () => {
  const k = bloque(new Uint8Array(32), 0, new Uint8Array(12));
  assert.equal(aHex(k), '76b8e0ada0f13d90405d6ae55386bd28bdd219b8a08ded1aa836efcc8b770dc7'
    + 'da41597c5157488d7724e03fb8d84a376a43b8f41518a11cc387b669b2ee6586');
});

test('cotejo con el chacha20 de node:crypto en largos de 0 a 300 y contadores variados', () => {
  for (const largo of [0, 1, 31, 63, 64, 65, 127, 128, 129, 300]) {
    for (const contador of [0, 1, 7, 0xfffffff0]) {
      const k = new Uint8Array(randomBytes(32));
      const n = new Uint8Array(randomBytes(12));
      const datos = new Uint8Array(randomBytes(largo));
      const iv = Buffer.alloc(16);
      iv.writeUInt32LE(contador, 0);
      Buffer.from(n).copy(iv, 4);
      const nodo = createCipheriv('chacha20', Buffer.from(k), iv).update(datos);
      assert.equal(aHex(chacha20(k, n, contador, datos)), nodo.toString('hex'), `largo ${largo}, contador ${contador}`);
    }
  }
});

test('rechaza claves, nonces y contadores que no valen, y el desbordamiento del contador', () => {
  assert.throws(() => chacha20(new Uint8Array(31), new Uint8Array(12), 0, new Uint8Array(1)), RangeError);
  assert.throws(() => chacha20(new Uint8Array(32), new Uint8Array(8), 0, new Uint8Array(1)), RangeError);
  assert.throws(() => chacha20(new Uint8Array(32), new Uint8Array(12), -1, new Uint8Array(1)), RangeError);
  assert.throws(() => chacha20(new Uint8Array(32), new Uint8Array(12), 0xffffffff, new Uint8Array(65)), RangeError);
  assert.throws(() => chacha20(new Uint8Array(32), new Uint8Array(12), 0, 'texto'), TypeError);
});
