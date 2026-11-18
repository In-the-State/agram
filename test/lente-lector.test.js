// El lector de los sitios y los pesos (docs/notas/SITIOS_Y_PESOS.md, paso 1): contrato.sitios y contrato.pesos leen la
// época del libro, la época 0 y el archivo de la lente (datos/lente/lente-0.json), en ese orden; 9.5.8 clave a clave y
// 9.5.6 entera o nada; con el suelo dentro y sin lanzar nunca. Sin libro dan exactamente la FOTO de la carta de hoy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../src/contrato.js';
import { sitiosDe, pesosDe, CAPAS } from '../src/sitios.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import { LENTE_0_DATOS } from '../datos/lente/lente-0.js';
import { generar } from '../datos/lente/generar.mjs';
import { FOTO } from './ayudas-sitios.mjs';

const copia = (x) => JSON.parse(JSON.stringify(x));
const SITIOS = LENTE_0_DATOS['epoch.9.5.6'];
const PESOS = LENTE_0_DATOS['epoch.9.5.8'];
const CAMPOS = ['botones', 'rosetones', 'tiraDeArriba', 'ordenDeSequenced', 'buscarDestacado', 'proponenALaVista', 'ejecucionesEnCelda', 'ejecucionesEnCeldaAbierta', 'seriesEnElPie', 'alEmpezar'];
const soloPesos = (p) => Object.fromEntries(CAMPOS.map((k) => [k, p[k]]));
const soloSitios = (s) => ({ geometria: s.geometria, centros: s.centros, laterales: s.laterales, hilo: s.hilo });
const FOTO_SITIOS = { geometria: FOTO.geometria, centros: FOTO.centros, laterales: FOTO.laterales, hilo: FOTO.hilo };
const FOTO_PESOS = Object.fromEntries(CAMPOS.map((k) => [k, FOTO[k]]));

/** Una época de libro: la 0 con 9.5.6 y 9.5.8 cambiadas (una raíz BTML, como la lee el lector). */
function epocaCon({ sitios, pesos } = {}) {
  const raiz = copia(EPOCA_0_BTML.registro);
  if (sitios !== undefined) raiz[9][5][6] = sitios;
  if (pesos !== undefined) raiz[9][5][8] = pesos;
  return raiz;
}

/** La tabla de sitios del archivo con un cambio en sus filas (por el pv de cada fila). */
function sitiosCon(cambiar) {
  const t = copia(SITIOS);
  cambiar(t[1], (pv) => t[1].find((f) => f[0][0] === pv));
  return t;
}

/** Una tabla «lens» con estas claves y valores (lo que no dice, lo dice la capa siguiente). */
const pesosCon = (pares) => [['lens'], ['-'], ['-'], pares.map(([k]) => k), pares.map(([, v]) => v)];

test('el archivo de la lente: lente-0.js está al día con lente-0.json y la época 0 aún no trae ninguna de las dos posiciones', () => {
  assert.equal(readFileSync(new URL('../datos/lente/lente-0.js', import.meta.url), 'utf8'), generar(), 'regenera con: node datos/lente/generar.mjs');
  assert.equal(EPOCA_0_BTML.registro[9][5][6], undefined, 'la pasada única por la 0 aún no se ha hecho');
  assert.equal(EPOCA_0_BTML.registro[9][5][8], undefined);
});

test('sin libro, el lector da exactamente la FOTO de la carta de hoy, y la da el archivo', () => {
  const s = C.sitios(null);
  assert.deepEqual(soloSitios(s), FOTO_SITIOS);
  assert.equal(s.de, CAPAS.archivo);
  assert.deepEqual(s.descartadas, []);
  const p = C.pesos(null);
  assert.deepEqual(soloPesos(p), FOTO_PESOS);
  assert.ok(Object.values(p.de).every((c) => c === CAPAS.archivo));
  assert.deepEqual(p.descartadas, []);
  // Con la época 0 dicha a mano, lo mismo; y es lo mismo de una llamada a otra (congelado y guardado).
  assert.deepEqual(soloSitios(C.sitios(null, { epoca: EPOCA_0_BTML })), FOTO_SITIOS);
  assert.equal(C.sitios(null), s);
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.geometria[1].celda) && Object.isFrozen(p.botones));
});

test('un libro con otra tabla válida la da: los sitios enteros, y los pesos solo en las claves que dice', () => {
  const otra = sitiosCon((filas, fila) => {
    // El 1 y el 2 cambian de esquina (y de lado); el 0 pasa a ser el reverso y el 5 el anverso; sin hilo.
    fila(1)[1] = [0, 2]; fila(1)[4] = [2];
    fila(2)[1] = [0, 0]; fila(2)[4] = [1];
    fila(0)[4][0] = 'back'; fila(5)[4][0] = 'front';
    fila(6)[3] = ['side']; fila(6)[4] = [1];
    fila(7)[3] = ['side']; fila(7)[4] = [2];
  });
  const epoca = epocaCon({ sitios: otra, pesos: pesosCon([['buttons card', 2], ['rosette order', 9], ...[8, 7, 6, 5, 4, 3, 2, 1, 0].map((d) => ['rosette order', d]), ['open at start size', 'slot']]) });
  const s = C.sitios(null, { epoca });
  assert.equal(s.de, CAPAS.libro);
  assert.deepEqual(s.geometria[1], { grupo: 'x', lado: 2, fila: 'arriba', celda: [0, 2] });
  assert.deepEqual(s.geometria[2], { grupo: 'x', lado: 1, fila: 'arriba', celda: [0, 0] });
  assert.deepEqual(s.centros, [5, 0], 'el anverso primero');
  assert.equal(s.geometria[5].cara, 'anverso');
  assert.deepEqual(s.hilo, { pasado: null, futuro: null });
  const p = C.pesos(null, { epoca });
  assert.equal(p.botones.tarjeta, 2);
  assert.deepEqual(p.rosetones, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(p.alEmpezar, { pv: 9, tamano: 1 });
  assert.equal(p.de['buttons card'], CAPAS.libro);
  assert.equal(p.de['buttons screen'], CAPAS.archivo, 'lo que el libro no dice, lo dice el archivo');
  assert.deepEqual({ ...p.botones, tarjeta: 1 }, FOTO.botones);
});

test('una tabla de sitios hostil o incompleta cae ENTERA a la capa siguiente, con su motivo, y nunca lanza', () => {
  const hostiles = {
    'celdas repetidas': sitiosCon((_, fila) => { fila(2)[1] = [0, 0]; }),
    'un PV que falta': sitiosCon((filas) => { filas.splice(3, 1); }),
    'un PV repetido': sitiosCon((filas, fila) => { filas[3] = copia(fila(1)); }),
    'una celda fuera del 3×3': sitiosCon((_, fila) => { fila(1)[1] = [3, 0]; }),
    'una celda negativa': sitiosCon((_, fila) => { fila(4)[1] = [-1, 2]; }),
    'una celda de texto': sitiosCon((_, fila) => { fila(1)[1] = ['a', 'b']; }),
    'un lateral en el centro': sitiosCon((_, fila) => { fila(8)[1] = [1, 1]; }),
    'el 0 fuera del centro': sitiosCon((_, fila) => { fila(0)[1] = [0, 1]; }),
    'dos anversos': sitiosCon((_, fila) => { fila(5)[4][0] = 'front'; }),
    'una cara rara': sitiosCon((_, fila) => { fila(0)[4][0] = 'top'; }),
    'una cara fuera del centro': sitiosCon((_, fila) => { fila(1)[3] = ['side', 'face']; fila(1)[4] = [1, 'front']; }),
    'un lado fuera de rango': sitiosCon((_, fila) => { fila(1)[4] = [3]; }),
    'un lado de texto': sitiosCon((_, fila) => { fila(1)[4] = ['1']; }),
    'sin lado': sitiosCon((_, fila) => { fila(9)[3] = []; fila(9)[4] = []; }),
    'una clave desconocida': sitiosCon((_, fila) => { fila(1)[3] = ['side', 'z-index']; fila(1)[4] = [1, 999]; }),
    'una clave repetida': sitiosCon((_, fila) => { fila(1)[3] = ['side', 'side']; fila(1)[4] = [1, 2]; }),
    'claves y valores sin par': sitiosCon((_, fila) => { fila(1)[4] = [1, 2]; }),
    'dos pasados': sitiosCon((_, fila) => { fila(7)[4] = [2, 'past']; }),
    'el tiempo en el centro': sitiosCon((_, fila) => { fila(0)[3].push('time'); fila(0)[4].push('past'); fila(6)[3] = ['side']; fila(6)[4] = [1]; }),
    'un borde fuera de rango': sitiosCon((_, fila) => { fila(0)[4][2] = 7; }),
    'medio borde': sitiosCon((_, fila) => { fila(5)[3] = ['face', 'side', 'edge row']; fila(5)[4] = ['back', 0, 2]; }),
    'once filas': sitiosCon((filas) => { filas.push([[3], [2, 0], ['-'], ['side'], [1]]); }),
    'otra cabecera': (() => { const t = copia(SITIOS); t[0] = ['hola']; return t; })(),
    'filas que no son una lista': [['places'], 'nada'],
    'una fila que no es una lista': sitiosCon((filas) => { filas[4] = 7; }),
    'un texto': 'hola',
    'un número': 42,
    'null': null,
    'un objeto': { a: 1 },
  };
  for (const [que, tabla] of Object.entries(hostiles)) {
    let s;
    assert.doesNotThrow(() => { s = C.sitios(null, { epoca: epocaCon({ sitios: tabla }) }); }, que);
    assert.equal(s.de, CAPAS.archivo, que + ': cae al archivo');
    assert.deepEqual(soloSitios(s), FOTO_SITIOS, que + ': entera, la del archivo');
    if (tabla !== null) assert.equal(s.descartadas.length, 1, que + ': con su motivo');
    assert.equal(s.descartadas[0]?.capa ?? CAPAS.libro, CAPAS.libro, que);
  }
});

test('las capas de los sitios van en su orden: el libro, la época 0 y el archivo; si ninguna vale, nada y sin lanzar', () => {
  const valida = sitiosCon((_, fila) => { fila(8)[4] = [1]; });
  const mala = sitiosCon((_, fila) => { fila(8)[1] = [0, 0]; });
  const r = sitiosDe([{ capa: CAPAS.libro, tabla: mala }, { capa: CAPAS.epoca0, tabla: valida }, { capa: CAPAS.archivo, tabla: SITIOS }]);
  assert.equal(r.de, CAPAS.epoca0);
  assert.equal(r.geometria[8].lado, 1);
  assert.deepEqual(r.descartadas.map((d) => d.capa), [CAPAS.libro]);
  assert.equal(sitiosDe([{ capa: CAPAS.libro, tabla: undefined }, { capa: CAPAS.epoca0, tabla: SITIOS }]).de, CAPAS.epoca0, 'lo que no está no se descarta: se salta');
  const nada = sitiosDe([{ capa: CAPAS.libro, tabla: mala }]);
  assert.equal(nada.de, null);
  assert.deepEqual([nada.centros, nada.laterales, nada.geometria], [[], [], {}]);
});

test('los pesos hostiles caen a la capa siguiente clave a clave: tipos raros, fuera de rango, órdenes que esconden un PV; las claves desconocidas se ignoran', () => {
  const sinElUno = [2, 0, 3, 4, 6, 7, 5, 8, 9];
  const conRepetido = [1, 1, 0, 3, 4, 6, 7, 5, 8, 9];
  const tabla = pesosCon([
    ['buttons slot', -1], ['buttons card', 1.5], ['buttons screen', '3'], ['buttons open', 'todas'], ['next steps in rows', 1000000],
    ...sinElUno.map((d) => ['rosette order', d]),
    ...conRepetido.map((d) => ['sequenced order', d]),
    ['top strip', 1], ['top strip', 1],
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 10].map((d) => ['highlight search', d]),
    ['proposers shown', 100000], ['executions in cell', null], ['executions in open cell', [1]], ['series in footer', 4], ['series in footer', 5],
    ['open at start', 10], ['open at start size', 'screen'],
    ['z-index', 999], ['position', 'fixed'],
  ]);
  let p;
  assert.doesNotThrow(() => { p = C.pesos(null, { epoca: epocaCon({ pesos: tabla }) }); });
  assert.deepEqual(soloPesos(p), FOTO_PESOS, 'todo lo hostil cae al archivo');
  assert.ok(Object.values(p.de).every((c) => c === CAPAS.archivo));
  const motivos = Object.fromEntries(p.descartadas.filter((d) => d.clave).map((d) => [d.clave, d.motivo]));
  for (const k of ['buttons slot', 'buttons card', 'buttons screen', 'buttons open', 'next steps in rows', 'rosette order', 'sequenced order', 'top strip', 'highlight search', 'proposers shown', 'executions in cell', 'series in footer', 'open at start', 'open at start size']) {
    assert.equal(motivos[k], 'valor fuera de lo que vale', k);
  }
  assert.equal(motivos['z-index'], 'clave desconocida');
  assert.equal(motivos.position, 'clave desconocida');
  // Una clave desconocida no tumba a las buenas de la misma capa.
  const mezcla = C.pesos(null, { epoca: epocaCon({ pesos: pesosCon([['z-index', 9], ['buttons screen', 5], ['open at start size', 'card']]) }) });
  assert.equal(mezcla.botones.bloque, 5);
  assert.equal(mezcla.de['buttons screen'], CAPAS.libro);
  assert.deepEqual(mezcla.alEmpezar, { pv: 9, tamano: 2 });
  // Una tabla que no se puede leer entera (sin par, otra cabecera, basura) cae entera, sin lanzar.
  for (const mala of [[['lens'], '-', '-', ['buttons card'], [1, 2]], [['otra'], '-', '-', ['buttons card'], [2]], 'hola', 7, null, {}]) {
    let q;
    assert.doesNotThrow(() => { q = C.pesos(null, { epoca: epocaCon({ pesos: mala }) }); });
    assert.deepEqual(soloPesos(q), FOTO_PESOS);
  }
  // Una época que no es una época, o un eje roto: el archivo, sin lanzar.
  for (const epoca of [42, 'x', {}, [], null]) assert.deepEqual(soloPesos(C.pesos(null, { epoca })), FOTO_PESOS);
  const roto = { epoca() { throw new Error('roto'); } };
  assert.deepEqual(soloSitios(C.sitios(roto)), FOTO_SITIOS);
  assert.deepEqual(soloPesos(C.pesos(roto)), FOTO_PESOS);
});

test('el hueco de la preferencia: pisa al libro clave a clave, solo en pesos y órdenes de la persona; lo demás es del libro', () => {
  const epoca = epocaCon({ pesos: pesosCon([['buttons card', 2], ['proposers shown', 7]]) });
  const p = C.pesos(null, {
    epoca,
    preferencia: { 'buttons card': 4, 'rosette order': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'proposers shown': 1, 'highlight search': [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], 'buttons screen': -2 },
  });
  assert.equal(p.botones.tarjeta, 4);
  assert.equal(p.de['buttons card'], CAPAS.preferencia);
  assert.deepEqual(p.rosetones, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(p.proponenALaVista, 7, 'las cuentas de listas son del libro');
  assert.deepEqual(p.buscarDestacado, FOTO.buscarDestacado, 'la búsqueda del destacado es del libro');
  assert.equal(p.botones.bloque, 3, 'un valor malo de la preferencia cae a la capa siguiente');
  const motivos = p.descartadas.filter((d) => d.capa === CAPAS.preferencia).map((d) => d.clave + ': ' + d.motivo).sort();
  assert.deepEqual(motivos, ['buttons screen: valor fuera de lo que vale', 'highlight search: la dice el libro, no la persona', 'proposers shown: la dice el libro, no la persona']);
  // Sin preferencia, lo de siempre (y la preferencia no se queda guardada).
  assert.equal(C.pesos(null, { epoca }).botones.tarjeta, 2);
  // Una preferencia que no es un objeto no dice nada.
  for (const preferencia of ['x', 3, [1, 2], null]) assert.deepEqual(soloPesos(C.pesos(null, { preferencia })), FOTO_PESOS);
  // El núcleo puro, con las cuatro capas en su orden.
  const r = pesosDe([
    { capa: CAPAS.preferencia, dice: { 'buttons slot': [1] }, persona: true },
    { capa: CAPAS.libro, tabla: pesosCon([['buttons slot', 2], ['buttons card', 2]]) },
    { capa: CAPAS.epoca0, tabla: pesosCon([['buttons card', 3], ['buttons screen', 4]]) },
    { capa: CAPAS.archivo, tabla: PESOS },
  ]);
  assert.deepEqual([r.botones.comprimido, r.botones.tarjeta, r.botones.bloque, r.botones.abierto], [1, 2, 4, 'todas']);
  assert.deepEqual([r.de['buttons slot'], r.de['buttons card'], r.de['buttons screen'], r.de['buttons open']], [CAPAS.preferencia, CAPAS.libro, CAPAS.epoca0, CAPAS.archivo]);
});
