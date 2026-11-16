import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejemploCompra, ejemploCuenta } from '../ejemplos/ikisai/compra-food.mjs';
import { proponer, consolidar, descubrir, OPERADORES } from '../src/motor.js';
import { pagaElCoste } from './ayudas-coste.js';

// Después de la compra (13:30) y de su cuenta (14:10): el t de un evento no es anterior al de su foco ([X] confirmar VG, src/ciclo.js).
const T = '2026-11-07T15:00:00Z';
const gastaT = (de) => pagaElCoste(de);

test('operadores Q, B, C', () => {
  assert.deepEqual(OPERADORES, { Q: 'descubrir', B: 'proponer', C: 'consolidar' });
});

test('proponer: las fórmulas del foco construyen las elecciones; lo literal se propone por referencia', async () => {
  const { eje, compra } = await ejemploCompra();
  const cuenta = await ejemploCuenta(eje, compra);
  // Un plan escrito sobre la compra (fórmulas del BQL mínimo, it = el plan): en 1 un literal, en 2 calcula un terminal,
  // en 3 un texto literal, y en 4 elige lo primero anclado en su 1 (registros: el primero es el candidato).
  const plan2 = await eje.escribir({ autor: 'huesped', sobre: compra.id, t: T, movimientos: [gastaT('huesped')],
    payload: ['Plan 2', ['menú', 1], '=2 * 7', 'avisar a cocina', '=first (down it where last it2.6.5 = "1000000000")'] });
  const nota = await eje.escribir({ autor: 'huesped', sobre: plan2.id, en: '1000000000', t: T, movimientos: [gastaT('huesped')], payload: 'un menú más' });
  const p = proponer(eje, plan2.id);
  assert.deepEqual(Object.keys(p.elecciones).map(Number), [1, 2, 3, 4]);
  assert.deepEqual(p.elecciones[1], { ref: plan2.id, dir: '1000000000' }); // literal: por referencia al foco
  assert.equal(p.elecciones[2], 14); // fórmula con valor: terminal nuevo (un número: el BQL mínimo no lleva unidades)
  assert.deepEqual(p.elecciones[3], { ref: plan2.id, dir: '3000000000' });
  // Fórmula que da registros: el primero, con su encaje calculado por encaje.ocupantes (un escrito en el 1, exacto).
  assert.deepEqual(p.elecciones[4].candidato, { evento: nota.id, dir: '0000000000', tipo: 'escrito', origenDir: '1000000000', vector: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], signo: 'exacto' });
  assert.deepEqual(p.origenes.map((o) => o.desde), ['foco', 'formula', 'foco', 'formula']);
  assert.deepEqual(p.pendientes, []);
  // Q → B → C: la propuesta se consolida tal cual.
  const d = descubrir(eje, plan2.id);
  assert.ok(d.length);
  const c = await consolidar(eje, { autor: 'huesped', foco: plan2.id, t: T, elecciones: p.elecciones, titulo: 'Propuesto por fórmulas' });
  assert.equal(c.payload[2], 14);
  assert.deepEqual(c.payload[4], { ref: nota.id, dir: '0000000000' });
  assert.deepEqual(c.payload[1], { ref: plan2.id, dir: '1000000000' });
  assert.equal(c.contexto.encaje.length, 3); // dos referencias al foco y un candidato llevan encaje; el terminal no
  void cuenta;
});

test('proponer: lo pendiente o erróneo no entra en la propuesta y se informa', async () => {
  const { eje, compra } = await ejemploCompra();
  const plan = await eje.escribir({ autor: 'huesped', sobre: compra.id, t: T, movimientos: [gastaT('huesped')],
    payload: ['Plan', '=(payload(it)).9 + 0', '=1 +', '=first (down it where last it2.6.5 = "7000000000")'] });
  const p = proponer(eje, plan.id);
  assert.deepEqual(Object.keys(p.elecciones), []);
  assert.deepEqual(p.pendientes.map((x) => x.posicion), [1, 2, 3]);
  assert.match(p.pendientes[0].motivo, /PENDIENTE/);
  assert.match(p.pendientes[1].motivo, /ERROR/);
  assert.equal(p.pendientes[2].motivo, 'sin candidatos');
});
