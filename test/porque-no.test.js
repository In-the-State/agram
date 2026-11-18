// El porqué de un «no» (8b; docs/notas/NUCLEO_6_7_8.md §8.2 a §8.5; Core, pendiente de revisar VG): acciones.porQueNo,
// acciones.acciones con noOfrecidas, los motivos de parámetro con su porqué y contrato.porqueEnLlano con sus tres clases
// de texto (las frases «why …», de la época 0 o provisionales y nunca de un libro; los nombres de los datos, marcados y
// cortados; los valores, con legible). Los dos ejemplos de §8.2, cada forma de bajar, la etiqueta hostil y que el porqué
// no entra en lo que se firma.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explicar, LIMITES } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { TEXTOS_PROVISIONALES_DATOS } from '../src/provisional-textos.js';
import { generar, SALIDA } from '../datos/provisional/textos/generar.mjs';
import { ejemploReserva } from '../ejemplos/ikisai/reserva-booking.mjs';
import { epocaRoadmap } from '../datos/epocas/roadmap/generar.mjs';
import { guardarRetoque } from '../carta/carta.js';

const ES = { idioma: 'es' };
const T = '2026-11-09T10:00:00Z';
const P = ['Lista de la compra', ['pan', 'leche', 'huevos'], [[2], [3], [12]], [[['pan'], [2]], [['leche'], [1]], [['huevos'], [12]]], [2, 1, 12]];
const sinLibro = new ContextoEje(null, { epoch: P });
const llano = (src, opciones = {}, idioma = 'es') => C.porqueEnLlano(explicar(src, sinLibro, opciones).porque, { idioma, valor: opciones.valor });

let booking;
const reserva = async () => (booking ??= await ejemploReserva());

// ---------- los textos provisionales ----------

test('las frases «why …» y el glosario: un dato provisional al día, en los dos idiomas, que no tapa ningún texto de la época 0', () => {
  assert.equal(readFileSync(SALIDA, 'utf8'), generar(), 'src/provisional-textos.js no está al día: node datos/provisional/textos/generar.mjs');
  const claves = (codigo) => TEXTOS_PROVISIONALES_DATOS.find((r) => r[0][0] === codigo)[1].map((h) => h.slice(0, h.indexOf(': ')));
  assert.deepEqual(claves('es'), claves('en'), 'las mismas claves en los dos');
  assert.ok(claves('es').filter((k) => k.startsWith('why ')).length >= 12);
  assert.ok(claves('es').filter((k) => k.startsWith('position ')).length >= 25);
  for (const k of claves('es')) {
    // Hoy la 0 no las tiene: se leen de lo provisional. Cuando las tenga, mandará la 0 (fraseDelPorque la mira antes).
    assert.equal(C.texto(null, k, 'es'), null, k + ' ya está en la época 0: lo provisional iría detrás');
    assert.equal(typeof C.fraseDelPorque(k, 'es'), 'string');
  }
  assert.equal(C.fraseDelPorque('why compare >', 'fr'), C.fraseDelPorque('why compare >', 'en'), 'un idioma sin ellas, el canónico');
});

// ---------- cada forma de bajar, en llano ----------

test('cada forma de bajar, en llano: comparación, and, or, not, where sin ninguno, pendiente, error y límite', () => {
  assert.equal(llano('count epoch.1 > 5').texto, 'hace falta que «count epoch.1» sea mayor que 5, y es 3');
  assert.equal(llano('count epoch.1 > 5', {}, 'en').texto, '“count epoch.1” has to be greater than 5, and it is 3');
  assert.equal(llano('count epoch.1 >= 3 and "sal" in epoch.1').texto, 'hace falta que sal esté entre «epoch.1» (pan, leche, huevos), y es sal');
  assert.equal(llano('1 = 2 or epoch.0 = "x"').texto, 'no se cumple ninguna: hace falta que 1 sea 2, y es 1; hace falta que «epoch.0» sea x, y es Lista de la compra');
  assert.equal(llano('not (1 = 1)').texto, 'se cumple «1 = 1», y no debería');
  assert.equal(llano('count (epoch.4 where it > 5 and it < 10) > 0').texto, 'en «epoch.4» (3), ninguno cumple «it > 5 and it < 10»; el que más se acerca, 2, falla en: hace falta que «it» sea mayor que 5, y es 2');
  assert.equal(llano('count (epoch.9 where it > 5) > 0').texto, 'no hay nada en «epoch.9»');
  assert.equal(llano('first epoch.4 + epoch.9 > 0').texto, 'no se puede comprobar: «epoch.9» está vacío');
  assert.equal(llano('epoch.4 where 6 / (it - 1) > 0').texto, 'no se puede comprobar: «6 / (it - 1)» da un error');
  assert.equal(llano('count (1 follow it + 1) > 0').texto, 'no se ha podido comprobar (límite de cálculo)');
  assert.equal(C.porqueEnLlano(explicar('count (epoch.4 where it > 0 and it < 10 and it != 5) > 5', sinLibro, { limites: { ...LIMITES, ocupantes: 12 } }).porque, ES).texto.includes('límite de cálculo'), true, 'la explicación cortada lo dice');
  // Con el valor de un parámetro como sujeto, la frase lo calla.
  assert.equal(llano('=it > 0', { sujeto: 0, valor: true }).texto, 'hace falta que sea mayor que 0, y es 0');
  // Las piezas: frases, nombres (del libro, marcados), código (del libro) y valores (del núcleo).
  const { piezas } = llano('count epoch.1 > 5');
  assert.deepEqual(piezas.map((p) => [p.clase, p.texto, Boolean(p.delLibro)]), [['frase', 'hace falta que ', false], ['codigo', 'count epoch.1', true], ['frase', ' sea mayor que ', false], ['valor', '5', false], ['frase', ', y es ', false], ['valor', '3', false]]);
});

// ---------- los dos ejemplos de §8.2 ----------

test('ejemplo 1: «consume» no se ofrece a recepcion sobre la reserva; de sus 8 series ninguna es una E con saldo atada a ella', async () => {
  const { eje, reserva: r } = await reserva();
  const p = A.porQueNo(eje, r.id, 'consume', 'recepcion', ES);
  assert.deepEqual([p.ofrecida, p.estado], [false, 'RESUELTO']);
  const w = p.porque.hijos[0];
  assert.deepEqual([w.de, w.pasan, w.muestras[0].cumple], [8, 0, '2 de 3']);
  assert.equal(p.texto, '«consumir» no se ofrece aquí: en lo que tiene Alta de recepcion (8), ninguno cumple «E in it2.0.0.0 and it2.1 > 0 and first it2.0.5 = first it.5»; el que más se acerca, horas de Casa rural de ejemplo, falla en: hace falta que el registro al que está atada horas de Casa rural de ejemplo sea el id de Reserva de la cama individual, 3 noches (Reserva de la cama individual, 3 noches), y es Casa rural de ejemplo');
  // Para huesped, lo mismo con sus euros, también atados al génesis.
  const h = A.porQueNo(eje, r.id, 'consume', 'huesped', ES);
  assert.match(h.texto, /el que más se acerca, euros de Casa rural de ejemplo, falla en: hace falta que el registro al que está atada euros de Casa rural de ejemplo sea/);
  // Lo que se ofrece no tiene porqué en llano; lo que no se ofrece, lo da noOfrecidas sin explicar.
  const l = A.acciones(eje, r.id, 1, 'recepcion', { ...ES, noOfrecidas: true });
  assert.ok(l.noOfrecidas.some((x) => x.nombre === 'consume' && x.estado === 'RESUELTO'));
  for (const a of l) assert.deepEqual([A.porQueNo(eje, r.id, a.nombre, 'recepcion', ES).ofrecida, A.porQueNo(eje, r.id, a.nombre, 'recepcion', ES).texto], [true, null], a.nombre);
});

test('ejemplo 2: «consume» en seco con cantidad 0: la validación que falla, en llano, con la ayuda aparte', async () => {
  const { eje, reserva: r } = await reserva();
  const t = await A.transaccion(eje, 'consume', { X: r.id, quantity: 0 }, 'huesped', { t: T, ...ES });
  const m = t.motivos.find((x) => x.parametro === 'quantity');
  assert.equal(m.mensaje, 'cantidad: hace falta que sea mayor que 0, y es 0');
  assert.equal(m.ayuda, 'cuántas unidades se queman');
  assert.deepEqual(m.validacion, { de: 'parámetro', formula: '=it > 0' });
  assert.equal(m.porque.dio, false);
  // Lo que falta: «hace falta y no tiene valor», no la ayuda.
  assert.equal(t.motivos.find((x) => x.parametro === 'series').mensaje, 'serie: hace falta y no tiene valor');
  // Si la validación queda pendiente: «no se puede comprobar», nunca «no vale».
  const c = new ContextoEje(eje, { epoch: eje.epoca(), me: 'huesped' });
  const pendiente = C.porqueEnLlano(explicar('=first before.4.(it).1.0 > 0', c, { sujeto: 'E:casa/XYZ' }).porque, { eje, idioma: 'es', valor: true });
  assert.equal(pendiente.texto, 'no se puede comprobar: «first before.4.(it).1.0» está vacío para XYZ de Casa rural de ejemplo');
  // Con el presupuesto agotado: no se ha podido comprobar (límite de cálculo).
  const corto = C.porqueEnLlano(explicar('=count (before.1 where count it.3 > 0) > 0', c, { limites: { ...LIMITES, ocupantes: 3 } }).porque, { eje, idioma: 'es' });
  assert.equal(corto.texto, 'no se ha podido comprobar (límite de cálculo)');
});

// ---------- la seguridad de §8.4 ----------

test('lo del libro se pinta tal cual, marcado, sin saltos y cortado a 60; nunca se evalúa; un libro no retoca las frases «why …»', async () => {
  // Un texto con huecos dentro de la fórmula del libro sale literal: no pasa por rellenar.
  const t = llano('epoch.0 = "{first epoch.1} ya pagaste"').texto;
  assert.equal(t, 'hace falta que «epoch.0» sea {first epoch.1} ya pagaste, y es Lista de la compra');
  // El nombre de la acción lo retoca el dueño del libro: sale marcado, sin saltos y cortado.
  const { eje, reserva: r } = await ejemploReserva();
  const largo = 'ya pagaste, no hace falta hacer nada más con esta reserva, de verdad, créetelo ya';
  const g = await guardarRetoque(eje, 'casa', { clave: 'template consume', idioma: 'es', texto: largo }, undefined, { t: T });
  assert.ok(g.asentado, JSON.stringify(g));
  const p = A.porQueNo(eje, r.id, 'consume', 'recepcion', ES);
  const accion = p.piezas.find((x) => x.delLibro);
  assert.equal(accion.texto.length, C.LARGO_DE_UN_NOMBRE_DEL_LIBRO);
  assert.ok(accion.texto.endsWith('…') && largo.startsWith(accion.texto.slice(0, -1)));
  assert.ok(p.texto.startsWith('«' + accion.texto + '» no se ofrece aquí: '));
  // Un retoque de una frase «why …» no se puede escribir y, si se escribiera, no la cambiaría: se leen de la 0 y de lo provisional.
  const antes = A.porQueNo(eje, r.id, 'consume', 'huesped', ES).texto;
  const w = await guardarRetoque(eje, 'casa', { clave: 'why compare =', idioma: 'es', texto: 'todo bien, no pasa nada' }, undefined, { t: T });
  assert.equal(w.asentado ?? null, null, 'la clave no es de la época: no se retoca');
  assert.equal(A.porQueNo(eje, r.id, 'consume', 'huesped', ES).texto, antes);
  assert.equal(C.fraseDelPorque('why compare =', 'es'), 'hace falta que {a} sea {b}, y es {va}');
});

test('el porqué no entra en lo que se firma: una transacción que pasa no lleva porqué; una que no pasa no tiene evento', async () => {
  const eje = await Eje.genesis({ identidad: 'duena', foco: 'roadmap', t: T, emision: [{ token: 'R', cantidad: 10 }], epoca: epocaRoadmap(), demostracion: true });
  const bien = await A.transaccion(eje, 'anchor here', { X: eje.genesisId, title: 'Proyecto A' }, 'duena', { t: T, ...ES });
  assert.ok(bien.ok, JSON.stringify(bien.motivos));
  const firmado = JSON.stringify({ evento: bien.evento, ejecucion: bien.ejecucion ?? null, resumen: bien.resumen ?? null });
  assert.doesNotMatch(firmado, /porque|hace falta|no se ofrece|why /);
  const { eje: b, reserva: r } = await reserva();
  const mal = await A.transaccion(b, 'consume', { X: r.id, quantity: 0 }, 'huesped', { t: T, ...ES });
  assert.deepEqual([mal.ok, mal.evento], [false, null]);
  // Y el código: lo que construye y resume la candidata no llama a explicar ni compone el llano.
  const fuente = readFileSync('src/acciones.js', 'utf8');
  for (const nombre of ['function resumenDeEjecucion', 'function movimientosBql', 'export function ejecucion', 'export function sobreDe']) {
    const i = fuente.indexOf(nombre);
    const cuerpo = fuente.slice(i, fuente.indexOf('\n}\n', i));
    assert.ok(i > 0 && !/explicar\(|porqueEnLlano|porQueNo/.test(cuerpo), nombre);
  }
});

test('noOfrecidas: las que no se ofrecen, con el estado de su condición y sin explicación; con las ofrecidas, todas las del punto de vista', async (prueba) => {
  const { eje, reserva: r } = await reserva();
  for (const k of [0, 1, 2, 4, 9]) {
    const l = A.acciones(eje, r.id, k, 'recepcion', { ...ES, noOfrecidas: true });
    const todas = A.plantillasDeTransaccion({ epoca: eje.epoca() }).filter((p) => p.pv === k).map((p) => p.nombre).sort();
    assert.deepEqual([...l.map((a) => a.nombre), ...l.noOfrecidas.map((x) => x.nombre)].sort(), todas, 'PV ' + k);
    for (const x of l.noOfrecidas) assert.deepEqual(Object.keys(x).sort(), ['estado', 'nombre']);
    assert.deepEqual(A.acciones(eje, r.id, k, 'recepcion', ES).map((a) => a.nombre), l.map((a) => a.nombre), 'las ofrecidas, las mismas');
    assert.equal(A.acciones(eje, r.id, k, 'recepcion', ES).noOfrecidas, undefined);
  }
  // Lo que cuesta: medido, sin y con noOfrecidas (la misma evaluación por plantilla).
  // Alternadas, para que el orden no cuente; la mediana de cada una.
  const vez = (o) => {
    const t0 = process.hrtime.bigint();
    A.acciones(eje, r.id, 1, 'recepcion', o);
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
  const sin = [];
  const con = [];
  for (let i = 0; i < 12; i++) {
    con.push(vez({ ...ES, noOfrecidas: true }));
    sin.push(vez(ES));
  }
  const mediana = (x) => x.sort((a, b) => a - b)[x.length >> 1];
  prueba.diagnostic('acciones del PV 1, mediana de 12: ' + mediana(sin).toFixed(1) + ' ms sin noOfrecidas, ' + mediana(con).toFixed(1) + ' ms con ellas');
});
