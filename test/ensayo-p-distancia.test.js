// La lectura «distance» (A.2.1.8) y la plantilla de recuento «distance from the author» de la época de ensayo de P
// (VG 18-11, por Core State; datos/epocas/ensayo-p/): cuánto se parece el reparto de P de una persona entre los diez
// puntos de vista de un registro al reparto del autor. Todo inventado: libros en memoria, de demostración.
//
// El libro: ana escribe X (diez P suyos sobre él). Da su sí («let P come down here») a cuatro personas y les pasa P de
// X con su origen (la serie P:X/ana). Cada una lo baja a puntos de vista de X, un paso por transacción (el paso hacia
// abajo deja una décima más: quema q y acuña 1,1 q). Las cantidades, a escala de décimas para que ana alcance a todos:
//
//   ana  (autora): quema 0,4 → 0,44 en X.2 y quema 0,6 → 0,66 en X.5     reparto: X.2 = 0,4   X.5 = 0,6
//   bea: recibe 2,5, quema 0,8 → 0,88 en X.2 y 1,2 → 1,32 en X.5; 0,5 se queda en X entero. El doble, en las mismas proporciones.
//   cai: recibe 1, quema 1 → 1,1 en X.7                                  reparto: X.7 = 1
//   dani: recibe 1, quema 0,5 → 0,55 en X.2 y 0,5 → 0,55 en X.7         reparto: X.2 = 0,5   X.7 = 0,5
//   erin: recibe 0,5 y lo deja en X entero, sin punto de vista           sin reparto
//
// Distancia = 1 − Σ mínimos de las dos proporciones, diez puntos de vista (0 a 9):
//   bea:  X.2 min(0,4; 0,4) = 0,4 · X.5 min(0,6; 0,6) = 0,6 · resto 0           → 1 − 1,0 = 0
//   cai:  X.2 min(0,4; 0) = 0 · X.5 min(0,6; 0) = 0 · X.7 min(0; 1) = 0         → 1 − 0 = 1
//   dani: X.2 min(0,4; 0,5) = 0,4 · X.5 min(0,6; 0) = 0 · X.7 min(0; 0,5) = 0   → 1 − 0,4 = 0,6
//   erin: ningún P en puntos de vista de X: la lectura no da nada (y el P sobre X entero de ana, de bea y de erin no cuenta).
//
// La plantilla (una decisión D de ana sobre X que nombra «distance from the author») suma, sobre las entradas de P en
// puntos de vista de X de todos menos la autora y con lectura, la cantidad de cada entrada por (1 − distancia) para el
// apoyo y por la distancia para la crítica:
//   bea:  0,88 + 1,32 = 2,2 con distancia 0   → apoyo 2,2 · crítica 0
//   cai:  1,1 con distancia 1                 → apoyo 0 · crítica 1,1
//   dani: 0,55 + 0,55 = 1,1 con distancia 0,6 → apoyo 1,1 × 0,4 = 0,44 · crítica 1,1 × 0,6 = 0,66
//   erin: sin lectura, no entra
//   apoyo = 2,2 + 0 + 0,44 = 2,64 · crítica = 0 + 1,1 + 0,66 = 1,76
// El recuento da el primero (apoyo) y, al ser mayor que el umbral de la época (0), pasa.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Eje } from '../src/eje.js';
import { evaluar } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { epocaEnsayoP } from '../datos/epocas/ensayo-p/generar.mjs';
import { entrarPorInvitacion } from '../ejemplos/ikisai/altas.mjs';
import * as A from '../src/acciones.js';
import { recuento } from '../src/motor.js';
import { pagaElCoste } from './ayudas-coste.js';

const T = '2026-11-18T10:00:00Z';
const GENTE = ['bea', 'cai', 'dani', 'erin'];
const cerca = (a, b, m) => assert.ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, `${m ?? ''} ${a} ≠ ${b}`);

/** El libro de arriba, con la época dada (o la 0). Devuelve el eje, X y la decisión D de ana sobre X. */
async function libro(epoca) {
  const eje = await Eje.genesis({ identidad: 'ana', foco: 'libro de ensayo', t: T, demostracion: true, ...(epoca ? { epoca } : {}) });
  for (const q of GENTE) await entrarPorInvitacion(eje, { por: 'ana', quien: q, t: T, grupo: 3 });
  const X = await eje.escribir({ autor: 'ana', sobre: eje.genesisId, t: T, payload: 'X', movimientos: [pagaElCoste('ana')] });
  for (const whom of GENTE) {
    const r = await A.transaccion(eje, 'let P come down here', { X: X.id, whom, answer: 'yes' }, 'ana', { t: T });
    assert.ok(r.ok, JSON.stringify(r.motivos));
    await eje.anadir(r.evento);
  }
  const da = (a, cantidad) => eje.escribir({ autor: 'ana', sobre: eje.genesisId, t: T, payload: 'da ' + a, movimientos: [pagaElCoste('ana'), { token: 'P', ambito: X.id, cantidad, de: 'ana', a }] });
  await da('bea', 2.5); await da('cai', 1); await da('dani', 1); await da('erin', 0.5);
  // Un paso hacia abajo: de X entero a su punto de vista d, con el origen de ana.
  const baja = (quien, quemado, d, acunado) => eje.escribir({
    autor: quien, sobre: X.id, t: T, payload: 'paso',
    movimientos: [pagaElCoste(quien), { token: 'P', ambito: X.id, cantidad: quemado, de: quien, a: null, origen: 'ana' }, { token: 'P', ambito: X.id + '.' + d, cantidad: acunado, de: null, a: quien, origen: 'ana' }],
  });
  await baja('ana', 0.4, 2, 0.44); await baja('ana', 0.6, 5, 0.66);
  await baja('bea', 0.8, 2, 0.88); await baja('bea', 1.2, 5, 1.32);
  await baja('cai', 1, 7, 1.1);
  await baja('dani', 0.5, 2, 0.55); await baja('dani', 0.5, 7, 0.55);
  const criterio = [['decidir'], [1], ['distance from the author'], GENTE];
  const D = await eje.escribir({ autor: 'ana', sobre: X.id, t: T, payload: ['¿Plantamos?', ['x'], criterio], movimientos: [pagaElCoste('ana')] });
  return { eje, X, D };
}

/** Evalúa BQL mínimo en el contexto del libro con su época (con `it` = la decisión, si se da). */
function evalua(eje, src, sujeto) {
  const r = evaluar(src, new ContextoEje(eje, { epoch: eje.epoca() }), sujeto ? { sujeto } : {});
  assert.equal(r.estado, 'RESUELTO', r.motivo);
  return r.valor;
}

/** La lectura de A sobre X: lo que da `.8` en cada una de sus entradas de A.2.1 sobre X. */
const lectura = (eje, A_, X) => evalua(eje, `("${A_}").2.1.("${X.id}") each 8`);

test('la lectura «distance» (A.2.1.8): 0 para el mismo reparto en el doble, 1 para nada en común, 0,6 para el reparto de dani, nada sin reparto', async () => {
  const { eje, X } = await libro(epocaEnsayoP());
  const quien = Object.fromEntries(['ana', ...GENTE].map((q) => [q, lectura(eje, q, X)]));
  // Una lectura por entrada de A.2.1 sobre X (da lo mismo en todas las del mismo registro): se miran todas.
  const unica = (q, esperado) => { assert.ok(quien[q].length > 0, q + ' sin lectura'); for (const v of quien[q]) cerca(v, esperado, q); };
  unica('ana', 0);   // consigo misma
  unica('bea', 0);   // el doble en las mismas proporciones
  unica('cai', 1);   // todo en el 7, la autora no pone nada ahí
  unica('dani', 0.6); // 1 − 0,4, cuenta a mano arriba
  assert.deepEqual(quien.erin, [], 'erin no tiene P en puntos de vista de X: la lectura no da nada');
  assert.equal(quien.bea.length, 3, 'bea: X entero, X.2 y X.5, una lectura por entrada');
});

test('el P sobre el registro entero, sin punto de vista, no cuenta en el reparto', async () => {
  const { eje, X } = await libro(epocaEnsayoP());
  // Hay P sin punto de vista: ana 4 (10 − 5 que pasa − 1 que baja), bea 0,5, erin 0,5.
  const entero = (q) => evalua(eje, `(("${q}").2.1 where first it.0 = "${X.id}" and count it.5 = 0) each 4`);
  cerca(entero('ana')[0], 4, 'ana en X entero'); cerca(entero('bea')[0], 0.5, 'bea en X entero'); cerca(entero('erin')[0], 0.5, 'erin en X entero');
  // Y no entra en las proporciones: con él, bea tendría 0,88/2,7, 1,32/2,7 y la distancia no sería 0.
  for (const v of lectura(eje, 'bea', X)) cerca(v, 0, 'bea');
  for (const v of lectura(eje, 'ana', X)) cerca(v, 0, 'ana');
  // erin solo tiene P sobre X entero: no hay reparto y la lectura no da nada.
  assert.deepEqual(lectura(eje, 'erin', X), []);
});

test('la plantilla «distance from the author»: apoyo 2,64 y crítica 1,76, y el recuento da el apoyo y pasa', async () => {
  const { eje, D } = await libro(epocaEnsayoP());
  const formula = /"=(sum \(\(\(before\.3[^"]*)"/.exec(readFileSync('datos/epocas/ensayo-p/ensayo-p-0.raiz.json', 'utf8'))[1];
  const [apoyo, critica, ...mas] = evalua(eje, formula, D.id);
  assert.deepEqual(mas, []);
  cerca(apoyo, 2.64, 'apoyo'); cerca(critica, 1.76, 'crítica');
  const r = recuento(eje, D.id);
  assert.deepEqual([r.plantilla, r.estado, r.umbral, r.pasa], ['distance from the author', 'RESUELTO', 0, true]);
  cerca(r.valor, 2.64, 'el recuento da el apoyo');
});

test('sin la época de ensayo (la 0 a secas) no hay lectura «distance»', async () => {
  const { eje, X } = await libro(null);
  for (const q of ['ana', 'bea', 'cai', 'dani']) assert.deepEqual(lectura(eje, q, X), [], q);
});
