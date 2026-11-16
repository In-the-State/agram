// Copia de test/recibo.test.js de stateark-sim (Core StateArk, commit 108f888: el recibo único y la equivocación; firmarRecibo exige dominio y t), con las rutas adaptadas a este repo (servidor/sim/stateark/ y src/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  Custodia, RechazoCustodia, esquemaNoble, verificarReciboComun, camposDeRecibo,
  construirEquivocacion, verificarEquivocacion, ErrorEquivocacion,
} from '../servidor/sim/stateark/index.js';
import { sha256Texto } from '../servidor/sim/stateark/hash.js';

const AGRAM = process.env.AGRAM_SRC ?? fileURLToPath(new URL('../src', import.meta.url));
const hayAgram = existsSync(`${AGRAM}/evento.js`);
const T = '2026-11-12T12:00:00Z';
const codigo = (c) => (e) => e instanceof RechazoCustodia && e.codigo === c;

const aceptacion = (evento, nucleo = 'abc123', epoca = 'e0') => ({
  clase: 'aceptación', sujeto: [evento], ata: [['evento', evento]], universo: 'relé aarpia-sim',
  nucleo, epoca, noAfirma: ['NO afirma que lo que dice el evento sea verdad'],
});
const rechazo = (evento, nucleo = 'abc123', epoca = 'e0') => ({
  clase: 'rechazo', sujeto: [evento], ata: [['evento', evento]], causa: 'writing burns today\'s T', universo: 'relé aarpia-sim',
  nucleo, epoca, noAfirma: ['NO afirma nada sobre el autor fuera de este evento'],
});

async function autoridad(opciones) {
  const k = new Custodia(opciones);
  await k.crearClave('nostr', 'autoridad');
  return k;
}

test('un recibo firmado verifica, y sus campos se leen tal cual', async () => {
  const k = await autoridad();
  const ev = await sha256Texto('evento 1');
  const r = await k.firmarRecibo('autoridad', aceptacion(ev), { t: T, dominio: 'nostr' });
  const v = await verificarReciboComun(r);
  assert.equal(v.ok, true);
  assert.equal(v.clase, 'aceptación');
  assert.deepEqual(v.sujeto, [ev]);
  assert.equal(v.nucleo, 'abc123');
  assert.equal(v.cuanto, undefined);
  assert.equal(r.recibo.length, 4); // sin evidencia: acaba en el 3, sin huecos, sin relleno y sin tuplas
  assert.deepEqual(r.recibo[2], ['evento', 'universo', 'núcleo', 'época', 'no afirma']);
  assert.deepEqual(r.recibo[3], [ev, 'relé aarpia-sim', 'abc123', 'e0', 'NO afirma que lo que dice el evento sea verdad']);
  assert.equal(r.recibo.flat(Infinity).some((x) => Array.isArray(x)), false);
  assert.deepEqual(camposDeRecibo(r.recibo).noAfirma, ['NO afirma que lo que dice el evento sea verdad']);
});

test('el recibo es BTML válido según el validador de AGRAM (sin huecos y sin relleno)', { skip: !hayAgram && 'no está el repo de AGRAM' }, async () => {
  const { validarPayload } = await import(pathToFileURL(`${AGRAM}/btml.js`).href).catch(() => import(pathToFileURL(`${AGRAM}/evento.js`).href));
  assert.equal(typeof validarPayload, 'function', 'validarPayload no está donde se esperaba');
  const k = await autoridad();
  const ev = await sha256Texto('evento 2');
  for (const campos of [aceptacion(ev), rechazo(ev), {
    clase: 'pago', sujeto: ['f'.repeat(64)], ata: [['destino', '5120ab']], cuanto: ['61000', 'sat'],
    universo: 'regtest', evidencia: ['0200000001ab', 'cd'.repeat(80), ['d'], ['ef'.repeat(32)]], noAfirma: ['NO afirma quién controla el destino', 'NO afirma por qué se pagó'],
  }]) {
    const r = await k.firmarRecibo('autoridad', campos, { t: T, dominio: 'nostr' });
    assert.deepEqual(validarPayload(r.recibo), { ok: true, errores: [] }, campos.clase);
  }
});

test('el id es el de AGRAM: SHA-256 del canónico de AGRAM', { skip: !hayAgram && 'no está el repo de AGRAM' }, async () => {
  const { canonico, hash } = await import(pathToFileURL(`${AGRAM}/evento.js`).href);
  const k = await autoridad();
  const r = await k.firmarRecibo('autoridad', aceptacion(await sha256Texto('e3')), { t: T, dominio: 'nostr' });
  assert.equal(await hash(canonico({ schema: r.schema, emisor: r.emisor, t: r.t, recibo: r.recibo })), r.id);
});

test('un recibo manipulado no verifica; uno mal formado no se firma', async () => {
  const k = await autoridad();
  const ev = await sha256Texto('evento 4');
  const r = await k.firmarRecibo('autoridad', aceptacion(ev), { t: T, dominio: 'nostr' });
  const otro = structuredClone(r); otro.recibo[3][otro.recibo[2].indexOf('universo')] = 'mainnet';
  assert.match((await verificarReciboComun(otro)).motivo, /id no es el de su cuerpo/);
  assert.match((await verificarReciboComun({ ...r, t: '2030-01-01T00:00:00Z' })).motivo, /id/);
  assert.match((await verificarReciboComun({ ...r, firma: '00'.repeat(32) })).motivo, /firma/);
  assert.match((await verificarReciboComun({ ...r, schema: 'x' })).motivo, /no es un recibo/);
  await assert.rejects(k.firmarRecibo('autoridad', { ...aceptacion(ev), noAfirma: [] }, { t: T, dominio: 'nostr' }), /NO afirma/);
  await assert.rejects(k.firmarRecibo('autoridad', { ...rechazo(ev), causa: undefined }, { t: T, dominio: 'nostr' }), /causa/);
  await assert.rejects(k.firmarRecibo('autoridad', { ...aceptacion(ev), clase: 'otra' }, { t: T, dominio: 'nostr' }), /clase/);
});

test('rotación: solo la firma la clave de AGRAM que rota, sobre sí misma, nombrando su sucesora', async () => {
  const k = await autoridad();
  const { publica: vieja } = await k.crearClave('agram', 'vg');
  const nueva = await sha256Texto('clave nueva');
  const rot = { clase: 'rotación', sujeto: [vieja], ata: [['sucesora', nueva]], universo: 'eje de AGRAM', noAfirma: ['NO afirma que la sucesora la custodie la misma persona'] };
  assert.equal((await verificarReciboComun(await k.firmarRecibo('vg', rot, { t: T, dominio: 'agram' }))).ok, true);
  await assert.rejects(k.firmarRecibo('autoridad', rot, { t: T, dominio: 'nostr' }), codigo('wrong_domain'));
  await assert.rejects(k.firmarRecibo('vg', { ...rot, sujeto: [nueva] }, { t: T, dominio: 'agram' }), codigo('wrong_subject'));
  await assert.rejects(k.firmarRecibo('vg', { ...rot, ata: [['otra', nueva]] }, { t: T, dominio: 'agram' }), codigo('successor_missing'));
  await assert.rejects(k.firmarRecibo('vg', aceptacion(nueva), { t: T, dominio: 'agram' }), codigo('wrong_domain'));
});

test('equivocación: veredictos contradictorios de la misma autoridad, con el mismo núcleo y época', async () => {
  const k = await autoridad();
  const ev = await sha256Texto('evento disputado');
  const a = await k.firmarRecibo('autoridad', aceptacion(ev), { t: T, dominio: 'nostr' });
  const b = await k.firmarRecibo('autoridad', rechazo(ev), { t: '2026-11-12T12:00:05Z', dominio: 'nostr' });
  const e = await construirEquivocacion(a, b);
  assert.equal(e.clase, 'veredictos contradictorios');
  assert.equal(e.acusado, k.publica('nostr', 'autoridad'));
  assert.deepEqual(await verificarEquivocacion(e), { ok: true, motivo: 'equivocación probada', clase: e.clase, acusado: e.acusado, id: e.id });
  // El id no depende del orden en que se presentan.
  assert.equal((await construirEquivocacion(b, a)).id, e.id);
});

test('equivocación: dos sucesoras de una misma clave', async () => {
  const k = new Custodia();
  const { publica: vieja } = await k.crearClave('agram', 'vg');
  const rot = (s) => ({ clase: 'rotación', sujeto: [vieja], ata: [['sucesora', s]], universo: 'eje de AGRAM', noAfirma: ['NO afirma que la sucesora sea de la misma persona'] });
  const a = await k.firmarRecibo('vg', rot(await sha256Texto('n1')), { t: T, dominio: 'agram' });
  const b = await k.firmarRecibo('vg', rot(await sha256Texto('n2')), { t: T, dominio: 'agram' });
  const e = await construirEquivocacion(a, b);
  assert.equal(e.clase, 'dos sucesoras de una clave');
  assert.equal((await verificarEquivocacion(e)).ok, true);
});

test('lo que NO es equivocación no se puede acusar', async () => {
  const k = await autoridad();
  const ev = await sha256Texto('evento');
  const otraK = await autoridad();
  const casos = [
    // dos aceptaciones del mismo evento (un reenvío)
    [await k.firmarRecibo('autoridad', aceptacion(ev), { t: T, dominio: 'nostr' }), await k.firmarRecibo('autoridad', aceptacion(ev), { t: '2026-11-12T13:00:00Z', dominio: 'nostr' })],
    // aceptación y rechazo con núcleos distintos (las reglas cambiaron)
    [await k.firmarRecibo('autoridad', aceptacion(ev, 'abc123'), { t: T, dominio: 'nostr' }), await k.firmarRecibo('autoridad', rechazo(ev, 'def456'), { t: T, dominio: 'nostr' })],
    // aceptación y rechazo con épocas distintas
    [await k.firmarRecibo('autoridad', aceptacion(ev, 'abc123', 'e0'), { t: T, dominio: 'nostr' }), await k.firmarRecibo('autoridad', rechazo(ev, 'abc123', 'e1'), { t: T, dominio: 'nostr' })],
    // aceptación y rechazo de eventos distintos
    [await k.firmarRecibo('autoridad', aceptacion(ev), { t: T, dominio: 'nostr' }), await k.firmarRecibo('autoridad', rechazo(await sha256Texto('otro')), { t: T, dominio: 'nostr' })],
    // dos autoridades distintas que discrepan: no es equivocación de nadie
    [await k.firmarRecibo('autoridad', aceptacion(ev), { t: T, dominio: 'nostr' }), await otraK.firmarRecibo('autoridad', rechazo(ev), { t: T, dominio: 'nostr' })],
  ];
  // la misma rotación firmada dos veces, a la MISMA sucesora (repetir no es contradecirse)
  const { publica: vieja } = await k.crearClave('agram', 'rota');
  const sucesora = await sha256Texto('única sucesora');
  const rot = { clase: 'rotación', sujeto: [vieja], ata: [['sucesora', sucesora]], universo: 'eje de AGRAM', noAfirma: ['NO afirma nada más'] };
  casos.push([await k.firmarRecibo('rota', rot, { t: T, dominio: 'agram' }), await k.firmarRecibo('rota', rot, { t: '2026-11-12T15:00:00Z', dominio: 'agram' })]);
  for (const [a, b] of casos) await assert.rejects(construirEquivocacion(a, b), ErrorEquivocacion);
  // el mismo recibo dos veces
  const r = casos[0][0];
  await assert.rejects(construirEquivocacion(r, r), ErrorEquivocacion);
});

test('una prueba de equivocación manipulada no verifica', async () => {
  const k = await autoridad();
  const ev = await sha256Texto('evento');
  const e = await construirEquivocacion(await k.firmarRecibo('autoridad', aceptacion(ev), { t: T, dominio: 'nostr' }), await k.firmarRecibo('autoridad', rechazo(ev), { t: T, dominio: 'nostr' }));
  const otraK = await autoridad();
  const casos = [
    [{ ...e, clase: 'dos sucesoras de una clave' }, /clase declarada/],
    [{ ...e, acusado: otraK.publica('nostr', 'autoridad') }, /no son del acusado/],
    [{ ...e, id: 'f'.repeat(64) }, /id/],
    [{ ...e, b: { ...e.b, firma: '00'.repeat(32) } }, /segundo recibo/],
    [{ ...e, b: await k.firmarRecibo('autoridad', aceptacion(ev), { t: '2026-11-12T14:00:00Z', dominio: 'nostr' }) }, /no hay conflicto/],
  ];
  for (const [malo, motivo] of casos) {
    const v = await verificarEquivocacion(malo);
    assert.equal(v.ok, false);
    assert.match(v.motivo, motivo);
  }
});

test('con BIP-340 real (noble de AGRAM): recibo y equivocación', { skip: !hayAgram && 'no está el repo de AGRAM' }, async () => {
  const { schnorr } = await import(pathToFileURL(`${AGRAM}/vendor/noble-secp256k1.js`).href);
  const esquema = esquemaNoble(schnorr);
  const k = await autoridad({ esquema });
  const ev = await sha256Texto('evento real');
  const a = await k.firmarRecibo('autoridad', aceptacion(ev), { t: T, dominio: 'nostr' });
  const b = await k.firmarRecibo('autoridad', rechazo(ev), { t: T, dominio: 'nostr' });
  assert.equal(a.firma.length, 128);
  assert.equal((await verificarReciboComun(a, { esquema })).ok, true);
  assert.equal((await verificarReciboComun(a)).ok, false, 'una firma real no pasa por simulada');
  const e = await construirEquivocacion(a, b, { esquema });
  assert.equal((await verificarEquivocacion(e, { esquema })).ok, true);
});

test('un rechazo puede llevar varias causas (una clave «causa» por cada una), y sigue siendo BTML válido', { skip: !hayAgram && 'no está el repo de AGRAM' }, async () => {
  const { validarPayload } = await import(pathToFileURL(`${AGRAM}/btml.js`).href);
  const k = await autoridad();
  const ev = await sha256Texto('evento con dos causas');
  const r = await k.firmarRecibo('autoridad', { ...rechazo(ev), causa: ["writing burns today's T", 'every record hangs on a record of the ledger'] }, { t: T, dominio: 'nostr' });
  assert.deepEqual(r.recibo[3].filter((_, i) => r.recibo[2][i] === 'causa'), ["writing burns today's T", 'every record hangs on a record of the ledger']);
  assert.deepEqual(validarPayload(r.recibo), { ok: true, errores: [] });
  assert.equal((await verificarReciboComun(r)).ok, true);
  await assert.rejects(k.firmarRecibo('autoridad', { ...rechazo(ev), causa: [] }, { t: T, dominio: 'nostr' }), /causa/);
  await assert.rejects(k.firmarRecibo('autoridad', { ...rechazo(ev), causa: ['ok', ''] }, { t: T, dominio: 'nostr' }), /causa/);
});
