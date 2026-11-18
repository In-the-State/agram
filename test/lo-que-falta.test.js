// Lo que falta, legible como posición (Core AGRAM 18-11; docs/notas/NUCLEO_6_7_8.md §6, decisiones 1 a 3 y 6, supuestos por
// confirmar con VG): la lectura «what is missing» que se materializa en X.4.9 (hasta la pasada única por la época 0, la
// provisional de datos/provisional/lecturas.json), sobre la reserva de Booking y la tarea de Tasks; el recuento que no
// pasa; un proceso terminado; el límite; que no depende de quién mira; lo que cuesta con y sin memoria; y que
// motor.siguiente y acciones.camino la leen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejemploReserva, confirmarReserva, EUR } from '../ejemplos/ikisai/reserva-booking.mjs';
import { ejemploTarea } from '../ejemplos/ikisai/tarea-tasks.mjs';
import { Eje } from '../src/eje.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { evaluar, aplanar, MemoriaDeLectura, Presupuesto, POR_LIMITE, analizar, nombreDeRegla, posicionDeLectura } from '../src/bqlm.js';
import { epocaDelEje, EPOCA_0_BTML } from '../src/epocas.js';
import { loQueFalta, LO_QUE_FALTA, siguiente, recuento, cerrado } from '../src/motor.js';
import { camino, transaccion } from '../src/acciones.js';
import { LECTURAS_PROVISIONALES } from '../src/provisional.js';
import { entrarPorInvitacion } from '../ejemplos/ikisai/altas.mjs';
import { pagaElCoste } from './ayudas-coste.js';

const corta = (f) => [f.serie, f.cantidad, f.porque, f.de, f.a, f.accion, f.sobre];
const LECTURA = LECTURAS_PROVISIONALES.find((r) => posicionDeLectura(r) === LO_QUE_FALTA);
const FORMULA = LECTURA[2][LECTURA[2].length - 1];

test('lo provisional: «what is missing» en X.4.9, una lectura de la época que no tapa a la 0 y no lee me', () => {
  assert.equal(LO_QUE_FALTA, 'X.4.9');
  assert.equal(nombreDeRegla(LECTURA), 'what is missing');
  assert.deepEqual(LECTURA[4], ['read']);
  assert.ok(!EPOCA_0_BTML.lecturas.some((r) => nombreDeRegla(r) === 'what is missing' || posicionDeLectura(r) === LO_QUE_FALTA), 'ya está en la 0: quítala de datos/provisional/');
  analizar(FORMULA, { sujeto: true });
  assert.ok(!/\bme\b/.test(FORMULA), 'la misma para todos los que miran');
});

test('Booking: cuatro filas (tres noches de la casa y el pago de la huésped), la acción de su estación; confirmada, ninguna', async () => {
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const { estado, filas } = loQueFalta(eje, reserva.id);
  assert.equal(estado, 'RESUELTO');
  assert.equal(filas.length, 4);
  const [ocupar, pagar] = [filas[0].sobre, filas[3].sobre];
  assert.deepEqual(filas.slice(0, 3).map((f) => [f.cantidad, f.porque, f.de, f.a, f.accion, f.sobre]), Array(3).fill([1, 'stage', ['casa'], 'huesped', 'pay', ocupar]));
  assert.deepEqual(corta(filas[3]), [EUR, 165, 'stage', ['huesped'], 'casa', 'pay', pagar]);
  assert.deepEqual(filas.slice(0, 3).map((f) => f.serie.split('@')[1]), ['2026-11-20', '2026-11-21', '2026-11-22']);
  // La misma lectura, como posición del registro: (first X.4).9.
  const ctx = new ContextoEje(eje, { epoch: epocaDelEje(eje) });
  assert.deepEqual(evaluar('(first it.4).9 each 4.0', ctx, { sujeto: reserva.id }).valor, ['pay', 'pay', 'pay', 'pay']);
  // Qué acción toca ahora, como dato: la de mis filas, una vez por anuncio.
  const toca = (yo) => {
    const c = new ContextoEje(eje, { epoch: epocaDelEje(eje), me: yo });
    return aplanar(evaluar('((first it.4).9 where me in it2.3.0) group row(it2.4.0, it2.5)', c, { sujeto: reserva.id }).valor, c).map((g) => [g[0][0], g[1][0]]);
  };
  assert.deepEqual(toca('huesped'), [['pay', pagar]]);
  assert.deepEqual(toca('casa'), [['pay', ocupar]], 'las tres noches, un solo «pay»');
  assert.deepEqual(toca('recepcion'), []);
  // motor.siguiente la lee: «pay» y no «move what was announced».
  assert.deepEqual(siguiente(eje, reserva.id, 'huesped').faltaDeMi.map((f) => [f.plantilla, f.anuncio]), [['pay', pagar]]);
  assert.deepEqual(siguiente(eje, reserva.id, 'recepcion').espera.map((e) => e.de), ['casa', 'casa', 'casa', 'huesped']);
  await confirmarReserva(eje, reserva);
  assert.deepEqual(loQueFalta(eje, reserva.id).filas, []);
  assert.equal(cerrado(eje, reserva.id).cerrado, true);
});

test('Tasks: dos filas sobre el mismo anuncio, la organizadora paga y los demás esperan', async () => {
  const t = await ejemploTarea({ hasta: 'entregada' });
  const { filas } = loQueFalta(t.eje, t.tarea.id);
  assert.deepEqual(filas.map((f) => [f.serie, f.cantidad, f.de, f.a, f.accion]), [
    ['E:casa/alquiler de la carpa', 250, ['organizadora'], 'proveedor', 'pay'],
    ['E:casa/transporte', 60, ['organizadora'], 'proveedor', 'pay'],
  ]);
  assert.equal(new Set(filas.map((f) => f.sobre)).size, 1);
  const deLaOrganizadora = siguiente(t.eje, t.tarea.id, 'organizadora');
  assert.deepEqual(deLaOrganizadora.faltaDeMi.map((f) => f.plantilla), ['pay']);
  assert.equal(deLaOrganizadora.faltaDeMi[0].transaccion.movimientos.length, 3, 'un minuto y los dos pagos, como antes');
  assert.deepEqual(siguiente(t.eje, t.tarea.id, 'proveedor').espera.map((e) => e.de), ['organizadora', 'organizadora']);
  const pasos = (await camino(t.eje, t.tarea.id, 'organizadora')).pasos.filter((p) => p.regla === 'stage');
  assert.deepEqual(pasos.map((p) => p.hacer?.plantilla), ['pay']);
});

test('no depende de quién mira: el mismo valor con cualquier me', async () => {
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const valor = (me) => JSON.stringify(aplanar(evaluar(FORMULA, new ContextoEje(eje, { epoch: epocaDelEje(eje), ...(me ? { me } : {}) }), { sujeto: reserva.id }).valor));
  assert.equal(valor('huesped'), valor());
  assert.equal(valor('casa'), valor());
  assert.equal(valor('recepcion'), valor());
});

test('el recuento que no pasa: una fila con «commit P» (de epoch.9.0.3), sobre X, con quién cuenta, su umbral y su valor', async () => {
  const T0 = '2026-11-08T10:00:00Z';
  const eje = await Eje.genesis({ demostracion: true, identidad: 'g', t: T0, foco: 'raíz', emision: [{ token: 'R', cantidad: 10 }, { token: 'E', denominacion: 'vale', cantidad: 100 }] });
  await entrarPorInvitacion(eje, { por: 'g', quien: 'ana', t: T0, grupo: 3 });
  await entrarPorInvitacion(eje, { por: 'g', quien: 'bea', t: T0 });
  const X = await eje.escribir({ autor: 'g', sobre: eje.genesisId, t: T0, payload: ['Huerto'], movimientos: [pagaElCoste('g')] });
  const decision = (criterio) => eje.escribir({ autor: 'g', sobre: X.id, t: T0, payload: ['¿Plantamos?', ['x'], criterio], movimientos: [pagaElCoste('g')] });
  const casos = [
    ['decidir', null],
    [[['decidir'], [1], ['weighted mean', 'above 0.4'], ['g', 'bea 5']], ['weighted mean', 0.4, ['g', 'bea 5']]],
    [[['decidir'], [1], ['threshold'], ['cualquiera']], ['threshold', 0, ['cualquiera']]],
    [[['decidir'], [1], ['one per person']], null],
    [[['decidir'], [1], ['weighted sum']], ['weighted sum', 0, ['g']]],
  ];
  for (const [criterio, espera] of casos) {
    const D = await decision(criterio);
    const { filas } = loQueFalta(eje, D.id);
    const c = recuento(eje, D.id);
    if (!espera) {
      assert.deepEqual(filas, [], JSON.stringify(criterio));
      continue;
    }
    assert.equal(c.pasa, false);
    assert.equal(filas.length, 1, JSON.stringify(criterio));
    const [f] = filas;
    assert.deepEqual([f.porque, f.cantidad, f.de, f.accion, f.lanzar, f.sobre, f.hay], ['weight', espera[1], [], 'commit P', D.id, D.id, c.valor], 'quien tenga «commit P» ofrecida');
    assert.equal(f.texto, 'the tally of g with ' + espera[0] + ' gives ' + c.valor + ' and asks above ' + espera[1]);
    assert.equal(f.serie, 'P:' + D.id);
    assert.deepEqual(siguiente(eje, D.id, 'g').faltaDeMi.map((x) => x.plantilla), ['commit P']);
  }
});

test('un límite agotado no dice «nada» (PENDIENTE POR LÍMITE); un proceso terminado no da filas', async () => {
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const corto = loQueFalta(eje, reserva.id, { limites: { ocupantes: 50 } });
  assert.deepEqual([corto.estado, corto.subtipo, corto.filas], ['PENDIENTE', POR_LIMITE, []]);
  const cierre = await transaccion(eje, 'close by decision', { X: reserva.id }, 'huesped');
  assert.equal(cierre.ok, true, JSON.stringify(cierre.motivos));
  await eje.anadir(cierre.evento);
  assert.equal(cerrado(eje, reserva.id).fin, 'decidido');
  assert.deepEqual(loQueFalta(eje, reserva.id).filas, []);
});

test('la época manda: con una lectura suya del mismo nombre, la provisional no se materializa', async () => {
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const propia = structuredClone(LECTURA);
  propia[2] = ['=7'];
  const epoca = epocaDelEje(eje);
  const ctx = new ContextoEje(eje, { epoch: { ...epoca, lecturas: [...epoca.lecturas, propia] } });
  assert.deepEqual(evaluar('(first it.4).9', ctx, { sujeto: reserva.id }).valor, [7]);
});

test('lo que cuesta: con memoria, la primera vez menos y la segunda un paso', async () => {
  const r = await ejemploReserva({ confirmar: false });
  const t = await ejemploTarea({ hasta: 'entregada' });
  for (const [nombre, eje, X] of [['Booking', r.eje, r.reserva.id], ['Tasks', t.eje, t.tarea.id]]) {
    const ctx = new ContextoEje(eje, { epoch: epocaDelEje(eje) });
    const medir = (opciones) => {
      const presupuesto = new Presupuesto(1e6, 1e7);
      const v = evaluar(FORMULA, ctx, { sujeto: X, presupuesto, ...opciones });
      assert.equal(v.estado, 'RESUELTO', nombre);
      return { ocupantes: presupuesto.usados, pasos: presupuesto.pasos };
    };
    const sin = medir({});
    const memoria = new MemoriaDeLectura();
    const primera = medir({ lectura: true, memoria });
    const segunda = medir({ lectura: true, memoria });
    assert.ok(sin.ocupantes < 10000, nombre + ': cabe en el presupuesto de hoy sin memoria (' + sin.ocupantes + ')');
    assert.ok(primera.ocupantes < sin.ocupantes, nombre + ': ' + JSON.stringify({ sin, primera }));
    assert.deepEqual(segunda, { ocupantes: 0, pasos: 1 }, nombre);
  }
});

test('siguiente y camino pasan opciones.memoria a la lectura: la segunda vez sale de la memoria', async () => {
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const memoria = new MemoriaDeLectura();
  const antes = siguiente(eje, reserva.id, 'huesped');
  assert.deepEqual(siguiente(eje, reserva.id, 'huesped', { memoria }), antes);
  const aciertos = memoria.aciertos;
  assert.deepEqual(siguiente(eje, reserva.id, 'casa', { memoria }).faltaDeMi.map((f) => f.plantilla), ['pay']);
  assert.ok(memoria.aciertos > aciertos, 'otra persona, la misma lectura: de la memoria');
  // camino lee X.9.8 con su reloj: la segunda vez, de la memoria.
  await camino(eje, reserva.id, 'recepcion', { memoria });
  const a = memoria.aciertos;
  await camino(eje, reserva.id, 'huesped', { memoria });
  assert.ok(memoria.aciertos > a, 'camino también');
});

test('X.4.9 por dentro de X.9.8: paga del mismo presupuesto (el coste que se informa es el de verdad) y usa la misma memoria', async () => {
  const { pasosDeLasReglas } = await import('../src/motor.js');
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const coste = (f, o = {}) => {
    const presupuesto = new Presupuesto(1e6, 1e7);
    const r = f(eje, reserva.id, { presupuesto, ...o });
    assert.equal(r.estado, 'RESUELTO');
    return presupuesto.usados;
  };
  const sola = coste(loQueFalta);
  const dentro = coste(pasosDeLasReglas);
  assert.ok(sola > 2000, 'X.4.9 cuenta también la lectura «stage» que lee por dentro: ' + sola);
  assert.ok(dentro > sola, 'X.9.8 cuenta X.4.9 por dentro: ' + dentro + ' > ' + sola);
  const memoria = new MemoriaDeLectura();
  coste(loQueFalta, { memoria });
  const conMemoria = coste(pasosDeLasReglas, { memoria });
  assert.ok(conMemoria < dentro - sola + 200, 'lo de X.4.9 sale de la memoria: ' + conMemoria);
  // Y el valor es el mismo con y sin memoria.
  assert.deepEqual(pasosDeLasReglas(eje, reserva.id, { memoria }).filas, pasosDeLasReglas(eje, reserva.id).filas);
});
