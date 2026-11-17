// Sellos en cascada y recibos de llegada INVENTADOS para los ejemplos (encargo A18, ejemplo «firmeza»), sacados de las
// ayudas de prueba (test/ayudas-sello.js las usa de aquí) a un módulo que no es de pruebas y que no importa ninguna
// simulación (servidor/ no se publica): solo src/. Cada sello es completo y se comprueba de verdad con la regla «sealed»
// (X.6.8.5): la décupla del SIP 0 por la vía «cascada», con cada eslabón una cabecera de lote v2 firmada con su clave
// (BIP-340), la de arriba firmada por el observador; su hash, comprometido en la hoja OP_RETURN del árbol Taproot de la
// salida 0 de una transacción de anclaje; y una cabecera de Bitcoin de 80 bytes con prueba de trabajo de regtest (la más
// fácil) cuya raíz de Merkle es la de esa transacción, firmada con su altura por el observador. Las claves las da quien
// llama (inventadas) o se generan: nada real, nada sale de la máquina.

import { schnorr } from '../../src/vendor/noble-secp256k1.js';
import { sha256, sha256d, hashEtiquetado, concatenar, deHex, aHex, tapleaf, taptweak } from '../../src/cripto.js';
import { generarClaves } from '../../src/autoridad.js';
import { decuplaDeSello, decuplaDeCabecera, leerCabeceraDeLote, ETIQUETA_DEL_OBSERVADOR } from '../../src/sello.js';

/** El libro de las cabeceras si no se da otro (32 bytes de relleno). */
export const LIBRO_DE_EJEMPLO = '1b'.repeat(32);
/** La hora (segundos Unix) de la primera cabecera de lote si no se da otra; la de cada eslabón de encima, un minuto más. */
export const HORA_DE_EJEMPLO = 1794830400;

/** Los bits de regtest: el objetivo más fácil (la mitad de los hashes lo cumplen). */
const BITS = 0x207fffff;
const OBJETIVO = (() => { const o = new Uint8Array(32); o[0] = 0x7f; o[1] = 0xff; o[2] = 0xff; return o; })();

const le = (n, bytes) => Uint8Array.from({ length: bytes }, (_, k) => Number((BigInt(n) >> BigInt(8 * k)) & 0xffn));
const leHex = (n, bytes) => aHex(le(n, bytes));
const menor = (a, b) => { for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k]; return false; };
const utf8 = (t) => new TextEncoder().encode(t);
/** Hex de 32 bytes derivado de un texto (ids, txids y entradas de relleno). */
const de = (texto) => aHex(sha256(utf8(texto)));

/** Una cabecera de Bitcoin de 80 bytes con esa raíz de Merkle (orden interno) y prueba de trabajo de regtest. */
export function cabeceraCon(raiz, { instante = '2026-11-10T11:00:00.000Z', anterior = new Uint8Array(32) } = {}) {
  const hora = Math.floor(Date.parse(instante) / 1000);
  for (let nonce = 0; ; nonce++) {
    const c = concatenar(le(1, 4), anterior, raiz, le(hora, 4), le(BITS, 4), le(nonce, 4));
    if (menor(sha256d(c).slice().reverse(), OBJETIVO)) return c;
  }
}

/**
 * La raíz de Merkle «bitcoin» de unos txids (orden interno; doble SHA-256; el impar se duplica) y los pasos (append o
 * prepend del hermano y dos sha256 por nivel) del de la posición k a la raíz.
 */
export function merkleBitcoin(txids, k) {
  let nivel = txids.map(deHex);
  const pasos = [];
  let i = k;
  while (nivel.length > 1) {
    if (nivel.length % 2) nivel = [...nivel, nivel[nivel.length - 1]];
    const hermano = i % 2 ? nivel[i - 1] : nivel[i + 1];
    pasos.push([i % 2 ? 'prepend' : 'append', aHex(hermano)], ['sha256'], ['sha256']);
    const siguiente = [];
    for (let a = 0; a < nivel.length; a += 2) siguiente.push(sha256d(concatenar(nivel[a], nivel[a + 1])));
    nivel = siguiente;
    i = Math.floor(i / 2);
  }
  return { raiz: nivel[0], pasos };
}

/**
 * El árbol «sip» de unos ids (SIP 0; src/cripto.js raizMerkle): hoja SHA-256(0x00 ‖ id), nodo SHA-256(0x01 ‖ izq ‖ der), el
 * impar sube tal cual. `ids` ordenados y sin repetir. → { raiz (hex), caminos: Map id → [[lado, hermano]] } («i» si el
 * hermano va a la izquierda, «d» si a la derecha).
 */
export function arbolSip(ids) {
  if (!ids.length) throw new RangeError('un lote vacío no tiene raíz');
  let nivel = ids.map((id) => sha256(concatenar(Uint8Array.of(0x00), deHex(id))));
  const indices = ids.map((_, k) => k);
  const caminos = ids.map(() => []);
  while (nivel.length > 1) {
    const siguiente = [];
    for (let p = 0; p < nivel.length; p += 2) siguiente.push(p + 1 < nivel.length ? sha256(concatenar(Uint8Array.of(0x01), nivel[p], nivel[p + 1])) : nivel[p]);
    for (let k = 0; k < ids.length; k++) {
      const pos = indices[k];
      const par = pos ^ 1;
      if (par < nivel.length) caminos[k].push([pos % 2 === 0 ? 'd' : 'i', aHex(nivel[par])]);
      indices[k] = pos >> 1;
    }
    nivel = siguiente;
  }
  return { raiz: aHex(nivel[0]), caminos: new Map(ids.map((id, k) => [id, caminos[k]])) };
}

/**
 * El anclaje de una sola raíz por Taproot (la hoja de compromiso OP_RETURN <raíz> es todo el árbol: sin hermanos): la clave de
 * salida es TapTweak(interna, hoja) y la transacción, una entrada (`previa`:0) y una salida P2TR de 330 sat a esa clave,
 * serializada como Bitcoin (sin testigo). → { tx (hex), txid (hex, orden interno) }.
 */
export function anclarRaiz(raiz, { interna, previa }) {
  const hoja = tapleaf(deHex('6a20' + raiz));
  const clave = aHex(taptweak(deHex(interna), hoja, []));
  const tx = '02000000' + '01' + previa + '00000000' + '00' + 'fdffffff' + '01' + leHex(330, 8) + '22' + '5120' + clave + '00000000';
  return { tx, txid: aHex(sha256d(deHex(tx))) };
}

/**
 * Una cabecera de lote v2 del SIP 0 («El sello en cascada» §1) firmada con `claves`: { cabecera (la forma JSON, con su
 * firma), decupla, hash }. `anterior` y `referencias`, 32 bytes a cero si no se dan.
 */
export function cabeceraDeLoteFirmada({ numero = 0, anterior = '00'.repeat(32), raiz, hora = HORA_DE_EJEMPLO, libro = LIBRO_DE_EJEMPLO, referencias = '00'.repeat(32) }, claves) {
  const sinFirma = { numero, anterior, raiz, hora, clave: claves.publica, libro, referencias, firma: '00'.repeat(64) };
  const { hash } = leerCabeceraDeLote(decuplaDeCabecera(sinFirma));
  const cabecera = { ...sinFirma, firma: aHex(schnorr.sign(deHex(hash), deHex(claves.privada), new Uint8Array(32))) };
  return { cabecera, decupla: decuplaDeCabecera(cabecera), hash };
}

/**
 * El sello EN CASCADA completo de `id` para eje.marcarSello: { altura, hash, instante, verificado: true, decupla, prueba,
 * cabeceras }. `capas` son los eslabones de abajo arriba ([{ nivel, grado?, red?, claves?, numero?, anterior?, libro?, hora?,
 * otros?, ids? }]: `claves` las del emisor de ese nivel, generadas si no se dan; `hora` la de su cabecera, en segundos Unix
 * (por defecto HORA_DE_EJEMPLO más un minuto por eslabón); `otros`, cuántos ids más van en su lote; `ids`, cuáles); la de
 * arriba la firma el observador (la clave declarada). `libro` es el de las cabeceras que no dicen otro (el id del génesis del
 * eje que las lee: «sealed» y «firm» exigen que la primera nombre este libro; VG 17-11). `instante` es la hora del bloque. `cambiar(prueba)` deja tocar la
 * prueba antes de hacer la décupla.
 */
export async function selloEnCascada(id, { altura = 1, instante = '2026-11-10T11:00:00.000Z', observador, capas = [{ nivel: 4 }], libro = LIBRO_DE_EJEMPLO, interna, otrasTx = 0, cambiar } = {}) {
  let x = id;
  let lote = null;
  const cadena = [];
  const cabeceras = [];
  for (const [k, c] of capas.entries()) {
    const claves = k === capas.length - 1 ? observador : (c.claves ?? (await generarClaves()));
    const ids = [...new Set([x, ...(c.ids ?? []), ...Array.from({ length: c.otros ?? 0 }, (_, i) => de('otro id ' + k + ' ' + i + ' ' + x))])].sort();
    const { raiz, caminos } = arbolSip(ids);
    if (k === 0) lote = raiz;
    const h = cabeceraDeLoteFirmada({ numero: c.numero ?? 0, anterior: c.anterior, raiz, hora: c.hora ?? HORA_DE_EJEMPLO + 60 * k, libro: c.libro ?? libro }, claves);
    cadena.push({ cabecera: h.cabecera, nivel: c.nivel, camino: caminos.get(x), ...(c.grado !== undefined ? { grado: c.grado } : {}), ...(c.red !== undefined ? { red: c.red } : {}) });
    cabeceras.push(h);
    x = h.hash;
  }
  const internaDeEjemplo = interna ?? (await generarClaves()).publica;
  const ancla = anclarRaiz(x, { interna: internaDeEjemplo, previa: de('previa ' + x) });
  const bloque = merkleBitcoin([ancla.txid, ...Array.from({ length: otrasTx }, (_, k) => de('otra tx ' + k))], 0);
  const cabecera = cabeceraCon(bloque.raiz, { instante });
  const alturaLe = le(altura, 4);
  const firma = schnorr.sign(hashEtiquetado(ETIQUETA_DEL_OBSERVADOR, concatenar(cabecera, alturaLe)), deHex(observador.privada), new Uint8Array(32));
  const prueba = {
    altura, hash: aHex(sha256d(cabecera)), instante, lote, compromiso: x,
    prueba: {
      via: 'cascada', cadena,
      taproot: { tx: ancla.tx, vout: 0, interna: internaDeEjemplo, hermanos: [] },
      pasos: bloque.pasos, cabecera: aHex(cabecera), observador: { clave: observador.publica, firma: aHex(firma), altura_le: aHex(alturaLe) },
    },
  };
  if (cambiar) cambiar(prueba);
  return { altura: prueba.altura, hash: prueba.hash, instante: prueba.instante, verificado: true, decupla: decuplaDeSello(prueba, id), prueba, cabeceras };
}

/**
 * Un recibo de llegada (X.6.8.1) para eje.marcarRecibo, firmado por un relé inventado (`rele`: { publica, privada }): la firma
 * BIP-340 del relé sobre el id del recibo (aquí, uno derivado de `semilla`).
 */
export function reciboFirmado(rele, { instante = '2026-11-10T10:30:00.000Z', semilla = instante } = {}) {
  const recibo = de('recibo de prueba ' + semilla);
  return { instante, rele: rele.publica, firma: aHex(schnorr.sign(deHex(recibo), deHex(rele.privada), new Uint8Array(32))), recibo };
}
