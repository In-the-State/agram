// La lectura «distance» (X.2.4.9) y la plantilla de recuento «distance from the author» de la época de ensayo de P
// (VG 18-11, por Core State; datos/epocas/ensayo-p/), con el diseño de «pongo mi P detrás de esto» (encargo P-3a):
// poner P detrás de algo no pide permiso a su autor. Todo inventado: libros en memoria, de demostración.
//
// El libro: ana escribe X (diez P suyos sobre él) y reparte su P entre los puntos de vista de X, que es suyo: quema 0,4 y
// acuña 0,44 en X.2; quema 0,6 y acuña 0,66 en X.5 (bajar un paso deja una décima más). Nadie le pide permiso: NADIE recibe
// su sí («let P come down here»). Cada una de las demás personas escribe una nota suya colgada de X (diez P suyos sobre
// ella), reparte la P de SU nota entre los puntos de vista de su nota (que es suya) y la COMPROMETE con X con la plantilla
// «I put my P behind this»: la bloquea en su mano con X como salida. Su P nunca aterriza en X. Las cantidades:
//
//   ana  (autora): X.2 = 0,44 · X.5 = 0,66                              reparto: X.2 = 0,4   X.5 = 0,6
//   bea: nota.2 = 0,88 y nota.5 = 1,32, y 0,5 de su nota entera, sin punto de vista; lo compromete todo con X.
//        El doble en las mismas proporciones; los 0,5 sin punto de vista no cuentan en su reparto.
//   cai:  nota.7 = 1,1, comprometido                                    reparto: 7 = 1
//   dani: nota.2 = 0,55 y nota.7 = 0,55, comprometidos                   reparto: 2 = 0,5   7 = 0,5
//   erin: escribe su nota y no compromete nada                          sin reparto, no entra
//   fran: compromete 3 de su nota entera, sin punto de vista            sin reparto, no entra
//
// Distancia = 1 − Σ mínimos de las dos proporciones, diez puntos de vista (0 a 9):
//   bea:  2: min(0,4; 0,4) = 0,4 · 5: min(0,6; 0,6) = 0,6 · resto 0            → 1 − 1,0 = 0
//   cai:  2: min(0,4; 0) = 0 · 5: min(0,6; 0) = 0 · 7: min(0; 1) = 0           → 1 − 0 = 1
//   dani: 2: min(0,4; 0,5) = 0,4 · 5: min(0,6; 0) = 0 · 7: min(0; 0,5) = 0     → 1 − 0,4 = 0,6
//   ana, erin, fran: sin lectura (la autora no se compara consigo; erin y fran no tienen P comprometido en puntos de vista).
//
// La plantilla (una decisión D de ana sobre X que nombra «distance from the author») suma, sobre los compromisos con X de
// todos menos la autora, con punto de vista y con lectura, la cantidad de cada uno por (1 − distancia) para el apoyo y por
// la distancia para la crítica:
//   bea:  (0,88 + 1,32) = 2,2 con distancia 0   → apoyo 2,2 · crítica 0      (sus 0,5 sin punto de vista, fuera)
//   cai:  1,1 con distancia 1                   → apoyo 0 · crítica 1,1
//   dani: (0,55 + 0,55) = 1,1 con distancia 0,6 → apoyo 1,1 × 0,4 = 0,44 · crítica 1,1 × 0,6 = 0,66
//   erin: nada · fran: sus 3 sin punto de vista, fuera
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
const GENTE = ['bea', 'cai', 'dani', 'erin', 'fran'];
const PLANTILLA = 'I put my P behind this';
const cerca = (a, b, m) => assert.ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, `${m ?? ''} ${a} ≠ ${b}`);

/**
 * El libro de arriba, con la época dada (o la 0). Devuelve el eje, X, la decisión D de ana sobre X, la nota de cada persona
 * y los eventos de «I put my P behind this» (por persona). Sin época de ensayo no hay plantilla: se bloquea a mano, con el
 * mismo movimiento que ella escribe, para ver que la lectura no existe.
 */
async function libro(epoca) {
  const eje = await Eje.genesis({ identidad: 'ana', foco: 'libro de ensayo', t: T, demostracion: true, ...(epoca ? { epoca } : {}) });
  for (const q of GENTE) await entrarPorInvitacion(eje, { por: 'ana', quien: q, t: T, grupo: 3 });
  const X = await eje.escribir({ autor: 'ana', sobre: eje.genesisId, t: T, payload: 'X', movimientos: [pagaElCoste('ana')] });
  // Un paso hacia abajo, dentro de un registro del propio autor: quema q en el registro y acuña 1,1 q en su punto de vista d.
  const baja = (quien, registro, quemado, d, acunado) => eje.escribir({
    autor: quien, sobre: registro.id, t: T, payload: 'paso',
    movimientos: [pagaElCoste(quien), { token: 'P', ambito: registro.id, cantidad: quemado, de: quien, a: null }, { token: 'P', ambito: registro.id + '.' + d, cantidad: acunado, de: null, a: quien }],
  });
  await baja('ana', X, 0.4, 2, 0.44); await baja('ana', X, 0.6, 5, 0.66);
  // Una nota de cada una, colgada de X, y el reparto de su P entre los puntos de vista de SU nota.
  const nota = {};
  for (const q of GENTE) nota[q] = await eje.escribir({ autor: q, sobre: X.id, t: T, payload: 'nota de ' + q, movimientos: [pagaElCoste(q)] });
  await baja('bea', nota.bea, 0.8, 2, 0.88); await baja('bea', nota.bea, 1.2, 5, 1.32);
  await baja('cai', nota.cai, 1, 7, 1.1);
  await baja('dani', nota.dani, 0.5, 2, 0.55); await baja('dani', nota.dani, 0.5, 7, 0.55);
  // Poner el P detrás de X: de la serie P:<nota>[.<d>]/<quien>, una cantidad.
  const eventos = {};
  const detras = async (quien, vista, cantidad) => {
    const serie = 'P:' + nota[quien].id + (vista === undefined ? '' : '.' + vista) + '/' + quien;
    let ev;
    if (epoca) {
      const r = await A.transaccion(eje, PLANTILLA, { X: X.id, power: serie, amount: cantidad }, quien, { t: T });
      assert.ok(r.ok, JSON.stringify(r.motivos));
      ev = r.evento;
      await eje.anadir(ev);
    } else {
      ev = await eje.escribir({ autor: quien, sobre: X.id, t: T, payload: 'detrás', movimientos: [pagaElCoste(quien), { token: 'P', ambito: nota[quien].id + (vista === undefined ? '' : '.' + vista), origen: quien, cantidad, de: quien, a: quien, estado: 'bloqueo', salida: X.id }] });
    }
    (eventos[quien] ??= []).push(ev);
  };
  await detras('bea', 2, 0.88); await detras('bea', 5, 1.32); await detras('bea', undefined, 0.5);
  await detras('cai', 7, 1.1);
  await detras('dani', 2, 0.55); await detras('dani', 7, 0.55);
  await detras('fran', undefined, 3);
  const criterio = [['decidir'], [1], ['distance from the author'], GENTE];
  const D = await eje.escribir({ autor: 'ana', sobre: X.id, t: T, payload: ['¿Plantamos?', ['x'], criterio], movimientos: [pagaElCoste('ana')] });
  return { eje, X, D, nota, eventos };
}

/** Evalúa BQL mínimo en el contexto del libro con su época (con `it` = la decisión, si se da). */
function evalua(eje, src, sujeto) {
  const r = evaluar(src, new ContextoEje(eje, { epoch: eje.epoca() }), sujeto ? { sujeto } : {});
  assert.equal(r.estado, 'RESUELTO', r.motivo);
  return r.valor;
}

/** La lectura de A sobre X: lo que da el 9 en cada compromiso de A con X (X.2.4). */
const lectura = (eje, A_, X) => evalua(eje, `(("${X.id}").2.4 where first it.3 = "${A_}") each 9`);

test('«I put my P behind this»: bloquea el P de la nota con X como salida, sin el sí de ana, y ningún registro deja P en X', async () => {
  const { eje, X, nota, eventos } = await libro(epocaEnsayoP());
  // Mueve lo mismo que «commit P»: un bloqueo en su mano (de = a = el titular), con X como salida; la serie es la de su nota.
  const ev = eventos.bea[0];
  assert.deepEqual(ev.movimientos[1], { token: 'P', ambito: nota.bea.id + '.2', origen: 'bea', cantidad: 0.88, de: 'bea', a: 'bea', estado: 'bloqueo', salida: X.id });
  // Nadie recibió el sí de ana: no hay ni un «let P come down here» en el libro.
  for (const q of GENTE) assert.equal(eje.sobre(X.id).filter((e) => e.autor === 'ana' && JSON.stringify(e.payload).includes('let P come down here')).length, 0, q);
  // Ningún registro de ellas deja P en X (ni entero ni en un punto de vista): todo lo que mueven es de su nota y es un bloqueo.
  for (const q of GENTE) {
    for (const e of eventos[q] ?? []) for (const m of e.movimientos.filter((x) => x.token === 'P')) {
      assert.ok(m.ambito.startsWith(nota[q].id), `${q}: ${m.ambito}`);
      assert.equal(m.estado, 'bloqueo');
      assert.equal(m.salida, X.id);
    }
    assert.deepEqual(evalua(eje, `(("${q}").2.1 where first it.0 = "${X.id}") each 1`), [], q + ' no tiene P posicionado en X');
  }
  // Lo bloqueado está en la mano de cada una, en su nota, con X como salida.
  assert.deepEqual(eje.bloqueosCon(X.id).map((b) => [b.identidad, b.clave, b.cantidad]).sort(), [
    ['bea', `P:${nota.bea.id}.2/bea`, 0.88], ['bea', `P:${nota.bea.id}.5/bea`, 1.32], ['bea', `P:${nota.bea.id}/bea`, 0.5],
    ['cai', `P:${nota.cai.id}.7/cai`, 1.1], ['dani', `P:${nota.dani.id}.2/dani`, 0.55], ['dani', `P:${nota.dani.id}.7/dani`, 0.55],
    ['fran', `P:${nota.fran.id}/fran`, 3],
  ].sort());
});

test('lo contrario del paso de bajar a X: aterrizar P en X sin el sí de ana sigue sin entrar; la plantilla no se ofrece a la autora', async () => {
  const { eje, X, nota } = await libro(epocaEnsayoP());
  // El camino de antes (acuñar P de bea en un punto de vista de X, quemando el suyo en X) pide el sí del dueño de X.
  await assert.rejects(eje.escribir({
    autor: 'bea', sobre: X.id, t: T, payload: 'paso',
    movimientos: [pagaElCoste('bea'), { token: 'P', ambito: X.id, cantidad: 1, de: 'bea', a: null }, { token: 'P', ambito: X.id + '.2', cantidad: 1.1, de: null, a: 'bea' }],
  }), /P comes down to a thing of another with its owner's yes/);
  // Se ofrece sobre un registro de OTRA persona a quien tiene P en su dominio: a las cinco sobre X, a la autora no, y a nadie
  // sobre la nota de otra persona en cuyo dominio no tienen P.
  const oferta = (quien, id) => A.acciones(eje, id, 2, quien).map((a) => a.nombre);
  for (const q of GENTE) assert.ok(oferta(q, X.id).includes(PLANTILLA), q + ' sobre X');
  assert.ok(!oferta('ana', X.id).includes(PLANTILLA), 'la autora de X no la tiene');
  assert.ok(!oferta('bea', nota.erin.id).includes(PLANTILLA), 'sobre la nota de erin, en cuyo dominio bea no tiene P');
  // Y erin, que no compromete nada, no tiene P bloqueado con X.
  assert.deepEqual(eje.bloqueosCon(X.id).filter((b) => b.identidad === 'erin'), []);
});

test('la lectura «distance» (X.2.4.9): 0 para el mismo reparto en el doble, 1 para nada en común, 0,6 para el reparto de dani, nada sin reparto', async () => {
  const { eje, X } = await libro(epocaEnsayoP());
  const quien = Object.fromEntries(['ana', ...GENTE].map((q) => [q, lectura(eje, q, X)]));
  // Una lectura por compromiso de A con X (da lo mismo en todos los de la misma persona): se miran todas.
  const unica = (q, esperado) => { assert.ok(quien[q].length > 0, q + ' sin lectura'); for (const v of quien[q]) cerca(v, esperado, q); };
  unica('bea', 0);   // el doble en las mismas proporciones, y su P sin punto de vista no cuenta
  unica('cai', 1);   // todo en el 7, la autora no pone nada ahí
  unica('dani', 0.6); // 1 − 0,4, cuenta a mano arriba
  assert.equal(quien.bea.length, 3, 'bea: tres compromisos (nota.2, nota.5 y nota entera), una lectura por compromiso');
  assert.equal(quien.cai.length, 1); assert.equal(quien.dani.length, 2);
  assert.deepEqual(quien.ana, [], 'la autora no tiene compromisos con X ni se compara consigo');
  assert.deepEqual(quien.erin, [], 'erin no compromete nada');
  assert.deepEqual(quien.fran, [], 'fran solo compromete P sin punto de vista: no hay reparto');
});

test('el P comprometido sin punto de vista no cuenta en el reparto: ni cambia el de bea ni da reparto a fran', async () => {
  const { eje, X } = await libro(epocaEnsayoP());
  // bea compromete 0,5 de su nota entera y fran 3: hay P bloqueado con X como salida sin punto de vista…
  const entero = (q) => evalua(eje, `(("${X.id}").2.4 where first it.3 = "${q}" and count it.0.0.5 = 0) each 1`);
  cerca(entero('bea')[0], 0.5, 'bea sin punto de vista'); cerca(entero('fran')[0], 3, 'fran sin punto de vista');
  // …y no entra en las proporciones: con los 0,5, bea tendría 0,88/2,7, 1,32/2,7 y 0,5/2,7 y la distancia no sería 0.
  for (const v of lectura(eje, 'bea', X)) cerca(v, 0, 'bea');
  assert.deepEqual(lectura(eje, 'fran', X), []);
  // El P posicionado de bea en X, ni entero ni por punto de vista: no hay (su P no aterriza en X).
  assert.deepEqual(evalua(eje, `(("bea").2.1 where first it.0 = "${X.id}") each 4`), []);
});

test('la plantilla «distance from the author»: apoyo 2,64 y crítica 1,76, y el recuento da el apoyo y pasa', async () => {
  const { eje, D } = await libro(epocaEnsayoP());
  const formula = /"=(sum \(\(\(first it\.6\.5\)[^"]*)"/.exec(readFileSync('datos/epocas/ensayo-p/ensayo-p-0.raiz.json', 'utf8'))[1];
  const [apoyo, critica, ...mas] = evalua(eje, formula, D.id);
  assert.deepEqual(mas, []);
  cerca(apoyo, 2.64, 'apoyo'); cerca(critica, 1.76, 'crítica');
  const r = recuento(eje, D.id);
  assert.deepEqual([r.plantilla, r.estado, r.umbral, r.pasa], ['distance from the author', 'RESUELTO', 0, true]);
  cerca(r.valor, 2.64, 'el recuento da el apoyo');
});

test('sin la época de ensayo (la 0 a secas) no hay plantilla «I put my P behind this» ni lectura «distance»', async () => {
  const { eje, X } = await libro(null);
  for (const q of ['ana', 'bea', 'cai', 'dani', 'fran']) assert.deepEqual(lectura(eje, q, X), [], q);
  assert.ok(!A.acciones(eje, X.id, 2, 'bea').map((a) => a.nombre).includes(PLANTILLA));
  const r = await A.transaccion(eje, PLANTILLA, { X: X.id }, 'bea', { t: T });
  assert.equal(r.ok, false);
});
