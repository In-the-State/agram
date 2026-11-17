// Reservar en lugar de entregar (encargo «el P baja con el sí del dueño» y «reservar en lugar de entregar», VG 17-11;
// docs/notas/RESERVA.md). De aquí salen dos fórmulas de la época 0, como las del gobierno (gobierno.mjs) y las del puente
// (puente.mjs):
//
//   · la tercera excepción de «nobody moves tokens of others» (reglas/nobody-moves-tokens-of-others.json), calcada de la
//     invitación y de la vuelta: un movimiento desde otro (liberación o transferencia con salida, nunca hacia quien
//     escribe; o una quema emparejada con lo que el mismo registro libera de una reserva) con la salida en una reserva
//     escrita por el titular de lo que se mueve y que nombra a quien escribe como quien gasta;
//   · la guarda «a reserve is spent as it says» (reglas/a-reserve-is-spent-as-it-says.json): lo que sale de una reserva
//     por mano de quien gasta sale del modo que dice, en «pay» hacia alguien de su lista, nunca hacia quien gasta, y no
//     después de su «hasta cuándo».
//
// Una prueba (test/reserva.test.js) comprueba que los archivos llevan exactamente estas fórmulas. Si cambian, se
// reescriben con
//
//   node datos/epocas/reserva.mjs --escribir    (y luego npm run epocas)

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { formatear } from './generar.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** El nombre de la plantilla de la reserva (lo que dice el 4 del registro que escribe) y el de la guarda. */
export const PLANTILLA_DE_RESERVA = 'a reserve';
export const REGLA_DE_LA_GUARDA = 'a reserve is spent as it says';

/** Dónde dice la reserva quién gasta, de qué modo, a quién paga y hasta cuándo: su payload 3.1, 1.0, 1.1 y 1.2. */
export const QUIEN_GASTA = '3.1';
export const MODOS = '1.0';
export const A_QUIEN_PAGA = '1.1';
export const HASTA = '1.2';

/** El elemento de un where a la profundidad d (it a 0, it2 a 1…). */
const el = (d) => (d === 0 ? 'it' : 'it' + (d + 1));
/** Una salida de un movimiento (un ocupante de su 2) como texto: el id de un registro de este libro, si lo es. */
const S = (x) => '(text(utf8(' + x + ')))';
/** Lo que dice el payload firmado de la reserva en una posición (nunca lo que otros anclan ahí). */
const dice = (R, en) => '(payload(' + R + ')).' + en;

/** La salida `R` es una reserva de este libro escrita por `titular` que nombra a `gasta` como quien gasta. */
export const esReserva = (R, titular, gasta) => 'first ' + R + '.5 = ' + R + ' and "' + PLANTILLA_DE_RESERVA + '" in ' + dice(R, 4)
  + ' and first ' + R + '.3 = ' + titular + ' and first ' + dice(R, QUIEN_GASTA) + ' = ' + gasta;

/**
 * El movimiento `v` (el elemento de un where a la profundidad d) sale con la salida en una reserva de su titular que nombra
 * a quien escribe; con `extra(R)`, una reserva así que además cumple eso.
 */
export const conReserva = (v, d, extra = null) => {
  const R = S(el(d + 1));
  return 'count (' + v + '.2 where ' + esReserva(R, v + '.3.0', 'first ev.3') + (extra ? ' and ' + extra(R, d + 1) : '') + ') > 0';
};

/** La suma de lo que el registro mueve con `primitiva` de la serie de `v` desde su titular (un where a la profundidad d). */
const sumaDe = (primitiva, v, d, extra = '') => {
  const e = el(d);
  return 'sum ((ev.1 where ' + primitiva + ' in ' + e + '.4 and ' + e + '.0 = ' + v + '.0 and ' + e + '.3.0 = ' + v + '.3.0' + (extra ? ' and ' + extra : '') + ') each 1)';
};

/**
 * La tercera excepción de «nobody moves tokens of others» (it = el movimiento, a la profundidad 0): una liberación o una
 * transferencia con la salida en una reserva escrita por su titular que nombra a quien escribe, nunca hacia quien escribe;
 * o una quema desde ese titular de una serie de la que el mismo registro libera, de reservas así, al menos lo que quema
 * (la quema no lleva salida en el núcleo: «burn» es liberar y quemar en el mismo registro).
 */
export function excepcionDeLaReserva() {
  return '(release in it.4 or transfer in it.4) and it.3.1 != first ev.3 and ' + conReserva('it', 0)
    + ' or burn in it.4 and ' + sumaDe('release', 'it', 1, conReserva('it2', 1)) + ' >= ' + sumaDe('burn', 'it', 1);
}

/**
 * Si dice hasta cuándo (su 1.2), ni el instante del registro (que elige quien escribe) ni el reloj del libro antes de él (el
 * mayor instante ya visto, before.6.0, como «at most a year ahead») lo pasan: antedatar no sirve.
 */
const aTiempo = (R) => '(count ' + dice(R, HASTA) + ' = 0 or (first ev.6.0).0 <= (first ' + dice(R, HASTA) + ').0 and (count before.6.0 = 0 or first before.6.0.0 <= (first ' + dice(R, HASTA) + ').0))';

/**
 * La guarda (it = el movimiento, a la profundidad 0): de un titular que no es quien escribe, una liberación o una
 * transferencia que sale de una reserva suya que nombra a quien escribe ha de salir de una reserva así que lo permite: a
 * tiempo, y liberar con «return» (o con «burn», si el registro quema de esa serie y de ese titular al menos lo que libera
 * de él), o transferir con «pay» a alguien de su lista que no es quien escribe; y una quema desde ese titular ha de
 * quedar cubierta por lo que libera, a tiempo, de reservas suyas con «burn» que nombran a quien escribe.
 */
export function formulaDeLaGuarda() {
  const permite = (R, d) => aTiempo(R) + ' and (release in it.4 and ("return" in ' + dice(R, MODOS) + ' or "burn" in ' + dice(R, MODOS)
    + ' and ' + sumaDe('burn', 'it', d + 1) + ' >= ' + sumaDe('release', 'it', d + 1) + ')'
    + ' or transfer in it.4 and "pay" in ' + dice(R, MODOS) + ' and it.3.1 in ' + dice(R, A_QUIEN_PAGA) + ' and it.3.1 != "-" and it.3.1 != first ev.3)';
  const conQuema = (R) => aTiempo(R) + ' and "burn" in ' + dice(R, MODOS);
  // Primero la primitiva (un ocupante del 1 del payload que no es un movimiento no llega a leer su 3).
  return '=count (ev.1 where (release in it.4 or transfer in it.4) and it.3.0 != first ev.3 and ' + conReserva('it', 0)
    + ' and not (' + conReserva('it', 0, permite) + ')'
    + ' or burn in it.4 and it.3.0 != first ev.3 and ' + sumaDe('release', 'it', 1, conReserva('it2', 1, conQuema)) + ' < ' + sumaDe('burn', 'it', 1) + ') = 0';
}

export const ARCHIVO_DEL_SUELO = join(AQUI, 'reglas', 'nobody-moves-tokens-of-others.json');
export const ARCHIVO_DE_LA_GUARDA = join(AQUI, 'reglas', 'a-reserve-is-spent-as-it-says.json');

/** La fórmula de «nobody moves tokens of others» con la tercera excepción, desde la que tiene las dos primeras. */
export function conLaExcepcion(formula) {
  const exc = ' and not (' + excepcionDeLaReserva() + ')';
  if (formula.includes(exc)) return formula;
  if (!formula.endsWith(') = 0')) throw new Error('nobody moves tokens of others: la fórmula no acaba en «) = 0»');
  return formula.slice(0, -') = 0'.length) + exc + ') = 0';
}

// node datos/epocas/reserva.mjs --escribir: pone la tercera excepción en el suelo y la fórmula en la guarda.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv.includes('--escribir')) {
  const poner = (archivo, cambiar) => {
    const registro = JSON.parse(readFileSync(archivo, 'utf8'));
    cambiar(registro);
    writeFileSync(archivo + '.nuevo', formatear(registro) + '\n');
    renameSync(archivo + '.nuevo', archivo);
    console.log('escrita la fórmula de ' + archivo);
  };
  poner(ARCHIVO_DEL_SUELO, (r) => { r[2] = [conLaExcepcion(r[2][0])]; });
  poner(ARCHIVO_DE_LA_GUARDA, (r) => { r[2] = [formulaDeLaGuarda()]; });
}
