// El defecto #134 de la lectura «stage» (agram-equipo/ISSUES.md; docs/notas/VOLCADO.md, «Límites»): el coste de escribir
// un registro anclado sobre un anuncio de T no lo cumple. «commit P» cuesta 6 minutos; con un anuncio de 1 minuto, la
// tarea pasaba de propuesta a ejecutada sin entregar nada. Eje local en memoria, sin claves ni nodos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import { cerrado } from '../src/motor.js';
import * as A from '../src/acciones.js';

const T0 = '2026-11-16T08:00:00Z';
const T = (s) => new Date(Date.parse(T0) + s * 1000).toISOString().replace('.000Z', 'Z');

async function escribe(eje, plantilla, params, yo, t) {
  const r = await A.transaccion(eje, plantilla, params, yo, { t });
  assert.equal(r.ok, true, plantilla + ': ' + JSON.stringify(r.motivos));
  return eje.anadir(r.evento);
}

/** Lo que el registro quema de T de minuto de su autor (el coste de escribir y lo que queme a propósito). */
const quemaMinutos = (ev) => ev.movimientos.filter((m) => m.token === 'T' && m.escala === 'minuto' && m.a === null && m.estado !== 'anunciado').reduce((s, m) => s + m.cantidad, 0);

test('#134: el coste de escribir «commit P» no cumple un anuncio de 1 minuto de T; lo cumple «deliver»', async () => {
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true });
  const tarea = await escribe(eje, 'anchor here', { X: eje.genesisId, title: 'una tarea' }, 'ana', T(1));
  const anuncio = await escribe(eje, 'declare future T', { X: tarea.id, what: 'trabajar', when: T(1), units: 1 }, 'ana', T(2));
  assert.equal(A.estacionDeAnuncio(eje, anuncio.id), 'propuesta');
  const compromiso = await escribe(eje, 'commit P', { X: anuncio.id }, 'ana', T(3));
  assert.ok(quemaMinutos(compromiso) >= 1, 'el coste de escribir «commit P» quema al menos el minuto anunciado: ' + quemaMinutos(compromiso));
  assert.equal(A.estacionDeAnuncio(eje, anuncio.id), 'autorizada', 'el coste de escribir no es el T anunciado: sigue autorizada, no ejecutada');
  assert.equal(cerrado(eje, tarea.id).cerrado, false, 'lo anunciado no ha pasado');
  assert.deepEqual(A.estaciones(eje, tarea.id).flatMap((e) => e.pendientes), [anuncio.id], 'sigue pendiente en la lectura «stage» (X.4.8)');
  // Entregar quema lo anunciado además de su coste: ahora sí.
  await escribe(eje, 'deliver', { X: tarea.id, announcement: anuncio.id }, 'ana', T(4));
  assert.equal(A.estacionDeAnuncio(eje, anuncio.id), 'ejecutada');
  assert.equal(cerrado(eje, tarea.id).cerrado, true);
});

test('#134: un registro a mano que solo paga su coste, aunque queme mucho más que lo anunciado en su misma escala, no cumple el anuncio; el que quema lo anunciado además del coste, sí', async () => {
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true });
  const tarea = await escribe(eje, 'anchor here', { X: eje.genesisId, title: 'otra tarea' }, 'ana', T(1));
  const anuncio = await escribe(eje, 'declare future T', { X: tarea.id, what: 'trabajar', when: T(1), units: 2 }, 'ana', T(2));
  // Un comentario sobre el anuncio: su coste (un minuto por posición) pasa de 2 minutos.
  const nota = await escribe(eje, 'anchor here', { X: anuncio.id, title: 'una nota sobre el anuncio, con más de dos posiciones', content: ['a', 'b', 'c'] }, 'ana', T(3));
  assert.ok(quemaMinutos(nota) > 2, 'la nota quema ' + quemaMinutos(nota) + ' minutos de coste');
  assert.equal(A.estacionDeAnuncio(eje, anuncio.id), 'propuesta');
  const entrega = await escribe(eje, 'deliver', { X: tarea.id, announcement: anuncio.id }, 'ana', T(4));
  assert.equal(A.estacionDeAnuncio(eje, anuncio.id), 'ejecutada');
  // Lo que cuelga de la entrega no cambia su coste (la medida del 8 lleva el subárbol; la fórmula le quita el de sus hijos).
  await escribe(eje, 'anchor here', { X: entrega.id, title: 'una nota larga sobre la entrega', content: ['a', 'b', 'c', 'd', 'e', 'f'] }, 'ana', T(5));
  assert.equal(A.estacionDeAnuncio(eje, anuncio.id), 'ejecutada');
});
