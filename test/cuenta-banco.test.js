// La cuenta del banco (VG 16-11, la trae Core State; encargo «cuenta del banco» y su ajuste; docs/notas/CUENTA_BANCO.md):
// una E única con el saldo como dato. Todo con plantillas (la orden de pago es de StateArk: aquí, un registro cualquiera
// en el 4 de la cuenta). Lo que se comprueba:
//   1. «connect an account» (PV1, orden 6) escribe un registro en el 1.1 de mi alta con capacidad 1 en su 2; «issue E
//      tied to X» acuña la E única y bloquea el P que pide la cuota del tope; no cabe otra;
//   2. una persona recién llegada (un libro como lo crea «crear mi cuenta») recorre el camino entero con plantillas;
//   3. el camino del 9 de la cuenta;
//   4. el permiso (falta, vigente, caducado) y el saldo (manda el de instante más reciente, escrito con permiso);
//   5. quién ordena: la regla «acting on an account needs P on it» y la cuenta compartida (P reposicionado);
//   6. la revisión de seguridad: nadie sin P escribe saldos ni permisos; el permiso y «confirmado por el banco» solo de
//      una cosa del dueño; fechas que no pueden mentir;
//   7. contrato.cuenta, la carta y el ejemplo;
//   8. la cuenta vive en el libro de su dueño (firme, VG 17-11, V6);
//   9. la E de una cuenta no cambia de manos (VG 17-11, V6): ni se transfiere ni se acuña para otra persona, y las
//      plantillas no lo ofrecen; el dueño la acuña y la quema como antes; una invitada sigue ganando P y proponiendo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { claveToken } from '../src/tokens.js';
import { generarClaves, firmar, firmarPosesion } from '../src/autoridad.js';
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
const P_SOBRE_LA_CUENTA = 'acting on an account needs P on it';
const EL_BANCO = "the bank speaks through the owner's thing";
const DE_SU_DUENO = 'the E of an account stays with its owner';

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

/** La E única, con la plantilla. */
const acunar = (lanzar, cuenta, yo = 'ana', t = T1) => lanzar('issue E tied to X', cuenta.id, { denomination: 'account', quantity: 1 }, yo, t);

/** Una orden sobre la cuenta: un registro cualquiera anclado en su 4 (la orden de pago es de StateArk). */
const ordenar = (eje, cuenta, yo, t = T3, en = '4000000000') => eje.escribir({ autor: yo, sobre: cuenta.id, en, t, payload: ['orden de pago simulada de ' + yo], movimientos: [pagaElCoste(yo)] });

// ---------- 1. la cuenta y su E única ----------

test('«connect an account»: PV1 orden 6, en el 1.1 de mi alta; 0 el nombre, 1.0 el banco, 1.1 los días (180), 2 la capacidad 1, 3 quién, 4 la acción, 5 el tipo «account»; nada del banco', async () => {
  const { eje, alta, cuenta } = await mundo();
  assert.deepEqual(A.plantillaDeTransaccion('connect an account')[8], [1, 6]);
  assert.ok(A.acciones(eje, alta, 1, 'ana').some((a) => a.nombre === 'connect an account'), 'se ofrece en el 1 de mi alta');
  assert.ok(!A.acciones(eje, alta, 1, 'bea').some((a) => a.nombre === 'connect an account'), 'no en un alta ajena');
  assert.deepEqual([cuenta.sobre, cuenta.en], [alta, '1100000000']);
  assert.deepEqual(cuenta.payload, [['cuenta de casa'], [['Banco de Ejemplo'], [180]], [1], ['ana'], ['connect an account'], ['account']]);
  assert.equal(C.nombreDePlantilla(C.plantilla(eje, cuenta.id)), 'account');
  assert.deepEqual(eje.topes(cuenta.id, T0).map((x) => x.capacidad), [1]);
  // Lanzada desde otro registro mío, ancla igual en mi alta (su 5: «=first me.6»).
  const otra = await A.transaccion(eje, 'connect an account', { X: cuenta.id, name: 'ahorro', bank: 'Banco de Ejemplo' }, 'ana', { t: T0 });
  assert.deepEqual([otra.ok, otra.evento.sobre, otra.evento.en], [true, alta, '1100000000']);
  const dos = await A.transaccion(eje, 'connect an account', { X: alta, name: 'x', bank: 'y', capacity: 2 }, 'ana', { t: T0 });
  assert.deepEqual(reglas(dos), ['capacity']);
  assert.equal(C.texto(eje, C.claves.plantilla('connect an account'), 'es'), 'conectar una cuenta');
  assert.equal(C.texto(eje, C.claves.plantilla('update the balance'), 'es'), 'actualizar el saldo');
});

test('la E única: «issue E tied to X» la acuña sola y bloquea 1 de mi P sobre la cuenta con la salida = la serie (la cuota del tope); no cabe otra; sin capacidad no bloquea nada', async () => {
  const { eje, alta, cuenta, lanzar } = await mundo();
  const serie = claveToken({ token: 'E', emisor: 'ana', denominacion: 'account', registro: cuenta.id });
  const ev = await acunar(lanzar, cuenta);
  assert.deepEqual(ev.payload[1], [['account'], [1], [['E'], [1]], [1]], 'el compromiso, en su 1.3');
  assert.deepEqual(ev.movimientos.slice(1).map((m) => [m.token, m.cantidad, m.de, m.a, m.estado ?? null, m.salida ?? null, m.ambito ?? null, m.origen ?? null]),
    [['E', 1, null, 'ana', null, null, null, null], ['P', 1, 'ana', 'ana', 'bloqueo', serie, cuenta.id, 'ana']]);
  assert.equal(eje.saldo('ana', serie), 1);
  assert.deepEqual(C.cuenta(eje, cuenta.id).unica, { serie, quien: ['ana'] });
  const otra = await A.transaccion(eje, 'issue E tied to X', { X: cuenta.id, denomination: 'otra', quantity: 1 }, 'ana', { t: T1 });
  assert.ok(otra.motivos.some((m) => /tope de E del registro .* llegaría a 2 y su capacidad es 1/.test(m.mensaje)), JSON.stringify(otra.motivos));
  // Sobre un registro sin capacidad (su 2 es un texto): ni compromiso ni bloqueo, la plantilla de siempre.
  const nota = await lanzar('anchor here', alta, { title: 'vales', content: 'x' }, 'ana', T1);
  const vales = await A.transaccion(eje, 'issue E tied to X', { X: nota.id, denomination: 'vale', quantity: 3 }, 'ana', { t: T1 });
  assert.ok(vales.ok, JSON.stringify(vales.motivos));
  assert.deepEqual([vales.evento.payload[1].length, vales.evento.movimientos.some((m) => m.estado === 'bloqueo')], [3, false]);
});

// ---------- 2. una persona recién llegada, con plantillas ----------

test('una persona recién llegada («crear mi cuenta»: génesis sin emisión) recorre el camino entero solo con plantillas: conectar, su conectora con clave, el permiso, su R (admitiendo a la conectora en la cuenta), la E única y un saldo', async () => {
  const { cuenta: yo, eje, privada } = await crearCuenta({ nombre: 'vg', t: T0 });
  const conectora = await generarClaves();
  const firmaDe = { [yo.identidad]: privada, conectora: conectora.privada };
  const lanzar = async (nombre, X, parametros, quien, t, posesion) => {
    const r = await A.transaccion(eje, nombre, { X, ...parametros }, quien, { t, firmar: (ev) => firmar(ev, firmaDe[quien]) });
    assert.ok(r.ok || posesion, nombre + ': ' + JSON.stringify(r.motivos));
    return eje.anadir(posesion ? await firmarPosesion(r.evento, posesion.quien, posesion.privada) : r.evento);
  };
  const cuenta = await lanzar('connect an account', yo.alta, { name: 'cuenta de casa', bank: 'Banco de Ejemplo' }, yo.identidad, T0);
  await lanzar('register a thing', yo.alta, { thing: 'conectora', minutes: 60, key: conectora.publica }, yo.identidad, T0, { quien: 'conectora', privada: conectora.privada });
  await lanzar('grant the permission', cuenta.id, { until: diasDespues(T1, 180) }, 'conectora', T1);
  // Sin R propia emitida no acuña (la regla no cambia).
  const sinR = await A.transaccion(eje, 'issue E tied to X', { X: cuenta.id, denomination: 'account', quantity: 1 }, yo.identidad, { t: T1, firmar: (ev) => firmar(ev, privada) });
  assert.deepEqual(reglas(sinR), ['minting E needs own R issued']);
  // Su R: admite a su conectora en la cuenta («admit someone» le da una unidad de su R, que acuña en la misma transacción).
  await lanzar('admit someone', cuenta.id, { whom: 'conectora' }, yo.identidad, T1);
  await lanzar('issue E tied to X', cuenta.id, { denomination: 'account', quantity: 1 }, yo.identidad, T1);
  await lanzar('update the balance', cuenta.id, { amount: 1250.4, when: T1 }, 'conectora', T1);
  const c = C.cuenta(eje, cuenta.id);
  assert.deepEqual([c.unica.quien, c.permiso.estado, c.saldo.cuanto, c.saldo.confirmado, c.ordenan], [[yo.identidad], 'vigente', 1250.4, true, [yo.identidad]]);
  const pasos = (await A.camino(eje, cuenta.id, yo.identidad, { t: T1 })).pasos.map((p) => [p.hacer?.plantilla, p.hecho]);
  assert.deepEqual(pasos, [['connect an account', true], ['grant the permission', true], ['issue E tied to X', true], ['renew the permission', false]]);
});

// ---------- 3. el camino del 9 ----------

test('el camino del 9 de la cuenta: elegir el banco (hecho al escribirla), dar el permiso (lo da la conectora, una cosa mía), volver (la E única) y renovar (en el 7.2 de la cuenta)', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  const pasos = async (t) => (await A.camino(eje, cuenta.id, 'ana', { t })).pasos.map((p) => [p.hacer?.plantilla, p.hecho]);
  assert.deepEqual(await pasos(T0), [['connect an account', true], ['grant the permission', false], ['issue E tied to X', false], ['renew the permission', false]]);
  const permiso = await lanzar('grant the permission', cuenta.id, { until: diasDespues(T1, 180) }, 'conectora', T1);
  assert.deepEqual([permiso.sobre, permiso.en], [cuenta.id, '7000000000']);
  assert.deepEqual(permiso.payload.slice(1, 5), [[['bank permission'], [diasDespues(T1, 180)]], ['all announced movements happened'], ['conectora'], ['grant the permission']]);
  await acunar(lanzar, cuenta);
  assert.deepEqual(await pasos(T1), [['connect an account', true], ['grant the permission', true], ['issue E tied to X', true], ['renew the permission', false]]);
  const renueva = await lanzar('renew the permission', cuenta.id, { until: diasDespues(T2, 180) }, 'conectora', T2);
  assert.deepEqual([renueva.sobre, renueva.en], [cuenta.id, '7200000000']);
  assert.deepEqual((await pasos(T2)).at(-1), ['renew the permission', true]);
  assert.deepEqual([C.cuenta(eje, cuenta.id).permiso.registro, C.cuenta(eje, cuenta.id).permiso.vence], [renueva.id, diasDespues(T2, 180)]);
});

// ---------- 4. el permiso y el saldo ----------

test('el permiso: falta, vigente y caducado; no pasa de los días de la cuenta; sin permiso (o caducado) el saldo no se actualiza; manda el de instante más reciente', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  assert.deepEqual(C.cuenta(eje, cuenta.id).permiso, { estado: 'falta', vence: null, registro: null });
  await lanzar('update the balance', cuenta.id, { amount: 999, when: T0 }, 'conectora', T0);
  assert.equal(C.cuenta(eje, cuenta.id).saldo, null, 'un saldo antes del permiso queda en el libro, pero no es el de la cuenta');
  const largo = await A.transaccion(eje, 'grant the permission', { X: cuenta.id, until: diasDespues(T1, 181) }, 'conectora', { t: T1 });
  assert.deepEqual(reglas(largo), ['until']);
  const permiso = await lanzar('grant the permission', cuenta.id, { until: diasDespues(T1, 180) }, 'conectora', T1);
  assert.deepEqual(C.cuenta(eje, cuenta.id).permiso, { estado: 'vigente', vence: diasDespues(T1, 180), registro: permiso.id });
  const s1 = await lanzar('update the balance', cuenta.id, { amount: 1250.4, when: T1 }, 'conectora', T1);
  assert.deepEqual(s1.payload.slice(1), [[['balance'], [1250.4], ['EUR'], [T1]], ['all announced movements happened'], [['conectora'], ['confirmed by the bank']], ['update the balance']]);
  assert.deepEqual([s1.sobre, s1.en, s1.movimientos.every((m) => m.token === 'T')], [cuenta.id, '1000000000', true], 'en el 1 de la cuenta; solo lo que cuesta escribir');
  const s2 = await lanzar('update the balance', cuenta.id, { amount: 1180.15, when: T2 }, 'conectora', T2);
  await lanzar('update the balance', cuenta.id, { amount: 5, when: T1 }, 'ana', T3); // llega después, con un instante anterior: no manda
  assert.deepEqual(C.cuenta(eje, cuenta.id).saldo, { cuanto: 1180.15, unidad: 'EUR', t: T2, fuente: 'confirmed by the bank', confirmado: true, registro: s2.id });
  const despues = diasDespues(T1, 181);
  assert.equal(C.cuenta(eje, cuenta.id, { t: despues }).permiso.estado, 'caducado');
  await lanzar('update the balance', cuenta.id, { amount: 1, when: despues }, 'conectora', despues);
  assert.deepEqual([C.cuenta(eje, cuenta.id).saldo.cuanto, C.cuenta(eje, cuenta.id).permiso.estado], [1180.15, 'caducado']);
  assert.ok(A.acciones(eje, cuenta.id, 1, 'conectora').some((a) => a.nombre === 'update the balance'));
  assert.ok(!A.acciones(eje, cuenta.id, 1, 'bea').some((a) => a.nombre === 'update the balance'));
});

// ---------- 5. quién ordena ----------

test('«acting on an account needs P on it»: en el 4 de la cuenta solo escribe quien tiene P sobre ella o una cosa suya; bea consigue P reposicionando el suyo (el defecto de «from» ya lo propone) y desde entonces ordena', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  assert.ok(EPOCA_0_BTML.reglasConId.some((x) => x.regla[0][0] === P_SOBRE_LA_CUENTA));
  await assert.rejects(ordenar(eje, cuenta, 'bea'), /acting on an account needs P on it: bea acts on the account cuenta de casa \(an order, a balance or a permission\) and neither it nor its owner has P on it/);
  await assert.rejects(ordenar(eje, cuenta, 'bea', T3, '4100000000'), /acting on an account needs P on it/, 'también en un hijo del 4 (4.1, el anuncio)');
  await ordenar(eje, cuenta, 'ana');
  await ordenar(eje, cuenta, 'conectora');
  await eje.escribir({ autor: 'bea', sobre: cuenta.id, en: '6000000000', t: T3, payload: ['una nota de bea'], movimientos: [pagaElCoste('bea')] });
  assert.deepEqual(C.cuenta(eje, cuenta.id).ordenan, ['ana']);
  const nota = await lanzar('anchor here', cuenta.id, { title: 'cuenta compartida', content: 'la llevamos entre las dos' }, 'bea', T2);
  const propuesta = A.acciones(eje, cuenta.id, 2, 'bea').find((a) => a.nombre === 'reposition P toward X');
  // El defecto de «from»: su P entero sobre un hijo de la cuenta (la nota del 6 que escribió antes), no el de una mirada.
  const desde = propuesta.parametros.find((p) => p.nombre === 'from').valor;
  const hijo = desde.slice(2, 66);
  assert.ok(/^P:[0-9a-f]{64}\/bea$/.test(desde) && eje.obtener(hijo)?.sobre === cuenta.id, desde);
  const sube = await lanzar('reposition P toward X', cuenta.id, {}, 'bea', T2);
  assert.deepEqual(sube.movimientos.slice(1).map((m) => [m.token, m.ambito, m.cantidad, m.de, m.a]), [['P', hijo, 10, 'bea', null], ['P', cuenta.id, 1, null, 'bea']]);
  assert.ok(nota.id);
  assert.deepEqual(C.cuenta(eje, cuenta.id).ordenan, ['ana', 'bea']);
  await ordenar(eje, cuenta, 'bea');
});

// ---------- 6. revisión de seguridad ----------

test('seguridad: quien no tiene P no escribe un saldo ni un permiso, y contrato.cuenta no cambia; «confirmado por el banco» solo si lo escribe la conectora', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  const permiso = await lanzar('grant the permission', cuenta.id, { until: diasDespues(T1, 180) }, 'conectora', T1);
  const bueno = await lanzar('update the balance', cuenta.id, { amount: 100, when: T1 }, 'conectora', T1);
  const antes = C.cuenta(eje, cuenta.id);
  assert.deepEqual([antes.saldo.registro, antes.saldo.confirmado, antes.permiso.registro], [bueno.id, true, permiso.id]);
  const falso = await A.transaccion(eje, 'update the balance', { X: cuenta.id, amount: 999999, when: T2 }, 'bea', { t: T2 });
  assert.deepEqual([falso.ok, reglas(falso)], [false, [P_SOBRE_LA_CUENTA]]);
  for (const nombre of ['grant the permission', 'renew the permission']) {
    const x = await A.transaccion(eje, nombre, { X: cuenta.id, until: diasDespues(T2, 1) }, 'bea', { t: T2 });
    assert.deepEqual([x.ok, reglas(x)], [false, [P_SOBRE_LA_CUENTA, EL_BANCO]], nombre);
  }
  await assert.rejects(eje.anadir(falso.evento), /acting on an account needs P on it/);
  const despues = C.cuenta(eje, cuenta.id);
  assert.deepEqual([despues.saldo, despues.permiso], [antes.saldo, antes.permiso]);
  // ana (con P) escribe un saldo con la fuente del banco, pero no es la conectora: no sale confirmado.
  const deAna = await lanzar('update the balance', cuenta.id, { amount: 7, when: T2 }, 'ana', T2);
  assert.deepEqual([C.cuenta(eje, cuenta.id).saldo.registro, C.cuenta(eje, cuenta.id).saldo.confirmado], [deAna.id, false]);
  // Ni el dueño en persona da el permiso: es de su conectora.
  const delDueno = await A.transaccion(eje, 'grant the permission', { X: cuenta.id, until: diasDespues(T2, 10) }, 'ana', { t: T2 });
  assert.deepEqual(reglas(delDueno), [EL_BANCO]);
});

test('seguridad: bea gana P sobre la cuenta, da de alta una cosa suya y esa cosa escribe permiso y saldo con la fuente del banco: el permiso se rechaza y el saldo no sale confirmado; la lectura vuelve a comprobar el P', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  const permiso = await lanzar('grant the permission', cuenta.id, { until: diasDespues(T1, 180) }, 'conectora', T1);
  const nota = await lanzar('anchor here', cuenta.id, { title: 'nota', content: 'x' }, 'bea', T2);
  await lanzar('reposition P toward X', cuenta.id, {}, 'bea', T2);
  await lanzar('register a thing', eje.alta('bea').id, { thing: 'falsa', minutes: 60 }, 'bea', T2);
  const suyo = await A.transaccion(eje, 'grant the permission', { X: cuenta.id, until: diasDespues(T2, 180) }, 'falsa', { t: T2 });
  assert.deepEqual(reglas(suyo), [EL_BANCO], 'la cosa de bea no es del dueño de la cuenta');
  assert.ok(!A.acciones(eje, cuenta.id, 7, 'falsa').some((a) => a.nombre === 'grant the permission'), 'ni se le ofrece');
  const saldo = await lanzar('update the balance', cuenta.id, { amount: 999999, when: T2 }, 'falsa', T2);
  const c = C.cuenta(eje, cuenta.id);
  assert.deepEqual([c.saldo.registro, c.saldo.cuanto, c.saldo.confirmado, c.permiso.registro], [saldo.id, 999999, false, permiso.id], 'cuenta (bea tiene P: lo decide VG), pero no confirmado, y el permiso no cambia');
  // Si bea se lleva su P de la cuenta (un paso abajo, a su nota), lo de su cosa deja de contar.
  await lanzar('reposition P toward X', nota.id, { from: 'P:' + cuenta.id + '/bea', amount: 1 }, 'bea', T3);
  assert.equal(eje.poderSobre('bea', cuenta.id), 0);
  assert.equal(C.cuenta(eje, cuenta.id).saldo, null);
});

test('seguridad: fechas que no pueden mentir: un saldo con un instante posterior a su registro y un permiso que vence más allá de los días de la cuenta se rechazan al escribir, también a mano, y la cuenta no cambia', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  const permiso = await lanzar('grant the permission', cuenta.id, { until: diasDespues(T1, 180) }, 'conectora', T1);
  const bueno = await lanzar('update the balance', cuenta.id, { amount: 100, when: T1 }, 'conectora', T1);
  const futuro = await A.transaccion(eje, 'update the balance', { X: cuenta.id, amount: 5, when: T3 }, 'conectora', { t: T2 });
  assert.deepEqual(reglas(futuro), ['when'], 'la plantilla no lo construye');
  const aMano = (payload, en) => eje.escribir({ autor: 'conectora', sobre: cuenta.id, en, t: T2, payload, movimientos: [pagaElCoste('conectora')] });
  await assert.rejects(aMano(['saldo del futuro', [['balance'], [5], ['EUR'], [T3]], ['all announced movements happened'], [['conectora'], ['confirmed by the bank']], ['update the balance']], '1000000000'), /the bank speaks through the owner's thing/);
  await assert.rejects(aMano(['permiso de 400 días', [['bank permission'], [diasDespues(T2, 400)]], ['all announced movements happened'], ['conectora'], ['grant the permission']], '7000000000'), /the bank speaks through the owner's thing/);
  const c = C.cuenta(eje, cuenta.id);
  assert.deepEqual([c.saldo.registro, c.permiso.registro], [bueno.id, permiso.id]);
});

// ---------- 7. el contrato, la carta y el ejemplo ----------

test('contrato.cuenta: null si el registro no es una cuenta; la clave de su E también la nombra', async () => {
  const { eje, alta, cuenta, lanzar } = await mundo();
  assert.equal(C.cuenta(eje, alta), null);
  assert.equal(C.cuenta(eje, 'f'.repeat(64)), null);
  await acunar(lanzar, cuenta);
  assert.equal(C.cuenta(eje, C.cuenta(eje, cuenta.id).unica.serie).id, cuenta.id);
  assert.deepEqual(Object.keys(C.cuenta(eje, cuenta.id)), ['id', 'nombre', 'banco', 'dias', 'unica', 'saldo', 'permiso', 'ordenan']);
});

test('el ejemplo «cuenta»: ana conecta, la conectora da el permiso, se acuña la E con la plantilla, llegan dos saldos y bea, con P reposicionado, ordena (con claves y sin ellas)', async () => {
  for (const claves of [{}, { ana: await generarClaves(), conectora: await generarClaves(), bea: await generarClaves() }]) {
    const r = await ejemploCuentaBanco({ claves });
    const c = C.cuenta(r.eje, r.cuenta.id);
    assert.deepEqual([c.nombre, c.banco, c.dias], [CUENTA.nombre, CUENTA.banco, CUENTA.dias]);
    assert.deepEqual([c.saldo.cuanto, c.saldo.t, c.saldo.confirmado], [1180.15, T2, true]);
    assert.deepEqual([c.permiso.estado, c.permiso.vence], ['vigente', diasDespues(T1, 180)]);
    assert.deepEqual([c.unica.quien, c.ordenan], [['ana'], ['ana', 'bea']]);
    assert.deepEqual(r.unica.payload[4], ['issue E tied to X'], 'la E, con la plantilla');
    assert.deepEqual([r.orden.sobre, r.orden.en, r.orden.autor], [r.cuenta.id, '4000000000', 'bea']);
    if (claves.ana) assert.ok(r.cuenta.firma && r.permiso.firma && r.unica.firma && r.orden.firma);
  }
});

test('la carta pinta lo que da contrato.cuenta: en el anverso de la cuenta, el saldo con su unidad, la fecha, «confirmado por el banco» y el permiso; en la cartera del rosetón del 1, el nombre de la cuenta y su saldo, no «1»', async () => {
  const r = await ejemploCuentaBanco();
  const a = await arbol({ foco: { X: r.cuenta.id, pv: 0 }, rosetones: { 1: NIVEL.tarjeta } }, r.eje, 'ana', ORDENADOR);
  assert.deepEqual([a.centro.cuenta.saldo.unidad, a.centro.cuenta.permiso.estado], ['EUR', 'vigente']);
  const h = html(a);
  const i = h.indexOf('<div class="cuenta-del-banco"');
  const bloque = h.slice(i, h.indexOf('</div>', i));
  assert.ok(bloque.includes('Banco de Ejemplo'));
  assert.ok(bloque.includes(a.centro.cuenta.saldo.cuanto + '</b> <span class="cuenta-unidad">EUR</span>'), bloque);
  assert.ok(bloque.includes('datetime="' + T2 + '"'));
  assert.ok(bloque.includes(textoDeLaCarta('cuentaConfirmado')));
  assert.ok(bloque.includes('data-permiso="vigente"'));
  const entrada = a.rosetones.find((x) => x.pv === 1).cartera.find((x) => x.cuenta);
  assert.deepEqual([entrada.cuenta.nombre, entrada.cuenta.saldo.cuanto], ['cuenta de casa', a.centro.cuenta.saldo.cuanto]);
  assert.match(h, new RegExp('<li class="cartera-cuenta" data-cuenta="' + r.cuenta.id + '"><span class="cartera-nombre">cuenta de casa</span> <b>' + a.centro.cuenta.saldo.cuanto + ' EUR</b></li>'));
  // VG 17-11 (V6): debajo del permiso, quién puede proponer pagos (contrato.cuenta, su «ordenan»), quién los aprueba y quién ve el saldo.
  assert.deepEqual([a.centro.cuenta.proponen, a.centro.cuenta.titular], [{ nombres: ['ana', 'bea'], mas: 0 }, 'ana']);
  const tras = bloque.slice(bloque.indexOf('data-permiso='));
  assert.ok(tras.includes('<p class="cuenta-proponen">' + textoDeLaCarta('cuentaProponen', { quienes: 'ana, bea' }) + '</p>'), bloque);
  assert.ok(tras.includes('<p class="cuenta-aprueba">' + textoDeLaCarta('cuentaAprueba', { titular: 'ana' }) + '</p>'), bloque);
  assert.ok(tras.includes('<p class="cuenta-ven">' + textoDeLaCarta('cuentaVenSaldo') + '</p>'), bloque);
  assert.equal(textoDeLaCarta('cuentaProponen', { quienes: 'ana, bea' }), 'pueden proponer pagos: ana, bea');
  assert.equal(textoDeLaCarta('cuentaAprueba', { titular: 'ana' }), 'cada pago lo aprueba ana en su banco');
  assert.match(textoDeLaCarta('cuentaTitulo'), /puede proponer pagos; cada uno lo aprueba el titular en su banco/);
  const otro = await arbol({ foco: { X: r.nota.id, pv: 0 } }, r.eje, 'ana', ORDENADOR);
  assert.equal(otro.centro.cuenta, null);
  assert.ok(!html(otro).includes('cuenta-del-banco'));
  const { eje, cuenta } = await mundo();
  const sin = html(await arbol({ foco: { X: cuenta.id, pv: 0 } }, eje, 'ana', ORDENADOR));
  assert.ok(sin.includes('data-permiso="falta"') && sin.includes(textoDeLaCarta('cuentaSinSaldo')));
});

// ---------- 8. la cuenta solo se conecta en el libro propio (firme: VG 17-11, V6) ----------

test("«an account lives in its owner's book» (VG 17-11, V6): en un libro ajeno conectar una cuenta se rechaza (ni se ofrece); en el propio pasa, y una persona invitada al libro propio gana P y ordena", async () => {
  const { eje, cuenta, lanzar } = await mundo(); // el libro de ana (su génesis): bea está invitada
  const altaBea = eje.alta('bea').id;
  assert.ok(!A.acciones(eje, altaBea, 1, 'bea').some((a) => a.nombre === 'connect an account'), 'a bea no se le ofrece en el libro de ana');
  const ajena = await A.transaccion(eje, 'connect an account', { X: altaBea, name: 'la mía', bank: 'Banco de Ejemplo' }, 'bea', { t: T1 });
  assert.deepEqual([ajena.ok, reglas(ajena)], [false, ["an account lives in its owner's book"]]);
  assert.match(ajena.motivos[0].mensaje, /bea .*(ana)/);
  await assert.rejects(eje.anadir(ajena.evento), /an account lives in its owner's book: bea connects an account in a ledger that is not its own \(its genesis was written by ana\)/);
  // En el propio, sí (la de mundo() ya pasó); y bea, invitada, gana P sobre la cuenta y ordena.
  assert.ok(C.cuenta(eje, cuenta.id));
  await lanzar('anchor here', cuenta.id, { title: 'nota', content: 'x' }, 'bea', T2);
  await lanzar('reposition P toward X', cuenta.id, {}, 'bea', T2);
  const orden = await ordenar(eje, cuenta, 'bea');
  assert.deepEqual([orden.autor, C.cuenta(eje, cuenta.id).ordenan], ['bea', ['ana', 'bea']]);
});

// ---------- 9. la E de una cuenta no cambia de manos (VG 17-11, V6) ----------

/** Un movimiento a mano de la E de la cuenta de ana (de ana a quien sea; de null es acuñar). */
const eDeLaCuenta = (cuenta, de, a) => ({ token: 'E', emisor: 'ana', denominacion: 'account', registro: cuenta.id, cantidad: 1, de, a });

test('«the E of an account stays with its owner»: la E de la cuenta no se transfiere a otra persona ni se acuña para otra (rechazo con el motivo de la regla); el dueño la acuña y la quema como antes', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  assert.ok(EPOCA_0_BTML.reglasConId.some((x) => x.regla[0][0] === DE_SU_DUENO));
  // Acuñarla para otra a mano ya lo para el suelo (la emisión de E va a su emisor); que otra la acuñe para sí, con P
  // sobre la cuenta, lo para la regla (la prueba siguiente).
  await assert.rejects(eje.escribir({ autor: 'ana', sobre: cuenta.id, en: '6000000000', t: T1, payload: ['para bea'], movimientos: [pagaElCoste('ana'), eDeLaCuenta(cuenta, null, 'bea')] }),
    /la emisión de E va a su propio emisor/);
  // El dueño la acuña como hasta ahora.
  const serie = claveToken({ token: 'E', emisor: 'ana', denominacion: 'account', registro: cuenta.id });
  await acunar(lanzar, cuenta);
  assert.equal(eje.saldo('ana', serie), 1);
  // Transferirla a otra persona: se rechaza.
  const pasar = (mov, t = T2) => eje.escribir({ autor: 'ana', sobre: cuenta.id, en: '6000000000', t, payload: ['paso'], movimientos: [pagaElCoste('ana'), mov] });
  await assert.rejects(pasar(eDeLaCuenta(cuenta, 'ana', 'bea')), /the E of an account stays with its owner: ana passes the E of an account to bea, who did not write it/);
  assert.deepEqual([eje.saldo('ana', serie), eje.saldo('bea', serie), C.cuenta(eje, cuenta.id).unica.quien], [1, 0, ['ana']]);
  // Otra E de ana (sin cuenta) sí pasa de manos: la regla solo mira las series atadas a una cuenta.
  const nota = await lanzar('anchor here', eje.alta('ana').id, { title: 'vales', content: 'x' }, 'ana', T1);
  await lanzar('issue E tied to X', nota.id, { denomination: 'vale', quantity: 3 }, 'ana', T1);
  await eje.escribir({ autor: 'ana', sobre: nota.id, en: '6000000000', t: T2, payload: ['un vale para bea'], movimientos: [pagaElCoste('ana'), { token: 'E', emisor: 'ana', denominacion: 'vale', registro: nota.id, cantidad: 1, de: 'ana', a: 'bea' }] });
  assert.equal(eje.saldo('bea', claveToken({ token: 'E', emisor: 'ana', denominacion: 'vale', registro: nota.id })), 1);
  // Un anuncio no mueve nada (no está en el 1 de la candidata: la regla no lo mira), pero «pay» no se ofrece para cumplir
  // el de la E de la cuenta; el de un vale, sí.
  const anuncia = (mov, payload) => eje.escribir({ autor: 'ana', sobre: nota.id, en: '4100000000', t: T2, payload: [payload], movimientos: [pagaElCoste('ana'), { ...mov, estado: 'anunciado' }] });
  const deLaCuenta = await anuncia(eDeLaCuenta(cuenta, 'ana', 'bea'), 'la cuenta para bea');
  assert.ok(!A.acciones(eje, nota.id, 4, 'ana').some((a) => a.nombre === 'pay'), 'no se ofrece pagar el anuncio de la E de la cuenta');
  const pago = await A.transaccion(eje, 'pay', { X: nota.id, announcement: deLaCuenta.id }, 'ana', { t: T2 });
  assert.ok(reglas(pago).includes(DE_SU_DUENO), JSON.stringify(pago.motivos));
  await anuncia({ token: 'E', emisor: 'ana', denominacion: 'vale', registro: nota.id, cantidad: 1, de: 'ana', a: 'bea' }, 'otro vale para bea');
  assert.ok(A.acciones(eje, nota.id, 4, 'ana').some((a) => a.nombre === 'pay'), 'el de un vale, sí');
  // Quemarla sigue valiendo («consume» sobre la cuenta).
  const quema = await lanzar('consume', cuenta.id, { series: serie, quantity: 1 }, 'ana', T3);
  assert.deepEqual(quema.movimientos.slice(1).map((m) => [m.token, m.de, m.a]), [['E', 'ana', null]]);
  assert.equal(eje.saldo('ana', serie), 0);
});

test('la E de una cuenta: quien gana P sobre una cuenta ajena no acuña su E (ni se le ofrece); las plantillas que mueven E no ofrecen pasarla a otra persona', async () => {
  const { eje, alta, cuenta, lanzar } = await mundo();
  const altaBea = eje.alta('bea').id;
  // bea gana P sobre la cuenta (como en el ejemplo): sigue proponiendo, pero no acuña la E de la cuenta.
  await lanzar('anchor here', cuenta.id, { title: 'nota', content: 'x' }, 'bea', T1);
  await lanzar('reposition P toward X', cuenta.id, {}, 'bea', T1);
  assert.ok(eje.poderSobre('bea', cuenta.id) > 0);
  assert.ok(!A.acciones(eje, cuenta.id, 1, 'bea').some((a) => a.nombre === 'issue E tied to X'), 'a bea no se le ofrece acuñar sobre la cuenta de ana');
  const deBea = await A.transaccion(eje, 'issue E tied to X', { X: cuenta.id, denomination: 'account', quantity: 1 }, 'bea', { t: T1 });
  assert.ok(reglas(deBea).includes(DE_SU_DUENO), JSON.stringify(deBea.motivos));
  assert.ok(A.acciones(eje, cuenta.id, 1, 'ana').some((a) => a.nombre === 'issue E tied to X'), 'a ana sí');
  await acunar(lanzar, cuenta);
  // Con solo la E de la cuenta, ni pagar con E un recurso de otra ni pujar con ella.
  const ofrece = (nombre, X, pv) => A.acciones(eje, X, pv, 'ana').some((a) => a.nombre === nombre);
  assert.deepEqual([ofrece('apply a resource', altaBea, 1), ofrece('lock E as a bid for a quota', alta, 1)], [false, false]);
  // Escribir a bea cuando su precio es E: el pago no toma la E de la cuenta (no hay otra: la plantilla no tiene con qué pagar).
  for (const zone of [0, 1, 2, 3, 4]) await lanzar('set a group price', altaBea, { token: 'E', amount: 1, zone }, 'bea', T1);
  const carta = await A.transaccion(eje, 'write to X', { X: altaBea, text: 'hola' }, 'ana', { t: T2 });
  assert.deepEqual([carta.ok, reglas(carta)], [false, ['write to X']], 'la plantilla no encuentra con qué E pagar: la de la cuenta no cuenta');
  assert.match(carta.motivos[0].mensaje, /no hay serie/);
  // Con otra E (sin cuenta), las mismas plantillas vuelven a ofrecerse y la toman a ella.
  const nota = await lanzar('anchor here', alta, { title: 'vales', content: 'x' }, 'ana', T2);
  await lanzar('issue E tied to X', nota.id, { denomination: 'vale', quantity: 3 }, 'ana', T2);
  assert.deepEqual([ofrece('apply a resource', altaBea, 1), ofrece('lock E as a bid for a quota', alta, 1)], [true, true]);
  const puja = A.acciones(eje, alta, 1, 'ana').find((a) => a.nombre === 'lock E as a bid for a quota');
  assert.match(puja.parametros.find((p) => p.nombre === 'series').valor, /^E:ana\/vale@/);
  const conVale = await A.transaccion(eje, 'write to X', { X: altaBea, text: 'hola' }, 'ana', { t: T2 });
  assert.ok(conVale.ok, JSON.stringify(conVale.motivos));
  assert.deepEqual(conVale.evento.movimientos.filter((m) => m.token === 'E').map((m) => [m.denominacion, m.a]), [['vale', 'bea']]);
  // bea, con P sobre la cuenta, sigue proponiendo pagos.
  const orden = await ordenar(eje, cuenta, 'bea');
  assert.deepEqual([orden.autor, C.cuenta(eje, cuenta.id).ordenan], ['bea', ['ana', 'bea']]);
});

test('la carta: si pueden proponer pagos más de tres, los tres primeros y «y N más»', async () => {
  const { eje, cuenta, lanzar } = await mundo();
  for (const quien of ['cris', 'dani']) await entrarPorInvitacion(eje, { por: 'ana', quien, t: T0 });
  for (const quien of ['bea', 'cris', 'dani']) {
    await lanzar('anchor here', cuenta.id, { title: 'nota de ' + quien, content: 'x' }, quien, T1);
    await lanzar('reposition P toward X', cuenta.id, {}, quien, T1);
  }
  assert.deepEqual(C.cuenta(eje, cuenta.id).ordenan, ['ana', 'bea', 'cris', 'dani']);
  const a = await arbol({ foco: { X: cuenta.id, pv: 0 } }, eje, 'ana', ORDENADOR);
  assert.deepEqual(a.centro.cuenta.proponen, { nombres: ['ana', 'bea', 'cris'], mas: 1 });
  const quienes = textoDeLaCarta('cuentaProponenMas', { quienes: 'ana, bea, cris', n: 1 });
  assert.equal(quienes, 'ana, bea, cris y 1 más');
  assert.ok(html(a).includes('<p class="cuenta-proponen">' + textoDeLaCarta('cuentaProponen', { quienes }) + '</p>'));
});
