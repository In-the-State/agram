// Los textos en jerga o sin traducir del repaso de pantalla (19-11), sin navegador: con arbol, formulario y acciones sobre
// el ejemplo del navegador (la compra) y sobre un alta nueva. Lo que es de la carta se arregla en la carta (textos.js, los
// textos en llano de carta.js, el nombre al crear la cuenta); lo que es dato de la época se apunta para la pasada única.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { arbol, formulario, ceroDe } from '../carta/carta.js';
import { t } from '../carta/textos.js';
import * as A from '../src/acciones.js';
import * as compraFood from '../ejemplos/ikisai/compra-food.mjs';
import { EJEMPLOS } from '../carta/ejemplos.js';
import { generarClaves } from '../src/autoridad.js';
import { salida, contrato } from '../src/index.js';

const almacen = new Map();
globalThis.localStorage ??= { getItem: (k) => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: (k) => almacen.delete(k) };
const Q = await import('../carta/cuentas.js');

const ES = { idioma: 'es' };
let compra;
before(async () => {
  const claves = {};
  for (const n of ['casa', 'cocina', 'huesped']) claves[n] = await generarClaves();
  const { eje, foco } = await EJEMPLOS[0].crear(compraFood, claves);
  compra = { eje, foco, yo: 'huesped' };
});

/** El formulario de la acción `nombre` que se ofrece sobre X a yo (en cualquier punto de vista). */
function formDe({ eje, foco, yo }, nombre) {
  for (let k = 0; k <= 9; k++) {
    const a = A.acciones(eje, foco, k, yo).find((x) => x.nombre === nombre);
    if (a) return formulario(eje, foco, a.id, yo, {}, ES);
  }
  return null;
}
const marcas = /\[\[|\]\]|\[ref\b|\{ref\b/;

test('1. el desplegable de «comprometer P»: los registros que escribió una plantilla, por su 0 en el idioma, no por el mensaje en inglés', () => {
  const f = formDe(compra, 'commit P');
  const textos = f.campos.flatMap((c) => (c.opciones ?? []).map((o) => o.texto));
  assert.ok(textos.length > 5);
  // El registro que escribió «commit P» se lee «… compromete …», no «commit P: huesped commits …».
  assert.ok(textos.some((x) => /compromete/.test(x)), JSON.stringify(textos));
  assert.ok(!textos.some((x) => /^P sobre commit P: |commits \d+ P|declare capacity or threshold:|locks \d+ E/.test(x)), JSON.stringify(textos));
});

test('1. una lista de registros (el legible de un campo) y una décupla guardada como texto: sin el inglés de la plantilla ni marcas en crudo', () => {
  const agregar = formDe(compra, 'aggregate T');
  assert.ok(!agregar.campos.some((c) => /declare capacity or threshold:/.test(c.legible ?? '')));
  const proponer = formDe(compra, 'propose');
  assert.ok(!proponer.campos.some((c) => (c.opciones ?? []).some((o) => marcas.test(o.texto))));
});

test('2. al crear la cuenta, el nombre se pide en llano: ni «representación» ni la ayuda «PV0: la lente libre…»', () => {
  const [nombre] = Q.camposDelAlta(ES);
  assert.equal(nombre.etiqueta, t('altaNombre'));
  assert.equal(nombre.ayuda, t('altaNombreAyuda'));
  assert.doesNotMatch(nombre.etiqueta + ' ' + nombre.ayuda, /PV ?\d|representación|lente/);
  assert.doesNotMatch(t('crearAyuda'), /el 0 de tu alta|su 5/);
});

test('3. en un alta nueva, ningún marcador lleva una marca en crudo («compra 1 = [[ref menú:1]…»)', async () => {
  const c = await Q.crearCuenta({ nombre: 'Ana Prueba', idioma: 'es' });
  const a = await arbol({ foco: c.cuenta.alta, niveles: {} }, c.eje, c.cuenta.identidad, {}, ES);
  const marcadores = (a.centro.campos ?? []).flatMap((x) => x.marcador ?? []);
  assert.ok(!marcadores.some((m) => typeof m === 'string' && marcas.test(m)), JSON.stringify(marcadores));
});

test('4. el motivo del botón de ejecutar apagado, en llano: sin rangos en cifras («0.3», «3.1»)', () => {
  for (const clave of ['ejecutarApagado', 'ejecutarApagadoSinRango']) {
    // La marca llega por su nombre (contrato.botonDeEjecutar: marca.nombre), nunca en cifras.
    const texto = t(clave, { nombre: 'idea', marca: 'aprendizaje profesional' });
    assert.ok(texto.includes('«aprendizaje profesional»'), 'dice el nivel que lo marca');
    assert.doesNotMatch(texto, /\d\.\d|rango|se marca/);
  }
  for (const estado of ['apagado', 'marcado', 'efectos']) assert.doesNotMatch(t('botonEjecutar_' + estado, { rango: '0.3' }), /\d\.\d|rango/);
});

test('4. de dónde sale la destacada «entregar»: el primer paso mío del camino (el criterio de cerrado de la compra), aunque el registro esté en «idea»', async () => {
  const { eje, foco, yo } = compra;
  const camino = await A.camino(eje, foco, yo, { ...ES, epoca: eje.epoca() });
  const paso = camino.pasos.find((p) => p.hacer && !p.espera && !p.hecho);
  assert.equal(paso.hacer.plantilla, 'deliver');
  assert.equal(contrato.botonDeEjecutar(eje, foco).nombre, 'idea');
  assert.equal(contrato.botonDeEjecutar(eje, foco).pulsable, true, 'el botón apagado no impide nada: se puede hacer');
});

test('5. un 0 nuevo cambia el nombre que se enseña', { todo: true }, async () => {
  const c = await Q.crearCuenta({ nombre: 'Ana Prueba', idioma: 'es' });
  const X = c.cuenta.alta;
  await salida.escribirDesde(c.eje, { modo: 'pointed', autor: c.cuenta.identidad, sobre: X, en: '0000000000', payload: salida.desdePointed(c.eje, 'Ana Nueva'), t: new Date(Date.now() + 1000).toISOString() }, c.privada);
  assert.equal(ceroDe(c.eje, X, ES), 'Ana Nueva');
});

test('3. ni los ejemplos de la regla corta como marcador (notas en español de quien escribió la época), en español ni en inglés', async () => {
  for (const idioma of ['es', 'en']) {
    const c = await Q.crearCuenta({ nombre: 'Ana Prueba', idioma });
    const a = await arbol({ foco: c.cuenta.alta, niveles: {} }, c.eje, c.cuenta.identidad, {}, { idioma });
    const marcadores = (a.centro.campos ?? []).flatMap((x) => x.marcador ?? []);
    const ejemplos = (a.centro.campos ?? []).flatMap((x) => contrato.marcador(null, { payload: [] }, x.pv, { idioma }));
    assert.ok(ejemplos.length > 0, 'la regla corta trae ejemplos');
    assert.deepEqual(marcadores.filter((m) => ejemplos.includes(m)), [], idioma);
  }
});
