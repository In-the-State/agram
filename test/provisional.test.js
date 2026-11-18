// Lo provisional (Core AGRAM 18-11; docs/notas/NUCLEO_6_7_8.md, decisión 13): los JSON de datos/provisional/ mandan y
// src/provisional.js importa sus copias generadas (datos/provisional/generar.mjs), sin fetch ni módulos JSON. Esta prueba
// falla si una copia no está al día con su JSON o si algo de src/ importa un módulo JSON.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { COPIAS, generar } from '../datos/provisional/generar.mjs';
import { TIPOS_PROVISIONALES, LECTURAS_PROVISIONALES } from '../src/provisional.js';

test('cada copia de datos/provisional/ está al día con su JSON (node datos/provisional/generar.mjs)', () => {
  for (const [fuente, copia, nombre] of COPIAS) {
    assert.equal(readFileSync(join('datos/provisional', copia), 'utf8'), generar(fuente, nombre), copia + ' no está al día con ' + fuente);
  }
});

test('src/provisional.js da lo mismo que los JSON, congelado', () => {
  assert.deepEqual(structuredClone(TIPOS_PROVISIONALES), JSON.parse(readFileSync('datos/provisional/tipos.json', 'utf8')));
  assert.deepEqual(structuredClone(LECTURAS_PROVISIONALES), JSON.parse(readFileSync('datos/provisional/lecturas.json', 'utf8')));
  assert.ok(Object.isFrozen(TIPOS_PROVISIONALES) && Object.isFrozen(LECTURAS_PROVISIONALES[0][2]));
});

test('ningún archivo de src/ importa un módulo JSON (with { type … })', () => {
  const archivos = [...readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => 'src/' + f), ...readdirSync('src/condiciones').filter((f) => f.endsWith('.js')).map((f) => 'src/condiciones/' + f)];
  for (const f of archivos) assert.ok(!/with\s*\{\s*type/.test(readFileSync(f, 'utf8')), f);
});
