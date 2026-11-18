// Lo que piden las reglas en el camino, como dato (Core AGRAM 18-11; docs/notas/NUCLEO_6_7_8.md §6 y decisión 5): la
// lectura provisional «path steps» en X.9.8 (las filas de X.4.9, las peticiones de atención y las caducidades próximas),
// que acciones.camino lee con la época y el reloj que se le pasen; y los finales de un proceso como dato (motor.FINES sale
// de datos/provisional/finales.json, y el motor no nombra sus acciones).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ejemploReserva } from '../ejemplos/ikisai/reserva-booking.mjs';
import { Eje } from '../src/eje.js';
import { epocaDelEje } from '../src/epocas.js';
import { nombreDeRegla, posicionDeLectura, analizar } from '../src/bqlm.js';
import { FINES, PASOS_DE_LAS_REGLAS, pasosDeLasReglas, loQueFalta, cerrado } from '../src/motor.js';
import { camino } from '../src/acciones.js';
import { LECTURAS_PROVISIONALES, FINALES_PROVISIONALES } from '../src/provisional.js';
import { entrarPorInvitacion } from '../ejemplos/ikisai/altas.mjs';
import { pagaElCoste } from './ayudas-coste.js';

const T0 = '2026-11-08T10:00:00Z';
const R = (emisor, cantidad, de, a) => ({ token: 'R', emisor, cantidad, de, a });

test('«path steps» en X.9.8: una lectura provisional, sin me, detrás de «what is missing»', () => {
  const l = LECTURAS_PROVISIONALES.find((r) => posicionDeLectura(r) === PASOS_DE_LAS_REGLAS);
  assert.equal(nombreDeRegla(l), 'path steps');
  const formula = l[2][l[2].length - 1];
  analizar(formula, { sujeto: true });
  assert.ok(!/\bme\b/.test(formula));
  assert.ok(formula.includes('(first it.4).9'), 'empieza por las filas de X.4.9');
});

test('las peticiones de atención: «attend» es de la fila (el dueño del alta actúa), los demás esperan; atendida, ninguna', async () => {
  const eje = await Eje.genesis({ demostracion: true, identidad: 'g', t: T0, foco: 'raíz', emision: [{ token: 'R', cantidad: 10 }, { token: 'E', denominacion: 'vale', cantidad: 100 }] });
  await entrarPorInvitacion(eje, { por: 'g', quien: 'ana', t: T0, grupo: 3 });
  await entrarPorInvitacion(eje, { por: 'g', quien: 'bea', t: T0 });
  const plaza = (await eje.escribir({ autor: 'g', sobre: eje.genesisId, t: T0, payload: ['Plaza'], movimientos: [pagaElCoste('g')] })).id;
  await eje.escribir({ autor: 'ana', sobre: plaza, t: T0, payload: 'mi R', movimientos: [pagaElCoste('ana'), R('ana', 10, null, 'ana'), R('ana', 2, 'ana', 'bea')] });
  const alta = eje.alta('ana').id;
  const peticion = await eje.escribir({ autor: 'bea', sobre: alta, en: '3000000000', t: T0, payload: ['ana, te pido atención'], movimientos: [pagaElCoste('bea'), R('ana', 1, 'bea', 'ana')] });
  const filas = pasosDeLasReglas(eje, alta).filas.filter((f) => f.accion === 'attend');
  assert.deepEqual(filas.map((f) => [f.de, f.accion, f.sobre]), [[['ana'], 'attend', peticion.id]]);
  assert.deepEqual(pasosDeLasReglas(eje, plaza).filas, [], 'la plaza no es un alta: no hay peticiones');
  const deAna = (await camino(eje, alta, 'ana')).pasos.filter((p) => p.regla === 'attended');
  assert.deepEqual(deAna.map((p) => [p.hacer?.plantilla, p.hacer?.X, p.espera]), [['attend', peticion.id, null]]);
  const deBea = (await camino(eje, alta, 'bea')).pasos.filter((p) => p.regla === 'attended');
  assert.deepEqual(deBea.map((p) => [p.hacer, p.espera, p.peticion]), [[null, 'ana', peticion.id]]);
  await eje.escribir({ autor: 'ana', sobre: peticion.id, t: T0, payload: 'te atiendo', movimientos: [pagaElCoste('ana')] });
  assert.deepEqual(pasosDeLasReglas(eje, alta).filas.filter((f) => f.accion === 'attend'), []);
});

test('las caducidades próximas: con el reloj de quien lee, «expire something mine» y sus parámetros de la fila', async () => {
  const { eje, habitacion } = await ejemploReserva({ confirmar: false });
  const sinReloj = pasosDeLasReglas(eje, habitacion.id).filas.filter((f) => f.accion === 'expire something mine');
  const conReloj = pasosDeLasReglas(eje, habitacion.id, { ahora: '2026-11-20T18:00:00Z' }).filas.filter((f) => f.accion === 'expire something mine');
  assert.ok(conReloj.length > sinReloj.length, 'el 20 por la tarde caducan más noches que con el reloj del libro');
  const f = conReloj.find((x) => x.para === '2026-11-21T12:00:00Z');
  assert.deepEqual([f.de, f.accion, f.lanzar, f.sobre, f.parametros, f.texto], [['casa'], 'expire something mine', habitacion.id, habitacion.id, { series: f.serie }, f.serie + ' expires at 2026-11-21T12:00:00Z']);
  const mia = await camino(eje, habitacion.id, 'casa', { t: '2026-11-20T18:00:00Z' });
  assert.ok(mia.pasos.some((p) => p.hacer?.plantilla === 'expire something mine' && p.hacer.parametros.series === f.serie));
});

test('camino lee X.9.8 con la época que se le pasa: una época cuyo «what is missing» no da nada no pide pagar', async () => {
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const conPago = (await camino(eje, reserva.id, 'huesped')).pasos.filter((p) => p.regla === 'stage' && p.hacer);
  assert.deepEqual(conPago.map((p) => p.hacer.plantilla), ['pay']);
  const epoca = epocaDelEje(eje);
  const vacia = structuredClone(LECTURAS_PROVISIONALES.find((r) => nombreDeRegla(r) === 'what is missing'));
  vacia[2] = ['=(0 where 1 = 0)'];
  const otra = { ...epoca, lecturas: [...epoca.lecturas, vacia] };
  assert.deepEqual(loQueFalta(eje, reserva.id, { epoca: otra }).filas, []);
  const sinPago = (await camino(eje, reserva.id, 'huesped', { epoca: otra })).pasos.filter((p) => p.regla === 'stage');
  assert.deepEqual(sinPago, []);
});

test('los finales del proceso son dato: FINES sale de datos/provisional/finales.json y el motor no nombra sus acciones', async () => {
  assert.deepEqual(FINES, [
    { fin: 'error', plantilla: 'closed with error', accion: 'close with error' },
    { fin: 'caducado', plantilla: 'expired', accion: 'expire' },
    { fin: 'decidido', plantilla: 'closed by decision', accion: 'close by decision' },
  ]);
  assert.deepEqual(FINES.map((f) => f.accion), FINALES_PROVISIONALES.map((f) => f[2][0]));
  assert.deepEqual(FINALES_PROVISIONALES.map((f) => f[4]), [['causa', '0'], ['plazo', '2.1'], ['causa', '0']], 'dónde vive el dato de cada final: su 4');
  assert.ok(!readFileSync('src/motor.js', 'utf8').includes('payload?.[2]?.[1]'), 'el motor no sabe dónde vive el plazo');
  const motor = readFileSync('src/motor.js', 'utf8');
  for (const f of FINES) assert.ok(!motor.includes("'" + f.accion + "'"), 'src/motor.js nombra «' + f.accion + '»');
  // Y siguen funcionando: cerrar por decisión deja el proceso en «decidido».
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const { transaccion } = await import('../src/acciones.js');
  const r = await transaccion(eje, 'close by decision', { X: reserva.id }, 'huesped');
  await eje.anadir(r.evento);
  assert.equal(cerrado(eje, reserva.id).fin, 'decidido');
});

test('el texto de una petición de atención: su 0 si es una décupla y el texto entero si su payload es un texto (no su primer carácter)', async () => {
  const eje = await Eje.genesis({ demostracion: true, identidad: 'g', t: T0, foco: 'raíz', emision: [{ token: 'R', cantidad: 10 }] });
  await entrarPorInvitacion(eje, { por: 'g', quien: 'ana', t: T0, grupo: 3 });
  await entrarPorInvitacion(eje, { por: 'g', quien: 'bea', t: T0 });
  const plaza = (await eje.escribir({ autor: 'g', sobre: eje.genesisId, t: T0, payload: ['Plaza'], movimientos: [pagaElCoste('g')] })).id;
  await eje.escribir({ autor: 'ana', sobre: plaza, t: T0, payload: 'mi R', movimientos: [pagaElCoste('ana'), R('ana', 10, null, 'ana'), R('ana', 4, 'ana', 'bea')] });
  const alta = eje.alta('ana').id;
  await eje.escribir({ autor: 'bea', sobre: alta, en: '3000000000', t: T0, payload: 'ana, te pido atención', movimientos: [pagaElCoste('bea'), R('ana', 1, 'bea', 'ana')] });
  await eje.escribir({ autor: 'bea', sobre: alta, en: '3000000000', t: T0, payload: [['otra vez'], ['x']], movimientos: [pagaElCoste('bea'), R('ana', 1, 'bea', 'ana')] });
  const faltas = (await camino(eje, alta, 'bea')).pasos.filter((p) => p.regla === 'attended').map((p) => p.falta.split(' · ').pop());
  assert.deepEqual(faltas, ['ana, te pido atención', 'otra vez']);
});

test('camino no distingue las filas por su nombre: ni «stage», ni «attended», ni «weight», ni ninguna acción', () => {
  const fuente = readFileSync('src/acciones.js', 'utf8');
  const camino = fuente.slice(fuente.indexOf('export async function camino('), fuente.indexOf('export async function autoejecutar('));
  assert.ok(camino.length > 1000);
  for (const nombre of ['stage', 'attended', 'weight', 'expiry', 'attend', 'expire something mine', 'commit P', 'pay', 'deliver', 'a key is declared at its alta', 'tutorial']) {
    assert.ok(!camino.includes("'" + nombre + "'"), 'camino nombra «' + nombre + '»');
  }
  assert.ok(!/[\s(]f\.porque\s*[!=]==\s*'/.test(camino), 'camino compara el porqué de una fila con un nombre');
});

test('el tutorial es la quinta clase de filas de X.9.8: lo pide la lectura; el del alta lo ve su dueño; «hecho» lo dice su ancla o su 7', async () => {
  const { eje } = await ejemploReserva({ confirmar: false });
  const alta = eje.alta('casa').id;
  const filas = pasosDeLasReglas(eje, alta).filas.filter((f) => f.fuente === 'tutorial');
  assert.deepEqual(filas.map((f) => [f.accion ?? 'regla: ' + f.porque, f.ven, f.hay]), [
    ['regla: a key is declared at its alta', ['casa'], false],
    ['set a group price', ['casa'], 'by its anchor'],
    ['anchor here', ['casa'], 'by its anchor'],
  ]);
  const deLaCasa = (await camino(eje, alta, 'casa')).pasos.filter((p) => p.fuente === 'tutorial');
  assert.deepEqual(deLaCasa.map((p) => [p.hacer?.plantilla ?? p.regla, p.hecho, p.espera]), [['a key is declared at its alta', false, null], ['set a group price', false, null], ['anchor here', true, null]], 'la casa ya ancló algo en su alta: hecho por su ancla');
  assert.deepEqual((await camino(eje, alta, 'recepcion')).pasos.filter((p) => p.fuente === 'tutorial'), [], 'el tutorial del alta, solo su dueño');
  // Un registro con su propio 9: lo que nombra es su tutorial, para quien mire.
  const conNueve = await eje.escribir({ autor: 'casa', sobre: eje.genesisId, t: '2026-11-09T10:00:00Z', payload: ['con camino', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', ['anchor here', 'no es nada', 'attended']], movimientos: [pagaElCoste('casa')] });
  const p = (await camino(eje, conNueve.id, 'recepcion')).pasos.filter((x) => x.fuente === 'tutorial');
  assert.deepEqual(p.map((x) => [x.hacer?.plantilla ?? x.regla, x.hecho]), [['anchor here', false], ['attended', null]]);
});

test('lo anunciado «como antes» (un payload que imita un movimiento) sale en el camino igual que lo anunciado de ahora', async () => {
  const { ejemploCompra } = await import('../ejemplos/ikisai/compra-food.mjs');
  const c = await ejemploCompra();
  const { eje, menu } = c;
  const T1 = '2026-11-07T16:00:00Z';
  const encargo = (titulo) => eje.escribir({ autor: 'cocina', sobre: menu.id, t: T1, payload: [titulo, ['x'], ['all announced movements happened'], ['cocina', 'huesped']], movimientos: [pagaElCoste('cocina')] });
  const deAntes = await encargo('Encargo de antes');
  await eje.escribir({ autor: 'cocina', sobre: deAntes.id, en: '4100000000', t: T1, payload: [['E:casa/EUR'], [7], ['pagar'], [['huesped'], ['cocina']]], movimientos: [pagaElCoste('cocina')] });
  const deAhora = await encargo('Encargo de ahora');
  await eje.escribir({ autor: 'cocina', sobre: deAhora.id, en: '4100000000', t: T1, payload: 'pagar', movimientos: [pagaElCoste('cocina'), { token: 'E', emisor: 'casa', denominacion: 'EUR', cantidad: 7, de: 'huesped', a: 'cocina', estado: 'anunciado' }] });
  const paso = async (X) => (await camino(eje, X, 'huesped', { t: T1 })).pasos.filter((p) => p.regla === 'stage').map((p) => [p.hacer?.plantilla, p.falta]);
  const antes = await paso(deAntes.id);
  assert.equal(antes.length, 1);
  assert.equal(antes[0][0], 'pay');
  assert.match(antes[0][1], / · pagar: huesped .*7.* cocina$/);
  assert.deepEqual(antes, await paso(deAhora.id), 'el mismo paso y el mismo texto');
  assert.deepEqual((await camino(eje, deAntes.id, 'cocina', { t: T1 })).pasos.filter((p) => p.regla === 'stage').map((p) => p.espera), ['huesped']);
});

test('nada usa ya anuncioDe: ni src, ni la carta, ni los ejemplos, ni las pruebas', async () => {
  const { readdirSync } = await import('node:fs');
  for (const carpeta of ['src', 'carta', 'ejemplos/ikisai', 'test']) {
    for (const f of readdirSync(carpeta).filter((x) => /\.(m?js)$/.test(x) && x !== 'camino-reglas.test.js')) assert.ok(!/\banuncioDe\b/.test(readFileSync(carpeta + '/' + f, 'utf8')), carpeta + '/' + f);
  }
});

test('si la lectura del camino no se resuelve, camino lo dice (estado y motivo), no da «nada» en silencio', async () => {
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const epoca = epocaDelEje(eje);
  const rota = structuredClone(LECTURAS_PROVISIONALES.find((r) => nombreDeRegla(r) === 'path steps'));
  rota[2] = ['=1 / 0'];
  const c = await camino(eje, reserva.id, 'huesped', { epoca: { ...epoca, lecturas: [...epoca.lecturas, rota] } });
  assert.equal(c.estado, 'ERROR');
  assert.match(c.motivo, /división por cero/);
  assert.equal((await camino(eje, reserva.id, 'huesped')).estado, undefined, 'resuelta, sin estado');
});

test('el alta cuyo 0 se llama como su identidad (crear la cuenta «ana» da la identidad «ana»): «path steps» se resuelve, en la 0 y en la de cuenta', async () => {
  const { epocaCuenta } = await import('../datos/epocas/cuenta/generar.mjs');
  const { evaluar } = await import('../src/bqlm.js');
  const { ContextoEje } = await import('../src/contexto-eje.js');
  for (const epoca of [null, epocaCuenta()]) {
    const filas = {};
    for (const foco of ['Ana', 'ana']) {
      const eje = await Eje.genesis({ identidad: 'ana', foco, t: T0, ...(epoca ? { epoca } : {}), demostracion: true });
      const alta = eje.alta('ana').id;
      const r = pasosDeLasReglas(eje, alta);
      assert.equal(r.estado, 'RESUELTO', foco + ': ' + r.motivo);
      const c = await camino(eje, alta, 'ana');
      assert.ok(c.pasos.length > 0, foco + ': el camino del alta no sale vacío');
      filas[foco] = r.filas.map((f) => [f.accion ?? f.porque, f.fuente]);
      // La causa: payload() de un payload terminal es la décupla cuyo 0 es esa hoja, no un texto suelto que se recorre
      // como la identidad que se llama igual (su 2 era el criterio de «ana», una décupla, y el «in» de «what is missing» fallaba).
      const ctx = new ContextoEje(eje, { epoch: eje.epoca() });
      assert.deepEqual(evaluar('(payload(it)).0', ctx, { sujeto: alta }).valor, [foco]);
      assert.deepEqual(evaluar('(payload(it)).2', ctx, { sujeto: alta }).valor, []);
    }
    assert.deepEqual(filas.ana, filas.Ana, 'lo mismo se llame como se llame');
  }
});
