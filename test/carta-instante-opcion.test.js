// Un parámetro de instante con valores posibles (encargo del repaso de pantalla, 18-11): elegir la fecha de la lista
// dejaba vacío el input de fecha (datetime-local no admite la «Z»), y «comprometer tiempo» no se podía lanzar. El input
// recibe la fecha en su forma y lo que se firma sigue siendo el instante exacto de la opción (el crudo).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instalar, valorElegidoParaInput } from '../carta/gestos.js';

test('un instante va al input de fecha sin la «Z» (y sin segundos cero); el exacto, como crudo', () => {
  assert.deepEqual(valorElegidoParaInput('2026-11-30T12:00:00Z', 'datetime-local'), { valor: '2026-11-30T12:00', crudo: '"2026-11-30T12:00:00Z"' });
  assert.deepEqual(valorElegidoParaInput('2026-11-30T12:00Z', 'datetime-local'), { valor: '2026-11-30T12:00', crudo: '"2026-11-30T12:00Z"' });
  assert.deepEqual(valorElegidoParaInput('2026-11-30T12:00:30Z', 'datetime-local'), { valor: '2026-11-30T12:00:30', crudo: '"2026-11-30T12:00:30Z"' }, 'con segundos, se ven');
  assert.deepEqual(valorElegidoParaInput('2026-11-30T12:00:00.250Z', 'datetime-local'), { valor: '2026-11-30T12:00:00.250', crudo: '"2026-11-30T12:00:00.250Z"' });
  assert.deepEqual(valorElegidoParaInput('2026-11-30T12:00:00+00:00', 'datetime-local').crudo, '"2026-11-30T12:00:00+00:00"');
});

test('lo que no es un instante, o no va a un input de fecha, pasa tal cual y sin crudo', () => {
  assert.deepEqual(valorElegidoParaInput('huesped', 'text'), { valor: 'huesped' });
  assert.deepEqual(valorElegidoParaInput('2026-11-30T12:00:00Z', 'text'), { valor: '2026-11-30T12:00:00Z' }, 'un texto que parece fecha, en un input de texto');
  assert.deepEqual(valorElegidoParaInput('6', 'number'), { valor: '6' });
  assert.deepEqual(valorElegidoParaInput('mañana', 'datetime-local'), { valor: 'mañana' });
});

/** Los gestos sobre una raíz de mentira; `m` apunta lo que se le pide. */
function gestos() {
  const oyentes = [];
  const llamadas = [];
  const documento = { defaultView: { innerWidth: 400, innerHeight: 800 }, addEventListener: (t, f) => oyentes.push([t, f]), removeEventListener() {} };
  const raiz = { ownerDocument: documento, addEventListener: (t, f) => oyentes.push([t, f]), removeEventListener() {}, querySelector: () => null };
  const m = new Proxy({}, { get: (_, nombre) => (...args) => { llamadas.push([nombre, ...args]); } });
  instalar(raiz, m);
  const disparar = (tipo, evento) => { for (const [t, f] of oyentes) if (t === tipo) f(evento); };
  return { disparar, llamadas };
}

test('elegir la fecha de la lista: el input de fecha la recibe y el crudo es el instante de la opción; la bandeja se entera', () => {
  const { disparar, llamadas } = gestos();
  const input = { type: 'datetime-local', hidden: true, value: '', dataset: { crudo: '', legible: '' }, focus() {} };
  const form = { nombre: 'formulario' };
  const select = (value, esOtro) => ({
    matches: (sel) => sel === '[data-otro-de]',
    dataset: { otroDe: 'param-until' },
    value,
    selectedOptions: [{ hasAttribute: (a) => a === 'data-otro' && esOtro }],
    ownerDocument: { getElementById: (id) => (id === 'param-until' ? input : null) },
    closest: (sel) => (sel === '[data-formulario]' ? form : null),
  });
  disparar('change', { target: select('2026-11-30T12:00:00Z', false) });
  assert.equal(input.value, '2026-11-30T12:00', 'el input de fecha no se queda vacío');
  assert.equal(input.hidden, true);
  assert.equal(input.dataset.crudo, '"2026-11-30T12:00:00Z"', 'lo que se firma: el instante exacto');
  assert.equal(input.dataset.legible, input.value, 'sin tocar el input, la app lee el crudo');
  assert.deepEqual(llamadas, [['cambioFormulario', form]]);
  // «otro…»: el input, vacío y a la vista, para escribir la fecha a mano.
  disparar('change', { target: select('otro…', true) });
  assert.deepEqual([input.value, input.hidden], ['', false]);
});

test('una opción que no es un instante sigue como antes: su valor al input, sin tocar el crudo', () => {
  const { disparar } = gestos();
  const input = { type: 'text', hidden: true, value: '', dataset: { crudo: '"antes"', legible: 'antes' }, focus() {} };
  disparar('change', { target: { matches: (sel) => sel === '[data-otro-de]', dataset: { otroDe: 'x' }, value: 'casa', selectedOptions: [{ hasAttribute: () => false }], ownerDocument: { getElementById: () => input }, closest: () => null } });
  assert.deepEqual([input.value, input.dataset.crudo, input.dataset.legible], ['casa', '"antes"', 'antes']);
});
