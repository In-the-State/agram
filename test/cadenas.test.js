// Las dependencias entre tareas como cadenas en el 7 (Core AGRAM 17-11, decidido con VG): la época hija del libro del
// roadmap (datos/epocas/roadmap/) y la lectura pura src/cadenas.js (docs/CONTRATO.md §12.10). Todo inventado: libros
// en memoria, de demostración.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generar, archivos, epocaRoadmap } from '../datos/epocas/roadmap/generar.mjs';
import { epocaGuiaLibro } from '../datos/epocas/guia-libro/generar.mjs';
import { EPOCA_0_BTML, cargarEpocaEscrita } from '../src/epocas.js';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as contrato from '../src/contrato.js';
import { cadenas, FINES_QUE_DESBLOQUEAN, NOMBRES_DE_LAS_CADENAS } from '../src/cadenas.js';
import { sinTraducir } from '../docs/sin-traducir.mjs';

const ID_DE_LA_0 = '7c1d49087209c41e03a38ef5e1c6aec6007a7515d1030f37ddea13e8a35a8448';
const DESPUES = 'this goes after';
const T = '2026-11-17T10:00:00Z';

/** Un libro de demostración (con la época dada, o la 0): la dueña y una casa invitada. */
async function libro(epoca) {
  const eje = await Eje.genesis({ identidad: 'duena', foco: 'roadmap de prueba', t: T, emision: [{ token: 'R', cantidad: 10 }], ...(epoca ? { epoca } : {}), demostracion: true });
  await eje.aceptar(await eje.invitar({ autor: 'duena', invitado: 'casa-b', t: T }), {}, { t: T });
  return eje;
}

/** Lanza una plantilla como `quien` y la asienta; falla si no pasa. */
async function hacer(eje, nombre, X, params, quien = 'duena') {
  const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: T });
  assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
  return eje.anadir(r.evento);
}
const tarea = (eje, proyecto, titulo, quien) => hacer(eje, 'anchor here', proyecto, { title: titulo, content: ['id: ' + titulo], type: 'task' }, quien);
const despues = (eje, t, anteriores, quien = 'duena') => hacer(eje, DESPUES, t.id, anteriores.length ? { previous: anteriores.map((x) => x.id) } : {}, quien);

/**
 * El roadmap de prueba: el proyecto A de la dueña con A1…A5 y el proyecto B de la casa con B1. A2 y A3 van después de
 * A1 (una bifurcación), A4 después de A2 y de A3 (una unión), B1 (de otra casa) después de A4; A5 es independiente.
 */
async function roadmap() {
  const eje = await libro(epocaRoadmap());
  const pa = await hacer(eje, 'anchor here', eje.genesisId, { title: 'Proyecto A' });
  const pb = await hacer(eje, 'anchor here', eje.alta('casa-b').id, { title: 'Proyecto B' }, 'casa-b');
  const t = {};
  for (const n of ['A1', 'A2', 'A3', 'A4', 'A5']) t[n] = await tarea(eje, pa.id, n, 'duena');
  t.B1 = await tarea(eje, pb.id, 'B1', 'casa-b');
  await despues(eje, t.A2, [t.A1]);
  await despues(eje, t.A3, [t.A1]);
  await despues(eje, t.A4, [t.A2, t.A3]);
  await despues(eje, t.B1, [t.A4], 'casa-b');
  return { eje, pa, pb, t };
}

/** Las cadenas en corto: los nombres de sus pasos (el 0 de cada tarea) y de dónde salen. */
const corto = (eje, r) => {
  const n = (id) => (id ? eje.obtener(id).payload[0][0] : null);
  return {
    cadenas: r.cadenas.map((c) => ({ sale: n(c.sale), pasos: c.pasos.map((p) => n(p.id) + (p.fuera ? ' (fuera)' : '') + (p.une.length ? ' une ' + p.une.map(n).join(',') : '')) })),
    independientes: r.independientes.map((p) => n(p.id)),
  };
};
const estados = (eje, r) => Object.fromEntries([...r.cadenas.flatMap((c) => c.pasos), ...r.independientes].map((p) => [eje.obtener(p.id).payload[0][0], p.estado + (p.espera.length ? ' ' + p.espera.map((x) => eje.obtener(x).payload[0][0]).join(',') : '')]));

test('la época del roadmap se genera desde su fuente, al día, hereda de la 0 definitiva y src/ no la importa', () => {
  const g = generar();
  assert.equal(g.fallos, 0, g.informe.join('\n'));
  for (const [ruta, texto] of Object.entries(archivos(g))) assert.equal(readFileSync(ruta, 'utf8'), texto, `${ruta} no está al día: npm run epoca:roadmap`);
  assert.deepEqual(g.plantillas.map((p) => [p.nombre, p.ocho]), [[DESPUES, [7, 6]]]);
  assert.deepEqual(g.reglas.map((r) => r.nombre), ['a task does not go after itself']);
  assert.equal(JSON.parse(readFileSync('datos/epocas/roadmap/roadmap-0.ids.json', 'utf8')).registrosAlPublicar, 4);
  assert.equal(EPOCA_0_BTML.id, ID_DE_LA_0, 'la 0 no cambia');
  assert.equal(g.hereda, ID_DE_LA_0);
  const e = cargarEpocaEscrita(epocaRoadmap());
  assert.equal(e.id, g.id);
  assert.equal(e.transacciones.length, EPOCA_0_BTML.transacciones.length + 1);
  assert.equal(e.reglasConId.length, EPOCA_0_BTML.reglasConId.length + 1);
  const donde = Object.fromEntries(contrato.plantillas(null, { epoca: e }).map((p) => [p.nombre, p.donde]));
  assert.deepEqual([donde.account, donde.task, donde['previous tasks']], ['9270000000', '9281000000', '9282000000'], 'las dos de datos, en un grupo en la 8 del 9.2; «account» en su sitio');
  assert.deepEqual(sinTraducir('es', { epoca: e }).map((x) => x.clave), []);
  const fuentes = readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => readFileSync(join('src', f), 'utf8'));
  assert.ok(!fuentes.some((s) => /(from|import)\s*\(?\s*['"][^'"]*(epocas\/roadmap|roadmap-0)/.test(s)), 'la época no viaja con el núcleo (#115)');
});

test('la relación: solo al autor de una tarea, en modo persona, en su 2.6; cuántas en su 1 y las anteriores en su 6; nunca a sí misma', async () => {
  const { eje, pa, t } = await roadmap();
  assert.ok(A.acciones(eje, t.A5.id, 7, 'duena').some((a) => a.nombre === DESPUES));
  assert.ok(!A.acciones(eje, t.A5.id, 7, 'casa-b').some((a) => a.nombre === DESPUES), 'a otra persona, no');
  assert.ok(!A.acciones(eje, pa.id, 7, 'duena').some((a) => a.nombre === DESPUES), 'sobre lo que no es una tarea, no');
  assert.equal(A.modoDeEjecucion(eje, DESPUES).modo, 'person');
  const r = await despues(eje, t.A5, [t.A1, t.B1]);
  assert.deepEqual([r.sobre, r.en], [t.A5.id, '2600000000']);
  assert.deepEqual(r.payload, [['goes after'], [2], ['all announced movements happened'], ['duena'], [DESPUES], ['previous tasks'], [{ ref: t.A1.id }, { ref: t.B1.id }]], 'la anterior puede ser de otra casa');
  const sin = await despues(eje, t.A5, []);
  assert.deepEqual(sin.payload.slice(0, 2), [['goes after'], [0]]);
  assert.equal(sin.payload.length, 6, 'sin 6: ya no depende de nada');
  const aSiMisma = await A.transaccion(eje, DESPUES, { X: t.A5.id, previous: [t.A5.id] }, 'duena', { t: T });
  assert.equal(aSiMisma.ok, false);
  assert.ok(aSiMisma.motivos.some((m) => m.regla === 'a task does not go after itself'));
  assert.equal((await A.transaccion(eje, DESPUES, { X: t.A5.id, previous: [t.A1.id], count: 2 }, 'duena', { t: T })).ok, false, 'la cuenta es la de su 6');
  assert.equal((await A.transaccion(eje, DESPUES, { X: t.A5.id, previous: [t.A1.id], who: 'casa-b' }, 'duena', { t: T })).ok, false, 'quién es quien escribe');
});

test('las cadenas: bifurcación, unión y varias casas; las independientes aparte; la anterior de fuera, como contexto', async () => {
  const { eje, pa, pb, t } = await roadmap();
  assert.deepEqual(corto(eje, cadenas(eje, eje.genesisId)), {
    cadenas: [{ sale: null, pasos: ['A1', 'A2', 'A4 une A3', 'B1'] }, { sale: 'A1', pasos: ['A3'] }],
    independientes: ['A5'],
  });
  assert.deepEqual(corto(eje, cadenas(eje, pa.id)), { cadenas: [{ sale: null, pasos: ['A1', 'A2', 'A4 une A3'] }, { sale: 'A1', pasos: ['A3'] }], independientes: ['A5'] }, 'una siguiente de otra casa no entra');
  assert.deepEqual(corto(eje, cadenas(eje, pb.id)), { cadenas: [{ sale: null, pasos: ['A4 (fuera)', 'B1'] }], independientes: [] }, 'la anterior de fuera, en la cadena, marcada');
  assert.deepEqual(corto(eje, contrato.cadenas(eje, eje.alta('casa-b').id)), corto(eje, cadenas(eje, pb.id)), 'la casa: lo que cuelga de su alta; por el contrato');
  // Manda la última: B1 ya no depende de nada; la relación de otra persona sobre una tarea ajena no cuenta.
  await despues(eje, t.B1, [], 'casa-b');
  await despues(eje, t.A5, [t.A1], 'casa-b');
  assert.deepEqual(corto(eje, cadenas(eje, eje.genesisId)).independientes, ['A5', 'B1']);
});

test('los estados: listo, espera (y por cuáles), en curso y hecho; una anterior cerrada con error o caducada no desbloquea', async () => {
  const { eje, t } = await roadmap();
  assert.deepEqual(FINES_QUE_DESBLOQUEAN, ['cumplido', 'decidido'], 'el valor por defecto, en un solo sitio');
  assert.deepEqual(estados(eje, cadenas(eje, eje.genesisId)), { A1: 'listo', A2: 'espera A1', A4: 'espera A2,A3', B1: 'espera A4', A3: 'espera A1', A5: 'listo' });
  await hacer(eje, 'declare future T', t.A5.id, { what: 'trabajo', when: '2026-11-20T10:00:00Z', units: 30 });
  await hacer(eje, 'close', t.A1.id, {});
  let r = cadenas(eje, eje.genesisId);
  assert.deepEqual(estados(eje, r), { A1: 'hecho', A2: 'listo', A4: 'espera A2,A3', B1: 'espera A4', A3: 'listo', A5: 'en curso' });
  assert.equal(r.independientes[0].estacion, 'propuesta');
  assert.deepEqual([r.cadenas[0].pasos[0].fin, r.cadenas[0].primeroSinHacer, r.cadenas[1].primeroSinHacer], ['cumplido', 1, 0]);
  await hacer(eje, 'close with error', t.A2.id, { cause: 'no salió' });
  await hacer(eje, 'close', t.A3.id, {});
  r = cadenas(eje, eje.genesisId);
  assert.deepEqual(estados(eje, r), { A1: 'hecho', A2: 'hecho', A4: 'espera A2', B1: 'espera A4', A3: 'hecho', A5: 'en curso' }, 'A2 cerrada con error: A4 sigue esperándola');
  assert.deepEqual([r.cadenas[0].pasos[1].fin, r.cadenas[0].primeroSinHacer, r.cadenas[1].primeroSinHacer], ['error', 2, null]);
});

test('un ciclo escrito a mano: se descarta la arista que lo cierra (la última en llegar) y se dice; lo que no es una tarea, también', async () => {
  const { eje, pa, t } = await roadmap();
  await despues(eje, t.A1, [t.A4, pa]);
  const r = cadenas(eje, eje.genesisId);
  assert.deepEqual(r.descartadas.map((d) => [eje.obtener(d.de).payload[0][0], eje.obtener(d.a).payload[0][0], d.motivo]), [['Proyecto A', 'A1', 'no es una tarea'], ['A4', 'A1', 'ciclo']]);
  assert.deepEqual(corto(eje, r).cadenas[0].pasos, ['A1', 'A2', 'A4 une A3', 'B1'], 'las cadenas, como sin el ciclo');
});

test('un libro con la época 0 a secas da vacío; el 7 de un libro sin esta época sigue siendo el de siempre', async () => {
  const cero = await libro(null);
  const p = await hacer(cero, 'anchor here', cero.genesisId, { title: 'Proyecto' });
  const t1 = await tarea(cero, p.id, 'X1', 'duena');
  assert.equal(A.plantillaDeTransaccion(DESPUES, { epoca: cero.epoca() }), null);
  assert.deepEqual(cadenas(cero, cero.genesisId), { cadenas: [], independientes: [], descartadas: [] });
  assert.deepEqual(contrato.cadenas(cero, t1.id), { cadenas: [], independientes: [], descartadas: [] });
  assert.deepEqual(cadenas(cero, 'no-es-un-id'), { cadenas: [], independientes: [], descartadas: [] });
  const de0 = contrato.divisionDelMundo(cero, 7);
  assert.equal(de0.forma, 'franjas');
  assert.ok(de0.bandas.length > 0);
  const guia = await libro(epocaGuiaLibro());
  assert.deepEqual(contrato.divisionDelMundo(guia, 7), de0, 'otra época hija no lo cambia');
  const { eje } = await roadmap();
  const d = contrato.divisionDelMundo(eje, 7);
  assert.deepEqual([d.forma, d.formas, d.mide, d.bandas], ['cadenas', ['cadenas'], [NOMBRES_DE_LAS_CADENAS.relacion], undefined]);
  assert.equal(contrato.divisionDelMundo(eje, 6).forma, 'franjas', 'el 6 del roadmap, el de siempre');
  assert.equal(contrato.formaDe(eje, 7, 'sequenced').forma, 'cadenas');
});

test('una anterior de fuera dice su estado verdadero: se leen sus propias anteriores (un salto), sin meterlas en la cadena', async () => {
  const { eje, pb, t } = await roadmap();
  let r = cadenas(eje, pb.id);
  assert.deepEqual(corto(eje, r), { cadenas: [{ sale: null, pasos: ['A4 (fuera)', 'B1'] }], independientes: [] }, 'A2 y A3 no entran');
  assert.deepEqual(estados(eje, r), { A4: 'espera A2,A3', B1: 'espera A4' });
  await hacer(eje, 'close', t.A1.id, {});
  await hacer(eje, 'close', t.A2.id, {});
  await hacer(eje, 'close', t.A3.id, {});
  r = cadenas(eje, pb.id);
  assert.deepEqual(estados(eje, r), { A4: 'listo', B1: 'espera A4' }, 'las de A4, hechas: A4 lista (y no se mira más allá: A1)');
  await hacer(eje, 'close', t.A4.id, {});
  assert.deepEqual(estados(eje, cadenas(eje, pb.id)), { A4: 'hecho', B1: 'listo' });
});

test('entregado: la entrega de su autor (deliver sobre su anuncio) sin cierre desbloquea a las siguientes; un cierre con error después, no', async () => {
  const { eje, pb, t } = await roadmap();
  const { ENTREGADA_DESBLOQUEA, ESTADOS_DE_PASO } = await import('../src/cadenas.js');
  assert.equal(ENTREGADA_DESBLOQUEA, true, 'la decisión, en un solo sitio');
  assert.deepEqual(Object.values(ESTADOS_DE_PASO), ['hecho', 'entregado', 'espera', 'en curso', 'listo'], 'en su orden de precedencia');
  const entregar = async (x, quien = 'duena') => {
    const an = await hacer(eje, 'declare future T', x.id, { what: 'trabajo', when: '2026-11-20T10:00:00Z', units: 30 }, quien);
    return hacer(eje, 'deliver', x.id, { announcement: an.id }, quien);
  };
  await entregar(t.A1);
  let r = cadenas(eje, eje.genesisId);
  assert.deepEqual(estados(eje, r), { A1: 'entregado', A2: 'listo', A3: 'listo', A4: 'espera A2,A3', B1: 'espera A4', A5: 'listo' });
  assert.equal(r.cadenas[0].primeroSinHacer, 1, 'primeroSinHacer salta lo entregado');
  await entregar(t.A2);
  await entregar(t.A3);
  await entregar(t.A4);
  r = cadenas(eje, pb.id);
  assert.deepEqual(estados(eje, r), { A4: 'entregado', B1: 'listo' }, 'la anterior de fuera, entregada, también deja pasar');
  // Un cierre con error después de la entrega: manda el cierre, y no desbloquea.
  await hacer(eje, 'close with error', t.A1.id, { cause: 'no salió' });
  r = cadenas(eje, eje.genesisId);
  assert.deepEqual([estados(eje, r).A1, estados(eje, r).A2, r.cadenas[0].pasos[0].fin], ['hecho', 'entregado A1', 'error'], 'A2 sigue entregada, y su `espera` dice que A1 no la deja pasar');
  assert.deepEqual(estados(eje, r).A3, 'entregado A1');
  await hacer(eje, 'close', t.A2.id, {});
  r = cadenas(eje, eje.genesisId);
  assert.deepEqual(estados(eje, r).A2, 'hecho');
  assert.deepEqual(r.cadenas[0].primeroSinHacer, 3, 'salta hechos (A1, A2) y entregados (A4): el primero sin hacer es B1');
});
