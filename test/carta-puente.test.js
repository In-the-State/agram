// «Irme con lo mío» y el puente entre mis libros, en la carta (encargo «carta: irme con lo mío y el puente», Core AGRAM 17-11).
// Lo que se comprueba:
//   0. de dónde salen los sellos: datos/epocas/puente.mjs se puede servir a la carta (nada de Node arriba); la prueba con que
//      se trae un registro es la décupla de sello que su libro ya tiene (pruebaParaTraer), y con ella la regla deja traer;
//      sin sello, sin claves o sin el nivel, se dice qué falta; un libro sin sellador o de demostración no tiene sello;
// Claves y libros de PRUEBA, generados en cada prueba; nada real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Eje } from '../src/eje.js';
import { PLANTILLAS_DEL_PUENTE as P, pruebaParaTraer, clavesDeLineaDe, paresDelEnlace, sinSello, porRecibir, registroComoDecupla } from '../datos/epocas/puente.mjs';
import { dosLibros } from '../ejemplos/puente.mjs';
import { selloEnCascada, declararExterior } from './ayudas-sello.js';

/** El sello en cascada de un registro del grande, como el que trae la sincronía: { altura, hash, instante, verificado, decupla }. */
const selloDelGrande = (m, id, { arriba = 4 } = {}) => selloEnCascada(id, {
  observador: m.claves.sellador, capas: [{ nivel: 1, grado: 0, claves: m.claves.casaG, libro: m.grande.genesisId }, { nivel: arriba, grado: 2, red: 0, libro: m.grande.genesisId }],
});

test('sección 0: puente.mjs se sirve a la carta: ningún import de Node arriba ni Buffer', () => {
  const fuente = readFileSync(new URL('../datos/epocas/puente.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(fuente, /^import .* from 'node:/m);
  assert.doesNotMatch(fuente, /Buffer\./);
  assert.doesNotMatch(fuente, /^import .* from '\.\/generar\.mjs'/m);
});

test('sección 0: la prueba para traer es la décupla de sello que el libro de origen ya tiene; con ella la regla deja traer', async () => {
  const m = await dosLibros();
  const menu = await m.lanza(m.grande, 'anchor here', { X: m.sala.id, title: 'menú', content: 'el menú del sábado' }, 'ana');
  const lineas = paresDelEnlace(m.cuelga);
  assert.equal(lineas.length, 2, 'el enlace del pequeño anota las dos claves del grande');
  // Sin sello: espera.
  assert.deepEqual(pruebaParaTraer(m.grande, menu.id, { lineas }), { prueba: null, falta: 'sello' });
  const sello = await selloDelGrande(m, menu.id);
  assert.equal(m.grande.marcarSello(menu.id, sello), true);
  const r = pruebaParaTraer(m.grande, menu.id, { lineas, nivel: 4 });
  assert.equal(r.falta, null);
  assert.deepEqual(r.prueba, sello.decupla, 'la misma décupla, copiada');
  // Sin claves, con otras claves o pidiendo más nivel del que llega: se dice qué falta.
  assert.equal(pruebaParaTraer(m.grande, menu.id, { lineas: [] }).falta, 'claves');
  assert.equal(pruebaParaTraer(m.grande, menu.id, { lineas: [[1, m.claves.casaP.publica], [4, m.claves.sellador.publica]] }).falta, 'claves');
  assert.equal(pruebaParaTraer(m.grande, menu.id, { lineas, nivel: 5 }).falta, 'nivel');
  // Con ella, la regla deja traer.
  const traido = await m.intenta(m.pequeno, P.traer, { X: m.cuelga.id, record: registroComoDecupla(menu), proof: r.prueba }, 'bea');
  assert.equal(traido.ok, true, (traido.motivos ?? []).map((x) => x.mensaje).join('; '));
});

test('sección 0: un libro sin quien lo selle, o de demostración, no tiene sello; con «seal url» y «line keys», sí', async () => {
  const m = await dosLibros();
  assert.equal(sinSello(m.grande), 'sinSellador');
  assert.deepEqual(clavesDeLineaDe(m.grande), []);
  const demo = await Eje.genesis({ identidad: 'ana', foco: ['demo'], t: '2026-11-17T09:00:00Z', demostracion: true });
  assert.equal(sinSello(demo), 'demostracion');
  await declararExterior(m.grande, { sello: 'https://sello.invalid', privada: m.claves.ana.privada });
  assert.equal(sinSello(m.grande), 'sinClaves');
  const lineas = [[1, m.claves.casaG.publica], [4, m.claves.sellador.publica]];
  await declararExterior(m.grande, { sello: 'https://sello.invalid', lineas, privada: m.claves.ana.privada });
  assert.equal(sinSello(m.grande), null);
  assert.deepEqual(clavesDeLineaDe(m.grande), lineas, 'las claves de línea del libro, de su «exterior settings»');
});

test('sección 0: porRecibir dice cuánto queda de un envío traído (la ida, una vez y entera)', async () => {
  const m = await dosLibros();
  const menu = await m.lanza(m.grande, 'anchor here', { X: m.sala.id, title: 'menú', content: 'el menú' }, 'ana');
  await m.lanza(m.grande, 'issue E tied to X', { X: menu.id, denomination: 'plato', quantity: 5 }, 'ana');
  const serie = 'E:ana/plato@' + menu.id;
  await m.traer(m.pequeno, m.grande, menu);
  const envio = await m.lanza(m.grande, P.enviar, { X: m.abre.id, series: serie, quantity: 3, to: m.claves.bea.publica }, 'ana');
  const traido = await m.traer(m.pequeno, m.grande, envio);
  assert.deepEqual(porRecibir(m.pequeno, traido.id), { envia: 3, recibido: 0, queda: 3, vuelta: false });
  await m.lanza(m.pequeno, P.recibir, { X: traido.id }, 'bea');
  assert.deepEqual(porRecibir(m.pequeno, traido.id), { envia: 3, recibido: 3, queda: 0, vuelta: false });
  assert.equal(porRecibir(m.pequeno, menu.id), null, 'un registro que no es un traído');
});
