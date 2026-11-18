// El ejemplo «criterio» de la carta (encargo P-5; ejemplos/ensayo-p/criterio.mjs): el libro de ensayo-p-criterio.test.js
// con datos inventados. Distancias 0, 1 y 0,6; recuento 2,64 de apoyo y 1,76 de crítica; erin tiene su P sin gastar y a ella
// se le ofrece «I back this with my criterion» en el punto de vista 2 de su nota; a ana no, sobre X.
// Las cuentas a mano están en la cabecera de test/ensayo-p-criterio.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generarClaves } from '../src/autoridad.js';
import { evaluar } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { recuento } from '../src/motor.js';
import * as A from '../src/acciones.js';
import { ejemploCriterio } from '../ejemplos/ensayo-p/criterio.mjs';

const APOYA = 'I back this with my criterion';
const PERSONAS = ['ana', 'bea', 'cai', 'dani', 'erin'];
const cerca = (a, b, m) => assert.ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, `${m ?? ''} ${a} ≠ ${b}`);

async function construir() {
  const claves = {};
  for (const q of PERSONAS) claves[q] = await generarClaves();
  return { claves, ...(await ejemploCriterio({ claves })) };
}

function evalua(eje, src) {
  const r = evaluar(src, new ContextoEje(eje, { epoch: eje.epoca() }), {});
  assert.equal(r.estado, 'RESUELTO', r.motivo);
  return r.valor;
}
const lectura = (eje, quien, X) => evalua(eje, `(("${X}").2.4 where first it.3 = "${quien}") each 9`);

test('el ejemplo se construye con claves generadas: cinco identidades, el foco es X', async () => {
  const { eje, foco, ids } = await construir();
  for (const q of PERSONAS) assert.ok(eje.identidades().includes(q), q);
  assert.equal(foco, ids.X);
  assert.equal(eje.obtener(foco).payload, 'poner un huerto en la azotea');
  assert.deepEqual(Object.keys(ids.notas), ['bea', 'cai', 'dani', 'erin']);
});

test('las distancias son 0 (bea), 1 (cai) y 0,6 (dani); erin no tiene lectura', async () => {
  const { eje, ids } = await construir();
  const quien = Object.fromEntries(PERSONAS.map((q) => [q, lectura(eje, q, ids.X)]));
  const todas = (q, esperado) => { assert.ok(quien[q].length > 0, q + ' sin lectura'); for (const v of quien[q]) cerca(v, esperado, q); };
  todas('bea', 0); todas('cai', 1); todas('dani', 0.6);
  assert.deepEqual(quien.erin, []);
  assert.deepEqual(quien.ana, []);
});

test('el recuento «distance from the author» da 2,64 de apoyo y 1,76 de crítica', async () => {
  const { eje, ids } = await construir();
  const formula = /"=(sum \(\(\(first it\.6\.5\)[^"]*)"/.exec(readFileSync('datos/epocas/ensayo-p/ensayo-p-0.raiz.json', 'utf8'))[1];
  const r0 = evaluar(formula, new ContextoEje(eje, { epoch: eje.epoca() }), { sujeto: ids.D });
  assert.equal(r0.estado, 'RESUELTO', r0.motivo);
  const [apoyo, critica, ...mas] = r0.valor;
  assert.deepEqual(mas, []);
  cerca(apoyo, 2.64, 'apoyo'); cerca(critica, 1.76, 'crítica');
  const r = recuento(eje, ids.D);
  assert.deepEqual([r.plantilla, r.estado], ['distance from the author', 'RESUELTO']);
  cerca(r.valor, 2.64, 'el recuento da el apoyo');
});

test('a erin se le ofrece la acción en el punto de vista 2 de su nota (P sin gastar); a ana no, sobre X', async () => {
  const { eje, ids } = await construir();
  const nombres = (id, quien) => A.acciones(eje, id, 2, quien).map((a) => a.nombre);
  cerca(eje.saldo('erin', `P:${ids.notas.erin}/erin`), 10, 'la P de la nota de erin sin gastar');
  assert.ok(nombres(ids.notas.erin, 'erin').includes(APOYA), 'erin sobre su nota');
  assert.ok(!nombres(ids.X, 'ana').includes(APOYA), 'ana sobre X');
  // Y las demás ya la usaron: su P de la nota está gastada.
  assert.ok(eje.saldo('bea', `P:${ids.notas.bea}/bea`) < 10);
});

test('el módulo no importa nada de node: (se carga en el navegador) ni la copia de la época viene de un .json', () => {
  const fuente = readFileSync('ejemplos/ensayo-p/criterio.mjs', 'utf8');
  assert.ok(!/node:/.test(fuente), 'sin node:');
  assert.ok(!/\.json/.test(fuente.replace(/^\/\/.*$/gm, '')), 'sin leer JSON');
  assert.match(fuente, /ensayo-p-0\.js/);
});
