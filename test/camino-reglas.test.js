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
  const filas = pasosDeLasReglas(eje, alta).filas.filter((f) => f.porque === 'attended');
  assert.deepEqual(filas.map((f) => [f.de, f.accion, f.sobre]), [[['ana'], 'attend', peticion.id]]);
  assert.deepEqual(pasosDeLasReglas(eje, plaza).filas, [], 'la plaza no es un alta: no hay peticiones');
  const deAna = (await camino(eje, alta, 'ana')).pasos.filter((p) => p.regla === 'attended');
  assert.deepEqual(deAna.map((p) => [p.hacer?.plantilla, p.hacer?.X, p.espera]), [['attend', peticion.id, null]]);
  const deBea = (await camino(eje, alta, 'bea')).pasos.filter((p) => p.regla === 'attended');
  assert.deepEqual(deBea.map((p) => [p.hacer, p.espera, p.peticion]), [[null, 'ana', peticion.id]]);
  await eje.escribir({ autor: 'ana', sobre: peticion.id, t: T0, payload: 'te atiendo', movimientos: [pagaElCoste('ana')] });
  assert.deepEqual(pasosDeLasReglas(eje, alta).filas.filter((f) => f.porque === 'attended'), []);
});

test('las caducidades próximas: con el reloj de quien lee, «expire something mine» y sus parámetros de la fila', async () => {
  const { eje, habitacion } = await ejemploReserva({ confirmar: false });
  const sinReloj = pasosDeLasReglas(eje, habitacion.id).filas.filter((f) => f.porque === 'expiry');
  const conReloj = pasosDeLasReglas(eje, habitacion.id, { ahora: '2026-11-20T18:00:00Z' }).filas.filter((f) => f.porque === 'expiry');
  assert.ok(conReloj.length > sinReloj.length, 'el 20 por la tarde caducan más noches que con el reloj del libro');
  const f = conReloj.find((x) => x.para === '2026-11-21T12:00:00Z');
  assert.deepEqual([f.de, f.accion, f.sobre, f.parametros], [['casa'], 'expire something mine', habitacion.id, { series: f.serie }]);
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
