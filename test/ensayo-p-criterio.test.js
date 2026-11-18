// «I back this with my criterion» («apoyo esto con mi criterio»), de la época de ensayo de P (VG 18-11, por Core State;
// datos/epocas/ensayo-p/; encargo P-4): apoyar un registro X de otra persona con el criterio entero de una vez.
// Todo inventado: libros en memoria, de demostración.
//
// QUÉ FORMA SALIÓ: la B (dos registros: la nota, como hoy, y UNA acción sobre la nota propia que reparte y bloquea todo).
// La A (un solo registro que escribe la nota Y reparte su P) no cabe con datos, por dos razones del motor, probadas abajo:
//   1. la serie de P de una nota se nombra por el id de la nota (P:<id>.d) y el id es el hash del cuerpo del registro, que
//      llevaría ese mismo movimiento: un registro no puede nombrar su propia serie antes de existir;
//   2. aunque pudiera, la P que la nota obtiene la acuña el libro DESPUÉS de los movimientos del registro (src/eje.js,
//      #obtencion: `[...movimientos, ...obtención]`), así que ningún movimiento del propio registro puede gastarla.
//
// El libro, el mismo del test de distancia: ana escribe X y reparte su P (quema 0,4 y acuña 0,44 en X.2; quema 0,6 y acuña
// 0,66 en X.5: reparto 2 = 0,4 · 5 = 0,6). bea, cai y dani escriben cada una una nota colgada de X (diez P suyos en ella) y
// la apoyan con la acción nueva, con los mismos repartos que allí; erin la escribe y la deja a cero:
//
//   bea:  split [2: 0,8 · 5: 1,2]  → quema 0,8 y 1,2 de su nota; acuña 0,88 en nota.2 y 1,32 en nota.5 (bajar un paso: 1,1 ×)
//         y los bloquea con X como salida. El doble en las mismas proporciones que ana.
//   cai:  split [7: 1]              → quema 1; acuña y bloquea 1,1 en nota.7
//   dani: split [2: 0,5 · 7: 0,5]   → bloquea 0,55 en nota.2 y 0,55 en nota.7
//   erin: split todo a cero         → no mueve nada: ni reparto ni lectura
//
// Distancia = 1 − Σ mínimos de las proporciones (ana: 2 = 0,4 · 5 = 0,6), diez puntos de vista:
//   bea:  min(0,4; 0,4) + min(0,6; 0,6) = 1,0          → 0
//   cai:  min(0,4; 0) + min(0,6; 0) + min(0; 1) = 0    → 1
//   dani: min(0,4; 0,5) + min(0,6; 0) + min(0; 0,5) = 0,4 → 0,6
// Recuento («distance from the author»): apoyo = Σ cantidad × (1 − distancia), crítica = Σ cantidad × distancia
//   bea (0,88 + 1,32) × 1 = 2,2 · 0   cai 1,1 × 0 = 0 · 1,1   dani 1,1 × 0,4 = 0,44 · 1,1 × 0,6 = 0,66
//   apoyo = 2,2 + 0 + 0,44 = 2,64 · crítica = 0 + 1,1 + 0,66 = 1,76
//
// Registros que escribe cada una (la nota incluida), contra el camino largo de hoy (nota; un paso de bajar por punto de
// vista; una «I put my P behind this» por serie):
//   bea:  largo 1 + 2 + 2 = 5 · ahora 2   cai: largo 1 + 1 + 1 = 3 · ahora 2   dani: largo 1 + 2 + 2 = 5 · ahora 2
// (la forma A habría sido 1 para cada una; no cabe).

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
const APOYA = 'I back this with my criterion';
const DETRAS = 'I put my P behind this';
const RETIRA = 'withdraw support';
const REGLA = /P is repositioned one step at a time/;
const cerca = (a, b, m) => assert.ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, `${m ?? ''} ${a} ≠ ${b}`);

/** Un reparto de diez cantidades desde {punto de vista: cantidad}. */
const reparto = (o) => Array.from({ length: 10 }, (_, d) => o[d] ?? 0);
const REPARTOS = {
  bea: reparto({ 2: 0.8, 5: 1.2 }),
  cai: reparto({ 7: 1 }),
  dani: reparto({ 2: 0.5, 7: 0.5 }),
  erin: reparto({}),
};

/**
 * El libro de arriba. `modo` 'criterio': cada una apoya con la acción nueva; 'largo': con el camino de hoy (bajar a cada punto
 * de vista y poner la P de cada serie detrás con «I put my P behind this»). Devuelve el eje, X, la decisión D de ana, la nota
 * de cada una, el evento de la acción de cada una (modo criterio) y cuántos registros escribió cada una.
 */
async function libro(modo = 'criterio') {
  const eje = await Eje.genesis({ identidad: 'ana', foco: 'libro de ensayo', t: T, demostracion: true, epoca: epocaEnsayoP() });
  for (const q of GENTE) await entrarPorInvitacion(eje, { por: 'ana', quien: q, t: T, grupo: 3 });
  const X = await eje.escribir({ autor: 'ana', sobre: eje.genesisId, t: T, payload: 'X', movimientos: [pagaElCoste('ana')] });
  const baja = (quien, registro, quemado, d, acunado) => eje.escribir({
    autor: quien, sobre: registro.id, t: T, payload: 'paso',
    movimientos: [pagaElCoste(quien), { token: 'P', ambito: registro.id, cantidad: quemado, de: quien, a: null }, { token: 'P', ambito: registro.id + '.' + d, cantidad: acunado, de: null, a: quien }],
  });
  await baja('ana', X, 0.4, 2, 0.44); await baja('ana', X, 0.6, 5, 0.66);
  const nota = {}; const evento = {}; const registros = {};
  for (const q of GENTE) {
    const antes = eje.orden.length;
    nota[q] = await eje.escribir({ autor: q, sobre: X.id, t: T, payload: 'nota de ' + q, movimientos: [pagaElCoste(q)] });
    if (modo === 'criterio') {
      const r = await A.transaccion(eje, APOYA, { X: nota[q].id, split: REPARTOS[q] }, q, { t: T });
      assert.ok(r.ok, q + ': ' + JSON.stringify(r.motivos));
      evento[q] = r.evento;
      await eje.anadir(r.evento);
    } else {
      REPARTOS[q].forEach((c, d) => { if (c > 0) evento[q] = [...(evento[q] ?? []), [d, c]]; });
      for (const [d, c] of evento[q] ?? []) await baja(q, nota[q], c, d, Math.round(c * 1.1 * 1e9) / 1e9);
      for (const [d, c] of evento[q] ?? []) {
        const r = await A.transaccion(eje, DETRAS, { X: X.id, power: 'P:' + nota[q].id + '.' + d + '/' + q, amount: Math.round(c * 1.1 * 1e9) / 1e9 }, q, { t: T });
        assert.ok(r.ok, JSON.stringify(r.motivos));
        await eje.anadir(r.evento);
      }
    }
    registros[q] = eje.orden.length - antes;
  }
  const criterio = [['decidir'], [1], ['distance from the author'], GENTE];
  const D = await eje.escribir({ autor: 'ana', sobre: X.id, t: T, payload: ['¿Plantamos?', ['x'], criterio], movimientos: [pagaElCoste('ana')] });
  return { eje, X, D, nota, evento, registros };
}

function evalua(eje, src, sujeto) {
  const r = evaluar(src, new ContextoEje(eje, { epoch: eje.epoca() }), sujeto ? { sujeto } : {});
  assert.equal(r.estado, 'RESUELTO', r.motivo);
  return r.valor;
}
/** La lectura de A sobre X: lo que da el 9 en cada compromiso de A con X (X.2.4). */
const lectura = (eje, quien, X) => evalua(eje, `(("${X.id}").2.4 where first it.3 = "${quien}") each 9`);
const bloqueado = (eje, X, quien) => eje.bloqueosCon(X.id).filter((b) => b.identidad === quien).reduce((s, b) => s + b.cantidad, 0);
const oferta = (eje, quien, id) => A.acciones(eje, id, 2, quien).map((a) => a.nombre);

test('la acción escribe UN registro por persona sobre su nota: reparte la P de la nota entre sus puntos de vista y bloquea cada parte con X como salida', async () => {
  const { eje, X, nota, evento } = await libro();
  const ps = (q) => evento[q].movimientos.filter((m) => m.token === 'P').map((m) => [m.ambito.slice(64), m.cantidad, m.de, m.a, m.estado ?? '-', m.salida === X.id ? 'X' : (m.salida ?? '-')]);
  // bea: por cada punto de vista, quema de la nota entera, acuña en el punto de vista y bloquea (en ese orden).
  assert.deepEqual(ps('bea'), [
    ['', 0.8, 'bea', null, '-', '-'], ['.2', 0.88, null, 'bea', '-', '-'], ['.2', 0.88, 'bea', 'bea', 'bloqueo', 'X'],
    ['', 1.2, 'bea', null, '-', '-'], ['.5', 1.32, null, 'bea', '-', '-'], ['.5', 1.32, 'bea', 'bea', 'bloqueo', 'X'],
  ]);
  for (const m of evento.bea.movimientos.filter((x) => x.token === 'P')) assert.equal(m.ambito.slice(0, 64), nota.bea.id, 'todo es de la nota de bea, nada aterriza en X');
  assert.deepEqual(eje.bloqueosCon(X.id).map((b) => [b.identidad, b.clave, b.cantidad]).sort(), [
    ['bea', `P:${nota.bea.id}.2/bea`, 0.88], ['bea', `P:${nota.bea.id}.5/bea`, 1.32],
    ['cai', `P:${nota.cai.id}.7/cai`, 1.1], ['dani', `P:${nota.dani.id}.2/dani`, 0.55], ['dani', `P:${nota.dani.id}.7/dani`, 0.55],
  ].sort());
  // Lo que queda en la nota entera: 10 − lo quemado.
  cerca(eje.saldo('bea', `P:${nota.bea.id}/bea`), 8, 'bea'); cerca(eje.saldo('cai', `P:${nota.cai.id}/cai`), 9, 'cai'); cerca(eje.saldo('dani', `P:${nota.dani.id}/dani`), 9, 'dani');
  // Ningún sí de ana, ningún P posicionado en X de nadie más.
  for (const q of GENTE) assert.deepEqual(evalua(eje, `(("${q}").2.1 where first it.0 = "${X.id}") each 1`), [], q);
});

test('las lecturas dan lo que el camino largo: distancia 0, 1 y 0,6, y el recuento 2,64 de apoyo y 1,76 de crítica', async () => {
  const { eje, X, D } = await libro();
  const quien = Object.fromEntries(GENTE.map((q) => [q, lectura(eje, q, X)]));
  const unica = (q, esperado) => { assert.ok(quien[q].length > 0, q + ' sin lectura'); for (const v of quien[q]) cerca(v, esperado, q); };
  unica('bea', 0); unica('cai', 1); unica('dani', 0.6);
  assert.equal(quien.bea.length, 2); assert.equal(quien.cai.length, 1); assert.equal(quien.dani.length, 2);
  assert.deepEqual(quien.erin, [], 'erin no entra en el reparto');
  const formula = /"=(sum \(\(\(first it\.6\.5\)[^"]*)"/.exec(readFileSync('datos/epocas/ensayo-p/ensayo-p-0.raiz.json', 'utf8'))[1];
  const [apoyo, critica, ...mas] = evalua(eje, formula, D.id);
  assert.deepEqual(mas, []);
  cerca(apoyo, 2.64, 'apoyo'); cerca(critica, 1.76, 'crítica');
  const r = recuento(eje, D.id);
  assert.deepEqual([r.plantilla, r.estado, r.umbral, r.pasa], ['distance from the author', 'RESUELTO', 0, true]);
  cerca(r.valor, 2.64, 'el recuento da el apoyo');
  // Backing (X.2.4.4): toda la P puesta detrás, 0,88 + 1,32 + 1,1 + 0,55 + 0,55 = 4,4.
  for (const v of evalua(eje, `("${X.id}").2.4.4`)) cerca(v, 4.4, 'backing');
});

test('contra el camino largo: mismas lecturas, mismo recuento y los mismos bloqueos, con menos registros', async () => {
  const nuevo = await libro('criterio');
  const largo = await libro('largo');
  for (const q of ['bea', 'cai', 'dani']) {
    assert.deepEqual(lectura(nuevo.eje, q, nuevo.X).map((v) => Math.round(v * 1e9)).sort(), lectura(largo.eje, q, largo.X).map((v) => Math.round(v * 1e9)).sort(), q);
    cerca(bloqueado(nuevo.eje, nuevo.X, q), bloqueado(largo.eje, largo.X, q), q + ' bloqueado');
  }
  cerca(recuento(nuevo.eje, nuevo.D.id).valor, recuento(largo.eje, largo.D.id).valor, 'recuento');
  // Registros por persona (la nota incluida): el largo, 5, 3, 5; ahora, 2 cada una (erin: la nota y una acción a cero).
  assert.deepEqual([largo.registros.bea, largo.registros.cai, largo.registros.dani], [5, 3, 5]);
  assert.deepEqual([nuevo.registros.bea, nuevo.registros.cai, nuevo.registros.dani], [2, 2, 2]);
});

test('cantidades que suman más que la P de la nota se rechazan con un mensaje claro; sumar justo la P de la nota entra', async () => {
  const { eje, X, nota } = await libro();
  const intenta = (split) => A.transaccion(eje, APOYA, { X: nota.erin.id, split }, 'erin', { t: T });
  // La nota de erin tiene 10 P: 6 + 6 = 12 no cabe.
  const r = await intenta(reparto({ 2: 6, 5: 6 }));
  assert.equal(r.ok, false);
  assert.match(r.motivos[0].mensaje, /^mi criterio: hace falta que .* sea como mucho lo disponible de P sobre nota de erin \(10\), y es 12$/);
  assert.equal(r.motivos[0].parametro, 'split');
  // Y aunque alguien se salte la validación del parámetro, el libro no deja gastar lo que no hay.
  await assert.rejects(eje.escribir({
    autor: 'erin', sobre: nota.erin.id, t: T, payload: 'a mano',
    movimientos: [pagaElCoste('erin'), { token: 'P', ambito: nota.erin.id, cantidad: 12, de: 'erin', a: null }, { token: 'P', ambito: nota.erin.id + '.2', cantidad: 13.2, de: null, a: 'erin' }],
  }), /saldo insuficiente de P/);
  // Una cantidad negativa tampoco, ni una décupla que no trae las diez.
  assert.equal((await intenta(reparto({ 2: 5, 5: -1 }))).ok, false);
  assert.equal((await intenta([1, 2, 3])).ok, false);
  // Justo 10 entra: queda 0 en la nota entera y 11 bloqueados en el punto de vista.
  const ok = await intenta(reparto({ 3: 10 }));
  assert.ok(ok.ok, JSON.stringify(ok.motivos));
  await eje.anadir(ok.evento);
  cerca(eje.saldo('erin', `P:${nota.erin.id}/erin`), 0, 'nota entera');
  cerca(eje.saldo('erin', `P:${nota.erin.id}.3/erin`), 0, 'lo del punto de vista está bloqueado');
  cerca(bloqueado(eje, X, 'erin'), 11, '10 × 1,1 bloqueados con X como salida');
});

test('todo a cero no reparte nada: el registro se escribe sin mover P y erin no entra en el reparto ni en el recuento', async () => {
  const { eje, X, nota, evento, D } = await libro();
  assert.deepEqual(evento.erin.movimientos.filter((m) => m.token === 'P'), [], 'sin movimientos de P');
  assert.equal(bloqueado(eje, X, 'erin'), 0);
  cerca(eje.saldo('erin', `P:${nota.erin.id}/erin`), 10, 'su P sigue entera en la nota');
  assert.deepEqual(lectura(eje, 'erin', X), []);
  assert.deepEqual(eje.bloqueosCon(X.id).filter((b) => b.identidad === 'erin'), []);
  cerca(recuento(eje, D.id).valor, 2.64, 'erin no cambia el recuento');
});

test('«withdraw support» devuelve lo puesto con la acción: la P vuelve a la mano de bea y su lectura desaparece', async () => {
  const { eje, X, nota, D } = await libro();
  assert.ok(oferta(eje, 'bea', X.id).includes(RETIRA), 'con P detrás de X, se ofrece');
  cerca(eje.saldo('bea', `P:${nota.bea.id}.2/bea`), 0, 'bloqueada, no disponible');
  const r = await A.transaccion(eje, RETIRA, { X: X.id }, 'bea', { t: T });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await eje.anadir(r.evento);
  assert.equal(bloqueado(eje, X, 'bea'), 0);
  cerca(eje.saldo('bea', `P:${nota.bea.id}.2/bea`), 0.88, 'nota.2'); cerca(eje.saldo('bea', `P:${nota.bea.id}.5/bea`), 1.32, 'nota.5');
  assert.deepEqual(lectura(eje, 'bea', X), []);
  cerca(bloqueado(eje, X, 'cai'), 1.1, 'lo de los demás no se toca');
  // Sin lo de bea, el apoyo es 0 + 0,44.
  cerca(recuento(eje, D.id).valor, 0.44, 'apoyo sin bea');
});

test('la acción no se ofrece a ana sobre lo suyo, ni sobre una nota ajena, ni sobre una nota colgada de algo propio', async () => {
  const { eje, X, nota } = await libro();
  assert.ok(oferta(eje, 'bea', nota.bea.id).includes(APOYA), 'bea sobre su nota colgada de X de ana');
  assert.ok(!oferta(eje, 'ana', X.id).includes(APOYA), 'ana sobre su X');
  assert.ok(!oferta(eje, 'bea', X.id).includes(APOYA), 'bea sobre X, que no es suyo');
  assert.ok(!oferta(eje, 'bea', nota.cai.id).includes(APOYA), 'bea sobre la nota de cai');
  // Una nota que ana cuelga de su propio X: el registro del que cuelga es suyo.
  const deAna = await eje.escribir({ autor: 'ana', sobre: X.id, t: T, payload: 'nota de ana', movimientos: [pagaElCoste('ana')] });
  assert.ok(!oferta(eje, 'ana', deAna.id).includes(APOYA), 'ana sobre una nota suya colgada de lo suyo');
  // Una nota de bea colgada de otra nota suya: tampoco apoya lo propio.
  const deBea = await eje.escribir({ autor: 'bea', sobre: nota.bea.id, t: T, payload: 'otra de bea', movimientos: [pagaElCoste('bea')] });
  assert.ok(!oferta(eje, 'bea', deBea.id).includes(APOYA), 'bea sobre una nota suya colgada de otra suya');
  // (La oferta no es una barrera: como en toda plantilla, transaccion() no vuelve a mirar el 2; lo que cuenta es que lo bloqueado
  // detrás de algo propio no pesa en el recuento, que ya deja fuera a la autora.)
});

test('la regla «P is repositioned one step at a time» da un paso por serie: un registro mueve varias series, ninguna dos veces ni de más', async () => {
  const { eje, nota } = await libro();
  const n = nota.erin.id;
  const mov = (extra) => [pagaElCoste('erin'), { token: 'P', ambito: n, cantidad: 1, de: 'erin', a: null }, ...extra];
  const mint = (d, c) => ({ token: 'P', ambito: n + '.' + d, cantidad: c, de: null, a: 'erin' });
  const escribe = (movimientos) => eje.escribir({ autor: 'erin', sobre: n, t: T, payload: 'paso', movimientos });
  // Bien: 1 quemado, 0,55 + 0,55 acuñados en dos puntos de vista distintos (1,1 en total).
  await escribe(mov([mint(2, 0.55), mint(5, 0.55)]));
  // Una sola serie acuñada en dos movimientos es UN paso (la rama de siempre suma lo acuñado): entra.
  await escribe(mov([mint(2, 0.3), mint(2, 0.8)]));
  // Con varias series, la misma serie en dos movimientos se rechaza: cada serie da su paso en un solo movimiento.
  await assert.rejects(escribe(mov([mint(2, 0.3), mint(2, 0.25), mint(5, 0.55)])), REGLA);
  // Lo acuñado no es lo quemado por la décima de más.
  await assert.rejects(escribe(mov([mint(2, 0.55), mint(5, 0.66)])), REGLA);
  // Acuñar para otra persona.
  await assert.rejects(escribe(mov([mint(2, 0.55), { ...mint(5, 0.55), a: 'bea' }])), REGLA);
  // Una de las series acuñadas en otro registro (la nota de cai).
  await assert.rejects(escribe(mov([mint(2, 0.55), { ...mint(5, 0.55), ambito: nota.cai.id + '.5' }])), REGLA);
});

test('un solo registro que escribe la nota y reparte su P no cabe: ni se puede nombrar la serie de la nota antes de que exista ni gastar la P que obtiene', async () => {
  const eje = await Eje.genesis({ identidad: 'ana', foco: 'libro de ensayo', t: T, demostracion: true, epoca: epocaEnsayoP() });
  await entrarPorInvitacion(eje, { por: 'ana', quien: 'bea', t: T, grupo: 3 });
  const X = await eje.escribir({ autor: 'ana', sobre: eje.genesisId, t: T, payload: 'X', movimientos: [pagaElCoste('ana')] });
  // Una nota que lleva en el mismo registro el movimiento de repartir su propia P: la serie no existe todavía (la P que la
  // nota obtiene la acuña el libro después de los movimientos) y su id, el hash del cuerpo, no se puede conocer.
  await assert.rejects(eje.escribir({
    autor: 'bea', sobre: X.id, t: T, payload: 'nota y reparto',
    movimientos: [pagaElCoste('bea'), { token: 'P', ambito: '0'.repeat(64), cantidad: 1, de: 'bea', a: null }, { token: 'P', ambito: '0'.repeat(64) + '.2', cantidad: 1.1, de: null, a: 'bea' }],
  }), /saldo insuficiente de P/);
});
