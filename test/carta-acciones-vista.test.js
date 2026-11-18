// Las acciones a la vista en cada punto de vista (VG 18-11, la forma C: un botón actúa sobre lo que lo contiene; el aro es
// un atajo hacia ellas). Con el libro de ejemplo de la compra: lo que ofrece el aro lo ofrece su punto de vista; cuántas
// van con nombre lo dice una sola tabla; la destacada es la del primer paso mío del camino; nada de valores a un toque.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arbol, botonesDeNivel, BOTONES_POR_NIVEL, medidasDePantalla, LATERALES, escalaDeTamanos } from '../carta/carta.js';

/** Los ocho laterales en tarjeta (Mapped): el paso de tamaño en que un punto de vista ya ocupa pantalla (escalaDeTamanos). */
const EN_TARJETA = () => Object.fromEntries(LATERALES.map((pv) => [pv, escalaDeTamanos({}).conEspacio]));
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
  // Dentro de UNA cabecera: entre su <header> y su </header>, sin saltar a la siguiente.
  assert.match(h, /<header class="pv-cabeza">(?:(?!<\/header>)[^])*<div class="pv-acciones"(?:(?!<\/header>)[^])*<\/header>/, 'las acciones van dentro de la cabecera');
  for (const cab of h.match(/<header class="pv-cabeza">(?:(?!<\/header>)[^])*<\/header>/g) ?? []) assert.ok((cab.match(/class="pv-acciones"/g) ?? []).length <= 1, 'una sola fila de acciones por cabecera');
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
  const pc = await arbol({ foco: { X, pv: 0 }, niveles: EN_TARJETA() }, eje, yo, PC);
  const suyo = pc.laterales.find((n) => n.acciones?.destacada === paso.hacer.id);
  assert.ok(suyo, 'en Mapped, la destacada está en el punto de vista de su acción');
  assert.ok(suyo.nivel >= 2, 'que se pinta en tarjeta o más (nivel ' + suyo.nivel + ')');
  assert.equal(suyo.acciones.nombradas[0].id, paso.hacer.id, 'y es la que lleva nombre');
  assert.equal(suyo.acciones.nombradas[0].paso, pc.camino.pasos.findIndex((p) => p.mio && p.hacer), 'con el índice de su paso');
  assert.equal((html(pc).match(/class="accion destacada"/g) ?? []).length, 1, 'una sola en la pantalla de PC');
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

test('el paso destacado se abre como desde el camino: su botón lleva data-paso y el paso trae el anuncio que cumple («deliver»)', async () => {
  const A = await import('../src/acciones.js');
  const { formulario } = await import('../carta/carta.js');
  const { eje, compra } = await ejemploCompra();
  const r = await A.transaccion(eje, 'declare future T', { X: compra.id, what: 'servir', when: '2026-12-01T10:00:00Z', units: 90 }, 'huesped', { t: '2026-11-08T12:00:00Z' });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  const anuncio = await eje.anadir(r.evento);
  const a = await arbol({ foco: { X: compra.id, pv: 0 }, niveles: EN_TARJETA() }, eje, 'huesped', PC);
  const i = a.camino.pasos.findIndex((p) => p.mio && p.hacer);
  const paso = a.camino.pasos[i];
  assert.equal(paso.hacer.parametros.announcement?.ref, anuncio.id, 'el paso del camino trae su anuncio');
  const h = html(a);
  const boton = h.match(new RegExp(`<button type="button" class="accion destacada"[^>]*data-lanzar="${paso.hacer.id}"[^>]*>`))?.[0];
  assert.ok(boton, 'el botón destacado está');
  assert.ok(boton.includes(`data-paso="${i}"`), 'con el índice del paso: app.js lanzar rellena el formulario con sus parámetros');
  assert.ok(boton.includes(`data-x="${paso.hacer.X}"`));
  // Y aunque se lance sin el paso (desde «+n» o el aro), el formulario sale apuntando al anuncio, no a otro registro.
  const f = formulario(eje, compra.id, paso.hacer.id, 'huesped', {});
  assert.equal(f.campos.find((c) => c.nombre === 'announcement')?.valor?.ref, anuncio.id);
});

test('mantener pulsado un punto de vista vacío sigue abriendo el aro de crear (#22): el botón «escribir aquí» no lleva data-x propio', async () => {
  const { eje, compra } = await ejemploCompra();
  const a = await arbol({ foco: { X: compra.id, pv: 0 } }, eje, 'huesped', MOVIL);
  const h = html(a);
  const vacios = h.match(/<(p|li) class="(vacio-pv|hilo-vacio)"[^>]*>(?:(?!<\/(p|li)>)[^])*<\/(p|li)>/g) ?? [];
  const conBoton = vacios.filter((v) => v.includes('escribir-aqui'));
  assert.ok(conBoton.length > 0, 'hay vacíos con su botón: ' + vacios.length);
  for (const v of conBoton) {
    assert.match(v, /^<(p|li) class="[^"]+" data-hueco-x="[0-9a-f]{64}" data-hueco-pv="\d"/, 'el contenedor es el hueco');
    const boton = v.match(/<button[^>]*escribir-aqui[^>]*>/)[0];
    assert.ok(!/ data-x=/.test(boton), 'el botón no lleva data-x: lo más cercano con data-x o data-hueco-x es el hueco');
    assert.ok(/ data-lanzar="[^"]+"/.test(boton));
  }
});

test('la cabecera: «+n» abierto sigue abierto; si la de «escribir aquí» iba con nombre, ocupa su sitio la siguiente; la marca sin «1 cosas»', async () => {
  const { htmlAccionesDeCabecera } = await import('../carta/dom.js');
  const { t } = await import('../carta/textos.js');
  const ac = (id) => ({ id, nombre: id, faltan: [] });
  const base = { pv: 6, X: 'a'.repeat(64), etiqueta: 'pasado', total: 3, nombradas: [ac('escribir')], resto: [ac('dos'), ac('tres')], destacada: null };
  const h = htmlAccionesDeCabecera(base, { sin: 'escribir' });
  assert.ok(!h.includes('data-lanzar="escribir"'));
  assert.match(h, /<div class="pv-acciones"[^>]*><button[^>]*data-lanzar="dos"/, 'la siguiente ocupa su sitio');
  assert.match(h, /<summary[^>]*>\+1<\/summary>/);
  assert.ok(!h.includes('<details class="pv-acciones-mas" open'));
  assert.ok(htmlAccionesDeCabecera({ ...base, abierta: true }).includes('<details class="pv-acciones-mas" open>'), 'abierta al repintar');
  const { eje, compra } = await ejemploCompra();
  const abierta = await arbol({ foco: { X: compra.id, pv: 0 }, accionesAbiertas: new Set([compra.id + '|9']) }, eje, 'huesped', PC);
  assert.equal(abierta.laterales.find((n) => n.pv === 9).acciones.abierta, true, 'la app lo guarda por elemento y punto de vista');
  assert.ok(!t('franjaCuantas', { n: 1, que: 'x' }).includes('1 cosas'));
});
