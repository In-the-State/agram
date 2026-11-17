// La época por referencia (tramo 4, parte A; agram-equipo/DISENO_TRAMO_4.md §2; docs/notas/VERSIONES.md §11): un libro
// nace con la época de otro en un punto. La época escrita gana `cambios` ({ raiz, registros, cambios: [{ raiz,
// registros }, …] }); al cargar se funde cada cambio encima, en orden, con la misma función con que el libro de arriba
// los fundió. El libro de arriba es el de test/versiones.test.js: una época hija de la 0 con nivel pedido 0 y una regla
// de prueba con su parámetro (7.8.1). De paso (Core AARPIA): eje.alta(x) da también su autor. Identidades inventadas,
// ejes de demostración en memoria.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { EPOCA_0_BTML, cargarEpocaEscrita, epocaEscritaDe, idDeRegistro, RAIZ_DE_LA_0_POR_REFERENCIA } from '../src/epocas.js';
import { crearEvento } from '../src/evento.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';
import { epocaState } from '../datos/epocas/state/generar.mjs';
import * as V from '../src/versiones.js';

const T0 = '2026-11-17T09:00:00Z';
const T1 = '2026-11-18T09:00:00Z';
const B = EPOCA_0_BTML.id;
const M = { ref: B };
const copia = (x) => JSON.parse(JSON.stringify(x));

/** La regla de prueba: un registro «test measure» no pasa de epoch.7.8.1 (o de lo que diga la condición). */
const regla = (condicion = '=not ("test measure" in ev.4) or first (payload(ev)).1 <= first epoch.7.8.1', mensaje = 'a test limit: {first (payload(ev)).1} is above the limit') => [['a test limit'], [0], [condicion], ['ev.3'], ['mint', 'transfer', 'lock', 'release', 'burn'], ['*'], ['prueba de la época por referencia'], ['test epoch'], ['after at most a year ahead'], [mensaje]];
const REGLA = regla();
/** La regla nueva del segundo cambio: más estricta, no pasa de 3. */
const ESTRICTA = regla('=not ("test measure" in ev.4) or first (payload(ev)).1 <= 3', 'a test limit: {first (payload(ev)).1} is above three');

const fila79 = (propias) => Array.from({ length: Math.max(...Object.keys(propias).map(Number)) + 1 }, (_, i) => propias[i] ?? M);
const siete = ({ ocho = M, nueve } = {}) => [M, M, M, M, M, M, M, M, ocho, ...(nueve ? [nueve] : [])];

/** La época de nacimiento del libro de arriba: hija de la 0, nivel pedido 0 y la regla de prueba con su 7.8.1 = 5. */
const EPOCA = Object.freeze({
  raiz: [['por referencia de prueba'], M, [{ ref: idDeRegistro(REGLA) }], M, M, M, [['época hija de prueba de la época por referencia'], ['hereda'], [B]], siete({ ocho: [M, [5]], nueve: fila79({ 3: [0], 4: [0] }) })],
  registros: [REGLA],
});

/** La raíz de un cambio sobre la época `id`: la marca en todo salvo `propias`. */
function raizDeCambio(id, titulo, propias) {
  const m = { ref: id };
  const n = Math.max(6, ...Object.keys(propias).map(Number)) + 1;
  return Array.from({ length: n }, (_, i) => (i === 0 ? [titulo] : propias[i] ?? (i === 6 ? [['propuesto en la prueba'], ['hereda'], [id]] : m)));
}

/** Un libro de `yo` con la época `epoca`: lanzar plantillas, aprobar y poner en vigor cambios, y medir con la regla. */
async function libro({ epoca = EPOCA, yo = 'ana', t0 = T0 } = {}) {
  let s = 0;
  const eje = await Eje.genesis({ identidad: yo, foco: ['el libro de ' + yo], t: t0, demostracion: true, epoca });
  const t = () => new Date(Date.parse(t0) + (++s) * 60_000).toISOString().replace('.000Z', 'Z');
  const intenta = async (cual, params) => {
    const r = await A.transaccion(eje, cual, params, yo, { t: t() });
    if (!r.evento) return { motivos: r.motivos };
    try {
      return { ev: await eje.anadir(r.evento) };
    } catch (e) {
      return { motivos: e.motivos ?? [{ texto: e.message }], error: e };
    }
  };
  const lanza = async (cual, params) => {
    const r = await intenta(cual, params);
    assert.ok(r.ev, cual + ': ' + JSON.stringify(r.motivos));
    return r.ev;
  };
  /** Propone, apoya, aprueba y pone en vigor un cambio sobre la época vigente: el registro que lo puso en vigor. */
  const enVigor = async (titulo, propias, { clase = 'ordinary', registros } = {}) => {
    const p = await lanza('propose a change', { X: eje.genesisId, title: titulo, explanation: 'prueba', change: raizDeCambio(eje.epoca().id, titulo, propias), ...(registros ? { records: registros } : {}), class: clase });
    await lanza('support a change', { X: p.id });
    const aprobacion = await lanza('enact a change', { X: p.id });
    await lanza('withdraw support', { X: p.id });
    return lanza('put a change in force', { X: aprobacion.id });
  };
  const mide = (n) => escribirPagando(eje, { autor: yo, sobre: eje.genesisId, t: t(), movimientos: [pagaElCoste(yo)], payload: [['medida'], [n], ['x'], [yo], ['test measure']] }).then((ev) => ({ ev }), (e) => ({ motivos: e.motivos, error: e }));
  return { eje, t, intenta, lanza, enVigor, mide };
}

/** El libro de arriba con dos cambios en vigor: el límite sube de 5 a 10; luego rige la regla nueva, que no pasa de 3. */
async function arriba() {
  const L = await libro();
  const primero = await L.enVigor('subir el límite', { 7: siete({ ocho: [M, [10]] }) });
  const segundo = await L.enVigor('una regla más estricta', { 2: [{ ref: idDeRegistro(ESTRICTA) }] }, { registros: [ESTRICTA], clase: 'governance' });
  assert.equal(L.eje.versiones().length, 3);
  return { ...L, primero, segundo };
}

/** Lo que rige en una época: reglas (con id), condiciones, plantillas, la fila 7.9 y la raíz resuelta entera. */
const loQueRige = (e) => ({
  reglas: e.reglasConId.map((x) => x.id),
  condiciones: JSON.stringify(e.condiciones),
  plantillas: e.transacciones.map((x) => x.id),
  fila79: JSON.stringify(e.registro[7][9]),
  registro: JSON.stringify(e.registro),
});

test('época por referencia: nacido de la vigente, rige lo mismo que arriba; nacido de la versión 1, lo del punto intermedio', async () => {
  const { eje } = await arriba();
  const vigente = epocaEscritaDe(eje.epoca());
  assert.deepEqual(Object.keys(vigente), ['raiz', 'registros', 'cambios']);
  assert.equal(vigente.raiz, eje.versiones()[0].version.escrita.raiz, 'la raíz, la que escribió el libro al nacer');
  assert.deepEqual(vigente.cambios.map((c) => c.raiz[0][0]), ['subir el límite', 'una regla más estricta'], 'sus cambios en vigor, en orden');
  assert.deepEqual(vigente.cambios[1].registros, [ESTRICTA]);
  const intermedia = epocaEscritaDe(eje.versiones()[1].version);
  assert.equal(intermedia.cambios.length, 1);
  assert.deepEqual(Object.keys(epocaEscritaDe(eje.versiones()[0].version)), ['raiz', 'registros'], 'sin cambios, lo de hoy');

  const nuevo = (await libro({ epoca: vigente, yo: 'bea', t0: T1 })).eje;
  assert.deepEqual(loQueRige(nuevo.epoca()), loQueRige(eje.epoca()), 'la misma época que la versión de arriba');
  assert.equal(nuevo.epoca().id, eje.epoca().id, 'su id es el de la época de arriba');
  assert.equal(nuevo.epoca().nombre, eje.epoca().nombre);
  // Sus versiones empiezan en una sola, la de nacimiento, que ya lleva los cambios.
  const v = nuevo.versiones();
  assert.equal(v.length, 1);
  assert.equal(v[0].version, nuevo.epoca());
  assert.equal(v[0].version.escrita.cambios.length, 2, 'el nacimiento dice con qué cambios nació');
  assert.equal(v[0].version.anterior, undefined, 'no es una versión de un cambio: es el nacimiento');
  // Los registros de época: la raíz, su regla y, detrás, los de cada cambio (con su contexto).
  const deEpoca = nuevo.registrosDeLaEpoca.map((id) => nuevo.obtener(id).contexto);
  assert.equal(deEpoca.length, 2 + 1 + 2);
  assert.deepEqual(deEpoca.map((c) => [c.cambio, c.raizDelCambio]), [[undefined, undefined], [undefined, undefined], [1, true], [2, true], [2, undefined]]);
  assert.ok(deEpoca.every((c) => c.registroDeEpoca === true && c.epoca === eje.epoca().id));
  assert.equal(nuevo.obtener(nuevo.genesisId).contexto.epocaEscrita, 5);

  const medio = (await libro({ epoca: intermedia, yo: 'cris', t0: T1 })).eje;
  assert.deepEqual(loQueRige(medio.epoca()), loQueRige(eje.versiones()[1].version), 'la del punto intermedio');
  assert.deepEqual(medio.epoca().registro[7][8][1], [10]);
  assert.equal(medio.epoca().reglasConId.find((x) => x.regla[0][0] === 'a test limit').id, idDeRegistro(REGLA));
  // Una época cargada (o una versión) vale por su forma escrita.
  const deVersion = (await libro({ epoca: eje.epoca(), yo: 'dani', t0: T1 })).eje;
  assert.deepEqual(deVersion.registrosDeLaEpoca.map((id) => deVersion.obtener(id).payload), nuevo.registrosDeLaEpoca.map((id) => nuevo.obtener(id).payload));
});

test('época por referencia: lo que arriba rechaza la regla nueva se rechaza igual en el nacido con ella y entra en el nacido sin ella', async () => {
  const A1 = await arriba();
  const rechazo = await A1.mide(4);
  assert.match(rechazo.error.message, /a test limit: 4 is above three/);
  const con = await libro({ epoca: epocaEscritaDe(A1.eje.epoca()), yo: 'bea', t0: T1 });
  const sin = await libro({ epoca: epocaEscritaDe(A1.eje.versiones()[1].version), yo: 'cris', t0: T1 });
  const r = await con.mide(4);
  assert.match(r.error.message, /a test limit: 4 is above three/);
  assert.deepEqual(r.motivos.map((m) => [m.texto, m.regla]), rechazo.motivos.map((m) => [m.texto, m.regla]), 'los mismos motivos');
  assert.ok((await sin.mide(4)).ev, 'sin la regla nueva, entra (rige el límite de 10)');
  assert.match((await sin.mide(11)).error.message, /a test limit: 11 is above the limit/);
  assert.ok((await con.mide(3)).ev);
});

test('época por referencia: sin cambios, el génesis y sus registros son byte a byte los de hoy', async () => {
  const hoy = async (epoca, yo) => {
    // El génesis y los registros de época tal como los escribe el código de antes del tramo 4.
    const g = await crearEvento({ autor: yo, sobre: null, t: T0, movimientos: [], payload: ['el libro de ' + yo], contexto: { genesis: true, epoca: idDeRegistro(epoca.raiz), epocaEscrita: 1 + epoca.registros.length, demostracion: true } });
    const ids = [g.id];
    for (const payload of [epoca.raiz, ...epoca.registros]) ids.push((await crearEvento({ autor: yo, sobre: g.id, t: T0, movimientos: [], payload, contexto: { epoca: idDeRegistro(epoca.raiz), registroDeEpoca: true } })).id);
    return ids;
  };
  for (const [epoca, cual] of [[EPOCA, 'la hija de prueba'], [epocaState(), 'la época state']]) {
    const esperado = await hoy(epoca, 'ana');
    assert.deepEqual((await libro({ epoca })).eje.orden, esperado, cual);
    assert.deepEqual((await libro({ epoca: { ...epoca, cambios: [] } })).eje.orden, esperado, cual + ', con una lista de cambios vacía');
    assert.deepEqual((await libro({ epoca: cargarEpocaEscrita(epoca) })).eje.orden, esperado, cual + ', cargada');
  }
  // Y lo que epocaEscritaDe da de una época sin cambios, también lo de hoy.
  assert.deepEqual(Object.keys(epocaEscritaDe(cargarEpocaEscrita(EPOCA))), ['raiz', 'registros']);
  assert.deepEqual(Object.keys(epocaEscritaDe(EPOCA_0_BTML)), ['raiz', 'registros']);
});

test('época por referencia: la época state como nacimiento y un cambio encima', async () => {
  const st = epocaState();
  const nacida = cargarEpocaEscrita(st);
  const cambio = { raiz: raizDeCambio(nacida.id, 'más margen', { 7: [{ ref: nacida.id }, { ref: nacida.id }, { ref: nacida.id }, [[900], [7200]]] }), registros: [] };
  const fundida = V.fundirCambio(nacida, cambio);
  assert.deepEqual(V.erroresDelSuelo(nacida, fundida.version), []);
  const { eje } = await libro({ epoca: { ...st, cambios: [cambio] }, yo: 'bea', t0: T1 });
  assert.equal(eje.epoca().id, nacida.id);
  assert.deepEqual(loQueRige(eje.epoca()), loQueRige(fundida.version));
  assert.deepEqual(eje.epoca().registro[7][3][0], [900]);
  assert.equal(eje.epoca().reglasConId.length, nacida.reglasConId.length, 'lo de la state sigue');
  assert.equal(eje.versiones().length, 1);
  // Y su forma escrita da lo mismo otra vez.
  const otra = epocaEscritaDe(eje.epoca());
  assert.equal(otra.registros.length, st.registros.length);
  assert.equal(otra.cambios.length, 1);
  assert.deepEqual(loQueRige(cargarEpocaEscrita(otra)), loQueRige(eje.epoca()));
});

test('época por referencia: un libro nacido con la 0 del código da RAIZ_DE_LA_0_POR_REFERENCIA, que carga como la 0', async () => {
  const cero = cargarEpocaEscrita({ raiz: RAIZ_DE_LA_0_POR_REFERENCIA, registros: [] });
  for (const k of ['reglas', 'condiciones', 'plantillas', 'fila79']) assert.deepEqual(loQueRige(cero)[k], loQueRige(EPOCA_0_BTML)[k], k);
  assert.equal(cero.nombre, EPOCA_0_BTML.nombre);
  assert.equal(cero.hereda, B);
  assert.notEqual(cero.id, B, 'es otra raíz: su id no es el de la 0');
  // Una versión sobre la 0 del código (un cambio fundido a mano: con la 0 sola, poner en vigor pide firmeza).
  const cambio = { raiz: raizDeCambio(B, 'más margen', { 7: [M, M, M, [[900], [7200]]] }), registros: [] };
  const version = V.fundirCambio(EPOCA_0_BTML, cambio).version;
  const escrita = epocaEscritaDe(version);
  assert.equal(escrita.raiz, RAIZ_DE_LA_0_POR_REFERENCIA);
  assert.deepEqual(escrita.registros, []);
  assert.equal(escrita.cambios.length, 1);
  const { eje } = await libro({ epoca: escrita, yo: 'bea', t0: T1 });
  for (const k of ['reglas', 'condiciones', 'plantillas', 'fila79']) assert.deepEqual(loQueRige(eje.epoca())[k], loQueRige(version)[k], k);
  assert.deepEqual(eje.epoca().registro[7][3][0], [900]);
});

test('época por referencia: un cambio manipulado (toca el suelo, no hereda, orden cambiado) no abre el libro', async () => {
  const nacida = cargarEpocaEscrita(EPOCA);
  const id = nacida.id;
  const abre = (cambios) => Eje.genesis({ identidad: 'bea', foco: ['bea'], t: T1, demostracion: true, epoca: { ...EPOCA, cambios } });
  // Toca el suelo: sustituye «the cost of writing».
  const coste = copia(EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === 'the cost of writing').regla);
  coste[6] = ['una nota distinta: es otra regla con el mismo nombre'];
  await assert.rejects(abre([{ raiz: raizDeCambio(id, 'otro coste', { 2: [{ ref: idDeRegistro(coste) }] }), registros: [coste] }]), /no abre con el cambio 1 de 1 \(«otro coste»\): el cambio sustituye «the cost of writing», que es del suelo/);
  // No hereda de la época del libro.
  const ajena = raizDeCambio(id, 'de otra', { 7: siete({ ocho: [M, [10]] }) });
  ajena[6] = [['x'], ['hereda'], ['ab'.repeat(32)]];
  await assert.rejects(abre([{ raiz: ajena, registros: [] }]), /no abre con el cambio 1 de 1 \(«de otra»\): el cambio no hereda de la época de este libro/);
  // El orden importa: sustituir la regla y después llevarla al suelo abre; al revés, la sustitución ya toca el suelo.
  const sustituir = { raiz: raizDeCambio(id, 'una regla más estricta', { 2: [{ ref: idDeRegistro(ESTRICTA) }] }), registros: [ESTRICTA] };
  const alSuelo = { raiz: raizDeCambio(id, 'la regla al suelo', { 7: siete({ nueve: fila79({ 6: [...V.sueloDe(nacida), 'a test limit'] }) }) }), registros: [] };
  const bien = await abre([sustituir, alSuelo]);
  assert.ok(V.sueloDe(bien.epoca()).includes('a test limit'));
  await assert.rejects(abre([alSuelo, sustituir]), /no abre con el cambio 2 de 2 \(«una regla más estricta»\): el cambio sustituye «a test limit», que es del suelo/);
  // Mal formado.
  await assert.rejects(abre([{ registros: [] }]), /época mal formada: el cambio 1: la raíz de la época es una décupla/);
  await assert.rejects(abre({ raiz: ajena }), /los cambios de la época son una lista/);
  // En el libro: los registros de los cambios en otro orden no se restauran.
  const eventos = bien.orden.map((x) => bien.obtener(x));
  // [génesis, raíz, regla, raíz del cambio 1, su regla, raíz del cambio 2]: el cambio 2 delante del 1.
  const cambiado = [...eventos.slice(0, 3), eventos[5], eventos[3], eventos[4]];
  await assert.rejects(Eje.desde(cambiado), /los cambios van en orden y sin saltos: tras la época de nacimiento va el cambio 1, no el 2/);
  const { cambio: _cambio, ...sinNumero } = eventos[3].contexto;
  const sinCambio = await crearEvento({ autor: 'bea', sobre: bien.genesisId, t: T1, movimientos: [], payload: eventos[3].payload, contexto: sinNumero });
  await assert.rejects(Eje.desde([...eventos.slice(0, 3), sinCambio, ...eventos.slice(4)]), /solo la raíz de un cambio lo dice en su contexto/);
});

test('época por referencia: restaurar, Eje.desde, reordenar y antes(n) dan la misma época', async () => {
  const { eje: arribaEje } = await arriba();
  const L = await libro({ epoca: epocaEscritaDe(arribaEje.epoca()), yo: 'bea', t0: T1 });
  assert.ok((await L.mide(2)).ev);
  const { eje } = L;
  const firma = (e) => [e.epoca().id, loQueRige(e.epoca()), e.versiones().length, e.epoca().escrita.cambios.length, e.registrosDeLaEpoca];
  assert.deepEqual(firma(await restaurar(serializar(eje))), firma(eje));
  assert.deepEqual(firma(await Eje.desde(eje.orden.map((id) => eje.obtener(id)))), firma(eje));
  const otro = await Eje.desde(eje.orden.map((id) => eje.obtener(id)));
  const { rechazados } = await otro.reordenar([...eje.orden]);
  assert.deepEqual(rechazados, []);
  assert.deepEqual(firma(otro), firma(eje));
  assert.deepEqual(firma(eje.antes(eje.orden.length)), firma(eje));
  assert.deepEqual(firma(eje.antes(1 + eje.registrosDeLaEpoca.length)), firma(eje), 'justo con la apertura entera');
  assert.throws(() => eje.antes(eje.registrosDeLaEpoca.length).epoca(), /no está entera en el libro/, 'sin el último registro de un cambio, la época no está entera');
});

test('época por referencia: el libro nuevo pone en vigor un cambio propio encima, y lo hereda quien nazca de él', async () => {
  const { eje: arribaEje } = await arriba();
  const L = await libro({ epoca: epocaEscritaDe(arribaEje.epoca()), yo: 'bea', t0: T1 });
  const { eje } = L;
  const nacimiento = eje.epoca();
  const puesta = await L.enVigor('subir otra vez', { 7: siete({ ocho: [M, [20]] }) });
  assert.equal(eje.versiones().length, 2);
  assert.equal(eje.versiones()[1].registro, puesta.id);
  assert.equal(eje.epoca().id, nacimiento.id);
  assert.equal(eje.epoca().anterior, nacimiento);
  assert.deepEqual(eje.epoca().registro[7][8][1], [20]);
  // La regla nueva de arriba sigue rigiendo (no pasa de 3), con el parámetro nuevo de este libro.
  assert.match((await L.mide(4)).error.message, /a test limit: 4 is above three/);
  // Quien nazca de este libro nace con los dos cambios de arriba y el propio, en orden.
  const escrita = epocaEscritaDe(eje.epoca());
  assert.deepEqual(escrita.cambios.map((c) => c.raiz[0][0]), ['subir el límite', 'una regla más estricta', 'subir otra vez']);
  const nieto = (await libro({ epoca: escrita, yo: 'cris', t0: T1 })).eje;
  assert.deepEqual(loQueRige(nieto.epoca()), loQueRige(eje.epoca()));
  assert.equal(nieto.versiones().length, 1);
});

test('de paso (Core AARPIA): eje.alta(x) da también quién escribió el alta', async () => {
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true });
  assert.deepEqual(eje.alta('ana'), { id: eje.genesisId, t: T0, autor: 'ana' });
  const r = await A.transaccion(eje, 'register a thing', { X: eje.genesisId, thing: 'robot', minutes: 1 }, 'ana', { t: '2026-11-17T09:01:00Z' });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  const robot = await eje.anadir(r.evento);
  assert.deepEqual(eje.alta('robot'), { id: robot.id, t: robot.t, autor: 'ana' }, 'una cosa: su alta la escribe su dueño');
  assert.equal(eje.alta('nadie'), null);
});
