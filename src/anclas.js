// T, el sistema de las anclas (VG 16-11, state/ANCLAJE_EN_CASCADA.md §7.8; agram-equipo/T_Y_CASCADA_2026-11-16.md,
// «Propuesta de regla»; encargo A18 «T, el sistema de las anclas»). La escala del T real que quema el autor de un registro
// al escribirlo es lo que el registro PIDE: segundo, minuto, hora y día piden los niveles 1 a 4 de epoch.7.6 (por
// posición: la escala k pide el nivel k), cada uno en un periodo de su escala desde el instante del registro; semana,
// ciclo y año piden el último nivel en siete días, 28 días o un año (los segundos de su escala en epoch.7.0). Si quema de
// varias escalas, cuenta el nivel más alto y, a igual nivel, el plazo más corto.
//
// Es una LECTURA, no una regla de validez: nada se rechaza por esto, y «firm», «sealed» y la capa exigida no cambian.
// Aquí están las dos fórmulas de la época 0 (las lecturas «asked» y «on time», que no se materializan en ninguna posición:
// el 6.8 de un registro ya está lleno) y la cuenta en JavaScript que el contrato hace con lo que no cabe en el BQL mínimo
// (el «ahora», lo colgado con «ask for more firmness» y el suelo de epoch.7.5). Nada de esto toca la fórmula de «sealed»
// ni la parte «cascada» de src/sello.js.

import { POSICIONES_DEL_SELLO, CAPAS_DE_LA_FORMULA } from './sello.js';
import { ESCALAS_REALES, movimientosReales } from './tokens.js';
import { deHex } from './cripto.js';

/** El nombre de la plantilla de transacción que pide más firmeza para un registro ya escrito (época 0, PV 1). */
export const PEDIR_MAS_FIRMEZA = 'ask for more firmness';

/** Los nombres de las dos lecturas de la época 0. */
export const LECTURA_PEDIDO = 'asked';
export const LECTURA_A_TIEMPO = 'on time';

/** Los estados de un pedido (contrato.firmeza: pedidos[].estado y plazo). */
export const ESTADOS_DEL_PEDIDO = Object.freeze(['a tiempo', 'pendiente', 'fuera de plazo']);

// ---------- las fórmulas de la época ----------

/** La prueba copiada (el sello de tiempo en X.6.8.2), como la leen «sealed» y «firm». */
const selloDe = (p) => '(first ((first it.6).8.2 where "' + p.marca + '" in it2.' + p.clase + '))';

/** La quema de T real del autor del registro (el coste de escribir: el criterio de «firm» y de «writing burns today's T»), con `x` el movimiento. */
const quema = (x) => 'T in ' + x + '.0.0.0 and burn in ' + x + '.4 and count epoch.7.0.(' + x + '.0.0.1) = 1 and ' + x + '.3.0 = first it.3';
/** ¿Quema el autor T real de alguna escala que cumpla `cond` (sobre el índice de la escala, `x.0.0.1`)? `x` es el nombre del movimiento en el where. */
const quemaDe = (x, ...conds) => 'count (it.1 where ' + quema(x) + conds.map((c) => ' and ' + x + '.0.0.1 ' + c).join('') + ') > 0';

/**
 * La fórmula de la lectura «asked» (el nivel que pide un registro por su quema propia): el más alto de los niveles de
 * epoch.7.6.1 que pide alguna de sus quemas de T real (la escala k pide el nivel k; las de más arriba, el último). Lee los
 * niveles por posición, desplegada para CAPAS_DE_LA_FORMULA niveles (BQL no tiene bucles; como «firm»). Sin quema, nada.
 */
export function formulaDelPedido() {
  const ramas = Array.from({ length: CAPAS_DE_LA_FORMULA }, (_, k) => 'it2 = nth ' + k + ' epoch.7.6.1 and ' + quemaDe('it3', '>= ' + k));
  return '=last (epoch.7.6.1 where ' + ramas.join(' or ') + ')';
}

/**
 * La fórmula de la lectura «on time»: ¿ha llegado el registro al nivel que pide su quema propia dentro de su plazo? Verdadera
 * si algún nivel a la altura del pedido o por encima está alcanzado (como en «firm») con un instante no posterior al plazo
 * (el instante del registro más los segundos de la escala elegida, epoch.7.0.k.1). El instante de cada nivel: el recibo de
 * llegada (X.6.8.1) o la hora de la cabecera de un eslabón de nivel 1 para el primero; la hora de la cabecera de un eslabón
 * de ese nivel (9.j.0.4) para los de en medio; la hora del bloque (la de la cabecera de Bitcoin copiada, 7.0) para el último.
 * Sin alcanzar, o alcanzado tarde, falsa (lo que distingue «pendiente» de «fuera de plazo» es el ahora: el contrato). Desplegada
 * para las siete escalas reales de epoch.7.0 y para CAPAS_DE_LA_FORMULA niveles; los eslabones, de uno en uno (9.0 a 9.9).
 */
export function formulaATiempo(p = POSICIONES_DEL_SELLO) {
  const S = selloDe(p);
  const n = CAPAS_DE_LA_FORMULA;
  const ultima = n - 1;
  const capa = (k) => '(nth ' + k + ' epoch.7.6.1)';
  const instante = 'first (first it.6).0.0';
  const sellado = 'count (first it.6).8.2 > 0 and first (first it.6).8.5';
  const recibidoA = (D) => 'count (first it.6).8.1 > 0 and first (first it.6).8.4 and first (first (first it.6).8.1).0 <= ' + D;
  const eslabonA = (k, D) => '"' + p.cascada + '" in ' + S + '.' + p.via + ' and (' + Array.from({ length: 10 }, (_, j) => {
    const e = S + '.' + p.cadena + '.' + j;
    return capa(k) + ' in (first ' + e + '.' + p.eslabon.nivel + ') and first ' + e + '.' + p.eslabon.cabecera + '.' + p.cabeceraDeLote.hora + ' <= ' + D;
  }).join(' or ') + ')';
  const bloqueA = (D) => 'first (cabecera(bytes(first ' + S + '.' + p.cabecera + '))).4 <= ' + D;
  // El nivel k alcanzado con un instante no posterior a D.
  const alcanzadoA = (k, D) => (k === ultima ? '(' + sellado + ' and ' + bloqueA(D) + ')'
    : k === 0 ? '((' + eslabonA(k, D) + ') or ' + recibidoA(D) + ')'
      : '(' + sellado + ' and ' + eslabonA(k, D) + ')');
  const ramas = [];
  for (let s = 0; s < ESCALAS_REALES.length; s++) {
    const pedido = Math.min(s, ultima);
    // La escala elegida: la del nivel más alto y, a igual nivel (el último), la del plazo más corto.
    const elegida = s >= ultima
      ? quemaDe('it2', '= ' + s) + (s > ultima ? ' and not (' + quemaDe('it2', '>= ' + ultima, '< ' + s) + ')' : '')
      : quemaDe('it2', '= ' + s) + ' and not (' + quemaDe('it2', '> ' + s) + ')';
    const D = '(' + instante + ' + first epoch.7.0.' + s + '.1)';
    const a = Array.from({ length: n - pedido }, (_, i) => alcanzadoA(pedido + i, D)).join(' or ');
    ramas.push('(' + elegida + ' and (' + a + '))');
  }
  return '=' + ramas.join(' or ');
}

// ---------- la misma cuenta en JavaScript (lo que el contrato hace con lo colgado, el suelo y el ahora) ----------

/** La escala que elige una quema de varias: la del nivel más alto y, a igual nivel, la del plazo más corto. `indices` de epoch.7.0. */
export function escalaElegida(indices, niveles = CAPAS_DE_LA_FORMULA) {
  const ultima = niveles - 1;
  const reales = [...new Set(indices.filter((k) => Number.isSafeInteger(k) && k >= 0 && k < ESCALAS_REALES.length))];
  if (!reales.length) return null;
  const arriba = reales.filter((k) => k >= ultima);
  return arriba.length ? Math.min(...arriba) : Math.max(...reales);
}

/** Los índices (de epoch.7.0) de las escalas de T real que quema el autor de un registro (lo que no está anunciado). */
export function escalasQuemadas(ev) {
  return movimientosReales(ev)
    .filter((m) => m && m.token === 'T' && (m.a === null || m.a === undefined) && m.de === ev.autor && ESCALAS_REALES.includes(m.escala) && Number(m.cantidad) > 0)
    .map((m) => ESCALAS_REALES.indexOf(m.escala));
}

/** ¿Es un registro escrito con «ask for more firmness»? Su 4 (la acción) lo nombra. */
export function esPeticionDeFirmeza(ev) {
  const cuatro = Array.isArray(ev?.payload) ? ev.payload[4] : undefined;
  return (Array.isArray(cuatro) ? cuatro : [cuatro]).includes(PEDIR_MAS_FIRMEZA);
}

/** La hora (segundos Unix) de una cabecera de Bitcoin de 80 bytes en hex (sus bytes 68 a 71, little-endian), o null. */
export function horaDeCabecera(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]{160}$/.test(hex)) return null;
  const b = deHex(hex);
  return b[68] + b[69] * 256 + b[70] * 65536 + b[71] * 16777216;
}
