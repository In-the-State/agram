// Lo que la lente sabe de unas acciones por dato provisional (src/lente-provisional.js; docs/notas/SITIOS_Y_PESOS.md §11):
// las de «Ajustes de este elemento» y lo que va antes y después de una acción. Las acciones que nombra el dato existen en
// alguna época (la 0 o la hija que las define), y la carta no las nombra (test/lente-limpia.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/contrato.js';
import { nombresDePlantillas } from './ayudas-lente.mjs';

test('las acciones de «Ajustes de este elemento» salen del dato, una por ajuste, y todas son acciones de la época 0', () => {
  const a = C.accionesDeAjuste();
  assert.deepEqual(Object.keys(a).sort(), ['clase', 'defecto', 'minimo', 'padre', 'precio', 'quitarPadre', 'rango']);
  const nombres = nombresDePlantillas();
  for (const [que, nombre] of Object.entries(a)) assert.ok(typeof nombre === 'string' && nombres.has(nombre), que + ': «' + nombre + '» es una acción de una época');
  assert.ok(Object.isFrozen(a));
});

test('lo que va antes y después: los mensajes piden una reserva antes; registrar una cosa lleva después adjuntar su HTML; lo demás, nada', () => {
  const nombres = nombresDePlantillas();
  for (const m of ['message in', 'message in from an agent', 'message out']) {
    assert.ok(nombres.has(m), m + ' es una acción de una época');
    assert.deepEqual(C.antesDe(m), ['a reserve']);
    assert.deepEqual(C.despuesDe(m), []);
  }
  assert.ok(nombres.has('a reserve'));
  assert.deepEqual(C.despuesDe('register a thing'), ['attach a file']);
  assert.deepEqual(C.antesDe('register a thing'), []);
  for (const otra of ['pay', 'close', '', null, undefined, 42]) {
    assert.deepEqual(C.antesDe(otra), []);
    assert.deepEqual(C.despuesDe(otra), []);
  }
});

test('los nombres de los hitos son dato en los dos idiomas: el núcleo los da en el idioma que se pide (sin idioma, en español, como antes)', async () => {
  const { HITOS } = await import('../src/bases.js');
  assert.deepEqual(C.nivelesDeLosHitos(), ['0.3', '1.1', '2.1', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '5.3']);
  assert.deepEqual(HITOS.map((h) => h.nivel), C.nivelesDeLosHitos(), 'src/bases.js lee los niveles del dato');
  assert.deepEqual(HITOS.map((h) => h.nombre), ['idea', 'aprendizaje', 'avanzado', 'aprendizaje profesional', 'resolución profesional', 'aprendizaje superior', 'solución profesional avanzada', 'investigación', 'trabajo maestro', 'resolución experimental muy avanzada']);
  assert.deepEqual(C.nivelesDeLosHitos().map((n) => C.nombreDelHito(n, 'en')), ['idea', 'learning', 'advanced', 'professional learning', 'professional resolution', 'higher learning', 'advanced professional solution', 'research', 'master work', 'very advanced experimental resolution']);
  assert.equal(C.nombreDelHito('3.1', 'fr'), 'professional learning', 'un idioma sin nombres: el canónico, el inglés');
  assert.equal(C.nombreDelHito('9.9', 'es'), null);
  assert.deepEqual(C.escalera({ idioma: 'en' }).map((p) => p.nombre), C.nivelesDeLosHitos().map((n) => C.nombreDelHito(n, 'en')));
  assert.equal(C.botonDeEjecutar(null, 'x', { idioma: 'en' }).marca.nombre, 'professional learning');
  assert.equal(C.botonDeEjecutar(null, 'x', { idioma: 'es' }).marca.nombre, 'aprendizaje profesional');
});

test('la carta en inglés dice los hitos en inglés (el cielo del 8 y el camino del 9), y en español, en español', async () => {
  const { arbol, medidasDePantalla } = await import('../carta/carta.js');
  const { html } = await import('../carta/dom.js');
  const { ejemploCompra } = await import('../ejemplos/ikisai/compra-food.mjs');
  const { eje, compra } = await ejemploCompra();
  const pinta = async (pv, idioma) => html(await arbol({ foco: { X: compra.id, pv } }, eje, 'huesped', medidasDePantalla(1200, 800), { t: '2026-11-08T10:00:00Z', idioma }));
  for (const pv of [8, 9]) {
    const en = await pinta(pv, 'en');
    const es = await pinta(pv, 'es');
    assert.ok(en.includes('professional learning') && !en.includes('aprendizaje profesional'), 'en inglés, el ' + pv);
    assert.ok(es.includes('aprendizaje profesional') && !es.includes('professional learning'), 'en español, el ' + pv);
  }
});

test("el sí del dueño: la acción y la lectura con nombre «who has the owner's yes» son dato, y la lectura tiene el molde de una regla de lectura", async () => {
  const { nombreDeRegla } = await import('../src/bqlm.js');
  const d = C.datosDelSiDelDueno();
  assert.ok(nombresDePlantillas().has(d.accion), 'la acción es de una época');
  const r = C.lecturaDeLaLente("who has the owner's yes");
  assert.ok(r, 'la lectura, por su nombre');
  assert.equal(d.lectura, r[2][0]);
  assert.ok(d.lectura.startsWith('=') && d.lectura.includes('"' + d.accion + '"'), 'la acción va en la fórmula, no en la lente');
  assert.equal(nombreDeRegla(r), "who has the owner's yes");
  assert.equal(r[4][0], 'read');
  assert.equal(C.lecturaDeLaLente('no existe'), null);
});

test('el destino del gesto «drop a person in a box» es dato: la acción y sus parámetros existen, y salen de lo que el gesto da', async () => {
  const A = await import('../src/acciones.js');
  const d = C.destinoDeGesto('drop a person in a box');
  assert.equal(d.vista, 3);
  assert.equal(d.sobre, 'the alta of the person');
  const p = A.plantillasDeTransaccion({}).find((x) => x.nombre === d.accion);
  assert.ok(p, 'la acción es de la época 0');
  const nombres = A.parametros(p.plantilla, {}).map((x) => x.nombre);
  for (const [nombre, de] of Object.entries(d.parametros)) {
    assert.ok(nombres.includes(nombre), 'el parámetro ' + nombre + ' es de la acción');
    assert.ok(['person', 'box'].includes(de), 'lo da el gesto: ' + de);
  }
  assert.equal(C.destinoDeGesto('no existe'), null);
});
