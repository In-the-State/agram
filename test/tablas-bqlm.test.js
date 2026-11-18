// El BQL mínimo, §15 (Core AGRAM 18-11, «la lente solo lee»; pendiente de revisar VG): agrupar (group), construir filas
// (row, each (e)), seguir una relación (follow), aplicar una fórmula guardada (apply), los n primeros (take), juntar
// listas (with) y el filtro tolerante de las lecturas (keep). Primero cada palabra sobre un payload inventado; después
// los tres casos del encargo sobre un libro del roadmap en memoria (la época hija de datos/epocas/roadmap/, solo leída):
// las acciones que se ofrecen (a), las cadenas del 7 (b) y la matriz del 4 (c), frente a lo que da hoy el JavaScript.
// Cada caso deja en el diagnóstico de la prueba los pasos y el presupuesto que gasta.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluar, aplanar, esFila, Presupuesto, MemoriaDeLectura, pendiente, POR_LIMITE, LLAMADAS_DE_LECTURA, TOPE_DE_APLICACION } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { epocaRoadmap } from '../datos/epocas/roadmap/generar.mjs';
import { olvidarIndices } from '../src/indice-de-nombres.js';

/** Un payload de prueba, leído como `epoch` (datos inventados). */
const P = [
  'Lista de la compra', // 0
  ['pan', 'leche', 'huevos'], // 1 una lista de tres ocupantes
  [[2], [3], [12]], // 2 una décupla
  [[['pan'], [2]], [['leche'], [1]], [['huevos'], [12]]], // 3 tres décuplas: 3.k.0 qué, 3.k.1 cuánto
  [2, 1, 12], // 4 una lista de números
];
/** Las tres décuplas del 3, como lista. */
const D = '(epoch.3.0 with epoch.3.1 with epoch.3.2)';
const ctx = new ContextoEje(null, { epoch: P });
const LEE = { lectura: true };

const val = (src, opciones = {}, c = ctx) => {
  const r = evaluar(src, c, opciones);
  assert.equal(r.estado, 'RESUELTO', src + ': ' + r.motivo);
  return r.valor;
};
const plano = (src, opciones = {}, c = ctx) => aplanar(val(src, opciones, c), c);
const falla = (src, re, opciones = {}, c = ctx) => {
  const r = evaluar(src, c, opciones);
  assert.equal(r.estado, 'ERROR', src + ' → ' + r.estado + ' ' + (r.texto ?? r.motivo));
  if (re) assert.match(r.motivo, re, src);
};
const espera = (src, re, opciones = {}, c = ctx) => {
  const r = evaluar(src, c, opciones);
  assert.equal(r.estado, 'PENDIENTE', src + ' → ' + r.estado + ' ' + (r.texto ?? r.motivo));
  if (re) assert.match(r.motivo, re, src);
};

// ---------- cada palabra ----------

test('§15 léxico: row y apply se escriben con paréntesis y su número de argumentos', () => {
  assert.deepEqual(Object.keys(LLAMADAS_DE_LECTURA), ['row', 'apply']);
  assert.equal(TOPE_DE_APLICACION, 8);
  falla('row', /row se escribe con sus argumentos entre paréntesis/);
  falla('row()', /lleva/);
  falla('row(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)', /lleva/);
  falla('apply(1)', /apply\(F, X\) lleva 2 argumentos/);
  falla('apply "=it" to 1', /se escribe con sus argumentos entre paréntesis/);
  falla('take 1', /falta una expresión/);
});

test('§15 take y with: los n primeros; los de A y luego los de B, sin quitar repetidos; el primero que no esté vacío', () => {
  assert.deepEqual(val('take 2 epoch.1'), ['pan', 'leche']);
  assert.deepEqual(val('take 0 epoch.1'), []);
  assert.deepEqual(val('take 9 epoch.1'), ['pan', 'leche', 'huevos']);
  falla('take 1.5 epoch.1', /take espera un entero/);
  falla('take (0 - 1) epoch.1', /take espera un entero/);
  espera('take epoch.9 epoch.1', /vacía/);
  assert.deepEqual(val('epoch.1 with epoch.0 with "pan"'), ['pan', 'leche', 'huevos', 'Lista de la compra', 'pan']);
  assert.deepEqual(val('count (epoch.1 with epoch.1)'), [6]);
  // El primero que no esté vacío (Core AGRAM 18-11): first (A with B with C).
  assert.deepEqual(val('first (epoch.9 with epoch.8 with epoch.0)'), ['Lista de la compra']);
  assert.deepEqual(val('first (epoch.9 with epoch.1)'), ['pan']);
  assert.deepEqual(val('first (epoch.9 with epoch.8)'), []);
  // Un «si no» con where sobre un literal: 1 si hay más de dos, si no 2.
  assert.deepEqual(val('first ((1 where count epoch.1 > 2) with 2)'), [1]);
  assert.deepEqual(val('first ((1 where count epoch.1 > 5) with 2)'), [2]);
  assert.deepEqual(val('"pan" in epoch.0 with epoch.1'), [true], 'with va antes que la comparación');
});

test('§15 row y each (e): una fila con una lista por posición; e para cada elemento, con el siguiente it', () => {
  const [f] = val('row(epoch.0, epoch.1, 7)');
  assert.ok(esFila(f));
  assert.deepEqual(aplanar(f, ctx), [['Lista de la compra'], ['pan', 'leche', 'huevos'], [7]]);
  assert.deepEqual(val('row(epoch.0, epoch.1).1'), ['pan', 'leche', 'huevos']);
  assert.deepEqual(val('(row(epoch.9, 3)).0'), []);
  assert.equal(evaluar('row(1, epoch.1)', ctx).texto, '[1 | pan, leche, huevos]');
  falla('row(1) = row(1)', /una décupla no tiene valor/);
  assert.deepEqual(val(D + ' each (it.1 * 10)'), [20, 10, 120]);
  assert.deepEqual(val(D + ' each 1'), val(D + ' each (it.1)'), 'each d es each (it.d)');
  assert.deepEqual(plano(D + ' each (row(it.0, it.1))'), [[['pan'], [2]], [['leche'], [1]], [['huevos'], [12]]]);
  assert.deepEqual(val(D + ' each (epoch.1 where it2 = first it.0)'), ['pan', 'leche', 'huevos'], 'dentro, un where da it2');
  assert.deepEqual(val('epoch.9 each (it.1)'), []);
  espera(D + ' each (it.1 + epoch.9)', /vacía/);
});

test('§15 group: un grupo por clave, por primera aparición; la clave en las primeras posiciones y los miembros en la siguiente', () => {
  assert.deepEqual(plano('epoch.4 group it > 1'), [[[true], [2, 12]], [[false], [1]]]);
  assert.deepEqual(plano('(epoch.1 with "pan" with "sal") group it'), [[['pan'], ['pan', 'pan']], [['leche'], ['leche']], [['huevos'], ['huevos']], [['sal'], ['sal']]]);
  assert.deepEqual(plano('((epoch.1 with "pan") group it) each 0'), ['pan', 'leche', 'huevos'], 'sin repetidos');
  // Con row, la clave ocupa sus partes: [fila, columna, contenido].
  assert.deepEqual(plano('(1 with 2 with 3 with 4) group row(it - floor (it / 2) * 2, it > 2)'), [[[1], [false], [1]], [[0], [false], [2]], [[1], [true], [3]], [[0], [true], [4]]]);
  // Una parte vacía es una clave más (a diferencia de by, que la da PENDIENTE): junta lo que no la tiene.
  assert.deepEqual(plano('epoch.4 group row(first (it where it2 > 5), 0)'), [[[], [0], [2, 1]], [[12], [0], [12]]]);
  espera('epoch.4 by first (it where it2 > 5)', /vacía/);
  falla(D + ' group it.1 with 1', /cada parte de la clave es un valor/);
  falla(D + ' group it', /una décupla no tiene valor/);
  falla('epoch.1 group row(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)', /no deja sitio a los miembros/);
  assert.deepEqual(plano('epoch.9 group it'), []);
  assert.deepEqual(plano('((epoch.1 with "pan") group it) by 0 - count it.1').map((g) => g[0][0]), ['pan', 'leche', 'huevos'], 'by ordena los grupos');
});

test('§15 follow: M y lo que da la relación una y otra vez, sin repetir; un ciclo acaba', () => {
  assert.deepEqual(val('1 follow (it + 1 where it2 <= 5)'), [1, 2, 3, 4, 5]);
  assert.deepEqual(val('(1 with 1 with 2) follow (it + 1 where it < 3)'), [1, 2, 3], 'las semillas, sin repetir');
  // Un ciclo: 0 → 1 → 2 → 0.
  assert.deepEqual(val('0 follow ((it + 1) - floor ((it + 1) / 3) * 3)'), [0, 1, 2]);
  // Una bifurcación: por niveles.
  assert.deepEqual(val('1 follow ((it * 2 with it * 2 + 1) where it2 < 8)'), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(val('epoch.9 follow it'), []);
  falla(D + ' follow it', /sigue registros o valores/);
});

test('§15 apply: una fórmula guardada con it = cada elemento; mismo contexto; un texto que no es fórmula no se evalúa', () => {
  assert.deepEqual(val('apply("=it * 2", 1 with 2 with 3)'), [2, 4, 6]);
  assert.deepEqual(val('apply("=count epoch.1 + it", 10)'), [13], 've el mismo contexto');
  assert.deepEqual(val('apply("=epoch.1 where it2 != it", "leche")'), ['pan', 'huevos'], 'dentro, el primer where da it2');
  assert.deepEqual(val('apply("=it", epoch.9)'), []);
  assert.deepEqual(val(String.raw`apply("=apply(\"=it + 1\", it) * 10", 1)`), [20], 'una aplicada puede aplicar otra');
  assert.deepEqual(val('apply(last (epoch.1 with "=it"), 5)'), [5], 'la fórmula es el valor de un texto, venga de donde venga');
  espera('apply(epoch.9, 1)', /vacía/);
  falla('apply(epoch.1, 1)', /es una lista de 3/);
  falla('apply("hola", 1)', /no es fórmula no se evalúa/);
  falla('apply("==it", 1)', /no es fórmula no se evalúa/);
  falla('apply(3, 1)', /aplica una fórmula/);
  falla('apply("=it +", 1)', /sintaxis/);
  falla('apply("=FILTRAR(it)", 1)', /no es BQL mínimo/);
  espera('apply("=epoch.9 + it", 1)', /vacía/);
});

test('§15 keep: como where, pero el elemento cuya condición no se resuelve se cae; solo en una lectura', () => {
  assert.deepEqual(plano('(1 with 2 with 3) keep 6 / (it - 2) > 0', LEE), [3], 'la división por cero de 2 lo tira; 1 da falso');
  assert.deepEqual(plano(D + ' keep it.1 + epoch.9 > 0', LEE), [], 'PENDIENTE: se caen todos');
  assert.deepEqual(plano('epoch.4 keep it + 1', LEE), [], 'lo que no es verdadero o falso, también se cae');
  assert.deepEqual(plano('epoch.1 keep it in epoch.1', LEE), ['pan', 'leche', 'huevos']);
  falla('(1 with 2 with 3) keep 6 / (it - 2) > 0', /keep: solo en una lectura/);
  falla('(1 with 2 with 3) where 6 / (it - 2) > 0', /división por cero/, LEE);
  espera(D + ' where it.1 + epoch.9 > 0', /vacía/, LEE);
});

// ---------- los tres casos del encargo, sobre el libro del roadmap ----------

const T = '2026-11-17T10:00:00Z';
const DESPUES = 'this goes after';

/**
 * El roadmap de test/cadenas.test.js: el proyecto A de la dueña con A1…A5 y el B de la casa con B1. A2 y A3 van después
 * de A1, A4 después de A2 y A3, B1 (de la casa) después de A4; A5 es independiente.
 */
async function roadmap() {
  const eje = await Eje.genesis({ identidad: 'duena', foco: 'roadmap de prueba', t: T, emision: [{ token: 'R', cantidad: 10 }], epoca: epocaRoadmap(), demostracion: true });
  await eje.aceptar(await eje.invitar({ autor: 'duena', invitado: 'casa-b', t: T }), {}, { t: T });
  const hacer = async (nombre, X, params, quien = 'duena') => {
    const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: T });
    assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
    return eje.anadir(r.evento);
  };
  const pa = await hacer('anchor here', eje.genesisId, { title: 'Proyecto A' });
  const pb = await hacer('anchor here', eje.alta('casa-b').id, { title: 'Proyecto B' }, 'casa-b');
  const t = {};
  for (const n of ['A1', 'A2', 'A3', 'A4', 'A5']) t[n] = await hacer('anchor here', pa.id, { title: n, content: ['id: ' + n], type: 'task' });
  t.B1 = await hacer('anchor here', pb.id, { title: 'B1', content: ['id: B1'], type: 'task' }, 'casa-b');
  await hacer(DESPUES, t.A2.id, { previous: [t.A1.id] });
  await hacer(DESPUES, t.A3.id, { previous: [t.A1.id] });
  await hacer(DESPUES, t.A4.id, { previous: [t.A2.id, t.A3.id] });
  await hacer(DESPUES, t.B1.id, { previous: [t.A4.id] }, 'casa-b');
  const nombres = new Map([...Object.entries(t).map(([k, v]) => [v.id, k]), [pa.id, 'PA'], [pb.id, 'PB']]);
  return { eje, pa, pb, t, nombres, ctx: new ContextoEje(eje, { epoch: eje.epoca(), me: 'duena' }) };
}

/** Evalúa con un presupuesto propio y deja en el diagnóstico lo que gasta: pasos, ocupantes y registros del libro. */
function medir(prueba, nombre, src, c, eje, opciones = {}) {
  const presupuesto = new Presupuesto();
  const r = evaluar(src, c, { ...opciones, presupuesto });
  assert.equal(r.estado, 'RESUELTO', nombre + ': ' + r.motivo);
  prueba.diagnostic(nombre + ': ' + presupuesto.pasos + ' pasos, ' + presupuesto.usados + ' ocupantes del presupuesto, ' + eje.orden.length + ' registros en el libro');
  return aplanar(r.valor, c);
}

// a) Las acciones que se ofrecen: las plantillas del PV K cuya fórmula del 2 pasa sobre X, por el orden de su 8, las N primeras.
const ACCIONES = (K, N) => '=take ' + N + ' (epoch.9.6.1 where first it2.8 = ' + K + ' keep apply(last it2.2, it) by nth 1 it2.8) each (first it2.0)';

// b) Las anteriores de una tarea (it): la última relación «this goes after» de su autor en su 2.6, y en su 6 las tareas.
const ANTERIORES = '=(last (it.2.6 where first it2.3 = first it.3 and "this goes after" in payload(it2).4)) each (payload(it2).6) where "task" in payload(it2).5 and it2 != it';
const ANT = JSON.stringify(ANTERIORES);
// b) Lo que continúa desde una tarea, con cited (§15.3): las relaciones que la nombran en su 6, la tarea en que se anclan, si
// es una tarea y la relación es la que manda (la tarea está entre sus anteriores).
const SIGUIENTES = '=it follow ((it2 cited 6) each (up it3) where "task" in payload(it3).5 and it2 in apply(' + ANT + ', it3))';

// c) La matriz del 4: el oficio (el PV de la plantilla que el registro nombra en su 4; si no, el dígito de la posición en
// que se ancla) y la ejecución (0 si no mueve nada más que el coste, la asignación y la obtención; si no, la columna de la
// primera familia que mueve, E 1, P 2, R 3, T 4). Una versión corta de contrato.celdaDeEjecucion: ni las estaciones de los
// anuncios ni las escalas informativas de T.
const DIGITOS = '"0" with "1" with "2" with "3" with "4" with "5" with "6" with "7" with "8" with "9"';
const OFICIO = '=first ((epoch.9.6.1 where first it2.0 in payload(it).4) each (first it2.8) with lookup(' + DIGITOS + ', 0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9, text(slice(utf8(nth 1 it.6.5), 0, 1))))';
const MUEVE = '(moves it where not (it3.4.1 in ("asignacion" with "obtencion")) and not (it3.4.0 = burn and first it3.0.0.0 = T and first it3.3.0 = first it.3))';
const FAMILIA = (k, f) => '(' + k + ' where ' + f + ' in ' + MUEVE + ' each (first it3.0.0.0))';
const EJECUCION = '=first ((0 where count ' + MUEVE + ' = 0) with ' + FAMILIA(1, 'E') + ' with ' + FAMILIA(2, 'P') + ' with ' + FAMILIA(3, 'R') + ' with ' + FAMILIA(4, 'T') + ')';
const MATRIZ = '=(down it) group row(apply(' + JSON.stringify(OFICIO) + ', it2), apply(' + JSON.stringify(EJECUCION) + ', it2))';
// El mismo oficio con lookup (§15.4): los nombres y los PV de las plantillas son una subexpresión cerrada (no leen it), que
// la memoria de una lectura de pantalla recuerda de un registro al siguiente; sin memoria cuesta algo más que OFICIO.
const OFICIO_CON_LOOKUP = '=first ((payload(it).4 each (first lookup(epoch.9.6.1 each (first it3.0), epoch.9.6.1 each (first it3.8), it2))) with lookup(' + DIGITOS + ', 0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9, text(slice(utf8(nth 1 it.6.5), 0, 1))))';
const MATRIZ_CON_LOOKUP = '=(down it) group row(apply(' + JSON.stringify(OFICIO_CON_LOOKUP) + ', it2), apply(' + JSON.stringify(EJECUCION) + ', it2))';

test('§15 caso a: las acciones que se ofrecen, como una lectura, dan lo mismo que acciones.acciones', async (prueba) => {
  const { eje, t, pa, ctx: c } = await roadmap();
  for (const [nombre, X, K] of [['la tarea A5', t.A5, 7], ['la tarea A5', t.A5, 0], ['el proyecto A', pa, 7], ['la tarea A4', t.A4, 9]]) {
    const js = A.acciones(eje, X.id, K, 'duena').map((x) => x.nombre);
    assert.deepEqual(medir(prueba, 'a) PV ' + K + ' sobre ' + nombre, ACCIONES(K, 50), c, eje, { sujeto: X.id, lectura: true }), js, 'PV ' + K);
  }
  assert.deepEqual(medir(prueba, 'a) PV 7, las 2 primeras', ACCIONES(7, 2), c, eje, { sujeto: t.A5.id, lectura: true }), A.acciones(eje, t.A5.id, 7, 'duena').slice(0, 2).map((x) => x.nombre));
  // Sin opciones.lectura, keep es ERROR: la misma fórmula no vale en una regla.
  assert.equal(evaluar(ACCIONES(7, 3), c, { sujeto: t.A5.id }).estado, 'ERROR');
});

test('§15 caso b: las cadenas del 7: las anteriores, lo que va antes, lo que va después y las tareas sin anterior', async (prueba) => {
  const { eje, t, pa, nombres, ctx: c } = await roadmap();
  const n = (ids) => ids.map((id) => nombres.get(id) ?? id);
  assert.deepEqual(n(medir(prueba, 'b) anteriores de A4', ANTERIORES, c, eje, { sujeto: t.A4.id })), ['A2', 'A3']);
  assert.deepEqual(n(medir(prueba, 'b) anteriores de B1 (de otra casa)', ANTERIORES, c, eje, { sujeto: t.B1.id })), ['A4']);
  assert.deepEqual(n(medir(prueba, 'b) anteriores de A1', ANTERIORES, c, eje, { sujeto: t.A1.id })), []);
  assert.deepEqual(n(medir(prueba, 'b) lo que va antes de A4', '=it follow apply(' + ANT + ', it2)', c, eje, { sujeto: t.A4.id })), ['A4', 'A2', 'A3', 'A1']);
  assert.deepEqual(n(medir(prueba, 'b) lo que continúa desde A1 (en su proyecto)', '=it follow (under up it2 where "task" in payload(it3).5 and it2 in apply(' + ANT + ', it3))', c, eje, { sujeto: t.A1.id })), ['A1', 'A2', 'A3', 'A4']);
  // Con «quién me nombra» (§15.3): las relaciones que nombran a la tarea en su 6, y la tarea en que se anclan.
  assert.deepEqual(n(medir(prueba, 'b) lo que continúa desde A1, con cited', SIGUIENTES, c, eje, { sujeto: t.A1.id })), ['A1', 'A2', 'A3', 'A4', 'B1']);
  assert.deepEqual(n(medir(prueba, 'b) lo que continúa desde A1 (en todo el libro)', '=it follow (under (last path it2) where "task" in payload(it3).5 and it2 in apply(' + ANT + ', it3))', c, eje, { sujeto: t.A1.id })), ['A1', 'A2', 'A3', 'A4', 'B1']);
  assert.deepEqual(n(medir(prueba, 'b) sin anterior, en el proyecto A', '=under it where "task" in payload(it2).5 and count apply(' + ANT + ', it2) = 0', c, eje, { sujeto: pa.id })), ['A1', 'A5']);
  assert.deepEqual(n(medir(prueba, 'b) sin anterior, en todo el libro', '=under it where "task" in payload(it2).5 and count apply(' + ANT + ', it2) = 0', c, eje, { sujeto: eje.genesisId })), ['A1', 'A5']);
  // Sin apply, escrita entera: lo mismo.
  const entera = '=under it where "task" in payload(it2).5 and count ((last (it2.2.6 where first it3.3 = first it2.3 and "this goes after" in payload(it3).4)) each (payload(it3).6) where "task" in payload(it3).5 and it3 != it2) = 0';
  assert.deepEqual(n(medir(prueba, 'b) sin anterior, sin apply', entera, c, eje, { sujeto: pa.id })), ['A1', 'A5']);
  // El orden por dependencias (los empates por llegada): por cuántas tareas van antes.
  assert.deepEqual(n(medir(prueba, 'b) orden por dependencias', '=under it where "task" in payload(it2).5 by count (it2 follow apply(' + ANT + ', it3))', c, eje, { sujeto: pa.id })), ['A1', 'A5', 'A2', 'A3', 'A4']);
});

test('§15 caso c: la matriz del 4, los registros anclados en X agrupados por (oficio, ejecución), frente a acciones.ejecuciones', async (prueba) => {
  const { eje, t, pa, nombres, ctx: c } = await roadmap();
  const memoria = new MemoriaDeLectura();
  for (const [nombre, X] of [['el proyecto A', pa], ['la tarea A4', t.A4], ['el génesis', { id: eje.genesisId }]]) for (const [como, formula, opciones] of [['', MATRIZ, {}], [' con lookup', MATRIZ_CON_LOOKUP, {}], [' con lookup y memoria', MATRIZ_CON_LOOKUP, { lectura: true, memoria }], [' con lookup y memoria, otra vez', MATRIZ_CON_LOOKUP, { lectura: true, memoria }]]) {
    const celdas = medir(prueba, 'c) ' + nombre + como, formula, c, eje, { sujeto: X.id, ...opciones });
    // Lo mismo que dice el JavaScript, celda a celda: [oficio, ejecución, registros].
    const js = new Map();
    for (const e of A.ejecuciones(eje, X.id).filter((x) => x.ocupante?.ref)) {
      const k = e.oficio + '.' + e.ejecucion;
      if (!js.has(k)) js.set(k, [[e.oficio], [e.ejecucion], []]);
      js.get(k)[2].push(e.ocupante.ref);
    }
    assert.deepEqual(celdas, [...js.values()], nombre + ': ' + JSON.stringify(celdas.map((f) => [f[0], f[1], f[2].map((id) => nombres.get(id) ?? id.slice(0, 6))])));
    assert.ok(celdas.every((f) => f.length === 3));
  }
});

// ---------- §15.3 «quién me nombra»: M cited d.d… ----------

/** Lo mismo que M cited P, escrito como recorrido: para cada elemento, los registros de before.1 que lo llevan en payload(r).P. */
const recorrido = (M, P, conSujeto) => M + ' each (before.1 where ' + (conSujeto ? 'it2 in payload(it3).' : 'it in payload(it2).') + P + ')';

/** Que las dos den lo mismo: el mismo estado y, resuelto, la misma lista (por valor). */
function iguales(c, M, P, opciones = {}) {
  const conSujeto = Object.hasOwn(opciones, 'sujeto');
  const a = evaluar(M + ' cited ' + P, c, opciones);
  const b = evaluar(recorrido(M, P, conSujeto), c, opciones);
  assert.equal(a.estado, b.estado, M + ' cited ' + P + ': ' + (a.motivo ?? a.texto) + ' / ' + (b.motivo ?? b.texto));
  if (a.estado === 'RESUELTO') assert.deepEqual(aplanar(a.valor, c), aplanar(b.valor, c), M + ' cited ' + P);
  return a;
}

test('§15.3 cited: da exactamente lo que el recorrido con where, en un libro, en una vista de antes y con una candidata', async () => {
  const { eje, t, pa, nombres } = await roadmap();
  olvidarIndices();
  const casos = [['it', '6'], ['it', '2.6'], ['"task"', '5'], ['(it with "task" with 7)', '4'], ['before.5', '6'], ['it', '0'], ['(it with it)', '6'], ['"this goes after"', '4']];
  const n = (r) => aplanar(r.valor, ctx).map((id) => nombres.get(id) ?? id.slice(0, 6));
  // El libro entero, sin candidata.
  const c = new ContextoEje(eje, { epoch: eje.epoca(), me: 'duena' });
  for (const X of [t.A1, t.A4, pa]) for (const [M, P] of casos) iguales(c, M, P, { sujeto: X.id });
  assert.deepEqual(n(iguales(c, 'it', '6', { sujeto: t.A1.id })).length, 2, 'las dos relaciones que nombran a A1 en su 6');
  assert.deepEqual(n(iguales(c, '"task"', '5')), ['A1', 'A2', 'A3', 'A4', 'A5', 'B1']);
  // Una vista de antes (lo que ve quien valida un registro): lo posterior no está.
  const k = eje.orden.indexOf(t.A4.id) + 1;
  const vista = eje.antes(k);
  const cv = new ContextoEje(vista, { epoch: eje.epoca(), me: 'duena' });
  for (const [M, P] of casos) iguales(cv, M, P, { sujeto: t.A1.id });
  assert.deepEqual(n(iguales(cv, '"task"', '5')), ['A1', 'A2', 'A3', 'A4'], 'ni A5 ni B1, que llegaron después');
  assert.deepEqual(aplanar(evaluar('it cited 6', cv, { sujeto: t.A1.id }).valor, cv), [], 'las relaciones, tampoco');
  // Con una candidata: no está en before.1, así que no se nombra a sí misma.
  const candidata = { autor: 'duena', t: T, movimientos: [], payload: [['x'], [], [], [], [], ['task'], [{ ref: t.A1.id }]] };
  const cc = new ContextoEje(vista, { epoch: eje.epoca(), me: 'duena', ev: candidata });
  for (const [M, P] of casos) iguales(cc, M, P, { sujeto: t.A1.id });
  assert.deepEqual(n(iguales(cc, '"task"', '5')), ['A1', 'A2', 'A3', 'A4']);
  // Las paradas, las mismas: una décupla no tiene valor (ERROR); sin libro, PENDIENTE; sobre nada, nada.
  assert.equal(iguales(c, 'epoch.9.6', '6').estado, 'ERROR');
  assert.equal(iguales(new ContextoEje(null, { epoch: P }), '"pan"', '1').estado, 'PENDIENTE');
  assert.deepEqual(iguales(new ContextoEje(null, { epoch: P }), 'epoch.9', '1').valor, []);
});

test('§15.3 cited: un registro cuyo recorrido no se resuelve para la lectura igual que el recorrido; una lista vacía no lo mira', () => {
  // Un contexto mínimo: tres registros; el payload del segundo lleva una referencia que no se puede seguir.
  const R = ['r1', 'r2', 'r3'].map((id) => ({ k: 'reg', id }));
  const PAYLOAD = { r1: ['a', 'b'], r2: 'roto', r3: ['b'] };
  const c = {
    nombre: (n) => (n === 'before' ? { k: 'before' } : undefined),
    payload: (o) => (o?.k === 'reg' ? { k: 'dec', id: o.id } : undefined),
    valor: (o) => (o?.k === 'reg' ? o.id : undefined),
    padre: () => undefined,
    hijos: () => undefined,
    ocupantes(nodo, camino, pres) {
      pres.gastar(1);
      if (nodo.k === 'before') return camino[0] === 1 ? R : [];
      if (nodo.k === 'dec' && camino[0] === 1) {
        if (PAYLOAD[nodo.id] === 'roto') throw pendiente('referencia a un evento ausente del eje: ffffffff');
        return PAYLOAD[nodo.id];
      }
      return [];
    },
  };
  olvidarIndices();
  const a = iguales(c, '"b"', '1');
  assert.equal(a.estado, 'PENDIENTE');
  assert.match(a.motivo, /ausente/);
  assert.equal(iguales(c, '"zzz"', '1').estado, 'PENDIENTE', 'aunque lo que se busca no esté en ninguno');
  assert.deepEqual(iguales(c, '("b" where 1 = 2)', '1').valor, []);
  PAYLOAD.r2 = ['c'];
  olvidarIndices();
  assert.deepEqual(aplanar(iguales(c, '"b"', '1').valor, c), ['r1', 'r3']);
});

test('§15.3 cited: el coste lo fija la definición (un paso y un ocupante por elemento y por resultado), con índice guardado o sin él', async () => {
  const { eje, t } = await roadmap();
  const c = new ContextoEje(eje, { epoch: eje.epoca(), me: 'duena' });
  const coste = (src, opciones = {}) => {
    const presupuesto = new Presupuesto();
    const r = evaluar(src, c, { ...opciones, presupuesto });
    assert.equal(r.estado, 'RESUELTO', src + ': ' + r.motivo);
    return [presupuesto.pasos, presupuesto.usados, r.valor.length];
  };
  olvidarIndices();
  const fresco = coste('"task" cited 5');
  assert.deepEqual(fresco, [1 + 6, 1 + 6, 6], 'un elemento y seis tareas');
  assert.deepEqual(coste('"task" cited 5'), fresco, 'con el índice ya guardado, lo mismo');
  olvidarIndices();
  const dos = coste('it cited 6', { sujeto: t.A1.id });
  assert.deepEqual(dos, [3, 3, 2]);
  assert.deepEqual(coste('it cited 6', { sujeto: t.A1.id }), dos);
  // El presupuesto corta igual: con un tope de 5, siete no caben, haya índice o no.
  for (const limpio of [true, false]) {
    if (limpio) olvidarIndices();
    const r = evaluar('"task" cited 5', c, { limites: { ocupantes: 5 } });
    assert.equal(r.subtipo, POR_LIMITE);
  }
  // Un libro que cambia tiene otra huella: el índice no sirve lo viejo.
  const antes = coste('"task" cited 5')[2];
  const r = await A.transaccion(eje, 'anchor here', { X: eje.genesisId, title: 'A6', content: ['id: A6'], type: 'task' }, 'duena', { t: T });
  assert.ok(r.ok);
  await eje.anadir(r.evento);
  assert.equal(coste('"task" cited 5')[2], antes + 1);
});

// ---------- §15.4 la memoria de las lecturas de pantalla ----------

test('§15.4 memoria: a) da lo mismo con memoria y sin ella; la segunda vez cuesta un paso', async (prueba) => {
  const { eje, t, ctx: c } = await roadmap();
  const memoria = new MemoriaDeLectura();
  const sin = medir(prueba, 'a) PV 7 sobre la tarea A5, sin memoria', ACCIONES(7, 50), c, eje, { sujeto: t.A5.id, lectura: true });
  assert.deepEqual(medir(prueba, 'a) PV 7 sobre la tarea A5, con memoria', ACCIONES(7, 50), c, eje, { sujeto: t.A5.id, lectura: true, memoria }), sin);
  const presupuesto = new Presupuesto();
  const r = evaluar(ACCIONES(7, 50), c, { sujeto: t.A5.id, lectura: true, memoria, presupuesto });
  assert.deepEqual(aplanar(r.valor, c), sin);
  assert.deepEqual([presupuesto.pasos, presupuesto.usados], [1, 0], 'un acierto cuesta un paso');
  assert.deepEqual(medir(prueba, 'a) PV 7 sobre la tarea A4, con la memoria de A5', ACCIONES(7, 50), c, eje, { sujeto: t.A4.id, lectura: true, memoria }), A.acciones(eje, t.A4.id, 7, 'duena').map((x) => x.nombre));
  assert.ok(memoria.tamano > 0 && memoria.tamano < 100, 'pocas entradas: ' + memoria.tamano);
});
