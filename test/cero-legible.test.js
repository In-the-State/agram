// El 0 de un registro escrito por una acción, en el idioma de quien lee (contrato.ceroLegible; Core AGRAM 19-11): se
// reconoce por su FORMA (los trozos fijos del canónico de la plantilla, en su orden) y no volviendo a calcularlo con el libro
// de hoy, que no siempre da lo mismo que al escribir (it era otro registro, o el libro estaba a medias). Los seis casos del
// barrido de pantalla, sobre los ejemplos de la compra, del nodo de la state y de un alta nueva. Y lo que usará el camino:
// contrato.mensajeEnLlano (el mensaje de una candidata, con sus huecos legibles) y contrato.textoDeFila (el texto de una fila
// de lo que falta).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/contrato.js';
import * as A from '../src/acciones.js';
import { pasosDeLasReglas } from '../src/motor.js';
import { generarClaves } from '../src/autoridad.js';
import { EJEMPLOS } from '../carta/ejemplos.js';
import * as compraFood from '../ejemplos/ikisai/compra-food.mjs';
import { ejemploNodo } from '../ejemplos/state/nodo.mjs';

const almacen = new Map();
globalThis.localStorage ??= { getItem: (k) => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: (k) => almacen.delete(k) };
const Q = await import('../carta/cuentas.js');

const ES = { idioma: 'es' };
let compra;
let nodo;
before(async () => {
  const claves = {};
  for (const n of ['casa', 'cocina', 'huesped']) claves[n] = await generarClaves();
  compra = (await EJEMPLOS[0].crear(compraFood, claves)).eje;
  nodo = (await ejemploNodo()).eje;
});

/** Los registros del eje cuyo 4 nombra la acción `nombre`. */
const deLaAccion = (eje, nombre) => eje.orden.map((id) => eje.obtener(id)).filter((ev) => Array.isArray(ev.payload) && [].concat(ev.payload[4] ?? []).includes(nombre));
const INGLES = /^(pay|attach a file|put in service|declare agent|a reserve|open a conversation): /;

test('los seis del barrido: el 0 que escribió la acción se recompone en español, también cuando releerlo hoy no da lo mismo', async () => {
  // «pay» ancla en el anuncio, no en la compra sobre la que se lanzó: releído con it = el anuncio, su hueco salía vacío.
  const [pago] = deLaAccion(compra, 'pay');
  assert.match(pago.payload[0], /^pay: huesped pays what was announced in Compra del menú del día$/);
  assert.deepEqual(C.ceroLegible(compra, pago.id, ES), { texto: 'Alta de huesped paga lo anunciado en Compra del menú del día', plantilla: 'pay', compuesto: true });
  // Los del nodo de la state.
  const casos = { 'put in service': /pone nodo-ejemplo en servicio$/, 'declare agent': /declara agente a /, 'a reserve': / reserva para /, 'open a conversation': / abre una conversación con agente-casa$/ };
  for (const [nombre, re] of Object.entries(casos)) {
    const escritos = deLaAccion(nodo, nombre).filter((ev) => typeof ev.payload[0] === 'string' && ev.payload[0].startsWith(nombre + ': '));
    assert.ok(escritos.length > 0, nombre);
    for (const ev of escritos) {
      const r = C.ceroLegible(nodo, ev.id, ES);
      assert.equal(r.compuesto, true, nombre + ': ' + ev.payload[0]);
      assert.match(r.texto, re, nombre);
      assert.doesNotMatch(r.texto, INGLES, nombre);
      assert.doesNotMatch(r.texto, / opens | reserves | declares | puts /, 'sin inglés dentro: ' + r.texto);
    }
  }
  // «a reserve» sobre una conversación cuyo 0 también escribió una acción: los dos, en español.
  const anidado = deLaAccion(nodo, 'a reserve').find((ev) => /on open a conversation: /.test(ev.payload[0]));
  assert.equal(C.ceroLegible(nodo, anidado.id, ES).texto, 'Alta de servicio-telegram reserva para agente-casa en Alta de servicio-telegram abre una conversación con agente-casa');
  // El HTML inicial del alta: «attach a file: … to ∅» (al escribirlo, el alta aún no estaba); hoy se dice con su nombre.
  const c = await Q.crearCuenta({ nombre: 'Ana Prueba', idioma: 'es', htmlInicial: true });
  const [adjunto] = deLaAccion(c.eje, 'attach a file');
  assert.match(adjunto.payload[0], / to ∅$/);
  assert.equal(C.ceroLegible(c.eje, adjunto.id, ES).texto, 'Ana Prueba adjunta un archivo a Ana Prueba');
});

test('lo que no escribió el canónico se queda tal cual: un 0 escrito a mano no se recompone', () => {
  const [nota] = deLaAccion(compra, 'anchor here');
  assert.deepEqual(C.ceroLegible(compra, nota.id, ES), { texto: 'Nota de la huésped', plantilla: 'anchor here', compuesto: false });
  for (const ev of deLaAccion(nodo, 'open a conversation').filter((x) => Array.isArray(x.payload[0]))) {
    assert.equal(C.ceroLegible(nodo, ev.id, ES).compuesto, false, 'el título de una conversación es suyo');
  }
  // En inglés, el canónico sin el nombre de la plantilla delante (#83).
  const [pago] = deLaAccion(compra, 'pay');
  const en = C.ceroLegible(compra, pago.id).texto;
  assert.match(en, / pays what was announced in Compra del menú del día$/);
  assert.doesNotMatch(en, /^pay: /);
});

test('mensajeEnLlano: el mensaje de una candidata con sus huecos legibles (un registro por su 0 en el idioma, no por el 0 en inglés)', () => {
  const plantilla = A.plantillaDeTransaccion('a reserve', { epoca: nodo.epoca() });
  const conv = nodo.orden.map((id) => nodo.obtener(id)).find((e) => typeof e.payload?.[0] === 'string' && e.payload[0].startsWith('open a conversation: servicio-telegram'));
  const candidata = { autor: 'servicio-telegram', sobre: conv.id, en: '0000000000', t: conv.t, movimientos: [], payload: [] };
  const es = C.mensajeEnLlano(nodo, plantilla, { candidata, X: conv.id, me: 'servicio-telegram', ...ES });
  assert.equal(es, 'Alta de servicio-telegram reserva para nadie en Alta de servicio-telegram abre una conversación con agente-casa');
  assert.doesNotMatch(es, /opens a conversation/);
});

test('textoDeFila: el texto de una fila de lo que falta que es el 0 de su registro, en el idioma (el «ask for an anchor» del camino)', () => {
  let fila = null;
  for (const id of nodo.orden) {
    fila = pasosDeLasReglas(nodo, id, { epoca: nodo.epoca() }).filas.find((f) => /^ask for an anchor: /.test(f.texto ?? ''));
    if (fila) break;
  }
  assert.ok(fila, 'el nodo tiene una fila con el 0 de «ask for an anchor»');
  assert.equal(C.textoDeFila(nodo, fila, ES), 'Alta de nodo-vecino devuelve 1 R a Alta de operador y le pide anclar una cabecera de lote');
  // Un texto que no es el 0 de su registro, tal cual.
  assert.equal(C.textoDeFila(nodo, { ...fila, texto: 'otra cosa' }, ES), 'otra cosa');
});
