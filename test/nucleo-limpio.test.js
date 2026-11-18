// El núcleo limpio (VG 18-11): una acción (lo que el código llama «plantilla de transacción») es dato de la época, y el
// código no debe conocer ninguna por su nombre. La hermana de test/lente-limpia.test.js (la carta), con su mismo método
// (test/ayudas-lente.mjs): los nombres salen al ejecutar de la época 0 y de cada hija de datos/epocas (state, guia-libro,
// roadmap, cuenta), y solo cuenta una cadena literal ENTERA igual a un nombre (ni trozos, ni comentarios, ni regex).
// Se mide src/ entero (src/*.js y src/condiciones/*.js; sin src/vendor/).
//
// Dos listas, por archivo:
//   SUELO        lo que el núcleo necesita por ser el formato mismo o lo que el suelo guarda: cada nombre ha de estar en
//                el suelo de la época 0 (epoch.7.9.6) o en sus piezas de gobierno (epoch.7.9.7), y la prueba lo comprueba
//                en los datos. Lista cerrada: solo cambia con una decisión.
//   DEUDA_DE_HOY lo que el núcleo sabe de una acción que solo existe porque una época la define: solo encoge.
// La prueba falla si aparece en src/ un nombre de acción que no está en ninguna de las dos (en ese archivo), y si una
// entrada de las listas ya no está en el código (hay que quitarla). La tabla con el motivo de cada uno:
// docs/notas/NUCLEO_Y_ACCIONES.md. Solo lee.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { EPOCA_0_BTML } from '../src/epocas.js';
import { nombresDePlantillas, nombresEnArchivos } from './ayudas-lente.mjs';

const SRC = new URL('../src/', import.meta.url);
const ARCHIVOS = [
  ...readdirSync(SRC).filter((f) => f.endsWith('.js')),
  ...readdirSync(new URL('condiciones/', SRC)).filter((f) => f.endsWith('.js')).map((f) => 'condiciones/' + f),
].sort();

/** A: el suelo (epoch.7.9.6 y 7.9.7 de la 0). Solo cambia con una decisión. */
const SUELO = {
  'acciones.js': ['send to another book', 'bring a record from another book'],
  'contrato.js': ['open a private book here', 'this book hangs from', 'withdraw a link'],
  'suelo.js': ['declare a balance'],
  'validez.js': ['receive from another book', 'open a private book here', 'this book hangs from', 'a reserve'],
  'versiones.js': ['propose a change', 'enact a change', 'put a change in force', 'withdraw a change', 'support a change', 'withdraw support'],
};

/** B: conocimiento de una época metido en código (18-11). Solo encoge. «dudoso»: lo mira Core AGRAM (NUCLEO_Y_ACCIONES.md). */
const DEUDA_DE_HOY = {
  'acciones.js': ['second factor' /* dudoso */, 'commit P', 'attend', 'expire something mine'],
  'anclas.js': ['ask for more firmness'],
  'cadenas.js': ['this goes after', 'close', 'deliver'],
  'contrato.js': ['declare capacity or threshold', 'change cohort', 'connect an account', 'grant the permission', 'renew the permission', 'update the balance', 'add a parent', 'remove a parent', 'set the kind of owner', 'set a custody default', 'retouch a text'],
  'elegibles.js': ['remove someone'],
  'guia-libro.js': ['a zone of the face', 'a step of the guide'],
  'motor.js': ['close with error' /* dudoso */, 'expire' /* dudoso */, 'close by decision' /* dudoso */, 'commit P'],
  'nota-detalle.js': ['anchor here'],
  'tres.js': ['remove someone', 'admit someone'],
};

/**
 * Compara lo hallado ({ archivo: { nombre: [líneas] } }) con las dos listas: → los fallos, en llano. Pura (se prueba
 * también sola, abajo).
 */
export function compararNucleo(hay, suelo, deuda) {
  const fallos = [];
  for (const [f, porNombre] of Object.entries(hay)) {
    for (const [nombre, lineas] of Object.entries(porNombre)) {
      if (suelo[f]?.includes(nombre) || deuda[f]?.includes(nombre)) continue;
      fallos.push(`src/${f} nombra la acción «${nombre}» (línea ${lineas.join(', ')}) y no está ni en SUELO ni en DEUDA_DE_HOY: el núcleo no debe conocer acciones por su nombre (si es suelo, lo decide Core AGRAM)`);
    }
  }
  for (const [lista, porArchivo] of [['SUELO', suelo], ['DEUDA_DE_HOY', deuda]]) {
    for (const [f, nombres] of Object.entries(porArchivo)) {
      for (const nombre of nombres) if (!hay[f]?.[nombre]) fallos.push(`src/${f} ya no nombra «${nombre}»: quítalo de ${lista} en test/nucleo-limpio.test.js`);
    }
  }
  return fallos;
}

test('núcleo limpio: ningún nombre de acción nuevo en src/; la deuda de hoy y el suelo siguen estando (la deuda solo encoge)', () => {
  const nombres = nombresDePlantillas();
  assert.ok(nombres.size > 50, 'los nombres salen de las épocas (' + nombres.size + ')');
  assert.deepEqual(compararNucleo(nombresEnArchivos(SRC, ARCHIVOS, nombres), SUELO, DEUDA_DE_HOY), []);
});

test('núcleo limpio: lo que está en SUELO lo guarda el suelo de la época 0 (epoch.7.9.6 o 7.9.7), y nada está en las dos listas', () => {
  const fila = EPOCA_0_BTML.registro?.[7]?.[9] ?? [];
  const guardado = new Set([...[fila[6]].flat(3), ...[fila[7]].flat(3)].filter((x) => typeof x === 'string'));
  assert.ok(guardado.size > 10, 'la fila de gobierno de la 0 se lee');
  const fuera = [];
  for (const [f, nombres] of Object.entries(SUELO)) {
    for (const n of nombres) {
      if (!guardado.has(n)) fuera.push(`src/${f}: «${n}» está en SUELO pero la época 0 no lo guarda en su suelo (7.9.6) ni en sus piezas de gobierno (7.9.7)`);
      if (DEUDA_DE_HOY[f]?.includes(n)) fuera.push(`src/${f}: «${n}» está en SUELO y en DEUDA_DE_HOY`);
    }
  }
  assert.deepEqual(fuera, []);
});

test('núcleo limpio, la guarda misma: falla con un nombre nuevo y con una entrada de cualquiera de las dos listas que ya no está (casos simulados en memoria)', () => {
  const hay = { 'a.js': { 'una acción': [7] }, 'b.js': { 'del suelo': [2] } };
  assert.deepEqual(compararNucleo(hay, { 'b.js': ['del suelo'] }, { 'a.js': ['una acción'] }), [], 'igual: pasa');
  assert.deepEqual(compararNucleo(hay, { 'b.js': ['del suelo'] }, {}), ['src/a.js nombra la acción «una acción» (línea 7) y no está ni en SUELO ni en DEUDA_DE_HOY: el núcleo no debe conocer acciones por su nombre (si es suelo, lo decide Core AGRAM)']);
  assert.deepEqual(compararNucleo(hay, { 'b.js': ['del suelo'] }, { 'a.js': ['una acción', 'otra'] }), ['src/a.js ya no nombra «otra»: quítalo de DEUDA_DE_HOY en test/nucleo-limpio.test.js']);
  assert.deepEqual(compararNucleo(hay, { 'b.js': ['del suelo', 'quitada'] }, { 'a.js': ['una acción'] }), ['src/b.js ya no nombra «quitada»: quítalo de SUELO en test/nucleo-limpio.test.js']);
  // Sobre src/ de verdad: una entrada de más en la deuda (como si el código ya no la nombrara) hace fallar.
  const real = nombresEnArchivos(SRC, ARCHIVOS, nombresDePlantillas());
  assert.deepEqual(compararNucleo(real, SUELO, { ...DEUDA_DE_HOY, 'motor.js': [...DEUDA_DE_HOY['motor.js'], 'pay'] }), ['src/motor.js ya no nombra «pay»: quítalo de DEUDA_DE_HOY en test/nucleo-limpio.test.js']);
  const sinUna = { ...DEUDA_DE_HOY, 'anclas.js': [] };
  assert.ok(compararNucleo(real, SUELO, sinUna)[0].startsWith('src/anclas.js nombra la acción «ask for more firmness»'), 'y quitar de la lista algo que el código sigue nombrando, también');
});
