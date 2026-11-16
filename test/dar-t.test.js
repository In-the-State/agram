// «give T to a thing of mine» (dar T a una cosa mía; VG 16-11 por Core State, V10): la plantilla de la época 0 que da T
// real de hoy de una persona a una cosa suya ya dada de alta. Eje local en memoria, identidades inventadas, sin claves
// de verdad ni nodos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { quemaDelCoste } from '../src/escritura.js';

const T0 = '2026-11-16T08:00:00Z';
const T = (s) => new Date(Date.parse(T0) + s * 1000).toISOString().replace('.000Z', 'Z');
const DAR = 'give T to a thing of mine';
const reglas = (r) => r.motivos.map((m) => m.regla);

async function escribe(eje, plantilla, params, yo, t) {
  const r = await A.transaccion(eje, plantilla, params, yo, { t });
  assert.equal(r.ok, true, plantilla + ': ' + JSON.stringify(r.motivos));
  return eje.anadir(r.evento);
}

/** Un registro escrito a mano, pagando su coste de escribir: → los motivos de la validación (vacío si pasa). */
async function aMano(eje, { autor, sobre, t, payload, movimientos }) {
  try {
    await eje.escribir({ autor, sobre, t, payload, movimientos: [quemaDelCoste(autor, payload, 'minuto', { eje }), ...movimientos] });
    return [];
  } catch (e) {
    return [e.message];
  }
}

/** Ana (persona, dueña del génesis) con su cosa «robot» dada de alta con 1 minuto; bea, otra persona, con su cosa «tostadora». */
async function mundo() {
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true });
  const altaAna = eje.alta('ana').id;
  const robot = await escribe(eje, 'register a thing', { X: altaAna, thing: 'robot', minutes: 1 }, 'ana', T(1));
  const inv = await eje.invitar({ autor: 'ana', invitado: 'bea', t: T(2) });
  await eje.aceptar(inv, {}, { t: T(3) });
  const tostadora = await escribe(eje, 'register a thing', { X: eje.alta('bea').id, thing: 'tostadora', minutes: 1 }, 'bea', T(4));
  return { eje, altaAna, robot, tostadora };
}

test('dar T: a una cosa propia, sobre su alta; la ofrece el PV 1 y mueve T real de hoy de quien la lanza a la cosa', async () => {
  const { eje, altaAna, robot, tostadora } = await mundo();
  assert.equal(eje.alta('robot').id, robot.id);
  const ofrecida = (X, yo) => A.acciones(eje, X, 1, yo).some((a) => a.nombre === DAR);
  assert.deepEqual([ofrecida(robot.id, 'ana'), ofrecida(altaAna, 'ana'), ofrecida(tostadora.id, 'ana'), ofrecida(robot.id, 'bea'), ofrecida(tostadora.id, 'bea')], [true, false, false, false, true], 'sobre el alta de una cosa mía; ni en la mía, ni en la de una cosa de otro');
  const etiqueta = A.acciones(eje, robot.id, 1, 'ana', { idioma: 'es' }).find((a) => a.nombre === DAR);
  assert.equal(etiqueta.etiqueta, 'dar T a una cosa mía');
  assert.equal(etiqueta.parametros.find((p) => p.nombre === 'scale').valor, 1, 'la escala por defecto, el minuto');
  const antes = { robot: eje.saldoT('robot', 'minuto', T(10)), ana: eje.saldoT('ana', 'minuto', T(10)) };
  assert.equal(antes.robot, 1, 'el alta le dio 1 minuto');
  const r = await A.transaccion(eje, DAR, { X: robot.id, amount: 37 }, 'ana', { t: T(10) });
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  const dado = r.evento.movimientos.filter((m) => m.a === 'robot');
  assert.deepEqual(dado, [{ token: 'T', escala: 'minuto', cantidad: 37, de: 'ana', a: 'robot' }]);
  assert.deepEqual([r.evento.sobre, r.evento.en], [robot.id, '1400000000'], 'ancla en el 1.4 del alta de la cosa');
  await eje.anadir(r.evento);
  assert.equal(eje.saldoT('robot', 'minuto', T(10)), 38);
  const coste = r.evento.movimientos.filter((m) => m.a === null).reduce((s, m) => s + (m.escala === 'minuto' ? m.cantidad : 0), 0);
  assert.equal(eje.saldoT('ana', 'minuto', T(10)), antes.ana - 37 - coste, 'sale de su T de minuto de hoy (lo dado y el coste de escribir)');
  // Otra escala: una hora; la cantidad es libre, sin la lista cerrada del alta (1, 60, 1440…).
  await escribe(eje, DAR, { X: robot.id, scale: 2, amount: 1 }, 'ana', T(11));
  assert.equal(eje.saldoT('robot', 'hora', T(11)), 1);
  for (const [params, que] of [[{ amount: 0 }, 'cero'], [{ amount: 1.5 }, 'no entero'], [{ amount: -3 }, 'negativo'], [{ amount: 1, scale: 9 }, 'una escala que no es real']]) {
    const x = await A.transaccion(eje, DAR, { X: robot.id, ...params }, 'ana', { t: T(12) });
    assert.equal(x.ok, false, que);
  }
});

test('dar T: no a una persona ni a una cosa de otro; la regla «a thing of mine is one whose alta I wrote» lo exige a esta acción', async () => {
  const { eje, altaAna, tostadora } = await mundo();
  // Con la plantilla: sobre el alta de una persona (bea) o la de una cosa de otro (la tostadora de bea), no se ofrece ni pasa.
  for (const X of [eje.alta('bea').id, tostadora.id, altaAna]) {
    const r = await A.transaccion(eje, DAR, { X, amount: 5 }, 'ana', { t: T(10) });
    assert.equal(r.ok, false, X);
  }
  // A mano, con la acción en su 4: a una persona lo impide «T only goes to things»; a la cosa de otro, la regla nueva.
  const payload = (a) => ['ana da T a ' + a, [[1], [5]], ['all announced movements happened'], ['ana'], [DAR]];
  const da = (a) => ({ token: 'T', escala: 'minuto', cantidad: 5, de: 'ana', a });
  const aPersona = await aMano(eje, { autor: 'ana', sobre: altaAna, t: T(11), payload: payload('bea'), movimientos: [da('bea')] });
  assert.match(aPersona.join('\n'), /T only goes to things/);
  const aAjena = await aMano(eje, { autor: 'ana', sobre: tostadora.id, t: T(12), payload: payload('tostadora'), movimientos: [da('tostadora')] });
  assert.match(aAjena.join('\n'), /a thing of mine is one whose alta I wrote/);
  // Sin decir la acción, dar T a la cosa de otro sigue valiendo («T only goes to things» lo deja a una persona).
  assert.deepEqual(await aMano(eje, { autor: 'ana', sobre: tostadora.id, t: T(13), payload: ['ana da T a la tostadora'], movimientos: [da('tostadora')] }), []);
  // Y a mano, con la acción, a una cosa suya: pasa.
  assert.deepEqual(await aMano(eje, { autor: 'ana', sobre: eje.alta('robot').id, t: T(14), payload: payload('robot'), movimientos: [da('robot')] }), []);
});

test('dar T: no más de lo que se tiene hoy («writing burns today\'s T»)', async () => {
  const { eje, robot } = await mundo();
  const queda = eje.saldoT('ana', 'minuto', T(10));
  const mucho = await A.transaccion(eje, DAR, { X: robot.id, amount: queda + 1 }, 'ana', { t: T(10) });
  assert.equal(mucho.ok, false);
  assert.ok(reglas(mucho).includes("writing burns today's T"), JSON.stringify(mucho.motivos));
  const justo = await A.transaccion(eje, DAR, { X: robot.id, amount: 100 }, 'ana', { t: T(10) });
  assert.equal(justo.ok, true, JSON.stringify(justo.motivos));
});

test('dar T: la cosa gasta lo recibido al escribir, y sin él no escribe', async () => {
  const { eje, robot } = await mundo();
  const nota = { X: robot.id, title: 'el robot escribe', content: ['una', 'nota'] };
  // Con el minuto del alta no le llega para escribir una nota de varias posiciones.
  const sin = await A.transaccion(eje, 'anchor here', nota, 'robot', { t: T(10) });
  assert.equal(sin.ok, false);
  assert.ok(reglas(sin).includes("writing burns today's T"), JSON.stringify(sin.motivos));
  await escribe(eje, DAR, { X: robot.id, amount: 20 }, 'ana', T(11));
  const antes = eje.saldoT('robot', 'minuto', T(12));
  const ev = await escribe(eje, 'anchor here', nota, 'robot', T(12));
  const coste = ev.movimientos.filter((m) => m.de === 'robot' && m.a === null && m.escala === 'minuto').reduce((s, m) => s + m.cantidad, 0);
  assert.ok(coste > 1);
  assert.equal(eje.saldoT('robot', 'minuto', T(12)), antes - coste, 'paga con el T que le dio su dueña');
  // Al día siguiente no le llega asignación: lo que tiene es lo que le dieron.
  assert.equal(eje.saldoT('robot', 'minuto', '2026-11-17T08:00:00Z'), antes - coste);
});
