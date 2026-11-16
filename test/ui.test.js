// Lo que queda de las pruebas del frontend sobrio de la web antigua (antigua/ui/), retirada con BQL V0 (#113): lo que
// probaban del núcleo. Los ejemplos de la carta se prueban en test/carta-ejemplos.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as nucleo from '../src/index.js';
import { ejemploCompra, ejemploCuenta } from '../ejemplos/ikisai/compra-food.mjs';
import { escalaQueCubre } from '../src/tiempo.js';

const { motor } = nucleo;

async function compra() {
  const { eje, compra: c } = await ejemploCompra();
  const cuenta = await ejemploCuenta(eje, c);
  return { eje, compra: c, cuenta };
}

test('fábrica: la propuesta de la compra propone sus cuatro posiciones por referencia al foco, y consolidarla dice de dónde vino cada fuente', async () => {
  const { eje, compra: c } = await compra();
  const p = motor.proponer(eje, c.id);
  assert.deepEqual(Object.keys(p.elecciones), ['1', '2', '3', '4']);
  assert.deepEqual(p.pendientes, []);
  const cons = await motor.consolidar(eje, { autor: 'huesped', foco: c.id, elecciones: p.elecciones, t: '2026-11-07T15:00:00Z' });
  assert.deepEqual(cons.payload.slice(1), Object.values(p.elecciones));
  for (const i of [1, 2, 3, 4]) {
    const e = cons.contexto.encaje.find((x) => x.posicion === i);
    assert.deepEqual([e.evento, e.origen, e.destino, e.vector.every((x) => x === 0)], [c.id, i + '000000000', i + '000000000', true], String(i)); // exacto
  }
  assert.deepEqual(cons.contexto.nuevos, []);
});

test('escalaQueCubre: la escala del calendario cuyo orden alcanza el de lo emitido (utilidad del 4, VG 12-11 #65); ya no hay incongruencia de escala', () => {
  // nunca baja del minuto (VG 13-11, #78): el coste de escribir va en minutos del calendario; el segundo es solo del desplegable
  assert.equal(escalaQueCubre(0), 'minuto');
  assert.equal(escalaQueCubre(1), 'minuto');
  assert.equal(escalaQueCubre(6), 'minuto');
  assert.equal(escalaQueCubre(10), 'minuto');
  assert.equal(escalaQueCubre(11), 'minuto');
  assert.equal(escalaQueCubre(100), 'minuto');
  assert.equal(escalaQueCubre(1000), 'hora');
  assert.equal(escalaQueCubre(1001), 'dia');
  assert.equal(escalaQueCubre(10 ** 7), 'anio');
  assert.equal(escalaQueCubre(10 ** 9), 'anio'); // se pasa de todas: la mayor
});
