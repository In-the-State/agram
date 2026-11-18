// Soltar en una caja (VG 18-11: «soltar en una caja es crear ahí lo que la época permita»): qué acciones de la época
// encajan (src/soltar.js loQueEncaja) con una, varias y ninguna; lo que la carta hace con eso (carta/soltar.js) y que
// soltar compone en la bandeja sin escribir. Sobre el ejemplo de la casa con ana en su 3 (como test/carta-mapped.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../src/acciones.js';
import { loQueEncaja } from '../src/soltar.js';
import { queHacerAlSoltar, entradaAlSoltar, htmlElegirAlSoltar } from '../carta/soltar.js';
import { crearBandeja } from '../carta/bandeja.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';

const T1 = '2026-11-08T10:00:00Z';
const O = { t: '2026-11-08T10:09:00Z' };

/** La casa con ana dentro, en la caja 3 de su 3. → { eje, alta (la de la casa), anaAlta }. */
async function tresDeLaCasa() {
  const { entrarPorInvitacion } = await import('../ejemplos/ikisai/altas.mjs');
  const c = await ejemploCompra();
  const alta = c.eje.alta('casa').id;
  await entrarPorInvitacion(c.eje, { por: 'huesped', quien: 'ana', t: T1 });
  const lanzar = async (nombre, X, valores, yo, m) => {
    const r = await A.transaccion(c.eje, nombre, { X, ...valores }, yo, { t: '2026-11-08T10:0' + m + ':00Z' });
    assert.equal(r.ok, true, nombre + ': ' + JSON.stringify(r.motivos));
    return c.eje.anadir(r.evento);
  };
  await lanzar('write to X', alta, { text: 'hola, casa' }, 'ana', 1);
  await lanzar('move to group', c.eje.alta('ana').id, { zone: 3 }, 'casa', 2);
  return { eje: c.eje, alta, anaAlta: c.eje.alta('ana').id };
}

let fijo;
const casa = async () => (fijo ??= await tresDeLaCasa());
const ana = (anaAlta) => ({ X: anaAlta, identidad: 'ana' });

test('una: soltar a ana en la caja 2 del 3 de la casa encaja con una sola acción, con el parámetro de la caja relleno; la carta la compone tal cual', async () => {
  const { eje, alta, anaAlta } = await casa();
  const destino = { X: alta, lugar: '3.2' };
  const r = loQueEncaja(eje, { arrastrado: ana(anaAlta), destino }, 'casa', O);
  assert.equal(r.motivo, null);
  assert.equal(r.encajan.length, 1);
  const [o] = r.encajan;
  // Ninguna acción se nombra en src/soltar.js: lo que encaja sale de la época (aquí, la que ancla en 3.<grupo>.3 de mi alta).
  assert.deepEqual([o.X, o.valores, o.faltan, o.por, o.pv], [anaAlta, { zone: 2 }, [], 'arrastrado', 3]);
  assert.equal(A.sobreDe(eje, o.accion, { X: o.X, ...o.valores }, 'casa'), alta, 'lo que escribe cuelga de la caja');
  const que = queHacerAlSoltar(r);
  assert.equal(que.componer, o);
  assert.deepEqual(entradaAlSoltar(o, destino), { accion: o.accion, X: anaAlta, valores: { zone: 2 }, donde: { X: alta, pv: 3 }, completa: true });
  // Va al borrador y no escribe nada: la entrada entra en seco y el libro queda igual.
  const m = new Map();
  const b = crearBandeja({ almacen: { leer: (k) => m.get(k) ?? null, guardar: (k, v) => (m.set(k, v), true) }, libro: eje.genesisId, cuenta: 'casa' });
  const n = eje.orden.length;
  assert.equal(b.poner(entradaAlSoltar(o, destino)).ok, true);
  const p = await b.probar(eje, 'casa', O);
  assert.equal(p.ok, true, JSON.stringify(p.items.map((x) => x.motivos)));
  assert.equal(eje.orden.length, n, 'soltar no escribe');
});

test('varias: soltar a ana en la caja 5 (vetar) encaja con dos acciones que crean ahí; la carta ofrece una lista corta para elegir', async () => {
  const { eje, alta, anaAlta } = await casa();
  const r = loQueEncaja(eje, { arrastrado: ana(anaAlta), destino: { X: alta, lugar: '3.5' } }, 'casa', O);
  assert.equal(r.encajan.length, 2);
  assert.ok(r.encajan.every((o) => A.sobreDe(eje, o.accion, { X: o.X, ...o.valores }, 'casa') === alta), 'las dos cuelgan de la caja');
  assert.deepEqual(r.encajan.map((o) => o.valores).sort((a, b) => Object.keys(a).length - Object.keys(b).length), [{}, { zone: 5 }], 'una ancla ahí sin huecos; la otra, con el grupo de la caja');
  const que = queHacerAlSoltar(r);
  assert.equal(que.elegir.length, 2);
  const h = htmlElegirAlSoltar({ opciones: que.elegir.map((o, k) => ({ ...o, etiqueta: 'opción <' + k + '>' })) });
  assert.match(h, /¿Qué preparo al soltar aquí\?/);
  assert.match(h, /data-soltar-elegir="0">opción &lt;0&gt;<\/button>[\s\S]*data-soltar-elegir="1"/);
  assert.match(h, /data-soltar-elegir="no">cancelar/);
});

test('ninguna: lo que la época no permite ahí, o lo permite pero no a quien mira (con la condición que falla, en llano)', async () => {
  const { eje, alta, anaAlta } = await casa();
  // La huésped suelta a ana en una caja del 3 de la casa: nada de lo suyo se crea en la casa.
  const nada = loQueEncaja(eje, { arrastrado: ana(anaAlta), destino: { X: alta, lugar: '3.2' } }, 'huesped', O);
  assert.deepEqual(nada, { encajan: [], motivo: { que: 'nada' } });
  assert.equal(queHacerAlSoltar(nada).aviso, 'Aquí no se puede preparar nada: la época no permite nada al soltar esto en este sitio.');
  // En la caja 7 crearía ahí algo que la época tiene, pero no se ofrece sobre ana: lo permite, no a ti, y por qué.
  const noATi = loQueEncaja(eje, { arrastrado: ana(anaAlta), destino: { X: alta, lugar: '3.7' } }, 'casa', O);
  assert.equal(noATi.encajan.length, 0);
  assert.equal(noATi.motivo.que, 'no-a-ti');
  assert.ok(noATi.motivo.acciones.length >= 1);
  assert.ok(noATi.motivo.acciones.every((a) => typeof a.texto === 'string' && a.texto.includes('no se ofrece aquí')), JSON.stringify(noATi.motivo));
  assert.match(queHacerAlSoltar(noATi).aviso, /^La época lo permite, pero no a ti: .*no se ofrece aquí/);
  // Lo que llega mal de la pantalla no encaja con nada.
  assert.deepEqual(loQueEncaja(eje, { arrastrado: { X: 'x' }, destino: { X: alta, lugar: '3.2' } }, 'casa', O).encajan, []);
  assert.deepEqual(loQueEncaja(eje, { arrastrado: ana(anaAlta), destino: { X: alta, lugar: 'tres' } }, 'casa', O).encajan, []);
});

test('el código de soltar no nombra ninguna acción: usa acciones(...) del núcleo y los tipos de los parámetros', () => {
  const nombres = A.plantillasDeTransaccion().map((p) => p.nombre);
  for (const f of ['../src/soltar.js', '../carta/soltar.js']) {
    const fuente = readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const n of nombres) assert.ok(!fuente.includes("'" + n + "'") && !fuente.includes('"' + n + '"'), f + ' nombra «' + n + '»');
  }
  assert.match(readFileSync(new URL('../src/soltar.js', import.meta.url), 'utf8'), /acciones\.acciones\(eje, sobre\.X, k, yo/);
});
