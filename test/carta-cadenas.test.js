// La forma «cadenas» del 7 en la carta (pieza P3; Core AGRAM 17-11; docs/CONTRATO.md §12.10): los constructores
// (carta/carta.js, cadenasDeRejilla) y el HTML (carta/dom.js, htmlCadenas) con un libro de la época del roadmap.
// Todo inventado: libros en memoria, de demostración.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arbol } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { epocaRoadmap } from '../datos/epocas/roadmap/generar.mjs';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';

const T = '2026-11-17T10:00:00Z';
const ORDENADOR = { ancho: 1200, alto: 800 };
const MOVIL = { ancho: 400, alto: 700 };

async function libro(epoca) {
  const eje = await Eje.genesis({ identidad: 'duena', foco: 'roadmap de prueba', t: T, emision: [{ token: 'R', cantidad: 10 }], epoca, demostracion: true });
  await eje.aceptar(await eje.invitar({ autor: 'duena', invitado: 'casa-b', t: T }), {}, { t: T });
  return eje;
}
async function hacer(eje, nombre, X, params, quien = 'duena') {
  const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: T });
  assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
  return eje.anadir(r.evento);
}
const tarea = (eje, proyecto, titulo, quien = 'duena') => hacer(eje, 'anchor here', proyecto, { title: titulo, content: ['id: x'], type: 'task' }, quien);
const despues = (eje, t, anteriores, quien = 'duena') => hacer(eje, 'this goes after', t.id, anteriores.length ? { previous: anteriores.map((x) => x.id) } : {}, quien);

/** A2 y A3 después de A1 (bifurcación), A4 después de A2 y A3 (unión), B1 (otra casa) después de A4; A5 suelta. */
async function roadmap(epoca = epocaRoadmap()) {
  const eje = await libro(epoca);
  const pa = await hacer(eje, 'anchor here', eje.genesisId, { title: 'Proyecto A' });
  const pb = await hacer(eje, 'anchor here', eje.alta('casa-b').id, { title: 'Proyecto B' }, 'casa-b');
  const t = {};
  for (const n of ['A1', 'A2', 'A3', 'A4', 'A5']) t[n] = await tarea(eje, pa.id, n);
  t.B1 = await tarea(eje, pb.id, 'B1', 'casa-b');
  await despues(eje, t.A2, [t.A1]);
  await despues(eje, t.A3, [t.A1]);
  await despues(eje, t.A4, [t.A2, t.A3]);
  await despues(eje, t.B1, [t.A4], 'casa-b');
  return { eje, pa, pb, t };
}

const siete = async (eje, X, medidas, extra = {}) => {
  const a = await arbol({ foco: { X, pv: 7 }, ...extra }, eje, 'duena', medidas);
  // En el móvil en vertical (Sequenced), el 7 es la zona del futuro del hilo: allí va la forma.
  return { r: a.secuencia ? a.secuencia.futuro.rejilla : a.centro.rejilla, h: html(a) };
};
const textos = (pasos) => pasos.map((p) => p.nodo.texto + ' · ' + p.texto);

test('las cadenas en pantalla ancha: una fila por cadena en orden, «sale de», «une», las independientes aparte y el estado en llano', async () => {
  const { eje } = await roadmap();
  const { r, h } = await siete(eje, eje.genesisId, ORDENADOR);
  assert.equal(r.forma, 'cadenas');
  assert.equal(r.formaDesconocida, undefined);
  assert.equal(r.cadenas.length, 2);
  assert.deepEqual(textos(r.cadenas[0].visibles), ['A1 · listo', 'A2 · espera a A1', 'A4 · espera a A2, A3', 'B1 · espera a A4']);
  assert.deepEqual([r.cadenas[0].sale, r.cadenas[0].antes, r.cadenas[0].despues], [null, 0, 0], 'cabe entera');
  assert.deepEqual(r.cadenas[0].visibles[2].une, ['A3']);
  assert.deepEqual([r.cadenas[1].sale, ...textos(r.cadenas[1].visibles)], ['A1', 'A3 · espera a A1']);
  assert.deepEqual(textos(r.independientes), ['A5 · listo']);
  assert.match(h, /data-forma="cadenas"/);
  assert.match(h, /sale de A1/);
  assert.match(h, /también después de A3/);
  assert.match(h, /espera a A2, A3/);
  assert.match(h, /sin dependencias/);
  assert.doesNotMatch(h, /cadena-alternar/, 'sin «+n» si cabe');
  assert.ok(h.indexOf('>A1<') < h.indexOf('>A2<') && h.indexOf('>A2<') < h.indexOf('>A4<') && h.indexOf('>A4<') < h.indexOf('>B1<'), 'de izquierda a derecha, en orden');
  // Cada paso es la tarjeta normal de su registro: se abre al tocar como cualquier otra.
  assert.ok(r.cadenas[0].visibles.every((p) => p.nodo.ref === p.id || p.nodo.X === p.id || p.nodo.id === p.id), JSON.stringify(r.cadenas[0].visibles[0].nodo).slice(0, 200));
});

test('la anterior de fuera, apagada; las descartadas, en una línea al final; todo escapado', async () => {
  const { eje, pa, pb, t } = await roadmap();
  const fuera = await siete(eje, pb.id, ORDENADOR);
  assert.deepEqual(fuera.r.cadenas[0].visibles.map((p) => [p.nodo.texto, p.fuera]), [['A4', true], ['B1', false]]);
  assert.match(fuera.h, /class="cadena-paso fuera"/);
  assert.match(fuera.h, /de fuera/);
  await despues(eje, t.A1, [t.A4, pa]);
  const { r, h } = await siete(eje, eje.genesisId, ORDENADOR);
  assert.deepEqual(r.descartadas, ['Proyecto A → A1: no es una tarea', 'A4 → A1: cerraría un ciclo']);
  assert.match(h, /No se pintan estas dependencias: Proyecto A → A1: no es una tarea; A4 → A1: cerraría un ciclo/);
  assert.ok(!r.cadenas.flatMap((c) => c.pasos).some((p) => p.nodo.texto === 'Proyecto A'), 'una descartada no es un paso');
  const malo = await tarea(eje, pa.id, '<img src=x onerror=alert(1)>');
  await despues(eje, t.A5, [malo]);
  const e = (await siete(eje, eje.genesisId, ORDENADOR)).h;
  assert.doesNotMatch(e, /<img src=x/);
  assert.match(e, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('en ancho, una cadena que no cabe enseña los pasos que quepan en torno al primero sin hacer, no solo tres', async () => {
  const eje = await libro(epocaRoadmap());
  const p = await hacer(eje, 'anchor here', eje.genesisId, { title: 'Proyecto largo' });
  const pasos = [];
  for (let k = 1; k <= 12; k++) {
    pasos.push(await tarea(eje, p.id, 'L' + k));
    if (k > 1) await despues(eje, pasos[k - 1], [pasos[k - 2]]);
  }
  // 1200 px de hueco como mucho: caben 7 tarjetas de 160; se enseñan 6 y los «+n».
  let c = (await siete(eje, eje.genesisId, ORDENADOR)).r.cadenas[0];
  const caben = c.visibles.length + 1;
  assert.ok(caben > 3 && caben < 12, 'en ancho caben más de tres y no todos: ' + caben);
  assert.deepEqual([c.visibles[0].nodo.texto, c.antes, c.despues], ['L1', 0, 12 - c.visibles.length], 'sin nada hecho: desde el primero, hacia delante');
  for (const k of [0, 1, 2, 3]) await hacer(eje, 'close', pasos[k].id, {});
  c = (await siete(eje, eje.genesisId, ORDENADOR)).r.cadenas[0];
  assert.deepEqual([c.visibles[0].nodo.texto, c.antes, c.visibles.length], ['L4', 3, caben - 1], 'uno antes del primero sin hacer (L5) y los siguientes que quepan');
  for (const k of [4, 5, 6, 7, 8, 9, 10]) await hacer(eje, 'close', pasos[k].id, {});
  c = (await siete(eje, eje.genesisId, ORDENADOR)).r.cadenas[0];
  assert.deepEqual([c.visibles.at(-1).nodo.texto, c.despues, c.visibles.length], ['L12', 0, caben - 1], 'al final de la cadena, se rellena hacia atrás');
});

test('a 400 px: el primer paso sin hacer, uno antes y uno después, con «+n» a cada lado; abierta, entera en vertical; toda hecha, el último', async () => {
  const { eje, t } = await roadmap();
  let { r, h } = await siete(eje, eje.genesisId, MOVIL);
  let c = r.cadenas[0];
  assert.deepEqual([c.visibles.map((p) => p.nodo.texto), c.antes, c.despues], [['A1', 'A2'], 0, 2], 'sin nada hecho: el primero y el siguiente');
  assert.match(h, new RegExp(`data-cadena="${c.clave}"[^>]*>\\+2<`));
  assert.doesNotMatch(h, /el futuro · \d/, 'con las cadenas, la zona del futuro no cuenta tarjetas');
  await hacer(eje, 'close', t.A1.id, {});
  await hacer(eje, 'close', t.A2.id, {});
  ({ r } = await siete(eje, eje.genesisId, MOVIL));
  c = r.cadenas[0];
  assert.deepEqual([c.visibles.map((p) => p.nodo.texto), c.antes, c.despues], [['A2', 'A4', 'B1'], 1, 0], 'uno antes del primero sin hacer (A4) y uno después');
  ({ r, h } = await siete(eje, eje.genesisId, MOVIL, { cadenasAbiertas: { [c.clave]: true } }));
  assert.equal(r.cadenas[0].abierta, true);
  assert.match(h, /cadena-pasos en-columna/);
  assert.match(h, /cerrar la cadena/);
  assert.equal((h.match(/class="cadena-paso[ "]/g) ?? []).length, 4 + 1 + 1, 'la abierta, con sus cuatro pasos');
  for (const n of ['A3', 'A4', 'B1']) await hacer(eje, 'close', t[n].id, {}, n === 'B1' ? 'casa-b' : 'duena');
  ({ r } = await siete(eje, eje.genesisId, MOVIL));
  c = r.cadenas[0];
  assert.deepEqual([c.visibles.map((p) => p.nodo.texto + ' · ' + p.texto), c.antes, c.despues], [['B1 · hecho'], 3, 0], 'toda hecha: el último, con su «+3»');
});

test('sin tareas, un texto llano; un libro sin la forma sigue con sus franjas; una forma que la carta no conoce cae a la de la 0 y lo dice', async () => {
  const vacio = await libro(epocaRoadmap());
  const s = await siete(vacio, vacio.genesisId, ORDENADOR);
  assert.equal(s.r.sinTareas, true);
  assert.match(s.h, /Este libro todavía no tiene tareas que se esperen unas a otras/);
  const { eje, compra } = await ejemploCompra();
  const f = (await arbol({ foco: { X: compra.id, pv: 7 } }, eje, 'huesped', ORDENADOR)).centro.rejilla;
  assert.equal(f.forma, 'franjas');
  assert.equal(f.formaDesconocida, undefined);
  const enMovil = await arbol({ foco: { X: compra.id, pv: 7 } }, eje, 'huesped', MOVIL);
  assert.ok(!enMovil.secuencia.futuro.rejilla, 'en el móvil, el futuro de un libro sin la forma sigue siendo su lista de tarjetas');
  assert.match(html(enMovil), /class="hilo-cartas"/);
  assert.match(html(enMovil), /el futuro · \d/, 'sin la forma, la cuenta de siempre');
  const nueva = epocaRoadmap();
  const fila = nueva.raiz[8][7][1][0];
  fila[4] = fila[4].map((v) => (v === 'cadenas' ? 'nube' : v));
  const { eje: otro } = await roadmap(nueva);
  const u = await siete(otro, otro.genesisId, ORDENADOR);
  assert.deepEqual([u.r.forma, u.r.formaDesconocida], ['franjas', 'nube']);
  assert.ok(u.r.bandas.length > 0);
  assert.match(u.h, /Esta carta no sabe pintar la forma «nube» que pide este libro: se ve como en la época 0\./);
});

test('entregado: su texto en llano y su data-estado; deja pasar a la siguiente', async () => {
  const { eje, t } = await roadmap();
  const an = await hacer(eje, 'declare future T', t.A1.id, { what: 'trabajo', when: '2026-11-20T10:00:00Z', units: 30 });
  await hacer(eje, 'deliver', t.A1.id, { announcement: an.id });
  const { r, h } = await siete(eje, eje.genesisId, ORDENADOR);
  assert.deepEqual(textos(r.cadenas[0].visibles).slice(0, 2), ['A1 · entregado, sin comprobar', 'A2 · listo']);
  assert.match(h, /data-estado="entregado"/);
  assert.match(h, /entregado, sin comprobar/);
});
