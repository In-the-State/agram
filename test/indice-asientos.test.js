// El índice de los asientos por serie y por titular (Core AGRAM 18-11; docs/notas/NUCLEO_6_7_8.md, quinta tanda, punto 4):
// `moves` de una serie o de una identidad da lo mismo que recorriendo el diario, también después de asentar más, y el
// camino lee las peticiones de atención de la serie R del dueño (su coste no crece con lo demás que mueve).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { ContextoEje } from '../src/contexto-eje.js';
import { Presupuesto } from '../src/bqlm.js';
import { epocaDelEje } from '../src/epocas.js';
import { pasosDeLasReglas } from '../src/motor.js';
import { pagaElCoste } from './ayudas-coste.js';

const recorrido = (eje, que) => (que.serie ? eje.libro.asientos({ serie: que.serie }) : eje.libro.asientos().filter((a) => a.de === que.titular || a.a === que.titular)).map((a) => a.n);

test('moves de una serie y de una identidad: lo mismo que recorriendo el diario, antes y después de asentar más', async () => {
  const c = await ejemploCompra();
  const { eje } = c;
  const ver = () => {
    const ctx = new ContextoEje(eje, { epoch: epocaDelEje(eje) });
    for (const titular of eje.identidades()) {
      assert.deepEqual(ctx.asientos(titular, new Presupuesto()).map((x) => x.a.n), recorrido(eje, { titular }), titular);
    }
    for (const serie of new Set(eje.libro.asientos().map((a) => a.serie))) {
      assert.deepEqual(ctx.asientos({ k: 'serie', clave: serie }, new Presupuesto()).map((x) => x.a.n), recorrido(eje, { serie }), serie);
    }
  };
  ver();
  for (let k = 0; k < 3; k++) {
    await eje.escribir({ autor: 'huesped', sobre: c.menu.id, t: '2026-11-07T15:0' + k + ':00Z', payload: ['más ' + k], movimientos: [pagaElCoste('huesped')] });
    ver();
  }
});

test('las peticiones de atención salen de la serie R del dueño: el coste del alta no crece con lo que compra', async () => {
  const coste = async (n) => {
    const c = await ejemploCompra();
    for (let k = 0; k < n; k++) await c.eje.escribir({ autor: 'huesped', sobre: c.menu.id, t: '2026-11-07T15:00:00Z', payload: ['compra ' + k], movimientos: [pagaElCoste('huesped')] });
    const presupuesto = new Presupuesto(1e7, 1e8);
    const r = pasosDeLasReglas(c.eje, c.eje.alta('huesped').id, { presupuesto });
    assert.equal(r.estado, 'RESUELTO');
    return presupuesto.usados;
  };
  assert.equal(await coste(15), await coste(0));
});
