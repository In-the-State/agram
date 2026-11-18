// La época de ensayo de P (VG 18-11, por Core State): diez etiquetas en el 1.1.1 y el paso lateral entre dos puntos de vista
// del mismo registro, sin pérdida, como número de la época (el 1.1.4.4). Época hija de la 0 (datos/epocas/ensayo-p/): la 0
// no se toca. Todo inventado: libros en memoria, de demostración.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generar, archivos, epocaEnsayoP } from '../datos/epocas/ensayo-p/generar.mjs';
import { EPOCA_0_BTML, cargarEpocaEscrita } from '../src/epocas.js';
import { Eje } from '../src/eje.js';
import { sinTraducir } from '../docs/sin-traducir.mjs';
import { pagaElCoste } from './ayudas-coste.js';

const ID_DE_LA_0 = '7c1d49087209c41e03a38ef5e1c6aec6007a7515d1030f37ddea13e8a35a8448';
const T = '2026-11-18T10:00:00Z';
const REGLA = /P is repositioned one step at a time/;
const gasta = (de) => pagaElCoste(de);
const quema = (de, ambito, cantidad) => ({ token: 'P', ambito, cantidad, de, a: null });
const acuna = (a, ambito, cantidad) => ({ token: 'P', ambito, cantidad, de: null, a });

/** Un libro de demostración (con la época dada, o la 0) y dos registros de ana, cada uno con sus diez P por escribirlo. */
async function libro(epoca) {
  const eje = await Eje.genesis({ identidad: 'ana', foco: 'libro de ensayo', t: T, demostracion: true, ...(epoca ? { epoca } : {}) });
  const r = await eje.escribir({ autor: 'ana', sobre: eje.genesisId, t: T, payload: 'registro uno', movimientos: [gasta('ana')] });
  const s = await eje.escribir({ autor: 'ana', sobre: eje.genesisId, t: T, payload: 'registro dos', movimientos: [gasta('ana')] });
  return { eje, r, s };
}

/** Reposiciona P de `de` a `a` en una transacción (sobre `sobre`): quema `quemado` y acuña `acunado`. */
const mueve = (eje, sobre, de, quemado, a, acunado) => eje.escribir({ autor: 'ana', sobre, t: T, payload: 'paso', movimientos: [gasta('ana'), quema('ana', de, quemado), acuna('ana', a, acunado)] });

/** Baja la P de r a su punto de vista 2 (la rama de siempre: 10 → 11) y devuelve la cantidad que queda en él. */
async function bajaAlDos(eje, r) {
  await mueve(eje, r.id, r.id, 10, r.id + '.2', 11);
  return enVista(eje, r.id, 2);
}

/** Lo que ana tiene en el punto de vista `d` del registro `id` (la serie P:<id>.<d>/ana). */
const enVista = (eje, id, d) => eje.saldo('ana', `P:${id}.${d}/ana`);

test('la época de ensayo de P se genera desde su fuente, al día, hereda de la 0 definitiva y src/ no la importa', () => {
  const g = generar();
  assert.equal(g.fallos, 0, g.informe.join('\n'));
  for (const [ruta, texto] of Object.entries(archivos(g))) assert.equal(readFileSync(ruta, 'utf8'), texto, `${ruta} no está al día: node datos/epocas/ensayo-p/generar.mjs`);
  assert.deepEqual(g.reglas.map((r) => r.nombre), ['distance', 'P is repositioned one step at a time']);
  assert.deepEqual(g.plantillas, []);
  assert.equal(EPOCA_0_BTML.id, ID_DE_LA_0, 'la 0 no cambia');
  assert.equal(g.hereda, ID_DE_LA_0);
  const e = cargarEpocaEscrita(epocaEnsayoP());
  assert.equal(e.id, g.id);
  assert.equal(e.transacciones.length, EPOCA_0_BTML.transacciones.length);
  assert.equal(e.reglasConId.length, EPOCA_0_BTML.reglasConId.length + 1, 'la de los pasos sustituye a la de la 0 y la lectura «distance» se suma: una más');
  assert.deepEqual(sinTraducir('es', { epoca: e }).map((x) => x.clave), []);
  const fuentes = readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => readFileSync(join('src', f), 'utf8'));
  assert.ok(!fuentes.some((s) => /(from|import)\s*\(?\s*['"][^'"]*(epocas\/ensayo-p|ensayo-p-0)/.test(s)), 'la época no viaja con el núcleo (#115)');
});

test('las etiquetas de P son diez, de dígito 0 a 9, y el paso lateral es [1] sin tocar lo demás del 1.1.4', () => {
  const e = cargarEpocaEscrita(epocaEnsayoP());
  const etiquetas = e.registro[1][1][1];
  assert.deepEqual(etiquetas.map((x) => x[1][0]), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(etiquetas.map((x) => x[0][0]), ['de representación', 'económico', 'administrativo', 'social', 'técnico', 'de encaje', 'de origen', 'de futuro', 'de comparación', 'de camino']);
  const mia = e.registro[1][1][4];
  const de0 = EPOCA_0_BTML.registro[1][1][4];
  assert.deepEqual(mia[4], [1]);
  assert.deepEqual(mia.slice(0, 4), de0.slice(0, 4), 'las posiciones 0 a 3, como en la 0');
  assert.deepEqual(mia[2], [0.1, 1.1]);
  assert.equal(EPOCA_0_BTML.registro[1][1][1].length, 5, 'la 0 sigue con sus cinco');
  assert.equal(de0.length, 4);
});

test('el paso lateral del 2 al 9 del mismo registro entra y no pierde; con otra cantidad, no; a otro registro, tampoco', async () => {
  const { eje, r, s } = await libro(epocaEnsayoP());
  const enElDos = await bajaAlDos(eje, r);
  assert.equal(enElDos, 11);
  // Otra cantidad, más o menos: no entra, y el rechazo nombra la regla.
  await assert.rejects(mueve(eje, r.id, r.id + '.2', 11, r.id + '.9', 12), REGLA);
  await assert.rejects(mueve(eje, r.id, r.id + '.2', 11, r.id + '.9', 10), REGLA);
  await assert.rejects(mueve(eje, r.id, r.id + '.2', 11, r.id + '.9', 1.1), REGLA);
  // A un punto de vista de OTRO registro: no entra.
  await assert.rejects(mueve(eje, r.id, r.id + '.2', 11, s.id + '.9', 11), REGLA);
  await assert.rejects(mueve(eje, r.id, r.id + '.2', 11, s.id + '.2', 11), REGLA);
  assert.equal(enVista(eje, r.id, 2), 11, 'lo rechazado no cambia nada');
  // Del 2 al 9, sin pérdida: entra y lo que hay en el 9 es exactamente lo que había en el 2.
  await mueve(eje, r.id, r.id + '.2', 11, r.id + '.9', 11);
  assert.equal(enVista(eje, r.id, 9), enElDos);
  assert.equal(enVista(eje, r.id, 2), 0);
});

test('en un libro de la época 0 a secas, el paso lateral sigue sin entrar', async () => {
  const { eje, r } = await libro();
  assert.equal(await bajaAlDos(eje, r), 11);
  await assert.rejects(mueve(eje, r.id, r.id + '.2', 11, r.id + '.9', 11), REGLA);
  assert.equal(enVista(eje, r.id, 2), 11);
  assert.equal(enVista(eje, r.id, 9), 0);
});

test('en el libro de esta época siguen entrando subir un paso y bajar un paso, con sus cantidades de siempre', async () => {
  const { eje, r } = await libro(epocaEnsayoP());
  const hijo = await eje.escribir({ autor: 'ana', sobre: r.id, t: T, payload: 'hijo', movimientos: [gasta('ana')] });
  const antesR = eje.poderSobre('ana', r.id);
  const antesH = eje.poderSobre('ana', hijo.id);
  // Bajar un paso (de r a su hijo): se quema 10 y se acuña 11.
  await mueve(eje, hijo.id, r.id, 10, hijo.id, 11);
  assert.deepEqual([antesR - eje.poderSobre('ana', r.id), eje.poderSobre('ana', hijo.id) - antesH], [10, 11]);
  // Subir un paso (del hijo a r): se quema 11 y se acuña 1,1.
  await mueve(eje, hijo.id, hijo.id, 11, r.id, 1.1);
  assert.ok(Math.abs(eje.poderSobre('ana', hijo.id) - antesH) < 1e-9);
  assert.ok(Math.abs(eje.poderSobre('ana', r.id) - (antesR - 10 + 1.1)) < 1e-9);
});
