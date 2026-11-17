// La salida con saldos, de punta a punta (tramo 4, parte B; agram-equipo/DISENO_TRAMO_4.md §4; docs/notas/PUENTE.md §11):
// saldosDe y planDeSalida (datos/epocas/puente.mjs) y el recorrido de ejemplos/salida.mjs. Ejes de demostración en
// memoria, identidades y claves inventadas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { cuelgaDe } from '../src/contrato.js';
import { saldosDe, planDeSalida, leerTraido, ESPERAS_DE_LA_SALIDA, PLANTILLAS_DEL_PUENTE as P, ENLACES } from '../datos/epocas/puente.mjs';
import { libroViejo, beaConLoSuyo, silenciarABea, salir, conRegla } from '../ejemplos/salida.mjs';
import { dosLibros } from '../ejemplos/puente.mjs';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';

const SALDO = 'a declared balance is true';
const reglas = (r) => (r.motivos ?? []).map((x) => x.regla);

/** Lo traído de cada paso «traer» del plan, leído en el libro nuevo. */
const traidos = (plan, nuevo) => plan.pasos.filter((p) => p.que === 'traer').map((p) => ({ paso: p, leido: leerTraido(nuevo, p.id) }));

/** Comprueba que la salida acabó: todo hecho y cada declaración, traída, fiable y con su cantidad. */
function salidaEntera(m, plan, nuevo, saldos) {
  assert.deepEqual(plan.pasos.filter((p) => p.estado !== 'hecho'), [], 'no queda ningún paso');
  assert.deepEqual(plan.esperan, []);
  const declarables = saldos.filter((s) => s.declarable);
  const lista = traidos(plan, nuevo);
  assert.equal(lista.length, declarables.length, 'una declaración traída por serie declarable');
  for (const { paso, leido } of lista) {
    const s = declarables.find((x) => x.serie === paso.serie);
    assert.ok(s, paso.serie);
    assert.equal(leido.fiable, true, 'fiable: ' + leido.causa);
    assert.equal(leido.libro, m.viejo.genesisId, 'del libro viejo');
    assert.equal(leido.autor, 'bea');
    assert.deepEqual(leido.payload[1], [[s.serie], [s.cantidad]], 'con su cantidad');
    assert.ok(leido.firme, 'en firme');
  }
  assert.equal(cuelgaDe(nuevo)?.libro, m.viejo.genesisId, 'el nuevo cuelga del viejo');
}

test('salida: bea declara, abre su libro, lo cuelga del viejo y trae sus declaraciones con su prueba; en el nuevo se leen fiables y con sus cantidades', async () => {
  const m = await libroViejo();
  await beaConLoSuyo(m);
  const saldos = saldosDe(m.viejo, 'bea');
  assert.deepEqual([...new Set(saldos.filter((s) => s.declarable).map((s) => s.familia))].sort(), ['E', 'P', 'R'], 'declara R, P y E');
  const antes = planDeSalida(m.viejo, 'bea', { claves: m.lineas });
  assert.deepEqual(antes.pasos.map((p) => [p.libro, p.que]), [
    ...saldos.filter((s) => s.declarable).map(() => ['viejo', 'declarar']), ['nuevo', 'genesis'], ['nuevo', 'cuelga'],
    ...saldos.filter((s) => s.declarable).map(() => ['nuevo', 'traer']),
  ], 'en orden: declarar en el viejo, abrir el nuevo, colgarlo y traer');
  assert.ok(antes.pasos.every((p) => p.plantilla === null || [P.declarar, P.traer, ENLACES.cuelga].includes(p.plantilla)));
  const { plan, nuevo } = await salir(m, 'bea');
  salidaEntera(m, plan, nuevo, saldos);
  assert.equal(cuelgaDe(nuevo).punto, undefined, 'sin cambios en vigor en el viejo, sin punto');
  assert.equal(nuevo.epoca().id, m.viejo.epoca().id);
});

test('salida: después de que un cambio de gobierno en vigor silencia a bea, sus declaraciones siguen entrando y se llevan igual', async () => {
  const m = await libroViejo();
  await beaConLoSuyo(m);
  const saldos = saldosDe(m.viejo, 'bea');
  await silenciarABea(m);
  const nota = await m.intenta(m.viejo, 'anchor here', { X: m.viejo.alta('bea').id, title: 'otra', content: 'otra nota' }, 'bea');
  assert.deepEqual(reglas(nota), ['not bea'], 'bea ya no escribe una nota');
  assert.deepEqual(saldosDe(m.viejo, 'bea'), saldos, 'lo que puede declarar no cambia');
  const { plan, nuevo } = await salir(m, 'bea', { punto: 'antes' });
  salidaEntera(m, plan, nuevo, saldos);
});

test('salida: saldosDe da lo que acepta «a declared balance is true»: una unidad más se rechaza; la T no es declarable y la regla lo confirma', async () => {
  const m = await libroViejo();
  await beaConLoSuyo(m);
  const alta = m.viejo.alta('bea').id;
  const saldos = saldosDe(m.viejo, 'bea');
  for (const s of saldos.filter((x) => x.declarable)) {
    const justo = await A.transaccion(m.viejo, P.declarar, { X: alta, series: s.serie, quantity: s.cantidad }, 'bea', { t: m.reloj() });
    assert.equal(justo.ok, true, s.serie + ': ' + JSON.stringify(justo.motivos));
    const mas = await A.transaccion(m.viejo, P.declarar, { X: alta, series: s.serie, quantity: s.cantidad + 1 }, 'bea', { t: m.reloj() });
    assert.deepEqual(reglas(mas), [SALDO], s.serie + ': una más no es verdad');
  }
  const t = saldos.find((s) => s.familia === 'T');
  assert.deepEqual([t.serie, t.declarable, t.cantidad], ['T:minuto', false, 0]);
  assert.match(t.causa, /se gasta|gastar/);
  // La regla, a mano (la plantilla ni la ofrece): declarar 1 de T, pagando su coste en T.
  const payload = ['declare a balance: bea declares having 1 of T:minuto', [['T:minuto'], [1]], ['all announced movements happened'], ['bea'], [P.declarar]];
  const r = await escribirPagando(m.viejo, { autor: 'bea', sobre: alta, en: '8000000000', t: m.reloj(), movimientos: [pagaElCoste('bea')], payload }).then(() => 'entra', (e) => e.message);
  assert.match(r, /a declared balance is true/, 'la T no entra: ' + r);
  const plan = planDeSalida(m.viejo, 'bea', { claves: m.lineas });
  assert.ok(plan.noSeLleva.some((x) => x.serie === 'T:minuto' && x.causa === t.causa), 'el plan dice que la T no se lleva');
  assert.ok(!plan.pasos.some((p) => p.serie === 'T:minuto'));
});

test('salida: lo bloqueado en un enlace (un envío) no se declara aquí y el plan lo dice; enviado todo, la serie no es declarable', async () => {
  const m = await dosLibros();
  const { grande, sala, claves, abre } = m;
  const menu = await m.lanza(grande, 'anchor here', { X: sala.id, title: 'menú', content: 'el menú' }, 'ana');
  await m.lanza(grande, 'issue E tied to X', { X: menu.id, denomination: 'plato', quantity: 5 }, 'ana');
  const serie = 'E:ana/plato@' + menu.id;
  await m.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 3, to: claves.bea.publica }, 'ana');
  const e = saldosDe(grande, 'ana').find((s) => s.serie === serie);
  assert.deepEqual([e.disponible, e.bloqueado, e.enOtroLibro, e.cantidad, e.declarable], [2, 3, 3, 2, true]);
  const alta = grande.alta('ana').id;
  assert.equal((await m.intenta(grande, P.declarar, { X: alta, series: serie, quantity: 2 }, 'ana')).ok, true);
  assert.deepEqual(reglas(await m.intenta(grande, P.declarar, { X: alta, series: serie, quantity: 3 }, 'ana')), [SALDO], 'lo bloqueado para otro libro no se declara aquí');
  const plan = planDeSalida(grande, 'ana');
  assert.deepEqual(plan.noSeLleva.filter((x) => x.serie === serie).map((x) => [x.cantidad, /otro libro/.test(x.causa)]), [[3, true]]);
  assert.equal(plan.pasos.find((p) => p.que === 'declarar' && p.serie === serie).params.quantity, 2);
  await m.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 2, to: claves.bea.publica }, 'ana');
  const todo = saldosDe(grande, 'ana').find((s) => s.serie === serie);
  assert.deepEqual([todo.cantidad, todo.declarable, todo.enOtroLibro], [0, false, 5]);
  assert.match(todo.causa, /bloqueado para otro libro/);
  assert.ok(!planDeSalida(grande, 'ana').pasos.some((p) => p.serie === serie), 'no se propone declararla');
});

test('salida: el libro nuevo nace con la época de antes del cambio si se pide (sin la regla que silencia) y con el id de época del viejo; con la vigente, la regla viaja', async () => {
  const m = await libroViejo();
  await beaConLoSuyo(m);
  const puesta = await silenciarABea(m);
  const vigente = planDeSalida(m.viejo, 'bea', { claves: m.lineas });
  const antes = planDeSalida(m.viejo, 'bea', { claves: m.lineas, punto: 'antes' });
  assert.deepEqual([vigente.epoca.version, vigente.epoca.registro, antes.epoca.version, antes.epoca.registro], [1, puesta.id, 0, null]);
  const genesisDe = (plan) => plan.pasos.find((p) => p.que === 'genesis').params;
  const cuelgaDel = (plan) => plan.pasos.find((p) => p.que === 'cuelga').params;
  assert.equal(genesisDe(vigente).epoca.cambios.length, 1, 'la vigente, con su cambio por referencia');
  assert.equal(genesisDe(antes).epoca.cambios, undefined, 'la de antes, la de nacimiento del viejo');
  assert.equal(cuelgaDel(vigente).point, puesta.id, 'el punto: el registro que puso en vigor el cambio');
  assert.equal('point' in cuelgaDel(antes), false);
  assert.throws(() => planDeSalida(m.viejo,'bea', { punto: 7 }), /no hay esa versión/);
  // La de antes: la salida entera.
  const { nuevo } = await salir(m, 'bea', { punto: 'antes' });
  assert.equal(nuevo.epoca().id, m.viejo.epoca().id, 'el id de la época es el del viejo');
  assert.deepEqual([conRegla(nuevo, 'not bea'), conRegla(m.viejo, 'not bea'), nuevo.versiones().length], [false, true, 1]);
  // La vigente: el libro nace con la regla que silencia, y en él bea no escribe ni de qué cuelga.
  const otro = await Eje.genesis({ ...genesisDe(vigente), t: m.reloj(), demostracion: true });
  assert.deepEqual([otro.epoca().id === m.viejo.epoca().id, conRegla(otro, 'not bea')], [true, true]);
  const r = await A.transaccion(otro, ENLACES.cuelga, { ...cuelgaDel(vigente), X: otro.genesisId }, 'bea', { t: m.reloj() });
  assert.ok(reglas(r).includes('not bea'), 'con la época vigente, la regla viaja: ' + JSON.stringify(reglas(r)));
});

test('salida: sin sello del libro viejo el plan se queda en las declaraciones firmadas y dice que espera el sello; sin claves de línea, que espera las claves', async () => {
  const m = await libroViejo();
  await beaConLoSuyo(m);
  await silenciarABea(m);
  const n = saldosDe(m.viejo, 'bea').filter((s) => s.declarable).length;
  const { plan, nuevo } = await salir(m, 'bea', { punto: 'antes', sellar: false });
  assert.deepEqual(plan.pasos.filter((p) => p.que === 'declarar').map((p) => p.estado), Array(n).fill('hecho'), 'las declaraciones, firmadas');
  assert.deepEqual(plan.pasos.filter((p) => p.que === 'traer').map((p) => p.estado), Array(n).fill('espera'));
  assert.ok(plan.pasos.filter((p) => p.que === 'traer').every((p) => p.espera === ESPERAS_DE_LA_SALIDA.sello && p.params.record && p.params.proof === null));
  assert.equal(plan.esperan.length, n);
  assert.ok(plan.esperan.every((x) => /sello del libro viejo/.test(x)));
  assert.equal(nuevo.sobre(nuevo.genesisId, '9800000000').length, 0, 'nada traído');
  // Con el sello ya dado, falta lo otro: sin claves de línea en el enlace no se trae nada.
  const sinClaves = await salir(m, 'bea', { punto: 'antes', claves: 0 });
  const traer = sinClaves.plan.pasos.filter((p) => p.que === 'traer');
  assert.ok(traer.length === n && traer.every((p) => p.estado === 'espera' && p.espera === ESPERAS_DE_LA_SALIDA.claves), JSON.stringify(traer.map((p) => p.espera)));
});
