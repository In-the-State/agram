// Scened (src/scened.js, escenaDe) sobre la compra: alcances, marco común, aristas y capacidad. La vista que lo pintaba
// (antigua/ui/escena.js) se retiró con la web antigua (#113); aquí queda lo que el núcleo da.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejemploCompra, ejemploCuenta } from '../ejemplos/ikisai/compra-food.mjs';
import { escenaDe, CAPACIDAD, ALCANCES } from '../src/scened.js';
import { pagaElCoste } from './ayudas-coste.js';

const AHORA = '2026-11-07T15:00:00Z';
const gastaT = (de) => pagaElCoste(de);

/** La compra con su cuenta y dos compras hermanas más del mismo menú (datos inventados). */
async function escenario() {
  const base = await ejemploCompra();
  const { eje, menu, compra } = base;
  const cuenta = await ejemploCuenta(eje, compra);
  const otra = (t, titulo) => eje.escribir({ autor: 'huesped', sobre: menu.id, t, movimientos: [gastaT('huesped')], payload: [titulo, [{ ref: menu.id, dir: '1000000000' }, 1]] });
  const c2 = await otra('2026-11-07T13:40:00Z', 'Segunda compra');
  const c3 = await otra('2026-11-07T13:50:00Z', 'Tercera compra');
  return { ...base, cuenta, c2, c3 };
}

test('Scened: los cuatro alcances de escenaDe, en su orden', async () => {
  const { eje, compra, c2 } = await escenario();
  assert.deepEqual([...ALCANCES], ['hermanos', 'proyecto', 'general', 'hilo']);
  for (const alcance of ALCANCES) {
    const e = escenaDe(eje, c2.id, { alcance, ahora: AHORA });
    assert.equal(e.alcance, alcance);
    assert.ok(e.focos.some((f) => f.id === c2.id && f.centro));
  }
  const g = escenaDe(eje, compra.id, { alcance: 'general', ahora: AHORA });
  assert.equal(g.recuentos.enEscena, eje.orden.length);
  assert.deepEqual(g.focos.filter((f) => f.centro).map((f) => f.id), [compra.id]);
  assert.equal(g.comun, eje.genesisId);
});

test('Scened: los focos en el orden del marco común, y cada arista apunta a un foco de la escena', async () => {
  const { eje, menu, compra, cuenta } = await escenario();
  const e = escenaDe(eje, compra.id, { alcance: 'proyecto', ahora: AHORA });
  assert.deepEqual(e.focos.map((f) => f.posicion), e.focos.map((_, i) => i));
  assert.deepEqual(e.focos.filter((f) => f.centro).map((f) => f.id), [compra.id]);
  const ids = new Set(e.focos.map((f) => f.id));
  assert.ok(e.aristas.every((x) => ids.has(x.aId) && ids.has(x.deId)));
  assert.deepEqual(Object.fromEntries(['hilo', 'referencia', 'formula'].map((t) => [t, e.aristas.filter((x) => x.tipo === t).length])), e.recuentos.aristas);
  // La cuenta lee la 1.2.1 de la compra por su id (BQL mínimo, (payload("<id>")).1.2.1): arista de fórmula a la compra.
  const pc = e.focos.find((f) => f.id === compra.id).posicion;
  assert.ok(e.aristas.some((x) => x.tipo === 'formula' && x.deId === cuenta.id && x.a === pc && x.dir === '1210000000'));
  // Las compras hermanas apuntan por referencia al menú.
  assert.ok(e.aristas.some((x) => x.tipo === 'referencia' && x.aId === menu.id));
  // Sin corte.
  assert.equal(e.corte, null);
});

test('Scened: si la capacidad corta la escena, quedan fuera los focos que no caben; el máximo es duro', async () => {
  const { eje, compra, c2, c3 } = await escenario();
  const entera = escenaDe(eje, compra.id, { alcance: 'hermanos', ahora: AHORA });
  assert.deepEqual(entera.focos.map((f) => f.id), [compra.id, c2.id, c3.id]);
  const sinC3 = entera.recuentos.posicionesEnEscena - 1; // c3 ya no cabe entero
  const e = escenaDe(eje, compra.id, { alcance: 'hermanos', ahora: AHORA, capacidad: sinC3 });
  assert.deepEqual(e.focos.map((f) => f.id), [compra.id, c2.id]);
  assert.deepEqual(e.corte.fuera, [c3.id]);
  assert.ok(e.recuentos.posicionesEnEscena < sinC3);
  assert.throws(() => escenaDe(eje, compra.id, { alcance: 'general', ahora: AHORA, capacidad: Infinity }), /máximo de Scened es duro/);
});

test('Scened: todo el eje con más de mil registros llega a la capacidad de 10000', async () => {
  const { Eje } = await import('../src/eje.js');
  const eje = await Eje.genesis({ demostracion: true, identidad: 'casa', emision: [], foco: 'Casa de prueba', t: '2026-11-07T09:00:00Z' });
  const menu = await eje.escribir({ autor: 'casa', sobre: eje.genesisId, t: '2026-11-07T09:00:00Z', movimientos: [gastaT('casa')], payload: ['Menú', ['sopa', 'pan', 'agua', 'fruta', 'café', 'vino', 'postre', 'pan sin gluten']] });
  for (let i = 0; i < 1000; i++) {
    // Cada compra, diez posiciones con contenido: su título y una lista de nueve.
    await eje.escribir({ autor: 'casa', sobre: menu.id, t: '2026-11-' + String(7 + Math.floor(i / 100)).padStart(2, '0') + 'T13:30:00Z', movimientos: [gastaT('casa')], payload: ['Compra ' + i, [{ ref: menu.id, dir: '1000000000' }, 1, 'sopa', 'pan', 'agua', 'fruta', 'café', 'mesa 4', 'sin prisa']] });
  }
  // 1002 registros: el génesis y el menú (10) y 999 compras de diez llenan las 10000; la última queda fuera.
  const e = escenaDe(eje, menu.id, { alcance: 'general', ahora: AHORA });
  assert.equal(e.recuentos.pedidos, 1002);
  assert.equal(e.recuentos.posicionesEnEscena, CAPACIDAD);
  assert.equal(e.recuentos.enEscena, 1001);
  assert.deepEqual(e.corte.fuera, eje.orden.slice(-1));
});

test('Scened: el hilo empieza en el génesis, y escenaDe solo lee', async () => {
  const { eje, compra } = await escenario();
  const antes = eje.orden.length;
  const hilo = escenaDe(eje, compra.id, { alcance: 'hilo', ahora: AHORA });
  assert.equal(hilo.focos[0].id, eje.genesisId);
  for (const alcance of ALCANCES) escenaDe(eje, compra.id, { alcance, ahora: AHORA });
  assert.equal(eje.orden.length, antes);
  assert.throws(() => escenaDe(eje, 'nada', { alcance: 'general', ahora: AHORA }), /foco desconocido: nada/);
});
