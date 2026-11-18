// La bandeja (carta/bandeja.js; agram-equipo/DISENO_BANDEJA_PV4.md, paso 1; CONTRATO_TANDA.md, precisión 12): el borrador
// guardado en el dispositivo (aquí, un almacén en memoria) y el único camino de lanzarlo, todo o nada: componer en seco,
// marcar, volver a probar, rehacer las pruebas de posesión, firmar y asentar. Claves de PRUEBA, generadas aquí.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Eje } from '../src/eje.js';
import { generarClaves, firmar, firmarPosesion } from '../src/autoridad.js';
import * as A from '../src/acciones.js';
import { SEGUNDOS } from '../src/tokens.js';
import { crearBandeja, ejecutarAhora, enviarPorLaBandeja, escribirPorLaBandeja, resumenDe, claveDelBorrador, MAXIMO_DE_ENTRADAS, TOPE_POR_REGISTRO } from '../carta/bandeja.js';

const T = (m) => '2026-11-18T10:' + String(m).padStart(2, '0') + ':00Z';

/** Un almacén en memoria con la forma de leerLocal/guardarLocal (carta/cuentas.js). */
function memoria() {
  const m = new Map();
  return { m, leer: (k) => m.get(k) ?? null, guardar: (k, v) => (m.set(k, v), true) };
}

/** Un libro firmado de vg, con ana dentro: { eje, vg, ana, altaAna }. */
async function libro() {
  const vg = await generarClaves();
  const ana = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['libro de prueba de la bandeja'], t: T(0), clave: vg.publica, privada: vg.privada, exigirFirmas: true, emision: [{ token: 'R', cantidad: 10 }] });
  const inv = await eje.invitar({ autor: 'vg', invitado: 'ana', clave: ana.publica, t: T(1), privada: vg.privada });
  const altaAna = await eje.aceptar(inv, ana, { t: T(2) });
  return { eje, vg, ana, altaAna, firmarVg: (ev) => firmar(ev, vg.privada) };
}

/** Todo lo que se puede leer del eje, para comparar antes y después (como en test/tanda.test.js). */
function foto(eje) {
  const mapa = (m) => [...m].map(([k, v]) => [k, v instanceof Map ? mapa(v) : v]);
  return JSON.stringify({
    orden: eje.orden, claves: mapa(eje.claves), saldos: mapa(eje.saldos), bloqueados: mapa(eje.bloqueados),
    hijos: [...eje.hijos].map(([k, v]) => [k, v.map((e) => e.id)]), longitud: eje.libro.longitud,
    transacciones: eje.libro.transacciones().map((tx) => tx.id), tMaximo: eje.tMaximo([]),
  });
}

const nota = (eje, texto, extra = {}) => ({ accion: 'write to X', X: eje.genesisId, valores: { text: texto }, donde: { X: eje.genesisId, pv: 3 }, ...extra });

test('el borrador sobrevive a recargar; misma acción sobre el mismo X en el mismo sitio se actualiza', () => {
  const almacen = memoria();
  const b = crearBandeja({ almacen, libro: 'g'.repeat(64), cuenta: 'vg' });
  const X = 'a'.repeat(64);
  const r1 = b.poner({ accion: 'write to X', X, valores: { text: 'uno' }, donde: { X, pv: 3 } });
  assert.equal(r1.ok, true);
  assert.equal(r1.actualizada, false);
  const r2 = b.poner({ accion: 'write to X', X, valores: { text: 'dos' }, donde: { X, pv: 3 } });
  assert.equal(r2.actualizada, true, 'mismo sitio: se actualiza');
  assert.equal(r2.entrada.id, r1.entrada.id);
  const r3 = b.poner({ accion: 'write to X', X, valores: { text: 'otro sitio' }, donde: { X, pv: 6 } });
  assert.equal(r3.actualizada, false, 'otro punto de vista: otra entrada');
  const r4 = b.poner({ accion: 'write to X', X, valores: { text: 'otra más' }, donde: { X, pv: 3 }, nueva: true });
  assert.equal(r4.actualizada, false, 'nueva: otra aunque la haya');
  const r5 = b.poner({ accion: 'write to X', X, valores: { text: 'por id' }, donde: { X, pv: 3 }, id: r4.entrada.id, completa: false });
  assert.equal(r5.actualizada, true);
  // Recargar: un objeto nuevo sobre el mismo almacén ve lo mismo, en el mismo orden.
  const otra = crearBandeja({ almacen, libro: 'g'.repeat(64), cuenta: 'vg' });
  assert.deepEqual(otra.listar(), b.listar());
  assert.deepEqual(otra.listar().entradas.map((e) => [e.id, e.valores.text, e.completa]), [['b1', 'dos', true], ['b2', 'otro sitio', true], ['b3', 'por id', false]]);
  // Otra cuenta u otro libro: otro borrador.
  assert.equal(crearBandeja({ almacen, libro: 'g'.repeat(64), cuenta: 'ana' }).listar().entradas.length, 0);
  assert.equal(b.clave, claveDelBorrador('g'.repeat(64), 'vg'));
  // Lo que no vale no se pone.
  assert.equal(b.poner({ accion: '', X, valores: {} }).ok, false);
  assert.equal(b.poner({ accion: 'write to X', X: { pendiente: 'b99' }, valores: {} }).ok, false, 'nombra una entrada que no existe');
  assert.equal(b.poner({ accion: 'write to X', X, valores: { text: 'x'.repeat(300 * 1024) } }).ok, false, 'valores demasiado grandes');
  assert.equal(b.vaciar(), true);
  assert.equal(otra.listar().entradas.length, 0);
});

test('un borrador corrupto, de otra versión o fuera de los topes se ignora sin romper', () => {
  const almacen = memoria();
  const clave = claveDelBorrador('g'.repeat(64), 'vg');
  const b = crearBandeja({ almacen, libro: 'g'.repeat(64), cuenta: 'vg' });
  const buena = { id: 'b1', accion: 'write to X', X: 'a'.repeat(64), valores: {}, donde: { X: null, pv: null }, completa: true, de: [] };
  const casos = [
    '{no es json',
    JSON.stringify({ v: 2, siguiente: 1, entradas: [] }),
    JSON.stringify([1, 2, 3]),
    JSON.stringify({ v: 1, siguiente: 1, entradas: Array.from({ length: MAXIMO_DE_ENTRADAS + 1 }, (_, k) => ({ ...buena, id: 'b' + k })) }),
    JSON.stringify({ v: 1, siguiente: 2, entradas: [{ ...buena, X: { pendiente: 'b9' }, de: ['b9'] }] }), // nombra una que no está
    JSON.stringify({ v: 1, siguiente: 2, entradas: [{ ...buena, de: ['b1'] }] }), // «de» que no casa
    JSON.stringify({ v: 1, siguiente: 3, entradas: [buena, buena] }), // id repetido
    JSON.stringify({ v: 1, siguiente: 2, entradas: [{ ...buena, valores: JSON.parse('['.repeat(40) + ']'.repeat(40)) }] }),
  ];
  for (const texto of casos) {
    almacen.m.set(clave, texto);
    const l = b.listar();
    assert.deepEqual(l.entradas, [], texto.slice(0, 60));
    assert.ok(l.ignorado, 'dice por qué');
  }
  // Un almacén que lanza al leer tampoco rompe.
  const roto = crearBandeja({ almacen: { leer: () => { throw new Error('sin almacenamiento'); }, guardar: () => false }, libro: 'g'.repeat(64), cuenta: 'vg' });
  assert.deepEqual(roto.listar().entradas, []);
  assert.equal(roto.poner({ accion: 'write to X', X: 'a'.repeat(64) }).ok, false, 'no se puede guardar: lo dice');
  // Tras uno corrupto, poner empieza uno nuevo.
  almacen.m.set(clave, '{no es json');
  assert.equal(b.poner({ accion: 'write to X', X: 'a'.repeat(64) }).ok, true);
  assert.equal(b.listar().entradas.length, 1);
});

test('una entrada sola entra como registro suelto y sale del borrador', async () => {
  const { eje, firmarVg } = await libro();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  b.poner(nota(eje, 'hola'));
  const n = eje.orden.length;
  const r = await b.ejecutar(eje, 'vg', firmarVg);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(r.tanda, null);
  assert.equal(r.eventos.length, 1);
  assert.equal(r.eventos[0].contexto?.tanda, undefined, 'un suelto no lleva marca');
  assert.equal(eje.orden.length, n + 1);
  assert.equal(eje.orden.at(-1), r.eventos[0].id);
  assert.equal(r.ids.b1, r.eventos[0].id);
  assert.deepEqual(b.listar().entradas, []);
});

test('tres entradas entran como tanda, seguidas; firmarTanda se llama una sola vez con todos', async () => {
  const { eje, vg, altaAna } = await libro();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  b.poner(nota(eje, 'uno'));
  b.poner({ accion: 'give own R', X: altaAna.id, valores: { amount: 2 }, donde: { X: altaAna.id, pv: 3 } });
  b.poner(nota(eje, 'tres', { donde: { X: eje.genesisId, pv: 6 } }));
  const llamadas = [];
  let sueltas = 0;
  const firmarTanda = async (eventos) => {
    llamadas.push(eventos.map((e) => e.id));
    return Promise.all(eventos.map((ev) => firmar(ev, vg.privada)));
  };
  const n = eje.orden.length;
  const r = await b.ejecutar(eje, 'vg', () => { sueltas++; return null; }, { firmarTanda });
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(llamadas.length, 1, 'un solo diálogo');
  assert.equal(llamadas[0].length, 3);
  assert.equal(sueltas, 0, 'no se firma de uno en uno');
  assert.equal(r.tanda, r.eventos[0].id);
  assert.deepEqual(eje.orden.slice(n), r.eventos.map((e) => e.id), 'seguidas y en orden');
  assert.deepEqual(r.eventos.map((e) => e.contexto.tanda.n), [1, 2, 3]);
  assert.deepEqual(llamadas[0], r.eventos.map((e) => e.id), 'se firma lo marcado: el id firmado es el definitivo');
  assert.deepEqual(b.listar().entradas, []);
});

test('una entrada que no entra: no se lanza nada, el libro queda exactamente igual y el borrador intacto', async () => {
  const { eje, firmarVg } = await libro();
  const almacen = memoria();
  const b = crearBandeja({ almacen, libro: eje.genesisId, cuenta: 'vg' });
  b.poner(nota(eje, 'uno'));
  b.poner(nota(eje, 'dos', { donde: { X: eje.genesisId, pv: 6 } }));
  b.poner({ accion: 'write to X', X: 'f'.repeat(64), valores: { text: 'sobre nada' }, donde: { X: null, pv: 3 } });
  const p = await b.probar(eje, 'vg');
  assert.deepEqual(p.items.map((x) => x.entra), [true, true, false]);
  assert.ok(p.items[2].motivos.length > 0);
  assert.equal(p.ok, false);
  const antes = foto(eje);
  const guardado = almacen.m.get(b.clave);
  let firmas = 0;
  const r = await b.ejecutar(eje, 'vg', (ev) => { firmas++; return firmarVg(ev); });
  assert.equal(r.ok, false);
  assert.equal(r.fase, 'componer');
  assert.ok(r.motivos.some((m) => m.id === 'b3'), 'dice cuál y por qué');
  assert.equal(firmas, 0, 'no se pide ninguna firma');
  assert.equal(foto(eje), antes);
  assert.equal(almacen.m.get(b.clave), guardado, 'el borrador, intacto');
  // Una incompleta tampoco se lanza: «falta por rellenar» y qué falta.
  b.quitar('b3');
  b.poner({ accion: 'write to X', X: eje.genesisId, valores: {}, donde: { X: eje.genesisId, pv: 9 }, completa: false });
  const q = await b.probar(eje, 'vg');
  const incompleta = q.items.find((x) => x.id === 'b4');
  assert.equal(incompleta.entra, false);
  assert.equal(incompleta.motivos[0].mensaje, 'falta por rellenar');
  assert.deepEqual(incompleta.faltan, ['text']);
  assert.equal((await b.ejecutar(eje, 'vg', firmarVg)).ok, false);
  assert.equal(foto(eje), antes);
});

test('una entrada que depende de otra pendiente: la nota sobre la tarea que es borrador, con los ids finales casando', async () => {
  const { eje, firmarVg } = await libro();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  const tarea = b.poner({ accion: 'propose', X: eje.genesisId, valores: { title: 'Tarea', content: 'hacer algo' }, donde: { X: eje.genesisId, pv: 4 } });
  const n1 = b.poner({ accion: 'write to X', X: { pendiente: tarea.entrada.id }, valores: { text: 'una nota sobre la tarea' }, donde: { X: eje.genesisId, pv: 4 } });
  assert.deepEqual(n1.entrada.de, [tarea.entrada.id]);
  const p = await b.probar(eje, 'vg');
  assert.equal(p.ok, true, JSON.stringify(p.items.map((x) => x.motivos)));
  assert.ok(JSON.stringify(p.items[1].candidato.payload).includes(p.items[0].candidato.id), 'en seco, la referencia es el id del candidato');
  const r = await b.ejecutar(eje, 'vg', firmarVg);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  const [t, n] = r.eventos;
  assert.ok(JSON.stringify(n.payload).includes(t.id), 'y lo nombra en su payload');
  assert.ok(!JSON.stringify(n.payload).includes(p.items[0].candidato.id), 'nada del id de antes de marcar');
  assert.deepEqual(r.ids, { [tarea.entrada.id]: t.id, [n1.entrada.id]: n.id });
  assert.equal(eje.obtener(n.payload[2][0].ref).id, t.id, 'la nota nombra la tarea ya asentada');
});

test('quitar la entrada de la que dependen otras quita también las que dependen', () => {
  const b = crearBandeja({ almacen: memoria(), libro: 'g'.repeat(64), cuenta: 'vg' });
  const G = 'a'.repeat(64);
  b.poner({ accion: 'propose', X: G, valores: { title: 'T' }, donde: { X: G, pv: 4 } }); // b1
  b.poner({ accion: 'write to X', X: { pendiente: 'b1' }, valores: { text: 'n' }, donde: { X: G, pv: 4 } }); // b2
  b.poner({ accion: 'write to X', X: G, valores: { text: 'cita', about: [{ pendiente: 'b2' }] }, donde: { X: G, pv: 3 } }); // b3, por un valor
  b.poner({ accion: 'write to X', X: G, valores: { text: 'suelta' }, donde: { X: G, pv: 6 } }); // b4
  // Un círculo no se puede poner.
  assert.equal(b.poner({ id: 'b1', accion: 'propose', X: { pendiente: 'b3' }, valores: {}, donde: { X: G, pv: 4 } }).ok, false);
  const r = b.quitar('b1');
  assert.equal(r.ok, true);
  assert.deepEqual(r.quitadas, ['b1', 'b2', 'b3']);
  assert.deepEqual(r.dependientes, ['b2', 'b3']);
  assert.deepEqual(b.listar().entradas.map((e) => e.id), ['b4']);
  assert.equal(b.quitar('b9').ok, false);
});

test('firma cancelada en la segunda de tres: nada asentado, borrador intacto; también si la firma cambia el registro', async () => {
  const { eje, firmarVg } = await libro();
  const almacen = memoria();
  const b = crearBandeja({ almacen, libro: eje.genesisId, cuenta: 'vg' });
  b.poner(nota(eje, 'uno'));
  b.poner(nota(eje, 'dos', { donde: { X: eje.genesisId, pv: 6 } }));
  b.poner(nota(eje, 'tres', { donde: { X: eje.genesisId, pv: 9 } }));
  const antes = foto(eje);
  const guardado = almacen.m.get(b.clave);
  let k = 0;
  const r = await b.ejecutar(eje, 'vg', async (ev) => (++k === 2 ? null : firmarVg(ev)));
  assert.equal(r.ok, false);
  assert.equal(r.fase, 'firmar');
  assert.equal(k, 2, 'se para en la que se cancela');
  assert.equal(foto(eje), antes);
  assert.equal(almacen.m.get(b.clave), guardado);
  const lanza = await b.ejecutar(eje, 'vg', async () => { throw new Error('el usuario dijo que no'); });
  assert.equal(lanza.fase, 'firmar');
  assert.match(lanza.motivos[0].mensaje, /dijo que no/);
  const trampa = await b.ejecutar(eje, 'vg', async (ev) => firmarVg({ ...ev, id: 'e'.repeat(64) }));
  assert.equal(trampa.ok, false);
  assert.equal(foto(eje), antes);
  assert.equal(almacen.m.get(b.clave), guardado);
});

test('el libro cambia por debajo entre componer y ejecutar: la bandeja recompone sobre lo fresco', async () => {
  const { eje, firmarVg, altaAna } = await libro();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  b.poner(nota(eje, 'uno'));
  b.poner({ accion: 'write to X', X: altaAna.id, valores: { text: 'para ana' }, donde: { X: altaAna.id, pv: 3 } });
  const p = await b.probar(eje, 'vg');
  assert.equal(p.ok, true);
  // Otro registro entra en el libro, más tarde.
  const fuera = await A.transaccion(eje, 'write to X', { X: eje.genesisId, text: 'de otro dispositivo' }, 'vg', { t: T(30), firmar: firmarVg });
  assert.equal(fuera.ok, true, JSON.stringify(fuera.motivos));
  await eje.anadir(fuera.evento);
  const r = await b.ejecutar(eje, 'vg', firmarVg);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(eje.orden.at(-3), fuera.evento.id, 'lo de fuera, antes que la tanda');
  assert.ok(r.eventos.every((e) => Date.parse(e.t) >= Date.parse(T(30))), 'compuesta con la hora de lo fresco');
  assert.ok(r.items.every((x, k) => x.candidato.id !== p.items[k].candidato.id), 'recompuesta, no lo de antes');
});

test('topes: de 1 a 32 registros, 256 KiB por registro, la propuesta para la app', async () => {
  const { eje, firmarVg } = await libro();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  const vacia = await b.probar(eje, 'vg');
  assert.equal(vacia.ok, false);
  assert.match(vacia.motivos[0].mensaje, /vacía/);
  assert.equal((await b.ejecutar(eje, 'vg', firmarVg)).ok, false);
  for (let k = 0; k < 33; k++) b.poner(nota(eje, 'nota ' + k, { nueva: true }));
  const muchas = await b.probar(eje, 'vg');
  assert.equal(muchas.ok, false);
  assert.ok(muchas.motivos.some((m) => /como mucho 32/.test(m.mensaje)));
  const antes = foto(eje);
  const r = await b.ejecutar(eje, 'vg', firmarVg);
  assert.equal(r.ok, false);
  assert.equal(foto(eje), antes);
  b.vaciar();
  // Un registro que no cabe: 140 000 eñes son 280 000 bytes en UTF-8.
  b.poner(nota(eje, 'ñ'.repeat(140000)));
  const grande = await b.probar(eje, 'vg');
  assert.equal(grande.items[0].entra, false);
  assert.ok(grande.items[0].bytes > TOPE_POR_REGISTRO);
  assert.ok(grande.items[0].motivos.some((m) => /no cabe: el registro pasa de/.test(m.mensaje)));
  b.vaciar();
  b.poner(nota(eje, 'corta'));
  const app = await b.probar(eje, 'vg', { topeDePropuesta: 300 });
  assert.equal(app.ok, false);
  assert.ok(app.motivos.some((m) => /propuesta para la app/.test(m.mensaje)));
  assert.equal((await b.ejecutar(eje, 'vg', firmarVg, { topeDePropuesta: 300 })).ok, false);
  assert.equal((await b.probar(eje, 'vg', { topeDePropuesta: 40000 })).ok, true);
});

test('el resumen de un movimiento sale del candidato: qué nace, de quién a quién, cuánto, y lo que cuesta', async () => {
  const { eje, altaAna } = await libro();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  b.poner({ accion: 'give own R', X: altaAna.id, valores: { amount: 2 }, donde: { X: altaAna.id, pv: 3 } });
  const p = await b.probar(eje, 'vg');
  const [x] = p.items;
  assert.equal(x.entra, true);
  const c = x.candidato;
  assert.deepEqual(x.resumen, resumenDe(c, 'give own R'), 'el resumen es función del candidato');
  assert.deepEqual(x.resumen.nace, { accion: 'give own R', autor: 'vg', sobre: altaAna.id, en: c.en, t: c.t });
  assert.ok(x.resumen.movimientos.some((m) => m.serie === 'R:vg' && m.cantidad === 2 && m.de === 'vg' && m.a === 'ana'));
  const quema = c.movimientos.filter((m) => m.token === 'T' && m.de === 'vg' && m.a === null);
  assert.ok(quema.length > 0);
  assert.equal(x.resumen.cuesta.segundos, quema.reduce((s, m) => s + SEGUNDOS[m.escala] * m.cantidad, 0));
  assert.equal(p.cuesta.segundos, x.resumen.cuesta.segundos);
  // Nada del texto del libro: el resumen no lleva el payload (el mensaje de la plantilla).
  assert.ok(!JSON.stringify(x.resumen).includes(String(c.payload[0])));
});

test('ejecutarAhora va por el mismo camino y no toca el borrador guardado', async () => {
  const { eje, firmarVg } = await libro();
  const almacen = memoria();
  const b = crearBandeja({ almacen, libro: eje.genesisId, cuenta: 'vg' });
  b.poner(nota(eje, 'en la bandeja'));
  const guardado = almacen.m.get(b.clave);
  const n = eje.orden.length;
  const r = await ejecutarAhora(eje, 'vg', firmarVg, { accion: 'write to X', X: eje.genesisId, valores: { text: 'ahora' } });
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(r.tanda, null);
  assert.equal(eje.orden.length, n + 1);
  assert.equal(almacen.m.get(b.clave), guardado);
  // Lo que no entra, tampoco por el aro.
  const no = await ejecutarAhora(eje, 'vg', firmarVg, { accion: 'write to X', X: 'f'.repeat(64), valores: { text: 'x' } });
  assert.equal(no.ok, false);
  assert.equal(eje.orden.length, n + 1);
  assert.equal(almacen.m.get(b.clave), guardado);
});

test('las pruebas de posesión se rehacen sobre los ids marcados', async () => {
  const { eje, vg, firmarVg } = await libro();
  const caja = await generarClaves();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  b.poner({ accion: 'register a thing', X: eje.genesisId, valores: { thing: 'caja', minutes: 60, key: caja.publica }, donde: { X: eje.genesisId, pv: 1 } });
  b.poner({ accion: 'write to X', X: { pendiente: 'b1' }, valores: { text: 'sobre la caja' }, donde: { X: eje.genesisId, pv: 1 } });
  const posesion = (ev, identidad) => firmarPosesion(ev, identidad, caja.privada);
  const p = await b.probar(eje, 'vg', { posesion });
  assert.equal(p.ok, true, JSON.stringify(p.items.map((x) => x.motivos)));
  // Sin quien rehaga la prueba, la tanda no se lanza.
  const sin = await b.ejecutar(eje, 'vg', firmarVg);
  assert.equal(sin.ok, false);
  assert.ok(sin.motivos.some((m) => m.id === 'b1' && /posesion/.test(m.mensaje)), 'la época pide la prueba de la clave declarada');
  const r = await b.ejecutar(eje, 'vg', (ev) => firmar(ev, vg.privada), { posesion });
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.ok(r.eventos[0].posesion?.caja, 'la prueba va sobre el id definitivo');
  assert.equal(eje.clave('caja'), caja.publica);
});

test('la reserva de un mensaje entra delante, una sola vez; si falta saldo no entra ni el mensaje', async () => {
  const { ejemploNodo, N, CLAVES } = await import('../ejemplos/state/nodo.mjs');
  const { eje, ids } = await ejemploNodo();
  const yo = N.personaCasa;
  const firmarYo = (ev) => firmar(ev, CLAVES[yo].privada);
  // Una conversación nueva, por el aro: ahí la persona aún no tiene reserva.
  const abre = await ejecutarAhora(eje, yo, firmarYo, { accion: 'open a conversation', X: ids.agenteCasa, valores: { title: 'Otra pregunta' } });
  assert.equal(abre.ok, true, JSON.stringify(abre.motivos));
  const conversacion = abre.eventos[0].id;
  const almacen = memoria();
  const b = crearBandeja({ almacen, libro: eje.genesisId, cuenta: yo });
  const mensaje = (texto, extra = {}) => ({ accion: 'message in', X: conversacion, valores: { channel: 'house', text: texto }, donde: { X: conversacion, pv: 1 }, ...extra });
  b.poner(mensaje('¿Abrís el domingo?'));
  // Sin saldo para la reserva (se pide pagarla con dos partes de año: hoy solo hay una), no entra ni el mensaje.
  const sinSaldo = { denominacion: [{ escala: 'anio', cantidad: 2 }] };
  const p0 = await b.probar(eje, yo, sinSaldo);
  assert.deepEqual(p0.items.map((x) => [x.puesta, x.accion, x.entra]), [[true, 'a reserve', false], [false, 'message in', false]]);
  assert.match(p0.items[0].motivos[0].mensaje, /le queda hoy/);
  assert.equal(p0.items[1].motivos[0].mensaje, 'lo que exige antes no entra');
  const antes = foto(eje);
  const guardado = almacen.m.get(b.clave);
  const no = await b.ejecutar(eje, yo, firmarYo, sinSaldo);
  assert.equal(no.ok, false);
  assert.equal(foto(eje), antes);
  assert.equal(almacen.m.get(b.clave), guardado);
  // Con saldo: la reserva delante, con su coste, y una sola aunque haya dos mensajes.
  b.poner(mensaje('¿Y el lunes?', { nueva: true }));
  const p = await b.probar(eje, yo);
  assert.equal(p.ok, true, JSON.stringify(p.items.map((x) => x.motivos)));
  assert.deepEqual(p.items.map((x) => [x.id, x.puesta, x.accion]), [[null, true, 'a reserve'], ['b1', false, 'message in'], ['b2', false, 'message in']]);
  assert.equal(p.items[0].para, 'b1');
  assert.ok(p.items[0].resumen.cuesta.segundos > 0, 'su coste a la vista');
  const r = await b.ejecutar(eje, yo, firmarYo);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(r.eventos.length, 3);
  assert.deepEqual(eje.orden.slice(-3), r.eventos.map((e) => e.id));
  assert.deepEqual(b.listar().entradas, []);
  // Ya está en el libro: otro mensaje no la vuelve a poner.
  b.poner(mensaje('Gracias'));
  const otra = await b.probar(eje, yo);
  assert.equal(otra.ok, true, JSON.stringify(otra.items.map((x) => x.motivos)));
  assert.deepEqual(otra.items.map((x) => x.puesta), [false]);
});

test('lo que se retoca o se pone mientras se firma se queda en el borrador', async () => {
  const { eje, firmarVg } = await libro();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  b.poner(nota(eje, 'uno'));
  b.poner(nota(eje, 'dos', { donde: { X: eje.genesisId, pv: 6 } }));
  let una = false;
  const r = await b.ejecutar(eje, 'vg', async (ev) => {
    if (!una) {
      una = true;
      b.poner(nota(eje, 'dos retocada', { donde: { X: eje.genesisId, pv: 6 } }));
      b.poner(nota(eje, 'nueva', { donde: { X: eje.genesisId, pv: 9 } }));
    }
    return firmarVg(ev);
  });
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.deepEqual(r.quedan, ['b2']);
  assert.deepEqual(b.listar().entradas.map((e) => [e.id, e.valores.text]), [['b2', 'dos retocada'], ['b3', 'nueva']]);
});

test('los topes se miden como el núcleo y la puerta: bytesDeMiembro por registro y bytesDeTanda la tanda entera (1 MiB)', async () => {
  const { bytesDeMiembro, bytesDeTanda, TANDA_TOPES } = await import('../src/evento.js');
  const { eje, firmarVg } = await libro();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  b.poner(nota(eje, 'una'));
  b.poner(nota(eje, 'otra', { nueva: true }));
  const p = await b.probar(eje, 'vg');
  assert.equal(p.ok, true);
  p.items.forEach((x, k) => assert.equal(x.bytes, bytesDeMiembro(x.candidato, k, 2), 'como viajará: marcado y firmado'));
  assert.equal(TOPE_POR_REGISTRO, TANDA_TOPES.porMiembro);
  b.vaciar();
  // Cinco de unos 220 KB: cada uno cabe, la tanda entera no.
  for (let k = 0; k < 5; k++) b.poner(nota(eje, String(k) + 'ñ'.repeat(110000), { nueva: true }));
  const grande = await b.probar(eje, 'vg');
  assert.ok(grande.items.every((x) => x.entra), 'cada registro cabe');
  assert.ok(bytesDeTanda(grande.items.map((x) => x.candidato)) > TANDA_TOPES.porPeticion);
  assert.ok(grande.motivos.some((m) => /la tanda entera pasa de/.test(m.mensaje)));
  const antes = eje.orden.length;
  assert.equal((await b.ejecutar(eje, 'vg', firmarVg)).ok, false);
  assert.equal(eje.orden.length, antes);
});

test('tocar un valor en un campo compone en la bandeja: el registro «pointed» en su posición, que se actualiza en el mismo campo; y por el aro, ahora', async () => {
  const { direccion } = await import('../src/btml.js');
  const { eje, firmarVg } = await libro();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  const campo = (texto, pv = 3) => ({ tipo: 'campo', en: direccion([pv]), X: eje.genesisId, valores: { texto }, donde: { X: eje.genesisId, pv } });
  assert.equal(b.poner(campo('primero')).ok, true);
  const otra = b.poner(campo('segundo'));
  assert.equal(otra.actualizada, true, 'el mismo campo: se actualiza');
  assert.equal(b.poner(campo('en el 6', 6)).actualizada, false);
  assert.equal(b.poner({ ...campo(''), nueva: true }).ok, false, 'sin texto no hay campo');
  assert.equal(b.poner({ ...campo('x'), accion: 'write to X' }).ok, false, 'un campo no lleva acción');
  assert.equal(b.poner({ ...campo('x'), en: '3' }).ok, false);
  const p = await b.probar(eje, 'vg');
  assert.equal(p.ok, true, JSON.stringify(p.items.map((x) => x.motivos)));
  assert.equal(p.items[0].resumen.nace.accion, null, 'no es una acción');
  const n = eje.orden.length;
  const r = await b.ejecutar(eje, 'vg', firmarVg);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(eje.orden.length, n + 2);
  const [tres, seis] = r.eventos;
  assert.deepEqual([tres.en, tres.sobre, tres.contexto.modo, JSON.stringify(tres.payload).includes('segundo')], [direccion([3]), eje.genesisId, 'pointed', true]);
  assert.equal(seis.en, direccion([6]));
  assert.ok(tres.movimientos.some((m) => m.token === 'T' && m.de === 'vg' && m.a === null), 'paga el coste de escribir');
  const ahora = await ejecutarAhora(eje, 'vg', firmarVg, { tipo: 'campo', en: direccion([3]), X: eje.genesisId, valores: { texto: 'por el aro' } });
  assert.equal(ahora.ok, true, JSON.stringify(ahora.motivos));
  assert.equal(eje.orden.length, n + 3);
});

test('lo que la lente sabe que falta fuera del libro (opciones.revisar: un archivo que ya no está aquí) deja la entrada fuera, con su motivo', async () => {
  const { eje, firmarVg } = await libro();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  b.poner(nota(eje, 'archivo:' + 'a'.repeat(64)));
  const revisar = (e) => (JSON.stringify(e.valores).includes('archivo:') ? 'el archivo ya no está' : null);
  const p = await b.probar(eje, 'vg', { revisar });
  assert.deepEqual([p.ok, p.items[0].entra, p.items[0].motivos[0].mensaje], [false, false, 'el archivo ya no está']);
  const antes = eje.orden.length;
  assert.equal((await b.ejecutar(eje, 'vg', firmarVg, { revisar })).ok, false);
  assert.equal(eje.orden.length, antes);
  assert.equal((await b.probar(eje, 'vg')).ok, true, 'sin revisar, entra');
});

test('enviarPorLaBandeja: lo que hacía enviar (una acción, ya) por el único camino, con la forma de enviar; sin firma en un libro que no la pide', async () => {
  const { eje, firmarVg } = await libro();
  const n = eje.orden.length;
  const r = await enviarPorLaBandeja(eje, eje.genesisId, 'write to X', { text: 'hola' }, 'vg', firmarVg);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(r.asentado.id, eje.orden.at(-1));
  assert.equal(r.evento, r.asentado);
  assert.ok(r.asentado.firma);
  assert.equal(eje.orden.length, n + 1);
  const no = await enviarPorLaBandeja(eje, 'f'.repeat(64), 'write to X', { text: 'x' }, 'vg', firmarVg);
  assert.deepEqual([no.ok, no.asentado, no.fase], [false, null, 'componer']);
  assert.ok(no.motivos.length > 0);
  // Quien tiene clave y no firma: el libro lo rechaza (como con enviar sin firma).
  const sin = await enviarPorLaBandeja(eje, eje.genesisId, 'write to X', { text: 'sin firma' }, 'vg', undefined);
  assert.equal(sin.ok, false);
  assert.equal(eje.orden.length, n + 1);
  for (const [archivo, sitio] of [['app.js', 'reclasificar'], ['app.js', 'propuesta'], ['reglas.js', 'actuar'], ['reglas.js', 'proponer'], ['carta.js', 'guardarRetoque'], ['archivos.js', 'adjuntarHtmlInicial']]) {
    const fuente = readFileSync(new URL('../carta/' + archivo, import.meta.url), 'utf8');
    const i = Math.max(fuente.indexOf('async function ' + sitio + '('), fuente.indexOf('async ' + sitio + '('));
    assert.ok(i >= 0, sitio);
    assert.match(fuente.slice(i, i + 3000), /enviarPorLaBandeja\(/, archivo + ' · ' + sitio);
  }
});

test('un registro hecho por la lente (preferencias, ajustes, formato) va por la bandeja: el mismo registro que escribirDesde, por el único camino', async () => {
  const { preferencias } = await import('../carta/carta.js');
  const salida = await import('../src/escritura.js');
  const { eje, vg, firmarVg } = await libro();
  const p = preferencias(eje, 'vg', { language: 'en' });
  assert.ok(p, 'la plantilla de preferencias da su registro');
  // El de siempre, sobre un libro gemelo, para comparar.
  const gemelo = await Eje.desde(eje.orden.map((id) => eje.obtener(id)), { exigirFirmas: true });
  const t = '2026-11-18T11:00:00Z';
  const viejo = await salida.escribirDesde(gemelo, { modo: 'sequenced', autor: 'vg', sobre: p.sobre, en: p.en, payload: p.payload, t }, vg.privada);
  const nuevo = await escribirPorLaBandeja(eje, 'vg', firmarVg, { modo: 'sequenced', sobre: p.sobre, en: p.en, payload: p.payload }, { t });
  for (const k of ['autor', 'sobre', 'en', 't', 'payload', 'movimientos', 'contexto']) assert.deepEqual(nuevo[k], viejo[k], k);
  assert.equal(nuevo.id, viejo.id, 'el mismo registro');
  assert.ok(nuevo.firma);
  assert.equal(eje.orden.at(-1), nuevo.id);
  // Lo que no vale no entra y lo dice (como escribirDesde, lanza con los motivos).
  await assert.rejects(escribirPorLaBandeja(eje, 'vg', firmarVg, { modo: 'pointed', sobre: p.sobre, en: p.en, payload: [] }), /nada que emitir/);
  await assert.rejects(escribirPorLaBandeja(eje, 'vg', firmarVg, { modo: 'sequenced', sobre: 'f'.repeat(64), en: p.en, payload: p.payload }));
  // En el borrador también vale: se compone y se ve.
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  const r = b.poner({ tipo: 'registro', modo: 'sequenced', en: p.en, X: p.sobre, valores: { payload: preferencias(eje, 'vg', { language: 'es' }).payload } });
  assert.equal(r.ok, true, r.motivo);
  assert.equal(b.poner({ tipo: 'registro', modo: 'sequenced', en: p.en, X: p.sobre, valores: { payload: 'no' } }).ok, false, 'un registro lleva un payload');
  assert.equal((await b.probar(eje, 'vg')).ok, true);
});

test('el orden de la tanda se cambia a mano (subir, bajar), sin pasar a una entrada por delante de lo que nombra; y se ejecuta en ese orden', async () => {
  const { eje, firmarVg } = await libro();
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'vg' });
  b.poner(nota(eje, 'uno'));
  b.poner(nota(eje, 'dos', { donde: { X: eje.genesisId, pv: 6 } }));
  b.poner({ accion: 'propose', X: eje.genesisId, valores: { title: 'Tarea', content: 'algo' }, donde: { X: eje.genesisId, pv: 4 } }); // b3
  b.poner({ accion: 'write to X', X: { pendiente: 'b3' }, valores: { text: 'sobre la tarea' }, donde: { X: eje.genesisId, pv: 4 } }); // b4
  assert.deepEqual(b.mover('b2', -1), { ok: true, orden: ['b2', 'b1', 'b3', 'b4'] });
  assert.deepEqual(b.mover('b2', -1), { ok: false, porque: 'borde' });
  assert.deepEqual(b.mover('b4', -1), { ok: false, porque: 'depende' }, 'no pasa por delante de la tarea que nombra');
  assert.deepEqual(b.mover('b3', 1), { ok: false, porque: 'depende' }, 'ni la tarea por detrás de la nota que la nombra');
  assert.deepEqual(b.mover('b9', 1), { ok: false, porque: 'no-esta' });
  assert.deepEqual(b.mover('b1', 1), { ok: true, orden: ['b2', 'b3', 'b1', 'b4'] });
  assert.deepEqual(b.listar().entradas.map((e) => e.id), ['b2', 'b3', 'b1', 'b4'], 'guardado');
  const r = await b.ejecutar(eje, 'vg', firmarVg);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.deepEqual(r.items.map((x) => x.id), ['b2', 'b3', 'b1', 'b4'], 'se ejecuta en ese orden');
  assert.deepEqual(eje.orden.slice(-4), r.eventos.map((e) => e.id));
});
