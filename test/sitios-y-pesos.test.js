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
import { ejemploCompra, ejemploJardinYParque, ejemploFabrica } from '../ejemplos/ikisai/compra-food.mjs';
import { ejemploCuentaBanco } from '../ejemplos/ikisai/cuenta-banco.mjs';
import { pagaElCoste } from './ayudas-coste.js';
import { FOTO } from './ayudas-sitios.mjs';
import { EPOCA_0_BTML, cargarEpocaBtml, REGISTROS_DE_MODELOS } from '../src/epocas.js';
import { EPOCA_0_BTML_DATOS, REGLAS_DE_EPOCA_DATOS, PLANTILLAS_DE_EPOCA_DATOS } from '../datos/epocas/epocas.js';
import { LENTE_0_DATOS } from '../datos/lente/lente-0.js';

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
  ['dom.js', 'const ARRIBA ='],
  ['dom.js', 'ordenCruz'],
  ['app.js', 'LATERALES.indexOf(pv)'],
  ['carta.js', 'export const GEOMETRIA = Object.freeze({'],
  ['carta.js', 'const esPvDelPasado = (pv) => GEOMETRIA'],
  ['carta.js', 'const zonaDelHilo = (pv) => (GEOMETRIA'],
  ['carta.js', 'Object.keys(GEOMETRIA)'],
  ['app.js', 'GEOMETRIA'], ['app.js', 'CENTROS'], ['app.js', 'LATERALES'], ['dom.js', 'GEOMETRIA'], ['dom.js', 'LATERALES'],
  // El anverso de la lente, no el dígito 0: los estados iniciales y los irA de app.js.
  ['app.js', 'pv: 0 }'], ['app.js', 'function irA(X, pv = 0)'], ['app.js', 'irA(X, 0)'], ['app.js', 'irA(otro, 0)'], ['app.js', 'irA(registro, 0)'],
];

test('la foto: la carta lee del dato (contrato.sitios y contrato.pesos), y las tablas que se fueron no vuelven', () => {
  for (const [archivo, texto] of YA_NO) assert.equal(fuente(archivo).includes(texto), false, 'carta/' + archivo + ' vuelve a tener «' + texto + '»');
  const p = C.pesos(null);
  assert.deepEqual([p.proponenALaVista, p.ejecucionesEnCelda, p.ejecucionesEnCeldaAbierta, p.seriesEnElPie], [FOTO.proponenALaVista, FOTO.ejecucionesEnCelda, FOTO.ejecucionesEnCeldaAbierta, FOTO.seriesEnElPie]);
  // Las que aún están en el código (el paso 2 en curso), por su línea.
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
  'html · inicial movil': 'aadc1a42e2efbf817b0af8e5',
  'html · inicial apaisado': 'c5cfa8dae458c14ffa7903f5',
  'html · inicial ordenador': '6843efd9b2cd54f9348a0541',
  'html · inicial grande': 'acb287fce2be3362271df159',
  'html · sequenced abre 1': '47d5bd2a3f04f8486996c013',
  'html · sequenced abre 2': '1d2a5ef8cf149abc3cd8fd36',
  'html · sequenced abre 3': '67eeddcb061abe9166da71fb',
  'html · sequenced abre 4': 'b6288c117c9531923290f7f6',
  'html · sequenced abre 8': '11ecac552fc064a77d588660',
  'html · sequenced abre 9': '28887a9a48f5202c94c387b0',
  'html · reverso movil': '45d3e63069a622b0ba478749',
  'html · reverso ordenador': 'b316bd0a8cc70c55ebf4c1e2',
  'html · mapped tope 1': 'a9d80c1107624fa3877e32fb',
  'html · mapped tope 2': '705a3bbfd8430172dabc6518',
  'html · mapped tope 3': 'd2fa854855f5235db280a3ef',
  'html · mapped tope 4': 'a470a530f4241dfcdeb0bb13',
  'html · mapped tope 6': '96d08925aa966990c43d113c',
  'html · mapped tope 7': 'c72533ee7ebec527f6cbe4f3',
  'html · mapped tope 8': '5507071f3cc97383d68fca74',
  'html · mapped tope 9': 'ea394dc76b1f85992cfec064',
  'html · completa 1': '294ade6103993081d3fe41be',
  'html · completa 2': 'da73f660e15a490055198df1',
  'html · completa 3': 'c6ec301885d22e49bff7eb62',
  'html · completa 4': '9d1bc8393ad91c861d905154',
  'html · completa 6': '87265bdb0d8e7c327e9fdad3',
  'html · completa 7': '25339c649a490f581d6d17d5',
  'html · completa 8': 'b1f5f7b29534dc23629c18a7',
  'html · completa 9': 'f271b48049a49a613bc40797',
  'html · todos +1 ordenador': '4db6278b57037c903b8d6d99',
  'html · todos +2 ordenador': 'bc7a1125644e00662f7c314c',
  'html · todos +1 apaisado': 'f529a1a93ee62f05a784a0e9',
  'html · todos +2 apaisado': 'fb2bda2bf2139c20ebcd9348',
  'html · completa 4 apaisado': '5656f0c74c5785d17fcfccb7',
  'html · mapped tope 1 grande': 'aaebf66e42ac7da71497f79d',
  'html · roseton 1 en 2 ordenador': '7d2089e220dfbbc50aaaf65a',
  'html · roseton 1 en 3 ordenador': 'f84b206492a925e2c91295b9',
  'html · roseton 9 en 3 ordenador': 'f81e7288e64f4497efa8fd2c',
  'html · aro movil': 'c82b025d8cd46d10cacbfbab',
  'html · aro ordenador': 'ef204f1e0223541b34310c2b',
  'otras · filas con paso: jardín, mapped tope 1': '9d1447582f0c18f2df050a61',
  'otras · matriz del 4: celdas cerradas': 'd2fa44ec9fdb2c478056b897',
  'otras · matriz del 4: la celda 4.4 abierta': 'ee8adf7e0aa159686afd941f',
  'otras · cuenta del banco: quién puede proponer': '3240598f5534703de4a5d04f',
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

test('lo muerto que se quitó: apilado, el árbol trae siempre su secuencia y nunca rosetones (sin tiras del móvil, sin franjas, sin «hermano» sobre un PV)', async () => {
  const { eje, compra } = await ejemploCompra();
  for (const [ancho, alto] of [PANTALLAS.movil, [360, 640], [500, 900]]) {
    for (const niveles of [{}, { 1: NIVEL.tarjeta }, { 9: NIVEL.bloque }]) {
      const a = await arbol({ foco: { X: compra.id, pv: 0 }, niveles, rosetones: { 1: 2, 9: 3 } }, eje, YO, medidasDePantalla(ancho, alto), { t: T });
      assert.equal(a.apilada, true);
      assert.ok(a.secuencia, 'apilado, con secuencia');
      assert.deepEqual(a.rosetones, [], 'apilado, sin rosetones');
    }
  }
});

test('un libro con otros sitios y pesos cambia la carta: la caja y el sitio del aro del 1, el hilo y el orden de Sequenced', async () => {
  const datos = JSON.parse(JSON.stringify(EPOCA_0_BTML_DATOS));
  const sitios = JSON.parse(JSON.stringify(LENTE_0_DATOS['epoch.9.5.6']));
  const fila = (pv) => sitios[1].find((f) => f[0][0] === pv);
  fila(1)[1] = [0, 2]; fila(1)[4] = [2]; // el 1 y el 2 cambian de esquina
  fila(2)[1] = [0, 0]; fila(2)[4] = [1];
  fila(6)[4] = [1, 'future']; fila(7)[4] = [2, 'past']; // y el pasado y el futuro, de lado
  datos[9][5][6] = sitios;
  datos[9][5][7] = ['una posición BTML no puede quedar vacía: 9.5.7, entre las dos, lleva su nota'];
  datos[9][5][8] = [['lens'], ['-'], ['-'], Array(10).fill('sequenced order'), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
  const epoca = cargarEpocaBtml(datos, { registros: [...REGLAS_DE_EPOCA_DATOS, ...REGISTROS_DE_MODELOS], plantillas: JSON.parse(JSON.stringify(PLANTILLAS_DE_EPOCA_DATOS)), id: EPOCA_0_BTML.id });
  const { eje, compra } = await ejemploCompra();
  const X = compra.id;
  const pinta = (estado, [ancho, alto], conEpoca) => arbol({ foco: { X, pv: 0 }, niveles: {}, rosetones: {}, ...estado }, eje, YO, medidasDePantalla(ancho, alto), { t: T, ...(conEpoca ? { epoca } : {}) });
  const tope = escalaDeTamanos().tope;
  for (const [con, columna] of [[false, 0], [true, 2]]) {
    const a = await pinta({ niveles: { 1: tope } }, PANTALLAS.ordenador, con);
    assert.deepEqual(a.laterales.find((n) => n.pv === 1).celda, [0, columna], 'el 1 en su esquina');
    assert.equal(a.laterales.find((n) => n.pv === 1).caja.x > 0.5, columna === 2, 'su caja, a ese lado');
    const aro = await pinta({ aro: { X, pv: null } }, PANTALLAS.ordenador, con);
    assert.deepEqual(aro.aro.huecos.find((h) => h.pv === 1).celda, [0, columna], 'el sitio del 1 en el aro');
    const m = await pinta({}, PANTALLAS.movil, con);
    assert.equal(m.secuencia.pasado?.pv, con ? 7 : 6, 'el pasado del hilo');
    const orden = m.secuencia.filas.map((x) => x.pv);
    assert.deepEqual(orden, [...orden].sort((p, q) => (con ? q - p : p - q)), 'el orden de Sequenced');
  }
});

test('las huellas: el reparto de Mapped, los toques de tamaño y las medidas de pantalla no cambian', () => {
  comparar('puras · ', huellasPuras());
});

test('las huellas: el HTML de la carta sobre el ejemplo de la compra no cambia (sobrio, reloj fijo)', async () => {
  comparar('html · ', await huellasDelHtml());
});

/**
 * Las vistas que el ejemplo de la compra solo no enseña, una por peso que si no quedaría sin foto: las filas con su
 * siguiente paso («next steps in rows»: el jardín y el parque dejan un «commit P» completo en el 2, que se ve en la
 * matriz), las ejecuciones de una celda del 4 cerrada y abierta («executions in cell», «executions in open cell»: la
 * fábrica con trece movimientos en hacer · T) y quién puede proponer pagos en una cuenta del banco («proposers shown»).
 */
async function huellasDeLasOtrasVistas() {
  const fuera = {};
  const tope = escalaDeTamanos().tope;
  const pinta = async (nombre, estado, eje, yo, [ancho, alto]) => { fuera[nombre] = sha(html(await arbol(estado, eje, yo, medidasDePantalla(ancho, alto), { t: T }))); };
  {
    const { eje, compra } = await ejemploCompra();
    await ejemploJardinYParque(eje, { compra });
    await pinta('filas con paso: jardín, mapped tope 1', { foco: { X: compra.id, pv: 0 }, niveles: { 1: tope }, rosetones: {} }, eje, YO, PANTALLAS.ordenador);
  }
  {
    const { eje, compra, ...c } = await ejemploCompra();
    await ejemploFabrica(eje, { compra, ...c });
    for (let k = 0; k < 12; k++) await eje.escribir({ autor: 'huesped', sobre: compra.id, en: '4100000000', t: '2026-11-07T17:' + String(k).padStart(2, '0') + ':00Z', movimientos: [pagaElCoste('huesped')], payload: [['T:hora'], [1], ['servir ' + k], [['huesped'], ['cocina']]] });
    await pinta('matriz del 4: celdas cerradas', { foco: { X: compra.id, pv: 4 } }, eje, YO, PANTALLAS.grande);
    await pinta('matriz del 4: la celda 4.4 abierta', { foco: { X: compra.id, pv: 4 }, celdaMatriz: { X: compra.id, celda: '4.4' } }, eje, YO, PANTALLAS.grande);
  }
  {
    const r = await ejemploCuentaBanco();
    await pinta('cuenta del banco: quién puede proponer', { foco: { X: r.cuenta.id, pv: 0 } }, r.eje, 'ana', PANTALLAS.ordenador);
  }
  return fuera;
}

test('las huellas: las vistas que la compra sola no enseña (filas con paso, la matriz del 4, la cuenta del banco) no cambian', async () => {
  comparar('otras · ', await huellasDeLasOtrasVistas());
});
