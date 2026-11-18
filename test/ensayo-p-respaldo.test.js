// La P puesta detrás de algo (VG 18-11, por Core State; encargo P-3b), en la época de ensayo de P (datos/epocas/ensayo-p/):
//
//   · se libera retirándola, en un «withdraw support» anclado en el registro («what is put behind something is released by
//     withdrawing it»), y de ninguna otra forma;
//   · si el registro ya estaba CERRADO cuando se bloqueó, se queda un ciclo (28 días, epoch.1.1.4.5, en segundos) desde el
//     registro que la bloqueó («backing of what is closed stays a cycle»); si estaba abierto, se retira en el acto y también
//     después de que se cierre;
//   · la lectura «backing» (X.2.4.4) da toda la P que otros tienen detrás de un registro, con o sin punto de vista, y «backing
//     of a person» (A.2.7) la suma de lo que hay detrás de todos los registros de una persona. No miran el criterio del autor.
//
// «Cerrado» = un registro de cierre del dueño anclado en el 4 del registro («close by decision», «close with error», «expire»,
// «close») con su instante no posterior al del bloqueo. No la plantilla «all announced movements happened» sola: esa lee
// cerrada desde que nace una decisión que no anuncia nada, y aquí «abierta» es que nadie la ha cerrado todavía.
//
// Todo inventado: libros en memoria, de demostración. El reloj se mueve dando a cada registro su t (como hacen los demás
// tests: `t` en eje.escribir y en A.transaccion); el ciclo son 2 419 200 s.
//
// Cuentas a mano de la lectura «backing» (libro de `libroDeLecturas`):
//   X de ana:  bea pone 0,88 en el punto de vista 2 de su nota y 0,5 de su nota entera (sin punto de vista); cai pone 1,1 en
//              el punto de vista 7 de la suya; ana bloquea 1 de lo suyo con X como salida (es la autora: no es respaldo)
//              respaldo de X = 0,88 + 0,5 + 1,1 = 2,48
//   Y de ana:  dani pone 3 de su nota entera                                  respaldo de Y = 3
//   respaldo de ana (persona) = 2,48 + 3 = 5,48 · respaldo de bea, cai y dani = 0 (nadie pone nada detrás de sus registros:
//              lo que ellas ponen detrás de X o Y es respaldo de ana, no suyo)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import { evaluar } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { cargarEpocaEscrita } from '../src/epocas.js';
import { epocaEnsayoP } from '../datos/epocas/ensayo-p/generar.mjs';
import { entrarPorInvitacion } from '../ejemplos/ikisai/altas.mjs';
import * as A from '../src/acciones.js';
import { pagaElCoste } from './ayudas-coste.js';

const DIA = 86400;
const CICLO = 28 * DIA;
const T0 = Date.parse('2026-11-18T10:00:00Z');
/** El instante `s` segundos después de las 10:00 del 18-11. */
const en = (s) => new Date(T0 + s * 1000).toISOString().replace('.000Z', 'Z');
const DETRAS = 'I put my P behind this';
const RETIRA = 'withdraw support';
const REGLA_2 = /what is put behind something is released by withdrawing it/;
const REGLA_3 = /backing of what is closed stays a cycle/;
const cerca = (a, b, m) => assert.ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, `${m ?? ''} ${a} ≠ ${b}`);

async function libroBase(quienes) {
  const eje = await Eje.genesis({ identidad: 'ana', foco: 'libro de ensayo', t: en(0), demostracion: true, epoca: epocaEnsayoP() });
  for (const q of quienes) await entrarPorInvitacion(eje, { por: 'ana', quien: q, t: en(0), grupo: 3 });
  return eje;
}
const registro = (eje, autor, sobre, texto, t = en(0)) => eje.escribir({ autor, sobre, t, payload: texto, movimientos: [pagaElCoste(autor)] });
/** Un paso hacia abajo dentro de un registro del propio autor: quema `quemado` en él y acuña `acunado` en su punto de vista d. */
const baja = (eje, quien, reg, quemado, d, acunado, t = en(0)) => eje.escribir({
  autor: quien, sobre: reg.id, t, payload: 'paso',
  movimientos: [pagaElCoste(quien), { token: 'P', ambito: reg.id, cantidad: quemado, de: quien, a: null }, { token: 'P', ambito: reg.id + '.' + d, cantidad: acunado, de: null, a: quien }],
});
/** Pone P detrás de X con la plantilla de la época: de la serie P:<nota>[.<d>]/<quien>, una cantidad. */
async function detras(eje, quien, X, nota, vista, cantidad, t = en(0)) {
  const power = 'P:' + nota.id + (vista === undefined ? '' : '.' + vista) + '/' + quien;
  const r = await A.transaccion(eje, DETRAS, { X: X.id, power, amount: cantidad }, quien, { t });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await eje.anadir(r.evento);
  return { ...r.evento, power };
}
/** Cierra X por decisión de su dueño, en el instante t. */
async function cierra(eje, dueno, X, t) {
  const r = await A.transaccion(eje, 'close by decision', { X: X.id }, dueno, { t });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await eje.anadir(r.evento);
  return r.evento;
}
/** «withdraw support» de quien sea sobre X, en el instante t: devuelve el intento (el evento aún no añadido). */
const intentaRetirar = async (eje, quien, X, t) => {
  const r = await A.transaccion(eje, RETIRA, { X: X.id }, quien, { t });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  return r.evento;
};
/** El intento de retirar que la época rechaza: la transacción sale con ok = false y la regla en sus motivos, y el evento tampoco entra en el libro. */
async function rechazadoPor(eje, quien, X, t, regla) {
  const r = await A.transaccion(eje, RETIRA, { X: X.id }, quien, { t });
  assert.equal(r.ok, false);
  assert.match(JSON.stringify(r.motivos), regla);
  await assert.rejects(eje.anadir(r.evento), regla);
}
const bloqueado = (eje, X, quien) => eje.bloqueosCon(X.id).filter((b) => b.identidad === quien).reduce((s, b) => s + b.cantidad, 0);

test('el ciclo es un número de la época: 2 419 200 s en el 1.1.4.5, al lado del paso lateral (1.1.4.4)', () => {
  const e = cargarEpocaEscrita(epocaEnsayoP());
  assert.deepEqual(e.registro[1][1][4][5], [CICLO]);
  assert.deepEqual(e.registro[1][1][4][4], [1]);
  assert.equal(e.registro[1][1][4][5][0], 28 * 24 * 3600);
});

test('«withdraw support» se ofrece sobre un registro corriente a quien tiene P detrás de él, y devuelve la P; antes no se ofrece', async () => {
  const eje = await libroBase(['bea']);
  const X = await registro(eje, 'ana', eje.genesisId, 'X');
  const nota = await registro(eje, 'bea', X.id, 'nota de bea');
  assert.ok(!A.acciones(eje, X.id, 2, 'bea').map((a) => a.nombre).includes(RETIRA), 'sin P detrás, no se ofrece');
  const antes = eje.saldo('bea', 'P:' + nota.id + '/bea');
  const ev = await detras(eje, 'bea', X, nota, undefined, 2);
  assert.ok(A.acciones(eje, X.id, 2, 'bea').map((a) => a.nombre).includes(RETIRA), 'con P detrás, se ofrece');
  assert.equal(bloqueado(eje, X, 'bea'), 2);
  assert.equal(eje.saldo('bea', ev.power), antes - 2);
  // Retirar: X está abierto, se retira en el acto.
  await eje.anadir(await intentaRetirar(eje, 'bea', X, en(60)));
  assert.equal(bloqueado(eje, X, 'bea'), 0, 'ya no hay P detrás');
  assert.equal(eje.saldo('bea', ev.power), antes, 'la P vuelve entera a su mano');
  assert.ok(!A.acciones(eje, X.id, 2, 'bea').map((a) => a.nombre).includes(RETIRA), 'sin P detrás, ya no se ofrece');
});

test('liberar de otra forma se rechaza con el mensaje de la regla: a mano, sin «withdraw support», y con la acción pero anclado en otro registro', async () => {
  const eje = await libroBase(['bea']);
  const X = await registro(eje, 'ana', eje.genesisId, 'X');
  const W = await registro(eje, 'ana', eje.genesisId, 'otro registro');
  const nota = await registro(eje, 'bea', X.id, 'nota de bea');
  const ev = await detras(eje, 'bea', X, nota, undefined, 2);
  const libera = { token: 'P', ambito: nota.id, origen: 'bea', cantidad: 2, de: 'bea', a: 'bea', estado: 'liberacion', salida: X.id };
  // A mano, en un registro cualquiera anclado en X.
  await assert.rejects(eje.escribir({ autor: 'bea', sobre: X.id, t: en(60), payload: 'suelto', movimientos: [pagaElCoste('bea'), libera] }), REGLA_2);
  // Diciendo «withdraw support» en su 4 pero anclado en otro registro (no en X).
  await assert.rejects(eje.escribir({ autor: 'bea', sobre: W.id, t: en(60), payload: [['x'], ['x'], ['x'], ['x'], [RETIRA]], movimientos: [pagaElCoste('bea'), libera] }), REGLA_2);
  assert.equal(bloqueado(eje, X, 'bea'), 2, 'lo rechazado no cambia nada');
  void ev;
});

test('P puesta detrás de algo que ya estaba cerrado: no se retira antes del ciclo y sí al pasar el ciclo desde el bloqueo', async () => {
  const eje = await libroBase(['bea']);
  const Y = await registro(eje, 'ana', eje.genesisId, 'Y');
  const nota = await registro(eje, 'bea', Y.id, 'nota de bea');
  // Y se cierra el día 1 (ana lo cierra por decisión); bea pone su P detrás el día 2: ya estaba cerrado.
  await cierra(eje, 'ana', Y, en(1 * DIA));
  const bloqueo = en(2 * DIA);
  await detras(eje, 'bea', Y, nota, undefined, 2, bloqueo);
  // En el acto, y casi un ciclo después (un segundo menos): rechazado con el mensaje de la regla; nada cambia.
  await rechazadoPor(eje, 'bea', Y, en(2 * DIA + 60), REGLA_3);
  await rechazadoPor(eje, 'bea', Y, en(2 * DIA + CICLO - 1), REGLA_3);
  assert.equal(bloqueado(eje, Y, 'bea'), 2);
  // Un ciclo exacto después del registro que la bloqueó: se retira.
  await eje.anadir(await intentaRetirar(eje, 'bea', Y, en(2 * DIA + CICLO)));
  assert.equal(bloqueado(eje, Y, 'bea'), 0);
});

test('P puesta detrás de algo abierto se retira en el acto, y también después de que se cierre', async () => {
  const eje = await libroBase(['bea', 'cai']);
  const Z = await registro(eje, 'ana', eje.genesisId, 'Z');
  const notaB = await registro(eje, 'bea', Z.id, 'nota de bea');
  const notaC = await registro(eje, 'cai', Z.id, 'nota de cai');
  // Las dos ponen P detrás de Z abierto el día 2; cai la retira en el acto.
  await detras(eje, 'bea', Z, notaB, undefined, 2, en(2 * DIA));
  await detras(eje, 'cai', Z, notaC, undefined, 3, en(2 * DIA));
  await eje.anadir(await intentaRetirar(eje, 'cai', Z, en(2 * DIA + 1)));
  assert.equal(bloqueado(eje, Z, 'cai'), 0);
  // ana cierra Z el día 3: bea, cuya P se puso con Z abierto, queda libre de retirar en cuanto se cierra (mucho antes del ciclo).
  await cierra(eje, 'ana', Z, en(3 * DIA));
  assert.equal(bloqueado(eje, Z, 'bea'), 2);
  await eje.anadir(await intentaRetirar(eje, 'bea', Z, en(3 * DIA + 1)));
  assert.equal(bloqueado(eje, Z, 'bea'), 0);
});

test('una decisión que no anuncia nada se lee cerrada desde que nace para motor.cerrado, pero aquí cuenta como abierta: nadie la ha cerrado', async () => {
  const { cerrado } = await import('../src/motor.js');
  const eje = await libroBase(['bea']);
  const Z = await registro(eje, 'ana', eje.genesisId, 'Z');
  const nota = await registro(eje, 'bea', Z.id, 'nota de bea');
  assert.equal(cerrado(eje, Z.id).cerrado, true, 'la pega conocida: sin nada anunciado, «all announced movements happened» ya vale');
  await detras(eje, 'bea', Z, nota, undefined, 2, en(2 * DIA));
  await eje.anadir(await intentaRetirar(eje, 'bea', Z, en(2 * DIA + 60)));
  assert.equal(bloqueado(eje, Z, 'bea'), 0, 'se retira en el acto: no estaba cerrada por nadie');
});

/** El libro de las lecturas, con las cuentas de la cabecera. */
async function libroDeLecturas() {
  const eje = await libroBase(['bea', 'cai', 'dani']);
  const X = await registro(eje, 'ana', eje.genesisId, 'X');
  const Y = await registro(eje, 'ana', eje.genesisId, 'Y');
  const nB = await registro(eje, 'bea', X.id, 'nota de bea'); const nC = await registro(eje, 'cai', X.id, 'nota de cai'); const nD = await registro(eje, 'dani', Y.id, 'nota de dani');
  await baja(eje, 'bea', nB, 0.8, 2, 0.88);
  await baja(eje, 'cai', nC, 1, 7, 1.1);
  await detras(eje, 'bea', X, nB, 2, 0.88); await detras(eje, 'bea', X, nB, undefined, 0.5);
  await detras(eje, 'cai', X, nC, 7, 1.1);
  await detras(eje, 'dani', Y, nD, undefined, 3);
  // ana bloquea 1 de lo suyo con X como salida (la autora): no es respaldo de nadie.
  await eje.escribir({ autor: 'ana', sobre: X.id, t: en(0), payload: 'lo mío detrás', movimientos: [pagaElCoste('ana'), { token: 'P', ambito: X.id, origen: 'ana', cantidad: 1, de: 'ana', a: 'ana', estado: 'bloqueo', salida: X.id }] });
  return { eje, X, Y };
}
function evalua(eje, src) {
  const r = evaluar(src, new ContextoEje(eje, { epoch: eje.epoca() }), {});
  assert.equal(r.estado, 'RESUELTO', r.motivo);
  return r.valor;
}

test('la lectura «backing» de un registro: toda la P de otros detrás de él, con o sin punto de vista, sin mirar el criterio del autor', async () => {
  const { eje, X, Y } = await libroDeLecturas();
  const de = (R) => evalua(eje, `(("${R.id}").2.4) each 4`);
  const lecturaX = de(X);
  assert.equal(lecturaX.length, 4, 'una por compromiso con X: bea (dos), cai y la propia ana');
  for (const v of lecturaX) cerca(v, 2.48, 'X: 0,88 + 0,5 + 1,1');
  const lecturaY = de(Y);
  assert.equal(lecturaY.length, 1);
  cerca(lecturaY[0], 3, 'Y: los 3 de dani, sin punto de vista');
  // No pide permiso al autor: ana no escribió nada en su criterio (ni lista de nombres ni puntos de vista) y el respaldo está.
  assert.deepEqual(evalua(eje, `(("${X.id}").2.3) each 1`), []);
});

test('la lectura «backing» de una persona: la suma de lo que hay detrás de todos sus registros; las demás, 0', async () => {
  const { eje } = await libroDeLecturas();
  cerca(evalua(eje, '("ana").2.7')[0], 5.48, 'ana: 2,48 + 3');
  for (const q of ['bea', 'cai', 'dani']) cerca(evalua(eje, `("${q}").2.7`)[0], 0, q);
});

test('sin la época de ensayo no hay lectura «backing» ni se rechaza liberar sin retirar', async () => {
  const eje = await Eje.genesis({ identidad: 'ana', foco: 'libro', t: en(0), demostracion: true });
  const X = await registro(eje, 'ana', eje.genesisId, 'X');
  assert.deepEqual(evalua(eje, `(("${X.id}").2.4) each 4`), []);
  assert.deepEqual(evalua(eje, '("ana").2.7'), []);
});

test('un cierre que no es del dueño no cuenta: si lo cierra otra persona, el registro sigue abierto para la regla del ciclo', async () => {
  const eje = await libroBase(['bea', 'cai']);
  const Z = await registro(eje, 'ana', eje.genesisId, 'Z');
  const nota = await registro(eje, 'bea', Z.id, 'nota de bea');
  // cai escribe un registro de cierre falso en el 4 de Z (no es la dueña de Z): no lo cierra.
  await eje.escribir({ autor: 'cai', sobre: Z.id, en: '4000000000', t: en(1 * DIA), payload: [['x'], ['x'], ['x'], ['x'], ['close by decision']], movimientos: [pagaElCoste('cai')] });
  await detras(eje, 'bea', Z, nota, undefined, 2, en(2 * DIA));
  await eje.anadir(await intentaRetirar(eje, 'bea', Z, en(2 * DIA + 60)));
  assert.equal(bloqueado(eje, Z, 'bea'), 0, 'se retira en el acto: nadie con derecho lo había cerrado');
});
