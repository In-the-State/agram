// La foto de los sitios y los pesos de la pantalla (docs/notas/SITIOS_Y_PESOS.md §4, paso 0): lo que hoy decide la carta
// sobre dónde va cada punto de vista, en qué orden y cuánto se enseña, fijado ANTES de mover nada a dato. Tres partes:
//
//   1. FOTO (test/ayudas-sitios.mjs): los valores de hoy, escritos a mano. No cambia al mover: en el paso 1 el lector (contrato.sitios y
//      contrato.pesos) tiene que darlos tal cual sin libro, y en el paso 2 la carta los lee de él.
//   2. Lo que la carta usa coincide con la FOTO y lo lee del dato: las tablas que se fueron no vuelven al código, y las que
//      aún quedan, por su línea en el fuente.
//   3. Huellas: sha256 de la salida de las funciones puras que leen las tablas y del HTML de la carta (html(arbol(…)))
//      sobre el ejemplo de la compra, con el reloj fijo, en un juego de pantallas y estados. Mismo HTML y mismo
//      estilo.css: misma pantalla, píxel a píxel.
//
// Regenerar las huellas, solo a propósito (cuando un cambio del HTML es querido, como el carril del aro):
//   AGRAM_HUELLAS=1 node --test test/sitios-y-pesos.test.js
// imprime las huellas de ahora como un objeto para pegar en HUELLAS. La prueba nunca reescribe nada sola y, con la
// variable puesta, sigue comparando: falla igual si algo cambió.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  arbol, ampliar, ampliarTodos, repartir, escalaDeTamanos, medidasDePantalla, botonesDeNivel,
  GEOMETRIA, CENTROS, LATERALES, ORDEN_ROSETONES, BOTONES_POR_NIVEL, NIVEL, LENTE_SIN_LIBRO,
} from '../carta/carta.js';
import { html } from '../carta/dom.js';
import * as C from '../src/contrato.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { FOTO } from './ayudas-sitios.mjs';

const T = '2026-11-08T10:00:00Z';
const YO = 'huesped';
const PANTALLAS = { movil: [400, 700], apaisado: [800, 375], ordenador: [1200, 800], grande: [1920, 1080] };
const IMPRIMIR = Boolean(process.env.AGRAM_HUELLAS);

// ---------- 1. la foto (18-11, commit 1dea43b) ----------

// La FOTO vive en test/ayudas-sitios.mjs: la usan esta prueba y la del lector (test/lente-lector.test.js).

// ---------- 2. lo que la carta usa coincide con la foto y lo lee del dato ----------

const fuente = (f) => readFileSync(new URL('../carta/' + f, import.meta.url), 'utf8');
const tiene = (f, linea) => assert.ok(fuente(f).includes(linea), 'carta/' + f + ' ya no dice «' + linea + '»: si es a propósito, cambia la FOTO o esta línea');

test('la foto: las constantes exportadas de la carta son las de la FOTO', () => {
  assert.deepEqual(GEOMETRIA, FOTO.geometria);
  assert.deepEqual(CENTROS, FOTO.centros);
  assert.deepEqual(LATERALES, FOTO.laterales);
  assert.deepEqual(ORDEN_ROSETONES, FOTO.rosetones);
  assert.deepEqual({ ...BOTONES_POR_NIVEL }, FOTO.botones);
  assert.deepEqual(['comprimido', 'tarjeta', 'bloque', 'abierto', 'filas'].map((n) => botonesDeNivel(n)), [0, 1, 3, Infinity, 12]);
});

/**
 * Las tablas que ya se han ido de la carta al dato (paso 2): ninguna vuelve al código. [archivo, el texto que no puede volver].
 * Lo que la carta enseña con ellas lo fijan las huellas, que no cambian.
 */
const YA_NO = [
  ['carta.js', 'const CUENTA_PROPONEN_A_LA_VISTA ='],
  ['carta.js', 'const EJECUCIONES_EN_CELDA_ABIERTA ='],
  ['carta.js', 'BOTONES_POR_NIVEL = Object.freeze({'],
  ['dom.js', 'const EJECUCIONES_EN_CELDA ='],
  ['dom.js', 'const SERIES_EN_EL_PIE ='],
  ['carta.js', 'Object.freeze([1, 2, 0, 3, 4, 6, 7, 5, 8, 9])'],
  ['carta.js', 'const digitos = [...pvs].sort('],
  ['carta.js', '[...CENTROS, ...LATERALES].sort('],
  ['app.js', 'PV_CAMINO'],
  ['dom.js', "GEOMETRIA[c.pv]?.grupo === 'cruz'"],
  ['dom.js', "GEOMETRIA[r.pv]?.grupo === 'cruz'"],
  ['dom.js', 'r.ocupantes.lista.slice(0, 4)'],
];

test('la foto: la carta lee del dato (contrato.sitios y contrato.pesos), y las tablas que se fueron no vuelven', () => {
  for (const [archivo, texto] of YA_NO) assert.equal(fuente(archivo).includes(texto), false, 'carta/' + archivo + ' vuelve a tener «' + texto + '»');
  const p = C.pesos(null);
  assert.deepEqual([p.proponenALaVista, p.ejecucionesEnCelda, p.ejecucionesEnCeldaAbierta, p.seriesEnElPie], [FOTO.proponenALaVista, FOTO.ejecucionesEnCelda, FOTO.ejecucionesEnCeldaAbierta, FOTO.seriesEnElPie]);
  // Las que aún están en el código (el paso 2 en curso), por su línea.
  tiene('dom.js', 'const ARRIBA = [' + FOTO.tiraDeArriba.join(', ') + '];');
  assert.deepEqual([p.rosetones, p.ordenDeSequenced, p.buscarDestacado, p.alEmpezar], [FOTO.rosetones, FOTO.ordenDeSequenced, FOTO.buscarDestacado, FOTO.alEmpezar]);
  // Lo que se abre al empezar: su tamaño de 9.5.2 es el paso de nivel con que la app lo abre (la tarjeta).
  assert.equal(NIVEL.tarjeta, FOTO.alEmpezar.tamano);
  assert.ok(fuente('app.js').includes('estado.niveles[alEmpezar.pv] = alEmpezar.tamano;'));
});

test('la foto: lo que la propuesta deja de escribir se deduce sin pérdida', () => {
  for (const [pv, g] of Object.entries(GEOMETRIA)) {
    const [f, c] = g.celda;
    const grupo = f === 1 && c === 1 ? 'nucleo' : f !== 1 && c !== 1 ? 'x' : 'cruz';
    assert.equal(g.grupo, grupo, 'el grupo del ' + pv + ' sale de su celda');
    assert.equal(g.fila, grupo === 'nucleo' ? undefined : ['arriba', 'medio', 'abajo'][f], 'la fila del ' + pv + ' sale de su celda');
  }
  // El hilo (carta.js zonaDelHilo y esPvDelPasado): la cruz del medio, el lado 1 el pasado y el 2 el futuro.
  const hilo = (lado) => Number(Object.keys(GEOMETRIA).find((pv) => GEOMETRIA[pv].grupo === 'cruz' && GEOMETRIA[pv].fila === 'medio' && GEOMETRIA[pv].lado === lado));
  assert.deepEqual({ pasado: hilo(1), futuro: hilo(2) }, FOTO.hilo);
  // El PV del camino (app.js PV_CAMINO: la cruz de abajo) es el que tiene la forma «camino» en 8.7, en los dos modos.
  const camino = Number(Object.keys(GEOMETRIA).find((pv) => GEOMETRIA[pv].grupo === 'cruz' && GEOMETRIA[pv].fila === 'abajo'));
  assert.equal(camino, FOTO.camino);
  for (const modo of ['sequenced', 'mapped']) assert.deepEqual(FOTO.laterales.filter((pv) => C.formaDe(null, pv, modo)?.forma === 'camino'), [FOTO.camino]);
  // El rosetón ampliado enseña los de la tarjeta de 9.5.2 (4), que el árbol ya corta; y el PV del camino de la lente es el 9.
  assert.equal(C.tamanos()[1].datos, 4);
  assert.equal(LENTE_SIN_LIBRO.camino, FOTO.camino);
});

// ---------- 3. las huellas ----------

const sha = (x) => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 24);

/** Las huellas de hoy. Se regeneran solo a propósito (AGRAM_HUELLAS=1, arriba). */
const HUELLAS = {
  'puras · escala': '30e3b18fe0749a4728884e68',
  'puras · repartir': '6e79c7826bda27696172c188',
  'puras · ampliar': 'e8f6139700750387e845c03f',
  'puras · medidasDePantalla': 'd98c216d474e30b1ea5e8b3b',
  'html · inicial movil': '826935eeca0ea5a6bdcc0551',
  'html · inicial apaisado': 'd858893ccffdaea602f1229f',
  'html · inicial ordenador': 'c8d14499e0ddbc909061f701',
  'html · inicial grande': '30ee4d9305f99ea6c7a67cd2',
  'html · sequenced abre 1': '7faee1efbb24e081cfaa6ffb',
  'html · sequenced abre 2': '15c7832b7b1f45025ac7e6ee',
  'html · sequenced abre 3': '422784f41986059f4cefeae7',
  'html · sequenced abre 4': '57e2d113d255765208b5c7e3',
  'html · sequenced abre 8': '8a39e408dee453f516ca3286',
  'html · sequenced abre 9': '7a5994c40204de9b1bc2cd16',
  'html · reverso movil': '079942f57c9fee07c1a100a6',
  'html · reverso ordenador': 'afa4b7d28e0d47781118417d',
  'html · mapped tope 1': 'dd21713f4b7d8c015909ec52',
  'html · mapped tope 2': '6aea4faaad7bf06a7b60bfbe',
  'html · mapped tope 3': '1230985327f0937c07ff9e7d',
  'html · mapped tope 4': '84e7e7d1c369b7165c37e0be',
  'html · mapped tope 6': '6e83e519eb8ef73f35ab2183',
  'html · mapped tope 7': '4867caa441aa9f1c7014e411',
  'html · mapped tope 8': '5f367a853f7f389ad70869f6',
  'html · mapped tope 9': 'c69a8367d077b580a80f74c1',
  'html · completa 1': '6883b90cf4a47a38da2c763a',
  'html · completa 2': 'e2f56e9ec9ed9302afb5f763',
  'html · completa 3': '86701f0a462bd36dcd96ce0d',
  'html · completa 4': '39228895cf55ca098a3e9cc6',
  'html · completa 6': 'cc610aa5d73c713f4fbe866d',
  'html · completa 7': '0da7cffaa3197c65825d5fc0',
  'html · completa 8': '9e213427845931f21e1f2a16',
  'html · completa 9': '9ac4bd16669dc9755812692b',
  'html · todos +1 ordenador': '50896abf55f668411c0c6949',
  'html · todos +2 ordenador': '46858a8c494534f7ef07f2dc',
  'html · todos +1 apaisado': '22b6cf7de73c6c131f93065a',
  'html · todos +2 apaisado': 'def143e8b929252249706f7b',
  'html · completa 4 apaisado': 'd864e6d450608726e0316440',
  'html · mapped tope 1 grande': '247bf224d65793ca3f56cf36',
  'html · roseton 1 en 2 ordenador': '14bab1239c3502648ff1111f',
  'html · roseton 1 en 3 ordenador': '697fff447fa86a71b99cbb63',
  'html · roseton 9 en 3 ordenador': '9499f3c205cca60b051167e6',
  'html · aro movil': '62156e4d3046333fdf47ab25',
  'html · aro ordenador': 'c0f945718e7eb7e92cf9d01d',
};

/** Compara las huellas hechas con las de HUELLAS que empiezan por `prefijo` (cada prueba, las suyas). */
function comparar(prefijo, hechas) {
  const dadas = Object.fromEntries(Object.entries(hechas).map(([k, v]) => [prefijo + k, v]));
  if (IMPRIMIR) console.log('// huellas de ahora (AGRAM_HUELLAS), «' + prefijo + '»:\n' + JSON.stringify(dadas, null, 2));
  const fijas = Object.fromEntries(Object.entries(HUELLAS).filter(([k]) => k.startsWith(prefijo)));
  const distintas = Object.keys({ ...fijas, ...dadas }).filter((k) => fijas[k] !== dadas[k]);
  assert.deepEqual(distintas, [], 'cambian estas huellas: ' + distintas.join(', ') + ' (si es a propósito, se regeneran con AGRAM_HUELLAS=1)');
}

/** Las funciones puras que leen las tablas: el reparto de Mapped, los toques de tamaño y las medidas de pantalla. */
function huellasPuras() {
  const escala = escalaDeTamanos();
  const reparto = [];
  for (const pv of LATERALES) for (let k = 0; k < escala.pasos.length; k++) reparto.push(repartir({ [pv]: k }, LATERALES, escala));
  for (let k = 0; k < escala.pasos.length; k++) reparto.push(repartir(Object.fromEntries(LATERALES.map((pv) => [pv, k])), LATERALES, escala));
  reparto.push(repartir({ 1: 3, 2: 2, 8: 3 }, LATERALES, escala, { recientes: [2, 1, 8] }));
  const toques = [];
  for (const secuencia of [[1, 2, 1, 8, 9, 4], [6, 7, 6, 7, 3], [9, 9, 9, 9]]) {
    let estado = {};
    for (const pv of secuencia) { estado = ampliar(estado, pv, 1); toques.push(estado); }
    toques.push(ampliar(estado, secuencia[0], -1));
  }
  for (const d of [1, 2, -1]) toques.push(ampliarTodos({}, d), ampliarTodos({ niveles: { 1: 3, 6: 2 } }, d));
  const pantallas = [[400, 700], [800, 375], [700, 300], [600, 200], [1200, 800], [1920, 1080], [100, 100]].map(([a, b]) => medidasDePantalla(a, b));
  return { escala: sha(escala), repartir: sha(reparto), ampliar: sha(toques), medidasDePantalla: sha(pantallas) };
}

/** Los casos del HTML: [nombre, pantalla, estado sin el foco]. Uno por cada cosa que lee una tabla. */
function casos() {
  const escala = escalaDeTamanos();
  const lista = [];
  for (const p of Object.keys(PANTALLAS)) lista.push(['inicial ' + p, p, {}]);
  // El 6 y el 7 son el hilo: en Sequenced van siempre en bloque, abrirlos no cambia nada (no se fotografían).
  for (const pv of LATERALES.filter((k) => k !== 6 && k !== 7)) lista.push(['sequenced abre ' + pv, 'movil', { niveles: { [pv]: NIVEL.tarjeta } }]);
  for (const p of ['movil', 'ordenador']) lista.push(['reverso ' + p, p, { pv: 5 }]);
  for (const pv of LATERALES) lista.push(['mapped tope ' + pv, 'ordenador', { niveles: { [pv]: escala.tope } }]);
  for (const pv of LATERALES) lista.push(['completa ' + pv, 'ordenador', { pv }]);
  for (const p of ['ordenador', 'apaisado']) for (const d of [1, 2]) lista.push(['todos +' + d + ' ' + p, p, { niveles: ampliarTodos({}, d).niveles }]);
  // En Sequenced el árbol no lleva rosetones: solo en Mapped.
  lista.push(['completa 4 apaisado', 'apaisado', { pv: 4 }]);
  lista.push(['mapped tope 1 grande', 'grande', { niveles: { 1: escala.tope } }]);
  lista.push(['roseton 1 en 2 ordenador', 'ordenador', { rosetones: { 1: 2 } }]);
  lista.push(['roseton 1 en 3 ordenador', 'ordenador', { rosetones: { 1: 3 } }]);
  lista.push(['roseton 9 en 3 ordenador', 'ordenador', { rosetones: { 9: 3 } }]);
  for (const p of ['movil', 'ordenador']) lista.push(['aro ' + p, p, { aro: true }]);
  return lista;
}

async function huellasDelHtml() {
  const { eje, compra } = await ejemploCompra();
  const X = compra.id;
  const fuera = {};
  for (const [nombre, p, e] of casos()) {
    const [ancho, alto] = PANTALLAS[p];
    const estado = { foco: { X, pv: e.pv ?? 0 }, niveles: e.niveles ?? {}, rosetones: e.rosetones ?? {}, ...(e.aro ? { aro: { X, pv: null } } : {}) };
    const a = await arbol(estado, eje, YO, medidasDePantalla(ancho, alto), { t: T });
    fuera[nombre] = sha(html(a));
  }
  return fuera;
}

test('las huellas: el reparto de Mapped, los toques de tamaño y las medidas de pantalla no cambian', () => {
  comparar('puras · ', huellasPuras());
});

test('las huellas: el HTML de la carta sobre el ejemplo de la compra no cambia (sobrio, reloj fijo)', async () => {
  comparar('html · ', await huellasDelHtml());
});
