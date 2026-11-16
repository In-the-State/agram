// La cuenta del banco (VG 16-11, la trae Core State; encargo «cuenta del banco»; docs/notas/CUENTA_BANCO.md): una E
// única con el saldo como dato. Lo que se comprueba:
//   1. «connect an account» (PV1, orden 6) escribe un registro en el 1.1 de mi alta con capacidad 1 en su 2; la E única
//      se acuña con «issue E tied to X» y no cabe otra; la cuota del tope pide además P comprometido con la serie;
//   2. una cuenta recién creada con «crear mi cuenta» no acuña su E hasta haber emitido R propia;
//   3. el camino del 9 de la cuenta: elegir el banco, dar el permiso (una cosa mía), volver (la E) y renovar;
//   4. el permiso (falta, vigente, caducado) y el saldo (manda el de instante más reciente, escrito con permiso);
//   5. la regla «acting on an account needs P on it» y la cuenta compartida (P reposicionado);
//   6. contrato.cuenta, la carta (el anverso de la cuenta y la cartera del rosetón del 1) y el ejemplo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { claveToken } from '../src/tokens.js';
import { generarClaves, firmar } from '../src/autoridad.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import { arbol, NIVEL } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { t as textoDeLaCarta } from '../carta/textos.js';
import { crearCuenta } from '../carta/cuentas.js';
import { entrarPorInvitacion } from '../ejemplos/ikisai/altas.mjs';
import { ejemploCuentaBanco, diasDespues, CUENTA, T0, T1, T2, T3 } from '../ejemplos/ikisai/cuenta-banco.mjs';
import { pagaElCoste } from './ayudas-coste.js';

const ORDENADOR = { ancho: 1200, alto: 800 };
const reglas = (r) => r.motivos.map((m) => m.regla);

/** Un eje con ana (génesis, con su R emitida), bea invitada por ana y la conectora, una cosa de ana; y la cuenta de ana. */
async function mundo() {
  const eje = await Eje.genesis({ demostracion: true, identidad: 'ana', t: T0, foco: ['ana'], emision: [{ token: 'R', cantidad: 10 }] });
  const alta = eje.alta('ana').id;
  await entrarPorInvitacion(eje, { por: 'ana', quien: 'bea', t: T0 });
  const lanzar = async (nombre, X, parametros, yo, t) => {
    const r = await A.transaccion(eje, nombre, { X, ...parametros }, yo, { t });
    assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
    return eje.anadir(r.evento);
  };
  const cuenta = await lanzar('connect an account', alta, { name: 'cuenta de casa', bank: 'Banco de Ejemplo' }, 'ana', T0);
  await lanzar('register a thing', alta, { thing: 'conectora', minutes: 60 }, 'ana', T0);
  return { eje, alta, cuenta, lanzar };
}

/** La E única: el evento de «issue E tied to X» con 1 de P de quien acuña bloqueado con la salida = la serie (la cuota del tope). */
async function acunar(eje, cuenta, yo = 'ana', t = T1, privada) {
  const r = await A.transaccion(eje, 'issue E tied to X', { X: cuenta.id, denomination: 'account', quantity: 1 }, yo, { t });
  const serie = claveToken({ token: 'E', emisor: yo, denominacion: 'account', registro: cuenta.id });
  const compromiso = { token: 'P', ambito: cuenta.id, origen: yo, cantidad: 1, de: yo, a: yo, estado: 'bloqueo', salida: serie };
  return { r, serie, ev: await eje.escribir({ autor: yo, sobre: r.evento.sobre, en: r.evento.en, t, payload: r.evento.payload, movimientos: [...r.evento.movimientos, compromiso] }, privada) };
}

/** Una orden sobre la cuenta: un registro cualquiera anclado en su 4 (la orden de pago es de StateArk). */
const ordenar = (eje, cuenta, yo, t = T3, en = '4000000000') => eje.escribir({ autor: yo, sobre: cuenta.id, en, t, payload: ['orden de pago simulada de ' + yo], movimientos: [pagaElCoste(yo)] });

// ---------- 1. la cuenta y su E única ----------

test('«connect an account»: PV1 orden 6, en el 1.1 de mi alta; 0 el nombre, 1.0 el banco, 1.1 los días (180), 2 la capacidad 1, 3 quién, 4 la acción, 5 el tipo «account»; nada del banco', async () => {
  const { eje, alta, cuenta } = await mundo();
  const p = A.plantillaDeTransaccion('connect an account');
  assert.deepEqual(p[8], [1, 6]);
  assert.ok(A.acciones(eje, alta, 1, 'ana').some((a) => a.nombre === 'connect an account'), 'se ofrece en el 1 de mi alta');
  assert.ok(!A.acciones(eje, alta, 1, 'bea').some((a) => a.nombre === 'connect an account'), 'no en un alta ajena');
  assert.deepEqual([cuenta.sobre, cuenta.en], [alta, '1100000000']);
  assert.deepEqual(cuenta.payload, [['cuenta de casa'], [['Banco de Ejemplo'], [180]], [1], ['ana'], ['connect an account'], ['account']]);
  assert.equal(C.nombreDePlantilla(C.plantilla(eje, cuenta.id)), 'account');
  assert.deepEqual(eje.topes(cuenta.id, T0).map((x) => x.capacidad), [1]);
  // Lanzada desde otro registro mío, ancla igual en mi alta (su 5: «=first me.6»).
  const otra = await A.transaccion(eje, 'connect an account', { X: cuenta.id, name: 'ahorro', bank: 'Banco de Ejemplo' }, 'ana', { t: T0 });
  assert.deepEqual([otra.ok, otra.evento.sobre, otra.evento.en], [true, alta, '1100000000']);
  // La capacidad es 1, fija.
  const dos = await A.transaccion(eje, 'connect an account', { X: alta, name: 'x', bank: 'y', capacity: 2 }, 'ana', { t: T0 });
  assert.deepEqual(reglas(dos), ['capacity']);
  // Los textos en español (9.4).
  assert.equal(C.texto(eje, C.claves.plantilla('connect an account'), 'es'), 'conectar una cuenta');
  assert.equal(C.texto(eje, C.claves.plantilla('update the balance'), 'es'), 'actualizar el saldo');
});

test('la E única: «issue E tied to X» sola no pasa la cuota del tope (pide P comprometido con la serie); con 1 P bloqueado con la salida = la serie, sí; y no cabe otra', async () => {
  const { eje, cuenta } = await mundo();
  const sola = await A.transaccion(eje, 'issue E tied to X', { X: cuenta.id, denomination: 'account', quantity: 1 }, 'ana', { t: T1 });
  assert.equal(sola.ok, false);
  assert.deepEqual(reglas(sola), [null]);
  assert.match(sola.motivos[0].mensaje, /^cuota de E:ana\/account@[0-9a-f]{64} en el registro [0-9a-f]{8}: ana compromete 0 de P con la salida de la serie, de 0 comprometido/);
  const { serie } = await acunar(eje, cuenta);
  assert.equal(eje.saldo('ana', serie), 1);
  assert.deepEqual(C.cuenta(eje, cuenta.id).unica, { serie, quien: ['ana'] });
  // Otra E en la misma cuenta, de cualquier denominación: no cabe (capacidad 1).
  const otra = await A.transaccion(eje, 'issue E tied to X', { X: cuenta.id, denomination: 'otra', quantity: 1 }, 'ana', { t: T1 });
  assert.ok(otra.motivos.some((m) => /tope de E del registro .* llegaría a 2 y su capacidad es 1/.test(m.mensaje)), JSON.stringify(otra.motivos));
  // No se acuña en el mismo registro que crea la cuenta: el P sobre ella llega al escribirla (minting E needs P on its record).
  assert.equal(eje.poderSobre('ana', cuenta.id), 10);
});

// ---------- 2. «crear mi cuenta» y la R propia ----------

test('una cuenta recién creada con «crear mi cuenta» no acuña la E de su cuenta del banco: «minting E needs own R issued» hasta que emite R propia (invitar a alguien le guarda una)', async () => {
  const { cuenta: yo, eje, privada } = await crearCuenta({ nombre: 'vg', t: T0 });
  const firma = { firmar: (ev) => firmar(ev, privada) };
  const lanzar = (nombre, X, parametros, t) => A.transaccion(eje, nombre, { X, ...parametros }, yo.identidad, { t, ...firma });
  const conecta = await lanzar('connect an account', yo.alta, { name: 'cuenta de casa', bank: 'Banco de Ejemplo' }, T0);
  assert.ok(conecta.ok, JSON.stringify(conecta.motivos));
  const cuenta = await eje.anadir(conecta.evento);
  const sinR = await lanzar('issue E tied to X', cuenta.id, { denomination: 'account', quantity: 1 }, T1);
  assert.equal(sinR.ok, false);
  assert.ok(sinR.motivos.some((m) => m.regla === 'minting E needs own R issued'), JSON.stringify(sinR.motivos));
  // Invita a alguien (la invitación le guarda una unidad de su R): ya ha emitido R; queda solo la cuota del tope.
  await entrarPorInvitacion(eje, { por: yo.identidad, quien: 'bea', t: T1, clave: await generarClaves(), privadaDe: () => privada });
  const conR = await lanzar('issue E tied to X', cuenta.id, { denomination: 'account', quantity: 1 }, T1);
  assert.ok(!conR.motivos.some((m) => m.regla === 'minting E needs own R issued'));
  await acunar(eje, cuenta, yo.identidad, T1, privada);
  assert.equal(C.cuenta(eje, cuenta.id).unica.quien[0], yo.identidad);
});

// ---------- 3. el camino del 9 ----------

test('el camino del 9 de la cuenta: elegir el banco (hecho al escribirla), dar el permiso (lo da la conectora, una cosa mía), volver (la E única) y renovar (en el 7.2 de la cuenta)', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  const pasos = async (t) => (await A.camino(eje, cuenta.id, 'ana', { t })).pasos.map((p) => [p.hacer?.plantilla, p.hecho]);
  assert.deepEqual(await pasos(T0), [['connect an account', true], ['grant the permission', false], ['issue E tied to X', false], ['renew the permission', false]]);
  const permiso = await lanzar('grant the permission', cuenta.id, { until: diasDespues(T1, 180) }, 'conectora', T1);
  assert.deepEqual([permiso.sobre, permiso.en], [cuenta.id, '7000000000']);
  assert.deepEqual(permiso.payload.slice(1, 5), [[['bank permission'], [diasDespues(T1, 180)]], ['all announced movements happened'], ['conectora'], ['grant the permission']]);
  await acunar(eje, cuenta);
  assert.deepEqual(await pasos(T1), [['connect an account', true], ['grant the permission', true], ['issue E tied to X', true], ['renew the permission', false]]);
  // Renovar: ancla en el 7.2 de la cuenta; el vigente es el último que llegó.
  const renueva = await lanzar('renew the permission', cuenta.id, { until: diasDespues(T2, 180) }, 'conectora', T2);
  assert.deepEqual([renueva.sobre, renueva.en], [cuenta.id, '7200000000']);
  assert.deepEqual((await pasos(T2)).at(-1), ['renew the permission', true]);
  assert.equal(C.cuenta(eje, cuenta.id).permiso.registro, renueva.id);
  void permiso;
  assert.equal(C.cuenta(eje, cuenta.id).permiso.vence, diasDespues(T2, 180));
});

// ---------- 4. el permiso y el saldo ----------

test('el permiso: falta, vigente y caducado; no pasa de los días de la cuenta; sin permiso (o caducado) el saldo no se actualiza; manda el de instante más reciente', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  assert.deepEqual(C.cuenta(eje, cuenta.id).permiso, { estado: 'falta', vence: null, registro: null });
  // Un saldo antes del permiso queda en el libro, pero no es el saldo de la cuenta.
  await lanzar('update the balance', cuenta.id, { amount: 999, when: T0 }, 'conectora', T0);
  assert.equal(C.cuenta(eje, cuenta.id).saldo, null);
  // Más de 180 días: no.
  const largo = await A.transaccion(eje, 'grant the permission', { X: cuenta.id, until: diasDespues(T1, 181) }, 'conectora', { t: T1 });
  assert.deepEqual(reglas(largo), ['until']);
  const permiso = await lanzar('grant the permission', cuenta.id, { until: diasDespues(T1, 180) }, 'conectora', T1);
  assert.deepEqual(C.cuenta(eje, cuenta.id).permiso, { estado: 'vigente', vence: diasDespues(T1, 180), registro: permiso.id });
  const s1 = await lanzar('update the balance', cuenta.id, { amount: 1250.4, when: T1 }, 'conectora', T1);
  assert.deepEqual(s1.payload, [s1.payload[0], [['balance'], [1250.4], ['EUR'], [T1]], ['all announced movements happened'], [['conectora'], ['confirmed by the bank']], ['update the balance']]);
  assert.deepEqual([s1.sobre, s1.en, s1.movimientos.every((m) => m.token === 'T')], [cuenta.id, '1000000000', true], 'en el 1 de la cuenta; solo lo que cuesta escribir');
  const s2 = await lanzar('update the balance', cuenta.id, { amount: 1180.15, when: T2 }, 'conectora', T2);
  // Uno que llega después pero dice un instante anterior no manda.
  await lanzar('update the balance', cuenta.id, { amount: 5, when: T1 }, 'ana', T3);
  assert.deepEqual(C.cuenta(eje, cuenta.id).saldo, { cuanto: 1180.15, unidad: 'EUR', t: T2, fuente: 'confirmed by the bank', confirmado: true, registro: s2.id });
  // Caducado al reloj que se pida; lo escrito después de caducar no actualiza el saldo.
  const despues = diasDespues(T1, 181);
  assert.equal(C.cuenta(eje, cuenta.id, { t: despues }).permiso.estado, 'caducado');
  await lanzar('update the balance', cuenta.id, { amount: 1, when: despues }, 'conectora', despues);
  assert.equal(C.cuenta(eje, cuenta.id).saldo.cuanto, 1180.15);
  assert.equal(C.cuenta(eje, cuenta.id).permiso.estado, 'caducado');
  // Lo lanza quien tiene P sobre la cuenta o una cosa suya: a bea no se le ofrece.
  assert.ok(A.acciones(eje, cuenta.id, 1, 'conectora').some((a) => a.nombre === 'update the balance'));
  assert.ok(!A.acciones(eje, cuenta.id, 1, 'bea').some((a) => a.nombre === 'update the balance'));
});

// ---------- 5. quién ordena ----------

test('«acting on an account needs P on it»: en el 4 de la cuenta solo escribe quien tiene P sobre ella o una cosa suya; bea consigue P reposicionando el suyo y desde entonces ordena', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  assert.ok(EPOCA_0_BTML.reglasConId.some((x) => x.regla[0][0] === 'acting on an account needs P on it'));
  await assert.rejects(ordenar(eje, cuenta, 'bea'), /acting on an account needs P on it: bea acts on the account cuenta de casa \(an order, a balance or a permission\) and neither it nor its owner has P on it/);
  await assert.rejects(ordenar(eje, cuenta, 'bea', T3, '4100000000'), /acting on an account needs P on it/, 'también en un hijo del 4 (4.1, el anuncio)');
  await ordenar(eje, cuenta, 'ana');
  await ordenar(eje, cuenta, 'conectora');
  // Fuera del 4, o sobre lo que no es una cuenta, la regla no dice nada.
  await eje.escribir({ autor: 'bea', sobre: cuenta.id, en: '6000000000', t: T3, payload: ['una nota de bea'], movimientos: [pagaElCoste('bea')] });
  assert.deepEqual(C.cuenta(eje, cuenta.id).ordenan, ['ana']);
  // La cuenta compartida: bea ancla una nota en la cuenta (diez P sobre la nota) y sube ese P un paso: una décima, 1 P.
  const nota = await lanzar('anchor here', cuenta.id, { title: 'cuenta compartida', content: 'la llevamos entre las dos' }, 'bea', T2);
  const sube = await lanzar('reposition P toward X', cuenta.id, { from: 'P:' + nota.id + '/bea', amount: 10 }, 'bea', T2);
  assert.deepEqual(sube.movimientos.slice(1).map((m) => [m.token, m.ambito, m.cantidad, m.de, m.a]), [['P', nota.id, 10, 'bea', null], ['P', cuenta.id, 1, null, 'bea']]);
  assert.equal(eje.poderSobre('bea', cuenta.id), 1);
  assert.deepEqual(C.cuenta(eje, cuenta.id).ordenan, ['ana', 'bea']);
  await ordenar(eje, cuenta, 'bea');
});

// ---------- 6. el contrato, la carta y el ejemplo ----------

test('contrato.cuenta: null si el registro no es una cuenta; la clave de su E también la nombra', async () => {
  const { eje, alta, cuenta } = await mundo();
  assert.equal(C.cuenta(eje, alta), null);
  assert.equal(C.cuenta(eje, 'f'.repeat(64)), null);
  const { serie } = await acunar(eje, cuenta);
  assert.equal(C.cuenta(eje, serie).id, cuenta.id);
  assert.deepEqual(Object.keys(C.cuenta(eje, cuenta.id)), ['id', 'nombre', 'banco', 'dias', 'unica', 'saldo', 'permiso', 'ordenan']);
});

test('el ejemplo «cuenta»: ana conecta, la conectora da el permiso, se acuña la E, llegan dos saldos y bea, con P reposicionado, ordena (con claves y sin ellas)', async () => {
  for (const claves of [{}, { ana: await generarClaves(), conectora: await generarClaves(), bea: await generarClaves() }]) {
    const r = await ejemploCuentaBanco({ claves });
    const c = C.cuenta(r.eje, r.cuenta.id);
    assert.deepEqual([c.nombre, c.banco, c.dias], [CUENTA.nombre, CUENTA.banco, CUENTA.dias]);
    assert.deepEqual([c.saldo.cuanto, c.saldo.t, c.saldo.confirmado], [1180.15, T2, true]);
    assert.deepEqual([c.permiso.estado, c.permiso.vence], ['vigente', diasDespues(T1, 180)]);
    assert.deepEqual([c.unica.quien, c.ordenan], [['ana'], ['ana', 'bea']]);
    assert.deepEqual([r.orden.sobre, r.orden.en, r.orden.autor], [r.cuenta.id, '4000000000', 'bea']);
    if (claves.ana) assert.ok(r.cuenta.firma && r.permiso.firma && r.orden.firma);
  }
});

test('la carta pinta lo que da contrato.cuenta: en el anverso de la cuenta, el saldo con su unidad, la fecha, «confirmado por el banco» y el permiso; en la cartera del rosetón del 1, el nombre de la cuenta y su saldo, no «1»', async () => {
  const r = await ejemploCuentaBanco();
  const a = await arbol({ foco: { X: r.cuenta.id, pv: 0 }, rosetones: { 1: NIVEL.tarjeta } }, r.eje, 'ana', ORDENADOR);
  assert.equal(a.centro.cuenta.saldo.unidad, 'EUR');
  assert.equal(a.centro.cuenta.permiso.estado, 'vigente');
  const h = html(a);
  const bloque = h.slice(h.indexOf('<div class="cuenta-del-banco"'), h.indexOf('</div>', h.indexOf('<div class="cuenta-del-banco"')));
  assert.ok(bloque.includes('Banco de Ejemplo'));
  assert.ok(bloque.includes(a.centro.cuenta.saldo.cuanto + '</b> <span class="cuenta-unidad">EUR</span>'), bloque);
  assert.ok(bloque.includes('datetime="' + T2 + '"'));
  assert.ok(bloque.includes(textoDeLaCarta('cuentaConfirmado')));
  assert.ok(bloque.includes('data-permiso="vigente"'));
  const roseton = a.rosetones.find((x) => x.pv === 1);
  const entrada = roseton.cartera.find((x) => x.cuenta);
  assert.deepEqual([entrada.cuenta.nombre, entrada.cuenta.saldo.cuanto], ['cuenta de casa', a.centro.cuenta.saldo.cuanto]);
  assert.match(h, new RegExp('<li class="cartera-cuenta" data-cuenta="' + r.cuenta.id + '"><span class="cartera-nombre">cuenta de casa</span> <b>' + a.centro.cuenta.saldo.cuanto + ' EUR</b></li>'));
  // Un registro que no es una cuenta no lleva el bloque; sin permiso, la carta lo dice.
  const otro = await arbol({ foco: { X: r.nota.id, pv: 0 } }, r.eje, 'ana', ORDENADOR);
  assert.equal(otro.centro.cuenta, null);
  assert.ok(!html(otro).includes('cuenta-del-banco'));
  const { eje, cuenta } = await mundo();
  const sin = html(await arbol({ foco: { X: cuenta.id, pv: 0 } }, eje, 'ana', ORDENADOR));
  assert.ok(sin.includes('data-permiso="falta"') && sin.includes(textoDeLaCarta('cuentaSinSaldo')));
});

// ---------- 7. revisión de seguridad: nadie sin P falsea el saldo ni el permiso ----------

test('seguridad: quien no tiene P sobre la cuenta no escribe un saldo ni un permiso (la regla lo rechaza) y, si llegara uno al libro, contrato.cuenta no lo cuenta; «confirmado por el banco» solo si lo escribe la conectora', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  const permiso = await lanzar('grant the permission', cuenta.id, { until: diasDespues(T1, 180) }, 'conectora', T1);
  const bueno = await lanzar('update the balance', cuenta.id, { amount: 100, when: T1 }, 'conectora', T1);
  const antes = C.cuenta(eje, cuenta.id);
  assert.deepEqual([antes.saldo.registro, antes.saldo.confirmado, antes.permiso.registro], [bueno.id, true, permiso.id]);
  // bea, sin P sobre la cuenta: ni con la plantilla (no se le ofrece y la regla la rechaza) ni a mano.
  const falso = await A.transaccion(eje, 'update the balance', { X: cuenta.id, amount: 999999, when: T2 }, 'bea', { t: T2 });
  assert.deepEqual([falso.ok, reglas(falso)], [false, ['acting on an account needs P on it']]);
  const caducar = await A.transaccion(eje, 'grant the permission', { X: cuenta.id, until: diasDespues(T2, 1) }, 'bea', { t: T2 });
  assert.deepEqual([caducar.ok, reglas(caducar)], [false, ['acting on an account needs P on it']]);
  const renovar = await A.transaccion(eje, 'renew the permission', { X: cuenta.id, until: diasDespues(T2, 1) }, 'bea', { t: T2 });
  assert.deepEqual([renovar.ok, reglas(renovar)], [false, ['acting on an account needs P on it']]);
  await assert.rejects(eje.anadir(falso.evento), /acting on an account needs P on it/);
  const despues = C.cuenta(eje, cuenta.id);
  assert.deepEqual([despues.saldo, despues.permiso], [antes.saldo, antes.permiso]);
  // ana (con P) puede escribir un saldo, pero no es la conectora: no sale «confirmado por el banco» aunque la fuente lo diga.
  const deAna = await lanzar('update the balance', cuenta.id, { amount: 7, when: T2 }, 'ana', T2);
  assert.deepEqual([C.cuenta(eje, cuenta.id).saldo.registro, C.cuenta(eje, cuenta.id).saldo.fuente, C.cuenta(eje, cuenta.id).saldo.confirmado], [deAna.id, 'confirmed by the bank', false]);
});

test('seguridad: el camino que da P sobre una cuenta ajena (una nota colgada de ella y un paso hacia arriba) también deja escribir saldos: la regla solo pide P mayor que cero', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  await lanzar('grant the permission', cuenta.id, { until: diasDespues(T1, 180) }, 'conectora', T1);
  const nota = await lanzar('anchor here', cuenta.id, { title: 'nota', content: 'x' }, 'bea', T2);
  await lanzar('reposition P toward X', cuenta.id, { from: 'P:' + nota.id + '/bea', amount: 10 }, 'bea', T2);
  const deBea = await lanzar('update the balance', cuenta.id, { amount: 999999, when: T2 }, 'bea', T2);
  const c = C.cuenta(eje, cuenta.id);
  assert.deepEqual([c.saldo.registro, c.saldo.cuanto, c.saldo.confirmado], [deBea.id, 999999, false], 'cuenta, pero no como «confirmado por el banco»');
  // La lectura lo vuelve a comprobar: si bea se lleva su P de la cuenta (un paso abajo, a su nota), su saldo deja de contar.
  await lanzar('reposition P toward X', nota.id, { from: 'P:' + cuenta.id + '/bea', amount: 1 }, 'bea', T3);
  assert.equal(eje.poderSobre('bea', cuenta.id), 0);
  assert.equal(C.cuenta(eje, cuenta.id).saldo, null, 'sin P, lo que escribió no es el saldo de la cuenta');
});
