// Los gestos de la lente, del lado del núcleo (Core AGRAM 18-11; docs/notas/NUCLEO_6_7_8.md, tercera tanda, punto 8;
// SUPUESTO POR CONFIRMAR CON VG): la lista cerrada (datos/provisional/gestos.json, con su copia generada), contrato.gestos y
// la validación de un destino «gesto».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as contrato from '../src/contrato.js';
import { TIPOS_BASE } from '../src/tipos.js';
import { GESTOS_PROVISIONALES } from '../src/provisional.js';
import { ejemploReserva } from '../ejemplos/ikisai/reserva-booking.mjs';

test('la lista cerrada: siete gestos, en su orden, cada parámetro con un tipo que se resuelve a un tipo base', () => {
  const lista = contrato.gestos(null);
  assert.deepEqual(lista.map((g) => g.nombre), ['focus', 'enter', 'turn', 'change level', 'launch', 'compose', 'execute']);
  assert.deepEqual(lista.map((g) => g.parametros.map((p) => p.nombre + (p.requerido ? '' : '?'))), [
    ['record'], ['record', 'view?'], ['view'], ['level'], ['action', 'record'], ['action', 'record', 'parameters?'], ['tray?'],
  ]);
  for (const g of lista) {
    for (const p of g.parametros) {
      assert.equal(p.error, null, g.nombre + ' · ' + p.nombre + ': ' + p.error);
      assert.ok(Object.hasOwn(TIPOS_BASE, p.base), g.nombre + ' · ' + p.nombre + ': ' + p.base);
    }
    assert.match(g.ayuda, /^(enfocar|entrar|girar|cambiar de nivel|lanzar|componer|ejecutar): /);
  }
  assert.ok(Object.isFrozen(GESTOS_PROVISIONALES));
  assert.ok(GESTOS_PROVISIONALES[0][3][0].includes('supuesto por confirmar con VG'));
});

test('un destino «gesto»: vale con lo que pide su gesto; no vale fuera de la lista, sin lo requerido ni con un valor que su tipo no admite', async () => {
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const v = (d) => contrato.validarGesto(eje, d);
  const bien = v([['gesture'], ['enter'], [{ ref: reserva.id }], [4]]);
  assert.deepEqual([bien.ok, bien.gesto, bien.parametros], [true, 'enter', { record: reserva.id, view: 4 }]);
  assert.equal(v([['gesture'], ['focus'], [reserva.id]]).ok, true, 'el id tal cual, también');
  assert.equal(v([['gesture'], ['launch'], ['pay'], [reserva.id]]).ok, true);
  assert.equal(v([['gesture'], ['execute']]).ok, true, 'sin parámetros: los opcionales pueden faltar');
  assert.equal(v([['gesture'], ['turn'], [7]]).ok, true);
  const fuera = v([['gesture'], ['delete everything']]);
  assert.deepEqual([fuera.ok, fuera.gesto, fuera.motivos[0].que], [false, null, 'no es un gesto']);
  assert.deepEqual(v([['gesture'], ['launch'], ['fly'], [reserva.id]]).motivos.map((m) => [m.que, m.parametro]), [['no vale', 'action']], 'una acción que la época no tiene');
  assert.deepEqual(v([['gesture'], ['enter'], ['f'.repeat(64)]]).motivos.map((m) => [m.que, m.parametro]), [['no vale', 'record']], 'un registro que no está en el libro');
  assert.deepEqual(v([['gesture'], ['turn'], [12]]).motivos.map((m) => m.parametro), ['view'], 'un punto de vista es un dígito');
  assert.deepEqual(v([['gesture'], ['launch'], ['pay']]).motivos.map((m) => [m.que, m.parametro]), [['falta', 'record']]);
  assert.deepEqual(v([['gesture'], ['turn'], [1], [2]]).motivos.map((m) => m.que), ['sobran']);
  assert.deepEqual(v([['go'], ['focus']]).motivos.map((m) => m.que), ['forma']);
  assert.deepEqual(v('focus').motivos.map((m) => m.que), ['forma']);
});

test('la lista es dato: src/gestos.js no nombra ningún gesto', () => {
  const fuente = readFileSync('src/gestos.js', 'utf8').replace(/^\s*\/\/.*$/gm, '');
  for (const g of contrato.gestos(null)) assert.ok(!fuente.includes("'" + g.nombre + "'"), 'src/gestos.js nombra «' + g.nombre + '»');
});
