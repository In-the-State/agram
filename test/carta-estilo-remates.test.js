// Remates de pantalla vistos en el repaso del conjunto (18-11), que son de estilo: se guardan aquí como reglas del CSS,
// para que no vuelvan sin que alguien lo decida. Leen carta/estilo.css como texto (y, donde hace falta, el HTML que las
// reglas suponen); no miden píxeles: eso se mira en pantalla.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arbol } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { EJEMPLOS } from '../carta/ejemplos.js';
import { generarClaves } from '../src/autoridad.js';
import * as comida from '../ejemplos/ikisai/compra-food.mjs';

const CSS = readFileSync(new URL('../carta/estilo.css', import.meta.url), 'utf8');
/** El cuerpo de la regla cuyo selector es exactamente `sel` (la primera), o null. */
const regla = (sel) => {
  const i = CSS.indexOf(sel + '{');
  if (i < 0) return null;
  return CSS.slice(i + sel.length + 1, CSS.indexOf('}', i));
};

test('matriz del 4: el nombre de una ficha no se parte por la mitad de una palabra; cede antes el nombre del estado', async () => {
  const nombre = regla('.rejilla-matriz .ejecucion .ocupante,.rejilla-matriz .ejecucion .ocupante .texto');
  assert.ok(nombre, 'la regla del nombre en la matriz');
  assert.match(nombre, /overflow-wrap:break-word/, 'entre palabras, no «anywhere»');
  const estado = regla('.rejilla-matriz .ejecucion .estacion-nombre');
  assert.ok(estado);
  assert.match(estado, /flex:0 1000 auto/, 'el estado encoge primero');
  assert.match(estado, /min-width:0/);
  assert.match(estado, /text-overflow:ellipsis/);
  assert.match(regla('.rejilla-matriz .ejecucion .abrir-aro') ?? '', /flex:none/, 'el ⋯ no se aplasta');
  assert.match(regla('.rejilla-matriz .ejecucion:not([data-estado="ejecutada"])') ?? '', /padding-right:3px/, 'el hueco del ✓, solo en la ejecutada');
  // El HTML que las reglas suponen: cada ficha, el nombre, el ⋯ y el estado, en ese orden.
  // El ejemplo de la comida como lo abre la carta (con la fábrica: pagar, servir y atender en la fila «hacer»).
  const claves = {};
  for (const k of EJEMPLOS[0].identidades) claves[k] = await generarClaves();
  const { eje, foco } = await EJEMPLOS[0].crear(comida, claves);
  const h = html(await arbol({ foco: { X: foco, pv: 4 } }, eje, 'huesped', { ancho: 1440, alto: 900 }));
  const fichas = h.match(/<li class="ejecucion"[^]*?<\/li>/g) ?? [];
  const conEstado = fichas.filter((x) => x.includes('estacion-nombre'));
  assert.ok(conEstado.length >= 2, 'la matriz tiene fichas con estado: ' + conEstado.length);
  for (const f of conEstado) assert.match(f, /class="ocupante[^"]*"[^]*class="abrir-aro"[^]*class="estacion-nombre"/);
});
