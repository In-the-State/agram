// El codificador de QR de retoques/qr.mjs contra vectores conocidos del estándar (ISO/IEC 18004) y contra una
// descodificación independiente escrita aquí: patrones fijos, información de formato y de versión, síndromes de
// Reed-Solomon a cero y el texto leído de vuelta. Todo inventado; ninguna llave real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codificar, reedSolomon, bitsDeFormato, bitsDeVersion, penalizacion } from '../retoques/qr.mjs';

// ---------- un GF(256) propio para los síndromes ----------
const EXP = [];
const LOG = [];
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x = (x << 1) ^ (x & 0x80 ? 0x11d : 0); x &= 0xff; }
const mul = (a, b) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);
/** Los síndromes de un bloque (datos ‖ corrección) en α⁰…αⁿ⁻¹: todos 0 si el bloque es una palabra del código. */
const sindromes = (bloque, n) => Array.from({ length: n }, (_, i) => bloque.reduce((s, c) => mul(s, EXP[i]) ^ c, 0));

// ---------- la tabla de bloques, escrita aquí aparte (tabla 9 del estándar) ----------
const TABLA = {
  '1M': [10, [[1, 16]]], '1L': [7, [[1, 19]]], '2M': [16, [[1, 28]]], '5M': [24, [[2, 43]]], '6L': [18, [[2, 68]]],
  '7M': [18, [[4, 31]]], '7L': [20, [[2, 78]]], '8M': [22, [[2, 38], [2, 39]]], '10M': [26, [[4, 43], [1, 44]]], '10L': [18, [[2, 68], [2, 69]]],
};
const ALIN = { 1: [], 2: [6, 18], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 10: [6, 28, 50] };

/** Una descodificación independiente: de la matriz al texto, comprobando todo por el camino. */
function descodificar(m) {
  const n = m.length;
  const v = (n - 17) / 4;
  assert.ok(Number.isInteger(v) && v >= 1, 'tamaño de una versión');
  // Patrones de posición (con su separador claro) en las tres esquinas.
  for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
      const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      assert.equal(m[y0 + dy][x0 + dx], d !== 2, 'patrón de posición en ' + x0 + ',' + y0);
    }
  }
  for (let i = 0; i < 8; i++) {
    assert.equal(m[7][i], false); assert.equal(m[i][7], false); // arriba a la izquierda
    assert.equal(m[7][n - 1 - i], false); assert.equal(m[i][n - 8], false); // arriba a la derecha
    assert.equal(m[n - 8][i], false); assert.equal(m[n - 1 - i][7], false); // abajo a la izquierda
  }
  // Temporización y módulo oscuro.
  for (let i = 8; i < n - 8; i++) { assert.equal(m[6][i], i % 2 === 0, 'temporización'); assert.equal(m[i][6], i % 2 === 0); }
  assert.equal(m[n - 8][8], true, 'el módulo oscuro');
  // Alineamiento.
  const c = ALIN[v];
  const centros = [];
  for (const cy of c) for (const cx of c) if (!((cx === 6 && cy === 6) || (cx === 6 && cy === n - 7) || (cx === n - 7 && cy === 6))) centros.push([cx, cy]);
  for (const [cx, cy] of centros) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) assert.equal(m[cy + dy][cx + dx], Math.max(Math.abs(dx), Math.abs(dy)) !== 1, 'alineamiento');
  // Formato: las dos copias, iguales, y una de las 32 palabras válidas.
  const leer = (pos) => pos.reduce((a, [x, y], i) => a | ((m[y][x] ? 1 : 0) << i), 0);
  const copia1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const copia2 = [...Array.from({ length: 8 }, (_, i) => [n - 1 - i, 8]), ...Array.from({ length: 7 }, (_, i) => [8, n - 7 + i])];
  const f1 = leer(copia1);
  assert.equal(leer(copia2), f1, 'las dos copias del formato');
  const f = f1 ^ 0x5412;
  const datosFormato = f >>> 10;
  let resto = datosFormato << 10;
  for (let i = 14; i >= 10; i--) if (resto & (1 << i)) resto ^= 0x537 << (i - 10);
  assert.equal(f & 0x3ff, resto, 'el BCH del formato');
  const nivel = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' }[datosFormato >>> 3];
  const mascara = datosFormato & 7;
  // Versión (7 en adelante): las dos copias y su BCH.
  const reservado = Array.from({ length: n }, () => new Array(n).fill(false));
  const reservar = (x, y) => { reservado[y][x] = true; };
  if (v >= 7) {
    let a = 0;
    let b = 0;
    for (let i = 0; i < 18; i++) { if (m[Math.floor(i / 3)][n - 11 + (i % 3)]) a |= 1 << i; if (m[n - 11 + (i % 3)][Math.floor(i / 3)]) b |= 1 << i; reservar(n - 11 + (i % 3), Math.floor(i / 3)); reservar(Math.floor(i / 3), n - 11 + (i % 3)); }
    assert.equal(a, b, 'las dos copias de la versión');
    assert.equal(a >>> 12, v, 'la versión dice la versión');
    let r = a;
    for (let i = 17; i >= 12; i--) if (r & (1 << i)) r ^= 0x1f25 << (i - 12);
    assert.equal(r, 0, 'el BCH de la versión');
  }
  // Las zonas de función, marcadas aquí aparte.
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) reservar(x, y);
  for (let y = 0; y < 9; y++) for (let x = n - 8; x < n; x++) reservar(x, y);
  for (let y = n - 8; y < n; y++) for (let x = 0; x < 9; x++) reservar(x, y);
  for (let i = 0; i < n; i++) { reservar(i, 6); reservar(6, i); }
  for (const [cx, cy] of centros) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) reservar(cx + dx, cy + dy);
  // Los bits, en zigzag, sin la máscara.
  const MASK = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0][mascara];
  const bits = [];
  let arriba = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < n; k++) {
      const y = arriba ? n - 1 - k : k;
      for (const x of [col, col - 1]) if (!reservado[y][x]) bits.push((m[y][x] !== MASK(x, y)) ? 1 : 0);
    }
    arriba = !arriba;
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // Desentrelazar y comprobar cada bloque.
  const [ec, grupos] = TABLA[v + nivel];
  const largos = grupos.flatMap(([b, d]) => Array(b).fill(d));
  const bloques = largos.map(() => []);
  let i = 0;
  for (let k = 0; k < Math.max(...largos); k++) for (let b = 0; b < largos.length; b++) if (k < largos[b]) bloques[b].push(bytes[i++]);
  for (let k = 0; k < ec; k++) for (let b = 0; b < largos.length; b++) bloques[b].push(bytes[i++]);
  for (const b of bloques) assert.deepEqual(sindromes(b, ec), new Array(ec).fill(0), 'síndromes a cero');
  const datos = bloques.flatMap((b, k) => b.slice(0, largos[k]));
  // Modo byte, longitud y texto.
  const flujo = datos.flatMap((b) => Array.from({ length: 8 }, (_, k) => (b >>> (7 - k)) & 1));
  const tomar = (pos, nb) => flujo.slice(pos, pos + nb).reduce((a, b) => (a << 1) | b, 0);
  assert.equal(tomar(0, 4), 0b0100, 'modo byte');
  const lb = v <= 9 ? 8 : 16;
  const largo = tomar(4, lb);
  const texto = new TextDecoder().decode(new Uint8Array(Array.from({ length: largo }, (_, k) => tomar(4 + lb + 8 * k, 8))));
  return { texto, version: v, nivel, mascara };
}

test('qr: Reed-Solomon, formato y versión contra los vectores conocidos del estándar', () => {
  // ISO/IEC 18004, anexo I: «01234567», 1-M.
  assert.deepEqual(reedSolomon([16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17], 10), [165, 36, 212, 193, 237, 54, 199, 135, 44, 85]);
  // «HELLO WORLD», 1-M (el ejemplo de siempre en modo alfanumérico).
  assert.deepEqual(reedSolomon([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  // Formato: tabla C.1 (M, máscara 0; L, máscara 4) y versión 7: anexo D (000111110010010100).
  assert.equal(bitsDeFormato('M', 0).toString(2).padStart(15, '0'), '101010000010010');
  assert.equal(bitsDeFormato('L', 4).toString(2).padStart(15, '0'), '110011000101111');
  assert.equal(bitsDeVersion(7).toString(2).padStart(18, '0'), '000111110010010100');
  assert.equal(bitsDeVersion(10).toString(2).padStart(18, '0'), '001010010011010011');
});

test('qr: versión 1 y las grandes se leen de vuelta con la descodificación independiente; la máscara es la de menor penalización', () => {
  const casos = [
    ['HOLA', 'M', 1],
    ['hola, móvil', 'L', 1],
    ['https://retoques-inventado.example.invalid/#llave=' + '0123456789abcdef'.repeat(4), 'M', 7],
    ['https://retoques-inventado.example.invalid/#llave=' + '0123456789abcdef'.repeat(4), 'L', 6],
    ['x'.repeat(150), 'M', 8],
    ['y'.repeat(213), 'M', 10],
    ['z'.repeat(250), 'L', 10],
  ];
  for (const [texto, correccion, version] of casos) {
    const q = codificar(texto, { correccion });
    assert.equal(q.version, version, texto.slice(0, 20) + ' ' + correccion);
    const d = descodificar(q.modulos);
    assert.deepEqual([d.texto, d.version, d.nivel, d.mascara], [texto, version, correccion, q.mascara]);
    // Con cada una de las ocho máscaras se lee igual; la elegida es la de menor penalización.
    const penas = [];
    for (let k = 0; k < 8; k++) {
      const otra = codificar(texto, { correccion, mascara: k });
      assert.equal(descodificar(otra.modulos).texto, texto, 'máscara ' + k);
      penas.push(penalizacion(otra.modulos));
    }
    assert.equal(q.mascara, penas.indexOf(Math.min(...penas)));
  }
  assert.throws(() => codificar('w'.repeat(300), { correccion: 'M' }), /no caben/);
  assert.throws(() => codificar('a', { correccion: 'H' }), /L o M/);
});
