// La celda 8 sobria y las medidas perezosas (VG, 8-11: «bien a ambos»; mapa
// §14.1, punto 12): hermanos por defecto con un toque para proyecto y todo el
// eje; primero las cantidades por serie y la cuota del foco frente a su
// padre, después los recuentos como información; mapped.mapa().medidas y la
// suma de Scened son la medida única del 8 y solo se calculan si se piden;
// (la web antigua, que pintaba la celda y el cielo, se retiró con BQL V0, #113).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { mapa, ocho, cuota, textoOcho, textoCuota, medicionesPedidas, medidasDe, recuentosDeCelda, COHORTES, RECUENTOS } from '../src/mapped.js';
import { escena, escenaDe, medidasDeEscena, render } from '../src/scened.js';
import { medir, hijos, MEDIDAS, SIN_BASE_ESCRITA } from '../src/bases.js';
import { ejemploComprasHermanas, escribirBasesDelEjemplo } from '../ejemplos/ikisai/compras-hermanas.mjs';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';

const AHORA = '2026-11-07T15:00:00Z';
const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('celda 8: hermanos por defecto, proyecto y todo el eje; cada cohorte lee su 8', async () => {
  const { eje, guisos } = await ejemploComprasHermanas();
  assert.deepEqual(COHORTES, ['hermanos', 'proyecto', 'general']);
  assert.equal(ocho(eje, guisos.id).alcance, 'hermanos');
  // General: todo el eje, con las altas de huesped y vecina (B1); encargo 3b: también la emisión inicial de la casa y sus
  // dos invitaciones, de las que cuelgan esas altas (mapa §16 [D]).
  const n = { hermanos: 4, proyecto: 9, general: 20 };
  for (const c of COHORTES) {
    const o = ocho(eje, guisos.id, { alcance: c });
    assert.equal(o.n, n[c], c);
  }
  assert.throws(() => ocho(eje, guisos.id, { alcance: 'mejores' }), /cohorte desconocida: mejores/);
  // El génesis no tiene padre: sin hermanos y sin cuota; en las otras cohortes, sí se lee.
  const g = ocho(eje, eje.genesisId);
  assert.deepEqual([g.estado, g.cantidades, g.recuentos, g.cuota], ['PENDIENTE', [], [], null]);
  assert.equal(ocho(eje, eje.genesisId, { alcance: 'general' }).cuota, null);
});

test('celda 8: primero las cantidades por serie y la cuota frente al padre; los recuentos, después y como información', async () => {
  const ej = await ejemploComprasHermanas();
  const { eje, guisos, menu } = ej;
  const o = ocho(eje, guisos.id);
  // Las cantidades son las series (T por escala, E por emisor y denominación, P por ámbito, R por emisor), situadas en la cohorte.
  assert.deepEqual(o.cantidades.map((x) => x.clave), ['E:casa/EUR', 'T:hora']);
  for (const x of o.cantidades) {
    assert.equal(x.foco, medir(eje, guisos.id).tokens[x.clave] ?? 0);
    assert.equal(x.debajo + x.enCaja + x.encima, o.n);
    assert.ok(!('hito' in x) && !('puesto' in x) && !('puntuacion' in x));
    assert.equal(x.cuota, x.suma ? x.foco / x.suma : null); // la cuota en la cohorte, la de bases (R7)
    assert.equal(x.cuota, o.cuota.series.find((y) => y.clave === x.clave).cuota); // entre hermanos, la cohorte es el padre
  }
  // La cuota: lo que mueve el foco ÷ lo que mueven entre todos los hijos de su padre, serie a serie (aquí, sin bases.js).
  const delPadre = (k) => hijos(eje, menu.id).reduce((s, h) => s + (medir(eje, h.id).tokens[k] ?? 0), 0);
  for (const x of o.cuota.series) assert.equal(x.cuota, medir(eje, guisos.id).tokens[x.clave] / delPadre(x.clave), x.clave);
  assert.deepEqual(o.cuota.series.map((x) => [x.clave, x.foco, x.padre, x.cuota]), [['E:casa/EUR', 12, 32, 0.375], ['T:hora', 1, 4, 0.25]]);
  assert.deepEqual([o.cuota.padre, o.cuota.escrita, o.cuota.frescura, o.cuota.incluido], [menu.id, false, SIN_BASE_ESCRITA, true]);
  assert.deepEqual([textoCuota(0.375), textoCuota(0.25), textoCuota(1 / 3), textoCuota(null)], ['37,5 %', '25 %', '33,3 %', '—']);
  // Frente al padre en cualquier cohorte: la de proyecto lee las cantidades del proyecto, pero la cuota sigue siendo la del padre.
  assert.deepEqual(ocho(eje, guisos.id, { alcance: 'proyecto' }).cuota, cuota(eje, guisos.id));
  // Los recuentos: todas las medidas de bases.MEDIDAS, valores de la medida única, sin caja (R7).
  assert.deepEqual(o.recuentos.map((r) => r.clave), MEDIDAS.map((m) => m.clave));
  for (const r of o.recuentos) assert.ok(r.recuento === true && !('caja' in r) && !('cuota' in r), r.clave);
  assert.deepEqual(o.recuentos.map((r) => r.foco), MEDIDAS.map((m) => medir(eje, guisos.id)[m.clave]));
  // La celda enseña cinco, con su nombre corto.
  const celda = recuentosDeCelda(o);
  assert.deepEqual(celda.map((r) => r.clave), RECUENTOS.map((r) => r.clave));
  assert.deepEqual(celda.map((r) => r.etiqueta), ['hilo', 'escritos', 'movimientos', 'posiciones', 'identidades']);
  assert.deepEqual(celda.map((r) => r.valor), RECUENTOS.map((r) => medir(eje, guisos.id)[r.clave]));
  // En el texto: la lectura, las series y, al final, los recuentos marcados como información.
  const lineas = textoOcho(o).split('\n');
  assert.equal(lineas[0], '8 · hermanos · sin base escrita (respaldo al vuelo) · n 4');
  assert.equal(lineas[1], 'E:casa/EUR 12: caja 6 · cuota frente al padre 37,5 %');
  assert.equal(lineas[2], 'T:hora 1: caja 1 · cuota frente al padre 25 %');
  // Fuera de hermanos, también la cuota en la cohorte.
  assert.match(textoOcho(ocho(eje, guisos.id, { alcance: 'general' })), /\nE:casa\/EUR 12: caja 6 · cuota frente al padre 37,5 % · en la cohorte [\d,]+ %\n/);
  assert.equal(lineas[3], 'recuentos (información): hilo 3 · escritos 0 · movimientos 2 · posiciones 5 · identidades 2');
  // Con la base escrita, la celda la lee y lo dice; las cantidades y la cuota no cambian.
  await escribirBasesDelEjemplo(ej);
  const escrita = ocho(eje, guisos.id);
  assert.equal(escrita.escrita, true);
  assert.deepEqual(escrita.cantidades, o.cantidades);
  assert.deepEqual(escrita.cuota.series, o.cuota.series);
  assert.equal(escrita.cuota.escrita, true);
});

test('medidas perezosas: mapa() sin { medidas: true } no mide; con ella, la medida única del 8, una vez', async () => {
  const { eje, compra, menu } = await ejemploCompra();
  const antes = medicionesPedidas();
  const m = mapa(eje, compra.id);
  mapa(eje, menu.id, { camino: [1] });
  assert.equal(m.medidas, null);
  assert.equal(medicionesPedidas(), antes, 'mapa() sin la opción no llama a medir');
  const conMedidas = mapa(eje, compra.id, { medidas: true });
  assert.equal(medicionesPedidas(), antes + 1);
  const unica = medir(eje, compra.id);
  for (const { clave } of MEDIDAS) assert.equal(conMedidas.medidas[clave], unica[clave], clave);
  assert.deepEqual(conMedidas.medidas.tokens, unica.tokens);
  assert.deepEqual(medidasDe(eje, compra.id), conMedidas.medidas);
  // Lo demás del mapa no cambia por pedir las medidas.
  const { medidas: _a, ...resto1 } = m;
  const { medidas: _b, ...resto2 } = conMedidas;
  assert.deepEqual(resto1, resto2);
  // En el código: mapped.js llama a bases.medir en un solo sitio (medidasDe, que cuenta), y mapa() solo si se pide.
  const fuente = leer('../src/mapped.js');
  assert.equal(fuente.match(/\bmedir\(/g).length, 1);
  assert.match(fuente, /const medidas = pedirMedidas \? medidasDe\(eje, id\) : null;/);
});

test('medidas perezosas: Scened no mide por registro al componer; la suma se pide aparte, con la misma función', async () => {
  const ej = await ejemploComprasHermanas();
  const { eje, guisos } = ej;
  const antes = medicionesPedidas();
  const e = escenaDe(eje, guisos.id, { alcance: 'general', ahora: AHORA });
  assert.equal(e.focos.length, eje.orden.length);
  assert.equal(medicionesPedidas(), antes, 'componer la escena no mide ningún registro');
  assert.equal(e.recuentos.medidas, null);
  assert.ok(e.focos.every((f) => f.mapa.medidas === null));
  assert.match(render(e), /\nmedidas del 8: bajo demanda \(escena con \{ medidas: true \}\)$/);
  // Pedida: una medida por foco, la misma que la celda 8 (medidasDe, es decir, bases.medir).
  const pedida = medidasDeEscena(eje, e);
  assert.equal(medicionesPedidas(), antes + e.focos.length);
  for (const { clave } of MEDIDAS) assert.equal(pedida[clave], e.focos.reduce((s, f) => s + medir(eje, f.id)[clave], 0), clave);
  assert.equal(pedida.focos, e.focos.length);
  const conOpcion = escena(eje, e.focos.map((f) => f.id), { ahora: AHORA, medidas: true });
  assert.deepEqual(conOpcion.recuentos.medidas, pedida);
  assert.match(render(conOpcion), new RegExp('\\nmedidas del 8 \\(suma de ' + e.focos.length + ' focos\\): escritos ' + pedida.escritos + ' · movimientos ' + pedida.movimientos + ' · posiciones ' + pedida.posiciones + ' · identidades ' + pedida.identidades + '$'));
  // En el código: Scened no llama a bases.medir; usa medidasDe de Mapped.
  const fuente = leer('../src/scened.js');
  assert.doesNotMatch(fuente, /\bmedir\(/);
  assert.doesNotMatch(fuente, /mapa\.medidas\./);
});