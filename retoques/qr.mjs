// Un codificador de QR propio (ISO/IEC 18004), puro y sin dependencias: modo byte, corrección L o M, versiones 1 a 10.
// Lo usa retoques/movil.html para enseñar en el PC la dirección pública con la llave, que el móvil lee con su cámara
// (VG 17-11: la llave no se teclea ni viaja por chat). Devuelve la matriz de módulos; pintarla es cosa de quien la usa.
//
//   codificar(texto, { correccion = 'M', version = null }) → { version, correccion, mascara, tamano, modulos }
//     modulos: tamano × tamano booleanos (true = oscuro), sin la zona en blanco (que pinta quien la usa: 4 módulos).
//     La versión es la menor que cabe (o la dada); la máscara, la de menor penalización según las cuatro reglas del
//     estándar (§7.8.3). Lanza un error si el texto no cabe en la versión 10.
//
// Exporta también las piezas que comprueban las pruebas: reedSolomon, bitsDeFormato, bitsDeVersion, BLOQUES,
// ALINEAMIENTO, mascaraEn.

/** Por versión (1 a 10) y corrección: [codewords de corrección por bloque, [bloques, datos por bloque], …]. Tabla 9 del estándar. */
export const BLOQUES = Object.freeze({
  L: [null, [7, [1, 19]], [10, [1, 34]], [15, [1, 55]], [20, [1, 80]], [26, [1, 108]], [18, [2, 68]], [20, [2, 78]], [24, [2, 97]], [30, [2, 116]], [18, [2, 68], [2, 69]]],
  M: [null, [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]], [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]],
});

/** Los centros de los patrones de alineamiento por versión (Anexo E). */
export const ALINEAMIENTO = Object.freeze([null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]);

/** Los dos bits del nivel de corrección en la información de formato. */
const NIVEL = Object.freeze({ L: 1, M: 0 });
export const VERSION_MAXIMA = 10;

// ---------- GF(256) y Reed-Solomon (polinomio primitivo 0x11D) ----------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** El polinomio generador de grado n: (x − α⁰)(x − α¹)…(x − αⁿ⁻¹), coeficientes de mayor a menor grado (sin el 1 inicial). */
function generador(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const nuevo = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      nuevo[j] ^= g[j];
      nuevo[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = nuevo;
  }
  return g.slice(1);
}

/** Los `n` codewords de corrección de `datos` (el resto de la división por el generador). */
export function reedSolomon(datos, n) {
  const g = generador(n);
  const resto = new Array(n).fill(0);
  for (const d of datos) {
    const factor = d ^ resto.shift();
    resto.push(0);
    for (let i = 0; i < n; i++) resto[i] ^= mul(g[i], factor);
  }
  return resto;
}

// ---------- información de formato y de versión ----------

/** Los 15 bits de formato (ya con la máscara 101010000010010) para una corrección y una máscara. */
export function bitsDeFormato(correccion, mascara) {
  const datos = (NIVEL[correccion] << 3) | mascara;
  let r = datos;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  return ((datos << 10) | r) ^ 0x5412;
}

/** Los 18 bits de versión (versiones 7 en adelante). */
export function bitsDeVersion(version) {
  let r = version;
  for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
  return (version << 12) | r;
}

// ---------- las máscaras (§7.8.2): x es la columna, y la fila ----------

const MASCARAS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
/** ¿Invierte la máscara `m` el módulo de la columna x y la fila y? */
export const mascaraEn = (m, x, y) => MASCARAS[m](x, y);

// ---------- los datos ----------

const capacidad = (version, correccion) => {
  const [, ...grupos] = BLOQUES[correccion][version];
  return grupos.reduce((s, [b, d]) => s + b * d, 0);
};

/** Los codewords de datos en modo byte: modo, longitud, bytes, terminador, relleno hasta la capacidad. */
function codewordsDeDatos(bytes, version, correccion) {
  const bits = [];
  const poner = (valor, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  poner(0b0100, 4);
  poner(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) poner(b, 8);
  const total = capacidad(version, correccion) * 8;
  if (bits.length > total) return null;
  poner(0, Math.min(4, total - bits.length));
  while (bits.length % 8) bits.push(0);
  const salida = [];
  for (let i = 0; i < bits.length; i += 8) salida.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let k = 0; salida.length < total / 8; k++) salida.push(k % 2 === 0 ? 0xec : 0x11);
  return salida;
}

/** Los codewords finales: los datos partidos en bloques, cada uno con su corrección, entrelazados (§7.6). */
function entrelazar(datos, version, correccion) {
  const [ec, ...grupos] = BLOQUES[correccion][version];
  const bloques = [];
  let i = 0;
  for (const [n, d] of grupos) for (let b = 0; b < n; b++) { bloques.push(datos.slice(i, i + d)); i += d; }
  const correcciones = bloques.map((b) => reedSolomon(b, ec));
  const salida = [];
  const largo = Math.max(...bloques.map((b) => b.length));
  for (let k = 0; k < largo; k++) for (const b of bloques) if (k < b.length) salida.push(b[k]);
  for (let k = 0; k < ec; k++) for (const c of correcciones) salida.push(c[k]);
  return salida;
}

// ---------- la matriz ----------

function matrizBase(version) {
  const n = 17 + 4 * version;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fija = Array.from({ length: n }, () => new Array(n).fill(false));
  const poner = (x, y, v) => { m[y][x] = v; fija[y][x] = true; };
  // Los tres patrones de posición con su separador.
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      poner(x, y, d !== 2 && d !== 4);
    }
  }
  // Los de alineamiento (no encima de los de posición).
  const c = ALINEAMIENTO[version];
  for (const cy of c) for (const cx of c) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === n - 7) || (cx === n - 7 && cy === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poner(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // Los de temporización.
  for (let i = 8; i < n - 8; i++) { poner(i, 6, i % 2 === 0); poner(6, i, i % 2 === 0); }
  // Las zonas de formato (se escriben después) y el módulo oscuro.
  for (let i = 0; i < 9; i++) { if (!fija[8][i]) poner(i, 8, false); if (!fija[i][8]) poner(8, i, false); }
  for (let i = 0; i < 8; i++) { poner(n - 1 - i, 8, false); poner(8, n - 1 - i, false); }
  poner(8, n - 8, true);
  // La información de versión (7 en adelante).
  if (version >= 7) {
    const v = bitsDeVersion(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((v >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      poner(a, b, bit);
      poner(b, a, bit);
    }
  }
  return { n, m, fija };
}

/** Escribe los 15 bits de formato en sus dos copias. */
function ponerFormato(m, n, correccion, mascara) {
  const f = bitsDeFormato(correccion, mascara);
  const bit = (i) => ((f >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) m[8][n - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) m[n - 15 + i][8] = bit(i);
  m[n - 8][8] = true;
}

/** Coloca los codewords en zigzag (§7.7.3), de abajo a la derecha, por parejas de columnas, saltando la 6. */
function colocar(m, fija, n, codewords) {
  let i = 0;
  const total = codewords.length * 8;
  for (let derecha = n - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5;
    for (let v = 0; v < n; v++) {
      for (let j = 0; j < 2; j++) {
        const x = derecha - j;
        const subiendo = ((derecha + 1) & 2) === 0;
        const y = subiendo ? n - 1 - v : v;
        if (fija[y][x]) continue;
        m[y][x] = i < total ? ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
        i++;
      }
    }
  }
}

/** La penalización de una matriz (§7.8.3): N1 = 3, N2 = 3, N3 = 40, N4 = 10. */
export function penalizacion(m) {
  const n = m.length;
  let p = 0;
  const lineas = [];
  for (let y = 0; y < n; y++) lineas.push(m[y]);
  for (let x = 0; x < n; x++) lineas.push(m.map((fila) => fila[x]));
  const patron1 = [true, false, true, true, true, false, true, false, false, false, false];
  const patron2 = [false, false, false, false, true, false, true, true, true, false, true];
  for (const l of lineas) {
    // N1: tramos de 5 o más módulos iguales.
    let tramo = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && l[i] === l[i - 1]) tramo++;
      else { if (tramo >= 5) p += 3 + (tramo - 5); tramo = 1; }
    }
    // N3: 1:1:3:1:1 con cuatro claros delante o detrás (fuera del símbolo cuenta como claro: la zona en blanco).
    const ext = [false, false, false, false, ...l, false, false, false, false];
    for (let i = 0; i + 11 <= ext.length; i++) {
      if (patron1.every((v, k) => ext[i + k] === v)) p += 40;
      if (patron2.every((v, k) => ext[i + k] === v)) p += 40;
    }
  }
  // N2: bloques de 2×2 del mismo color.
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  // N4: proporción de oscuros: 10 por cada 5 % de desvío del 50 %.
  let oscuros = 0;
  for (const fila of m) for (const v of fila) if (v) oscuros++;
  // (n × n es impar: nunca es justo la mitad; de 45 a 55 % no penaliza.)
  p += Math.max(0, Math.ceil(Math.abs(oscuros * 20 - n * n * 10) / (n * n)) - 1) * 10;
  return p;
}

/** Codifica `texto` (UTF-8, modo byte). → { version, correccion, mascara, tamano, modulos }. */
export function codificar(texto, { correccion = 'M', version = null, mascara = null } = {}) {
  if (!(correccion in NIVEL)) throw new Error('qr: la corrección es L o M');
  const bytes = [...new TextEncoder().encode(String(texto))];
  let v = version;
  let datos = null;
  if (v !== null) {
    if (!Number.isInteger(v) || v < 1 || v > VERSION_MAXIMA) throw new Error('qr: la versión va de 1 a ' + VERSION_MAXIMA);
    datos = codewordsDeDatos(bytes, v, correccion);
  } else {
    for (v = 1; v <= VERSION_MAXIMA; v++) if ((datos = codewordsDeDatos(bytes, v, correccion))) break;
  }
  if (!datos) throw new Error('qr: ' + bytes.length + ' bytes no caben en la versión ' + (version ?? VERSION_MAXIMA) + ' con corrección ' + correccion);
  const codewords = entrelazar(datos, v, correccion);
  const { n, m, fija } = matrizBase(v);
  colocar(m, fija, n, codewords);
  // La máscara: la de menor penalización (o la dada); en empate, la de número menor.
  let mejor = null;
  for (let k = 0; k < 8; k++) {
    if (mascara !== null && k !== mascara) continue;
    const c = m.map((fila, y) => fila.map((val, x) => (fija[y][x] ? val : val !== mascaraEn(k, x, y))));
    ponerFormato(c, n, correccion, k);
    const pena = penalizacion(c);
    if (!mejor || pena < mejor.pena) mejor = { k, c, pena };
  }
  return { version: v, correccion, mascara: mejor.k, tamano: n, modulos: mejor.c };
}
