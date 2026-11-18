// explicar, el 8a del diseño del núcleo (docs/notas/NUCLEO_6_7_8.md §8, rama beta-nucleo; docs/BQLM.md §15.5; Core,
// pendiente de revisar VG): el mismo veredicto que evaluar, y un árbol corto del porqué (qué parte decidió, qué valían sus
// lados, sobre qué elemento), con presupuesto y topes propios. Solo lee y no entra en lo que se firma ni en una regla.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { analizar, evaluar, explicar, esFormula, TOPES_DE_EXPLICAR, EXPLICACION_CORTADA } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { epocaRoadmap } from '../datos/epocas/roadmap/generar.mjs';
import { ejemploReserva } from '../ejemplos/ikisai/reserva-booking.mjs';
import { FORMULAS_DE_LAS_TABLAS } from './ayudas-formulas-tablas.mjs';

const P = ['Lista de la compra', ['pan', 'leche', 'huevos'], [[2], [3], [12]], [[['pan'], [2]], [['leche'], [1]], [['huevos'], [12]]], [2, 1, 12]];
const ctx = new ContextoEje(null, { epoch: P });

/** Sin porque, lo que da explicar es lo que da evaluar. */
const veredicto = ({ porque: _p, ...r }) => r;

/** Cuántos nodos y cuántos niveles tiene un porqué (muestras incluidas). */
function forma(p, nivel = 1) {
  if (!p) return { nodos: 0, niveles: 0 };
  let nodos = 1;
  let niveles = nivel;
  for (const h of [...(p.hijos ?? []), ...(p.muestras ?? []).flatMap((m) => m.hijos ?? [])]) {
    const f = forma(h, nivel + 1);
    nodos += f.nodos;
    niveles = Math.max(niveles, f.niveles);
  }
  return { nodos, niveles };
}

test('los espacios en el árbol: cada nodo sabe qué trozo de la fórmula lo escribe', () => {
  const src = '=count (me.1 where E in it2.0.0.0 and it2.1 > 0 and first it2.0.5 = first it.5) > 0';
  const a = analizar(src, { sujeto: true });
  const trozo = (n) => a.fuente.slice(n.ini, n.fin);
  assert.equal(a.fuente, src.slice(1));
  assert.equal(trozo(a), src.slice(1));
  assert.equal(trozo(a.a), 'count (me.1 where E in it2.0.0.0 and it2.1 > 0 and first it2.0.5 = first it.5)');
  const w = a.a.arg.e;
  assert.equal(trozo(w), 'me.1 where E in it2.0.0.0 and it2.1 > 0 and first it2.0.5 = first it.5');
  assert.equal(trozo(w.cond.a), 'E in it2.0.0.0 and it2.1 > 0', 'un and de en medio de la cadena, de sus hijos');
  assert.equal(trozo(w.cond.b), 'first it2.0.5 = first it.5');
  // No cambia lo que vale nada.
  assert.deepEqual(evaluar('count (epoch.4 where it > 1) = 2', ctx).valor, [true]);
});

test('cada forma de bajar: and, or, not, comparación, count … where con sus muestras, PENDIENTE y ERROR con dónde', () => {
  const y = explicar('count epoch.1 >= 3 and "sal" in epoch.1', ctx).porque;
  assert.equal(y.dio, false);
  assert.deepEqual(y.hijos.map((h) => [h.expr, h.dio, h.vale]), [['"sal" in epoch.1', false, ['sal', 'pan, leche, huevos']]], 'and falso: el primer término falso');
  const o = explicar('1 = 2 or epoch.0 = "x"', ctx).porque;
  assert.deepEqual(o.hijos.map((h) => h.expr), ['1 = 2', 'epoch.0 = "x"'], 'or falso: todos');
  const n = explicar('not (1 = 1)', ctx).porque;
  assert.deepEqual([n.dio, n.hijos[0].expr, n.hijos[0].dio], [false, '1 = 1', true], 'not: por qué lo de dentro es verdad');
  const c = explicar('count (epoch.4 where it > 5 and it < 10) > 0', ctx).porque;
  assert.deepEqual(c.vale, ['0', '0']);
  const w = c.hijos[0];
  assert.deepEqual([w.expr, w.de, w.pasan], ['epoch.4 where it > 5 and it < 10', 3, 0]);
  assert.deepEqual(w.muestras.map((m) => [m.sobre, m.cumple, m.hijos[0].expr, m.hijos[0].vale]), [['2', '1 de 2', 'it > 5', ['2', '5']], ['1', '1 de 2', 'it > 5', ['1', '5']], ['12', '1 de 2', 'it < 10', ['12', '10']]]);
  const p = explicar('first epoch.4 + epoch.9 > 0', ctx);
  assert.equal(p.estado, 'PENDIENTE');
  assert.deepEqual([p.porque.dio, p.porque.hijos[0].expr, p.porque.hijos[0].vale], ['PENDIENTE', 'first epoch.4 + epoch.9', ['2', '∅']], 'la operación, con lo que valían sus lados');
  const e = explicar('epoch.4 where 6 / (it - 1) > 0', ctx);
  assert.equal(e.estado, 'ERROR');
  assert.deepEqual([e.porque.hijos[0].sobre, e.porque.hijos[0].hijos[0].expr, e.porque.hijos[0].hijos[0].motivo], ['1', '6 / (it - 1)', 'división por cero'], 'sobre qué elemento se paró');
  const s = explicar('it.1 > 5', ctx, { sujeto: 'x' });
  assert.equal(s.porque.sobre, 'x', 'el sujeto');
});

test('el porqué de «consume» sobre la reserva de Booking: de las series de recepcion, ninguna es una E con saldo atada a la reserva', async () => {
  const { eje, reserva } = await ejemploReserva();
  const c = new ContextoEje(eje, { epoch: eje.epoca(), me: 'recepcion' });
  const r = explicar('=count (me.1 where E in it2.0.0.0 and it2.1 > 0 and first it2.0.5 = first it.5) > 0', c, { sujeto: reserva.id });
  assert.deepEqual(r.valor, [false]);
  const w = r.porque.hijos[0];
  assert.ok(w.de > 0 && w.pasan === 0, JSON.stringify(w));
  // La que más se acerca cumple dos de tres: es una E con saldo, pero atada a otro registro.
  const mejor = w.muestras[0];
  assert.equal(mejor.cumple, '2 de 3');
  assert.equal(mejor.hijos[0].expr, 'first it2.0.5 = first it.5');
  assert.equal(mejor.hijos[0].dio, false);
  assert.notEqual(mejor.hijos[0].vale[0], mejor.hijos[0].vale[1]);
  assert.ok(w.muestras.length <= TOPES_DE_EXPLICAR.muestras);
});

test('presupuesto y topes propios: con límites bajos la explicación se corta con su marca y el veredicto es el mismo', () => {
  const src = 'count (epoch.4 where it > 5 and it < 10 and it > 0) > 0';
  // Con 14 ocupantes la evaluación cabe; la explicación, que recorre más, no.
  const limites = { ocupantes: 14 };
  assert.equal(evaluar(src, ctx, { limites }).estado, 'RESUELTO');
  const r = explicar(src, ctx, { limites });
  assert.deepEqual(veredicto(r), evaluar(src, ctx, { limites }));
  assert.equal(r.porque.cortada, EXPLICACION_CORTADA);
  // Los topes de forma: nunca más de 20 nodos ni de 6 niveles.
  const larga = Array.from({ length: 30 }, (_, k) => 'epoch.0 = "x' + k + '"').join(' or ');
  const f = forma(explicar(larga, ctx).porque);
  assert.ok(f.nodos <= TOPES_DE_EXPLICAR.nodos && f.niveles <= TOPES_DE_EXPLICAR.niveles, JSON.stringify(f));
});

test('explicar solo lee: un verbo, put, mover o escribir no se explican; nada del núcleo la llama al firmar ni en una regla', () => {
  for (const [src, opciones] of [['=mint 1 T.1 to me', {}], ['=put 1 at me.2.1.("x")', {}], ['=1 = 1', { mover: true }], ['=1 = 1', { escribir: true }]]) {
    const r = explicar(src, ctx, opciones);
    assert.equal(r.estado, 'ERROR', src + ' ' + JSON.stringify(opciones));
  }
  // Ningún archivo de src/ la llama, salvo bqlm.js (donde vive) y acciones.js, y ahí solo para el porqué de una acción que
  // no se ofrece (porQueNo, a petición) y de un parámetro que no vale (preparar, en sus motivos): ni las reglas, ni las
  // plantillas, ni el eje, ni lo que construye o resume la candidata (8b; test/porque-no.test.js lo mira por función).
  const archivos = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(join(dir, e.name)) : /\.m?js$/.test(e.name) ? [join(dir, e.name)] : []));
  for (const f of archivos('src')) if (!f.endsWith('bqlm.js') && !f.endsWith('acciones.js')) assert.ok(!/\bexplicar\s*\(/.test(readFileSync(f, 'utf8')), f);
  const acc = readFileSync('src/acciones.js', 'utf8');
  const funcionDe = (i) => {
    const antes = acc.slice(0, i);
    const k = Math.max(antes.lastIndexOf('\nfunction '), antes.lastIndexOf('\nexport function '));
    return antes.slice(k + 1).match(/function (\w+)/)?.[1];
  };
  assert.deepEqual([...new Set([...acc.matchAll(/\bexplicar\s*\(/g)].map((m) => funcionDe(m.index)))].sort(), ['porQueNo', 'preparar'], 'en acciones.js, solo porQueNo y preparar');
  const bqlm = readFileSync('src/bqlm.js', 'utf8');
  for (const nombre of ['evaluarRegla', 'leerRegla', 'evaluarEscritura', 'evaluarPlantilla', 'leerFormula', 'rellenar']) {
    const i = bqlm.indexOf('export function ' + nombre + '(');
    const cuerpo = bqlm.slice(i, bqlm.indexOf('\n}\n', i));
    assert.ok(i > 0 && !/\bexplicar\s*\(/.test(cuerpo), nombre);
  }
});

// ---------- el mismo veredicto, sobre todas las fórmulas ----------

/** Las fórmulas de una época: las condiciones, las lecturas, las de los puntos de vista y el 2 de cada plantilla. */
function formulasDe(epoca) {
  const fuera = [];
  const de = (regla, sujeto) => {
    for (const x of Array.isArray(regla?.[2]) ? regla[2] : []) if (esFormula(x)) fuera.push({ f: x, sujeto });
  };
  for (const r of epoca.condiciones ?? []) de(r, false);
  for (const r of epoca.lecturas ?? []) de(r, true);
  for (const r of epoca.lecturasDePv ?? []) de(r, true);
  for (const { plantilla } of epoca.transacciones ?? []) de(plantilla, true);
  return fuera;
}

async function comparar(prueba, nombre, eje, me, sujetos, formulas) {
  const c = new ContextoEje(eje, { epoch: eje.epoca(), me });
  const ultimo = eje.obtener(eje.orden.at(-1));
  const conCandidata = new ContextoEje(eje, { epoch: eje.epoca(), ev: ultimo });
  let n = 0;
  const estados = {};
  for (const { f, sujeto } of formulas) {
    for (const s of sujeto ? sujetos : [undefined]) {
      for (const [cx, opciones] of [[c, s === undefined ? {} : { sujeto: s }], [conCandidata, s === undefined ? {} : { sujeto: s }], [c, { ...(s === undefined ? {} : { sujeto: s }), lectura: true }]]) {
        const a = evaluar(f, cx, opciones);
        const b = explicar(f, cx, opciones);
        assert.deepEqual(veredicto(b), a, nombre + ': ' + f);
        const fo = forma(b.porque);
        assert.ok(fo.nodos <= TOPES_DE_EXPLICAR.nodos + TOPES_DE_EXPLICAR.muestras && fo.niveles <= TOPES_DE_EXPLICAR.niveles + 1, f + ' ' + JSON.stringify(fo));
        estados[a.estado] = (estados[a.estado] ?? 0) + 1;
        n++;
      }
    }
  }
  prueba.diagnostic(nombre + ': ' + formulas.length + ' fórmulas, ' + n + ' comparaciones, ' + JSON.stringify(estados));
  return n;
}

test('el mismo veredicto que evaluar, sobre todas las fórmulas de la época 0, del roadmap y de las tablas, en Booking y en Tasks', async (prueba) => {
  const { eje: booking, reserva } = await ejemploReserva();
  const de0 = formulasDe(EPOCA_0_BTML);
  assert.ok(de0.length > 150, 'las fórmulas de la época 0: ' + de0.length);
  await comparar(prueba, 'Booking, época 0', booking, 'recepcion', [reserva.id], de0);

  const tasks = await Eje.genesis({ identidad: 'duena', foco: 'roadmap', t: '2026-11-17T10:00:00Z', emision: [{ token: 'R', cantidad: 10 }], epoca: epocaRoadmap(), demostracion: true });
  const hacer = async (nombre, X, params) => {
    const r = await A.transaccion(tasks, nombre, { X, ...params }, 'duena', { t: '2026-11-17T10:00:00Z' });
    assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
    return tasks.anadir(r.evento);
  };
  const pa = await hacer('anchor here', tasks.genesisId, { title: 'Proyecto A' });
  const t1 = await hacer('anchor here', pa.id, { title: 'A1', content: ['id: A1'], type: 'task' });
  const t2 = await hacer('anchor here', pa.id, { title: 'A2', content: ['id: A2'], type: 'task' });
  await hacer('this goes after', t2.id, { previous: [t1.id] });
  const hija = tasks.epoca();
  const propias = formulasDe(hija).filter(({ f }) => !de0.some((x) => x.f === f));
  await comparar(prueba, 'Tasks, lo propio de la época del roadmap', tasks, 'duena', [t1.id, pa.id], propias);
  await comparar(prueba, 'Tasks, las tablas de §15', tasks, 'duena', [t1.id, pa.id], FORMULAS_DE_LAS_TABLAS.map((f) => ({ f, sujeto: true })));
});
