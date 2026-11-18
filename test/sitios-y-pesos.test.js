// La foto de los sitios y los pesos de la pantalla (docs/notas/SITIOS_Y_PESOS.md §4, paso 0): lo que hoy decide la carta
// sobre dónde va cada punto de vista, en qué orden y cuánto se enseña, fijado ANTES de mover nada a dato. Tres partes:
//
//   1. FOTO (test/ayudas-sitios.mjs): los valores de hoy, escritos a mano. No cambia al mover: en el paso 1 el lector (contrato.sitios y
//      contrato.pesos) tiene que darlos tal cual sin libro, y en el paso 2 la carta los lee de él.
//   2. Lo que la carta usa hoy coincide con la FOTO (las constantes exportadas y, para las que no se exportan, su línea
//      en el fuente). Esta parte se reescribe en el paso 2, cuando las constantes desaparecen.
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
  GEOMETRIA, CENTROS, LATERALES, ORDEN_ROSETONES, BOTONES_POR_NIVEL, NIVEL,
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

// ---------- 2. lo que la carta usa hoy coincide con la foto (se reescribe en el paso 2) ----------

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

test('la foto: las que no se exportan, por su línea en el fuente', () => {
  tiene('dom.js', 'const ARRIBA = [' + FOTO.tiraDeArriba.join(', ') + '];');
  tiene('carta.js', 'const CUENTA_PROPONEN_A_LA_VISTA = ' + FOTO.proponenALaVista + ';');
  tiene('dom.js', 'const EJECUCIONES_EN_CELDA = ' + FOTO.ejecucionesEnCelda + ';');
  tiene('carta.js', 'const EJECUCIONES_EN_CELDA_ABIERTA = ' + FOTO.ejecucionesEnCeldaAbierta + ';');
  tiene('dom.js', 'const SERIES_EN_EL_PIE = ' + FOTO.seriesEnElPie + ';');
  // El orden de Sequenced y el de buscar el destacado: del 0 al 9.
  tiene('carta.js', 'const digitos = [...pvs].sort((a, b) => a - b);');
  tiene('carta.js', 'for (const pv of [...CENTROS, ...LATERALES].sort((a, b) => a - b)) {');
  // Lo que se abre al empezar (una cuenta nueva): el PV del camino, en tarjeta.
  assert.ok(fuente('app.js').includes('estado.niveles[PV_CAMINO] = NIVEL.tarjeta;'));
  assert.equal(NIVEL.tarjeta, FOTO.alEmpezar.tamano);
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
  // El rosetón ampliado enseña 4 (dom.js slice(0, 4)): los de la tarjeta de 9.5.2.
  tiene('dom.js', 'r.ocupantes.lista.slice(0, 4)');
  assert.equal(C.tamanos()[1].datos, 4);
});

// ---------- 3. las huellas ----------

const sha = (x) => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 24);

/** Las huellas de hoy. Se regeneran solo a propósito (AGRAM_HUELLAS=1, arriba). */
const HUELLAS = {
  'puras · escala': '30e3b18fe0749a4728884e68',
  'puras · repartir': '6e79c7826bda27696172c188',
  'puras · ampliar': 'e8f6139700750387e845c03f',
  'puras · medidasDePantalla': 'd98c216d474e30b1ea5e8b3b',
  'html · inicial movil': '8d7e91558299af113961b214',
  'html · inicial apaisado': '1001653609d7c1b766ce2717',
  'html · inicial ordenador': 'a41c57ed48fcb2650630e512',
  'html · inicial grande': 'e2245e012adebb92baf85b6c',
  'html · sequenced abre 1': '9b4f05903874c105151d07cb',
  'html · sequenced abre 2': '50ed755f72b9eeb395f93a0d',
  'html · sequenced abre 3': '25f3298cadeb6a32e5678fdd',
  'html · sequenced abre 4': '4b402e7f49538fdc162b43a9',
  'html · sequenced abre 8': 'bc90bd9dd2735be487bb03ac',
  'html · sequenced abre 9': 'af36aa89b1a404cc4d83041e',
  'html · reverso movil': '45d3e63069a622b0ba478749',
  'html · reverso ordenador': 'b316bd0a8cc70c55ebf4c1e2',
  'html · mapped tope 1': 'b08cc6e199abc9c566fb6915',
  'html · mapped tope 2': '4dcfd9e7dcf97cfb2a02fe9e',
  'html · mapped tope 3': '348ea3e24fa27abdd9c70340',
  'html · mapped tope 4': 'f4e01ae31e8359d04473cec3',
  'html · mapped tope 6': '9cb5fedb63e1770f35a90821',
  'html · mapped tope 7': 'affe6ddbbd33bfbfb75a5f18',
  'html · mapped tope 8': 'd3d8dd72244975c321e18f53',
  'html · mapped tope 9': '542a17e097ed4ee97adca154',
  'html · completa 1': '294ade6103993081d3fe41be',
  'html · completa 2': 'da73f660e15a490055198df1',
  'html · completa 3': 'c6ec301885d22e49bff7eb62',
  'html · completa 4': '9d1bc8393ad91c861d905154',
  'html · completa 6': '87265bdb0d8e7c327e9fdad3',
  'html · completa 7': '25339c649a490f581d6d17d5',
  'html · completa 8': 'b1f5f7b29534dc23629c18a7',
  'html · completa 9': 'f271b48049a49a613bc40797',
  'html · todos +1 ordenador': '5e3026c644c538c3f163bbaa',
  'html · todos +2 ordenador': '5b5e001d606daee22176731b',
  'html · todos +1 apaisado': 'c312385a57137b82e7b28b04',
  'html · todos +2 apaisado': 'df0a03cc28d4c9283c402efd',
  'html · completa 4 apaisado': '5656f0c74c5785d17fcfccb7',
  'html · mapped tope 1 grande': 'e58c0a4e5d6678be7b5c8191',
  'html · roseton 1 en 2 ordenador': '48ea52e939ad11b8db37c314',
  'html · roseton 1 en 3 ordenador': '82b1164d827d72adc3d0188c',
  'html · roseton 9 en 3 ordenador': '68aaf7e247a38eb898d1a5d7',
  'html · aro movil': '7baf781e9bf3085770babdef',
  'html · aro ordenador': '3bac2e6c78b714ec67e7a850',
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
