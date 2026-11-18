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
