// Las acciones a la vista en cada punto de vista (VG 18-11, la forma C: un botón actúa sobre lo que lo contiene; el aro es
// un atajo hacia ellas). Con el libro de ejemplo de la compra: lo que ofrece el aro lo ofrece su punto de vista; cuántas
// van con nombre lo dice una sola tabla; la destacada es la del primer paso mío del camino; nada de valores a un toque.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arbol, botonesDeNivel, BOTONES_POR_NIVEL, medidasDePantalla, LATERALES } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';

const PC = { ancho: 1920, alto: 1080 };
const MOVIL = medidasDePantalla(390, 844);
const ids = (a) => new Set([...(a?.nombradas ?? []), ...(a?.resto ?? [])].map((x) => x.id));

test('lo que ofrece el aro de un elemento lo ofrece su punto de vista: para cada sitio del aro, su punto de vista abierto tiene las mismas acciones', async () => {
  const { eje, compra, menu } = await ejemploCompra();
  for (const yo of ['huesped', 'casa']) {
    for (const X of [compra.id, menu.id, eje.alta(yo).id]) {
      const conAro = await arbol({ foco: { X, pv: 0 }, aro: { X, pv: null } }, eje, yo, PC);
      for (const h of conAro.aro.huecos) {
        const delAro = new Set([h.accion, ...h.otras].filter(Boolean).map((a) => a.id));
        const abierto = await arbol({ foco: { X, pv: h.pv } }, eje, yo, PC);
        const delPv = ids(abierto.centro.acciones);
        for (const id of delAro) assert.ok(delPv.has(id), `${yo} sobre ${X.slice(0, 8)}: el aro ofrece en el ${h.pv} algo que su punto de vista no ofrece`);
        assert.equal(delPv.size, delAro.size, `${yo}, ${X.slice(0, 8)}, ${h.pv}: las mismas`);
      }
    }
  }
});

test('cuántas van con nombre lo dice una sola tabla: comprimido 0 (la marca con cuántas), tarjeta 1, bloque 3, abierto todas; filas con paso, 12', async () => {
  assert.deepEqual([botonesDeNivel('comprimido'), botonesDeNivel('tarjeta'), botonesDeNivel('bloque'), botonesDeNivel('abierto'), botonesDeNivel('filas')], [0, 1, 3, Infinity, 12]);
  assert.equal(botonesDeNivel('no-existe'), 0);
  assert.equal(botonesDeNivel('tarjeta', { tarjeta: 2 }), 2, 'otra tabla (la que dará la época o las preferencias), otro número');
  assert.ok(Object.isFrozen(BOTONES_POR_NIVEL));
  const { eje, compra } = await ejemploCompra();
  const a = await arbol({ foco: { X: compra.id, pv: 0 }, niveles: { 6: 4, 1: 4, 2: 3 } }, eje, 'huesped', PC);
  const vistos = new Set();
  for (const n of a.laterales) {
    if (!n.acciones) continue;
    const k = botonesDeNivel(n.nivel >= 3 ? 'bloque' : n.nivel >= 2 ? 'tarjeta' : 'comprimido');
    assert.equal(n.acciones.nombradas.length, Math.min(k, n.acciones.total), `el ${n.pv} en nivel ${n.nivel}`);
    assert.equal(n.acciones.nombradas.length + n.acciones.resto.length, n.acciones.total, 'el resto, tras «+n»');
    vistos.add(n.nivel);
  }
  assert.ok(vistos.size >= 2, 'se han mirado varios niveles: ' + [...vistos]);
  const abierto = await arbol({ foco: { X: compra.id, pv: 6 } }, eje, 'huesped', PC);
  assert.equal(abierto.centro.acciones.resto.length, 0, 'abierto: todas con nombre');
  // En el HTML: dentro de la cabecera, y el «+n» con el resto.
  const h = html(a);
  assert.match(h, /<header class="pv-cabeza">[^]*?<div class="pv-acciones"[^]*?<\/header>/, 'las acciones van dentro de la cabecera');
  assert.ok(h.includes('class="pv-acciones-mas"'));
});

test('la que lleva nombre: la del primer paso mío del camino, en su punto de vista, una sola por pantalla; si no, la por defecto', async () => {
  const { eje } = await ejemploCompra();
  const yo = 'huesped';
  const X = eje.alta(yo).id;
  const movil = await arbol({ foco: { X, pv: 0 } }, eje, yo, MOVIL);
  const paso = movil.camino.pasos.find((p) => p.mio && p.hacer);
  assert.ok(paso, 'el alta tiene un primer paso mío');
  const h = html(movil);
  assert.equal((h.match(/class="accion destacada"/g) ?? []).length, 1, 'una sola destacada');
  assert.ok(h.includes(`class="accion destacada" data-nodo="accion" data-lanzar="${paso.hacer.id}"`) || new RegExp(`class="accion destacada"[^>]*data-lanzar="${paso.hacer.id}"`).test(h), 'es la del primer paso');
  // En la fila cerrada de su punto de vista (Sequenced), aunque esté cerrada.
  const fila = movil.secuencia.filas.find((f) => f.acciones?.destacada === paso.hacer.id);
  assert.ok(fila && !fila.abierta, 'en una fila cerrada');
  // En Mapped, abierto ese punto de vista en tarjeta, es la que lleva nombre.
  const pc = await arbol({ foco: { X, pv: 0 }, niveles: Object.fromEntries(LATERALES.map((pv) => [pv, 2])) }, eje, yo, PC);
  const suyo = pc.laterales.find((n) => n.acciones?.destacada === paso.hacer.id);
  if (suyo && suyo.nivel === 2) assert.equal(suyo.acciones.nombradas[0].id, paso.hacer.id);
  // Sin paso del camino ahí, la por defecto (la de la época): en otro punto de vista, ninguna destacada.
  for (const n of pc.laterales) if (n !== suyo && n.acciones) assert.equal(n.acciones.destacada, null);
});

test('la cabecera no lleva valores ni escribe directo: los valores a un toque solo están en el aro', async () => {
  const { eje, compra, menu } = await ejemploCompra();
  for (const [X, m, niveles] of [[compra.id, PC, { 6: 4, 1: 4, 2: 4, 3: 4 }], [menu.id, MOVIL, {}], [compra.id, PC, {}]]) {
    const a = await arbol({ foco: { X, pv: 0 }, niveles }, eje, 'huesped', m);
    const h = html(a);
    assert.ok(!h.includes('data-opcion'), 'sin aro abierto, ningún valor a un toque');
    for (const bloque of h.match(/<div class="pv-acciones"[^]*?<\/div>/g) ?? []) assert.ok(!bloque.includes('data-campo') && !bloque.includes('data-nuevo'), 'nada que escriba directo');
  }
  // Con el aro abierto, sus valores siguen ahí.
  const conAro = await arbol({ foco: { X: compra.id, pv: 0 }, aro: { X: compra.id, pv: null } }, eje, 'huesped', PC);
  assert.ok(conAro.aro.huecos.some((h) => h.opciones.length), 'el aro sigue ofreciendo valores');
});
